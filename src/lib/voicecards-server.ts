// VoiceCards API 서버사이드 유틸리티
// App Store Connect API와 Google Play Developer API 연동

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as jose from 'jose'
import { kstDateKey } from '@/lib/kst'
import {
  buildVoicecardsAnonymousLearningMap,
  buildVoicecardsJourneyMetaMap,
  voicecardsCanonicalOwnerId,
  voicecardsJourneyOwnerId,
  type VoicecardsAnonymousLearningMetrics,
  type VoicecardsAnonymousLearningRow,
  type VoicecardsDeviceJourneyRow,
} from '@/lib/voicecards-device-journey'
import {
  buildVoicecardsLocalAssetMap,
  LOCAL_SHEET_CREATED_EVENT,
  LOCAL_SHEET_FLUSHED_EVENT,
  type VoicecardsLocalAssets,
  type VoicecardsLocalSheetRow,
} from '@/lib/voicecards-local-assets'

// Supabase 클라이언트 (service_role) — willow-dash credentials/cache 저장
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// VoiceCards 앱 자체 Supabase — 회원 수 조회용
// 서버사이드 전용 — service_role 키 우선(RLS 우회 + anon 3s statement_timeout 회피). anon 폴백.
const voicecardsSupabase = process.env.VOICECARDS_SUPABASE_URL
  ? createClient(
      process.env.VOICECARDS_SUPABASE_URL,
      process.env.VOICECARDS_SUPABASE_SERVICE_KEY || process.env.VOICECARDS_SUPABASE_KEY!,
      { auth: { persistSession: false } }
    )
  : null

// 타입 정의
export interface VoicecardsCredentials {
  id?: string
  user_id: string
  // App Store Connect
  ios_issuer_id?: string | null
  ios_key_id?: string | null
  ios_private_key?: string | null
  ios_app_id?: string | null
  ios_vendor_number?: string | null
  // Google Play
  android_service_account?: string | null
  android_package_name?: string | null
  created_at?: string
  updated_at?: string
}

export interface IAPStats {
  platform: 'ios' | 'android'
  date: string
  revenue: number
  currency: string
  activeSubscriptions: number
  newSubscriptions: number
  churnedSubscriptions: number
  renewedSubscriptions: number
  refundCount: number
  refundAmount: number
  newDownloads: number
}

export interface CombinedStats {
  ios: IAPStats | null
  android: IAPStats | null
  combined: {
    totalRevenue: number
    totalCreditsSold: number
    totalPaidUsers: number
    totalActiveSubscriptions: number
    totalNewSubscriptions: number
    totalChurnedSubscriptions: number
    totalRefunds: number
    totalNewDownloads: number
  }
  dateRange: {
    start: string
    end: string
  }
  // 앱 DB(anonymous_events) 기반 매출 — 차트 데이터 산출용 (getCombinedStats 내부에서 이미 계산됨)
  appRevenue: AppDbRevenue
}

// 현재 사용자 ID 가져오기
async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    return payload.email || payload.sub || null
  } catch {
    return null
  }
}

// ============================================================
// 인증 정보 관리
// ============================================================

// 인증 정보 저장 (전달된 필드만 업데이트, 나머지는 기존값 유지)
export async function saveCredentials(creds: Partial<VoicecardsCredentials>): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  // 기존 값 로드
  const existing = await getCredentials()

  const merged = {
    user_id: userId,
    ios_issuer_id: creds.ios_issuer_id ?? existing?.ios_issuer_id ?? null,
    ios_key_id: creds.ios_key_id ?? existing?.ios_key_id ?? null,
    ios_private_key: creds.ios_private_key ?? existing?.ios_private_key ?? null,
    ios_app_id: creds.ios_app_id ?? existing?.ios_app_id ?? null,
    ios_vendor_number: creds.ios_vendor_number ?? existing?.ios_vendor_number ?? null,
    android_service_account: creds.android_service_account ?? existing?.android_service_account ?? null,
    android_package_name: creds.android_package_name ?? existing?.android_package_name ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('voicecards_credentials')
    .upsert(merged, { onConflict: 'user_id' })

  if (error) {
    console.error('Error saving credentials:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// 인증 정보 조회 (현재 사용자)
export async function getCredentials(): Promise<VoicecardsCredentials | null> {
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('voicecards_credentials')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null

  return data as VoicecardsCredentials
}

// 인증 정보 조회 (아무 사용자 — 서버 내부용, 캐시 갱신 등)
export async function getAnyCredentials(): Promise<VoicecardsCredentials | null> {
  const { data, error } = await supabase
    .from('voicecards_credentials')
    .select('*')
    .not('ios_issuer_id', 'is', null)
    .limit(1)
    .single()

  if (error || !data) return null
  return data as VoicecardsCredentials
}

// 연결 상태 확인
export async function getConnectionStatus(): Promise<{
  ios: { connected: boolean; appId?: string }
  android: { connected: boolean; packageName?: string }
}> {
  // 쿠키 기반 → fallback to 아무 credential
  const creds = await getCredentials() || await getAnyCredentials()

  return {
    ios: {
      connected: !!(creds?.ios_issuer_id && creds?.ios_key_id && creds?.ios_private_key),
      appId: creds?.ios_app_id || undefined,
    },
    android: {
      connected: !!(creds?.android_service_account && creds?.android_package_name),
      packageName: creds?.android_package_name || undefined,
    },
  }
}

// ============================================================
// App Store Connect API
// ============================================================

// App Store Connect JWT 생성 (ES256)
export async function generateAppStoreJWT(creds: VoicecardsCredentials): Promise<string | null> {
  if (!creds.ios_issuer_id || !creds.ios_key_id || !creds.ios_private_key) {
    return null
  }

  try {
    // ES256 private key 파싱
    const privateKey = await jose.importPKCS8(creds.ios_private_key, 'ES256')

    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({
        alg: 'ES256',
        kid: creds.ios_key_id,
        typ: 'JWT',
      })
      .setIssuer(creds.ios_issuer_id)
      .setIssuedAt()
      .setExpirationTime('20m') // 20분 유효
      .setAudience('appstoreconnect-v1')
      .sign(privateKey)

    return jwt
  } catch (error) {
    console.error('Error generating App Store JWT:', error)
    return null
  }
}

// App Store Connect API 호출
async function callAppStoreAPI(endpoint: string, jwt: string): Promise<Response> {
  return fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
  })
}

// iOS Sales Report 조회
export async function fetchIosSalesReport(
  creds: VoicecardsCredentials,
  params: {
    reportDate: string // YYYY-MM-DD
    reportType?: 'SALES' | 'SUBSCRIPTION' | 'SUBSCRIPTION_EVENT'
  }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const jwt = await generateAppStoreJWT(creds)
  if (!jwt) {
    return { success: false, error: 'Failed to generate JWT' }
  }

  try {
    const reportType = params.reportType || 'SALES'
    const vendorNumber = creds.ios_vendor_number || creds.ios_app_id || ''
    const endpoint = `/v1/salesReports?filter[reportDate]=${params.reportDate}&filter[reportType]=${reportType}&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${vendorNumber}&filter[frequency]=DAILY`

    const response = await callAppStoreAPI(endpoint, jwt)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `App Store API error: ${response.status} - ${JSON.stringify(errorData)}`
      }
    }

    // Sales reports return gzip-compressed TSV
    const buffer = await response.arrayBuffer()
    const { gunzipSync } = await import('zlib')
    let tsv: string
    try {
      tsv = gunzipSync(Buffer.from(buffer)).toString('utf-8')
    } catch {
      // Not gzip — treat as plain text
      tsv = Buffer.from(buffer).toString('utf-8')
    }
    return { success: true, data: tsv }
  } catch (error) {
    console.error('Error fetching iOS sales report:', error)
    return { success: false, error: String(error) }
  }
}

// iOS Analytics — 앱 다운로드 수 조회 (App Store Connect Analytics Reports API)
export async function fetchIosAnalyticsReport(
  creds: VoicecardsCredentials,
  params: { startDate: string; endDate: string }
): Promise<{ success: boolean; downloads?: number; error?: string }> {
  const jwt = await generateAppStoreJWT(creds)
  if (!jwt) return { success: false, error: 'Failed to generate JWT' }
  if (!creds.ios_app_id) return { success: false, error: 'No app ID' }

  try {
    // Step 1: Request an analytics report
    const requestBody = {
      type: 'analyticsReportRequests',
      attributes: {
        accessType: 'ONE_TIME_SNAPSHOT',
      },
      relationships: {
        app: {
          data: { type: 'apps', id: creds.ios_app_id },
        },
      },
    }

    const reqRes = await fetch('https://api.appstoreconnect.apple.com/v1/analyticsReportRequests', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: requestBody }),
    })

    if (!reqRes.ok) {
      // Analytics Reports API might not be available — fall back to metrics
      const err = await reqRes.json().catch(() => ({}))
      console.log('[VoiceCards] Analytics Reports API failed, trying metrics endpoint:', JSON.stringify(err))
    }

    // Alternative: Use the simpler App Analytics metrics endpoint
    // GET /v1/apps/{id}/analyticsSets is not standard — use perfPowerMetrics
    // The most reliable approach: use App Store Connect API for app info
    const appRes = await callAppStoreAPI(`/v1/apps/${creds.ios_app_id}`, jwt)
    if (appRes.ok) {
      const appData = await appRes.json()
      console.log('[VoiceCards] App info:', JSON.stringify(appData?.data?.attributes?.name))
    }

    return { success: false, error: 'Analytics reports require async processing — use Sales Reports with vendorNumber instead' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// iOS Subscription 통계 조회
export async function fetchIosSubscriptionStats(
  creds: VoicecardsCredentials,
  appId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const jwt = await generateAppStoreJWT(creds)
  if (!jwt) {
    return { success: false, error: 'Failed to generate JWT' }
  }

  try {
    // Subscription groups 조회
    const endpoint = `/v1/apps/${appId}/subscriptionGroups`
    const response = await callAppStoreAPI(endpoint, jwt)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `App Store API error: ${response.status} - ${JSON.stringify(errorData)}`
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error fetching iOS subscription stats:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================================
// Google Play Developer API
// ============================================================

// Google Play 액세스 토큰 획득
async function getGooglePlayAccessToken(serviceAccountJson: string): Promise<string | null> {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson)

    // Service account JWT 생성
    const privateKey = await jose.importPKCS8(serviceAccount.private_key, 'RS256')

    const jwt = await new jose.SignJWT({
      scope: 'https://www.googleapis.com/auth/androidpublisher',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(serviceAccount.client_email)
      .setSubject(serviceAccount.client_email)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey)

    // 토큰 교환
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('Google token exchange failed:', await tokenResponse.text())
      return null
    }

    const tokenData = await tokenResponse.json()
    return tokenData.access_token
  } catch (error) {
    console.error('Error getting Google Play access token:', error)
    return null
  }
}

// Google Play API 호출
async function callGooglePlayAPI(endpoint: string, accessToken: string): Promise<Response> {
  return fetch(`https://androidpublisher.googleapis.com${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
}

// Android 매출 보고서 조회
export async function fetchAndroidEarningsReport(
  creds: VoicecardsCredentials,
  params: {
    yearMonth: string // YYYYMM
  }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!creds.android_service_account || !creds.android_package_name) {
    return { success: false, error: 'Android credentials not configured' }
  }

  const accessToken = await getGooglePlayAccessToken(creds.android_service_account)
  if (!accessToken) {
    return { success: false, error: 'Failed to get access token' }
  }

  try {
    // Google Play Console Reports API
    // Note: 실제 구현 시 Play Console API의 정확한 엔드포인트 확인 필요
    const endpoint = `/androidpublisher/v3/applications/${creds.android_package_name}/reviews`
    const response = await callGooglePlayAPI(endpoint, accessToken)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `Google Play API error: ${response.status} - ${JSON.stringify(errorData)}`
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error fetching Android earnings:', error)
    return { success: false, error: String(error) }
  }
}

// Android 구독 상태 조회
export async function fetchAndroidSubscriptionStatus(
  creds: VoicecardsCredentials,
  subscriptionId: string,
  purchaseToken: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (!creds.android_service_account || !creds.android_package_name) {
    return { success: false, error: 'Android credentials not configured' }
  }

  const accessToken = await getGooglePlayAccessToken(creds.android_service_account)
  if (!accessToken) {
    return { success: false, error: 'Failed to get access token' }
  }

  try {
    const endpoint = `/androidpublisher/v3/applications/${creds.android_package_name}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}`
    const response = await callGooglePlayAPI(endpoint, accessToken)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `Google Play API error: ${response.status} - ${JSON.stringify(errorData)}`
      }
    }

    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    console.error('Error fetching Android subscription:', error)
    return { success: false, error: String(error) }
  }
}

// ============================================================
// 통계 캐시 관리
// ============================================================

// 캐시된 통계 조회
export async function getCachedStats(
  platform: 'ios' | 'android',
  date: string
): Promise<IAPStats | null> {
  const { data, error } = await supabase
    .from('voicecards_stats_cache')
    .select('*')
    .eq('platform', platform)
    .eq('date', date)
    .single()

  if (error || !data) return null

  return {
    platform: data.platform,
    date: data.date,
    revenue: parseFloat(data.revenue) || 0,
    currency: data.currency || 'KRW',
    activeSubscriptions: data.active_subscriptions || 0,
    newSubscriptions: data.new_subscriptions || 0,
    churnedSubscriptions: data.churned_subscriptions || 0,
    renewedSubscriptions: data.renewed_subscriptions || 0,
    refundCount: data.refund_count || 0,
    refundAmount: parseFloat(data.refund_amount) || 0,
    newDownloads: data.new_downloads || 0,
  }
}

// 통계 캐시 저장
export async function saveCachedStats(stats: IAPStats): Promise<void> {
  const { error } = await supabase
    .from('voicecards_stats_cache')
    .upsert({
      platform: stats.platform,
      date: stats.date,
      revenue: stats.revenue,
      currency: stats.currency,
      active_subscriptions: stats.activeSubscriptions,
      new_subscriptions: stats.newSubscriptions,
      churned_subscriptions: stats.churnedSubscriptions,
      renewed_subscriptions: stats.renewedSubscriptions,
      refund_count: stats.refundCount,
      refund_amount: stats.refundAmount,
      new_downloads: stats.newDownloads,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'platform,date' })

  if (error) {
    console.error('Error saving stats cache:', error)
  }
}

// 날짜 범위의 캐시된 통계 조회
export async function getCachedStatsRange(
  platform: 'ios' | 'android',
  startDate: string,
  endDate: string
): Promise<IAPStats[]> {
  const { data, error } = await supabase
    .from('voicecards_stats_cache')
    .select('*')
    .eq('platform', platform)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error || !data) return []

  return data.map(row => ({
    platform: row.platform,
    date: row.date,
    revenue: parseFloat(row.revenue) || 0,
    currency: row.currency || 'KRW',
    activeSubscriptions: row.active_subscriptions || 0,
    newSubscriptions: row.new_subscriptions || 0,
    churnedSubscriptions: row.churned_subscriptions || 0,
    renewedSubscriptions: row.renewed_subscriptions || 0,
    refundCount: row.refund_count || 0,
    refundAmount: parseFloat(row.refund_amount) || 0,
    newDownloads: row.new_downloads || 0,
  }))
}

// ============================================================
// 앱 DB 기반 매출 (anonymous_events 결제 이벤트)
// ============================================================

// 크레딧 팩 정가 (USD, 그로스). voice-cards CREDIT_PACKAGES와 동일하게 유지.
// 여기 없는 product_id 의 결제는 매출·판매크레딧·유료전환에서 통째로 빠진다 —
// 2026-08-16 엔트리팩($0.99/100) 첫 결제가 이 표에 없어서 대시보드에서 사라졌다.
const CREDIT_PRODUCT_PRICES_USD: Record<string, number> = {
  'com.monor.voicecards.credits.100': 0.99,
  'com.monor.voicecards.credits.1000': 9.99,
  'com.monor.voicecards.credits.5500': 49.99,
  'com.monor.voicecards.credits.12000': 99.99,
}

// 상품별 판매 크레딧 수 (매출을 크레딧 볼륨으로 집계).
// 이벤트에 delta(실제 지급량)가 있으면 그쪽이 먼저다. product_id 끝의 숫자는 스토어 SKU 문자열이라
// 지급량과 다르고(1000팩 = 1,100 지급, 5500팩 = 5,750 지급), 팩 수량이 또 바뀌면 이 표로 소급 집계한
// 과거 구매까지 값이 변한다. 이 표는 delta 없는 옛 이벤트 폴백용.
const CREDIT_PRODUCT_CREDITS: Record<string, number> = {
  'com.monor.voicecards.credits.100': 100,
  'com.monor.voicecards.credits.1000': 1100,
  'com.monor.voicecards.credits.5500': 5750,
  'com.monor.voicecards.credits.12000': 12000,
}

const EXCLUDED_VOICECARDS_NICKNAMES = new Set(['류하아빠', '큐트도넛'])
const EXCLUDED_VOICECARDS_EMAIL_DOMAINS = ['cloudtestlabaccounts.com']
// Synthetic/bot signup email patterns — kept in sync with the app's own bot
// definition (voice-cards scripts/ceo-report-prompt.md):
//  - Google Play test bots:         name.NNNNN@gmail.com  (dot + 5+ digits)
//  - structured batch-naming abuse: ...batchNN@gmail.com / waveNNbatchNN
//    (first seen 2026-06-30, e.g. wave31batch01@gmail.com — NOT a dev test acct).
// Excluded from BOTH the insight stat cards and the user list, since
// getVoicecardsUserStats derives both from the same filtered `users` set.
const EXCLUDED_VOICECARDS_EMAIL_PATTERNS: RegExp[] = [
  /\.[0-9]{5,}@gmail\.com$/i,
  /batch[0-9]+@gmail\.com$/i,
  /wave[0-9]+batch[0-9]+/i,
]
// 관리자/내부 테스트 계정 (정확 일치) — 2026-07-03 willowinvt 관리자 계정 추가
// 2026-07-18 qwe.gpt22022 봇/throwaway 추가 (가입 즉시 이탈, 기존 숫자 정규식엔 안 걸림)
// 2026-07-25 forcemajor1315 봇 추가 (가입 3초만에 이탈, 4자리+점없음이라 숫자 정규식 미포착).
//   이벤트통계는 IP필터(54.144/12)로 이미 제외됐지만, 유저 테이블은 이 JS 이메일 목록이라 별도 추가 필요.
// 2026-08-04 gpt1mnl2022 추가 — 구글 플레이 심사 계정. 카드 생성까지 해서 실사용자처럼 보이지만
//   (심사자가 주요 플로우를 훑기 때문), 출처가 104.132.16.0/20(Google)이고 릴리스마다 제출 당일
//   최신 버전으로 2~8분 훑고 사라지는 버스트가 05-12부터 13회 반복됐다. 1.1.119는 이 기기가
//   전 세계 유일 안드로이드였다. 이벤트통계는 같은 날 CIDR 추가로 제외했다(bot_ip_filter.sql).
const EXCLUDED_VOICECARDS_EMAILS = new Set([
  'dw.kim@willowinvt.com',
  'qwe.gpt22022@gmail.com',
  'forcemajor1315@gmail.com',
  'gpt1mnl2022@gmail.com',
])
const EXCLUDED_VOICECARDS_USER_IDS = new Set([
  '101662172713686736923',
  '100644446554227652222',
  '107821687966181028778',
])

function isExcludedVoicecardsEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  if (EXCLUDED_VOICECARDS_EMAILS.has(e)) return true
  if (EXCLUDED_VOICECARDS_EMAIL_DOMAINS.some(domain => e.endsWith(`@${domain}`))) return true
  return EXCLUDED_VOICECARDS_EMAIL_PATTERNS.some(re => re.test(e))
}

function isExcludedVoicecardsUser(user: { user_id?: string | null; nickname?: string | null; email?: string | null }): boolean {
  return !!(user.user_id && EXCLUDED_VOICECARDS_USER_IDS.has(user.user_id)) ||
    !!(user.nickname && EXCLUDED_VOICECARDS_NICKNAMES.has(user.nickname)) ||
    isExcludedVoicecardsEmail(user.email)
}

export interface AppDbRevenue {
  iosByDate: Map<string, number>
  androidByDate: Map<string, number>
  paidUsersByDate: Map<string, number>
  creditsByDate: Map<string, number>
  iosTotal: number
  androidTotal: number
  creditsTotal: number
  totalPaidUsers: number
}

// 앱 DB(anonymous_events)의 credits_changed/reason=purchase 이벤트로 매출 산출.
// product_id → 정가(USD) 매핑, 그로스 기준. Apple/Google 판매 리포트와 달리 거의
// 실시간이지만 추정치다(정가 기준 → 지역가·환불·스토어 수수료 미반영).
export async function getAppDbRevenue(
  startDate: string,
  endDate: string
): Promise<AppDbRevenue> {
  const result: AppDbRevenue = {
    iosByDate: new Map(),
    androidByDate: new Map(),
    paidUsersByDate: new Map(),
    creditsByDate: new Map(),
    iosTotal: 0,
    androidTotal: 0,
    creditsTotal: 0,
    totalPaidUsers: 0,
  }
  if (!voicecardsSupabase) return result

  const excludedUsersRes = await voicecardsSupabase
    .from('users')
    .select('user_id, nickname, email')
  const excludedUserIds = new Set(
    (excludedUsersRes.data || [])
      .filter(user => isExcludedVoicecardsUser(user))
      .map(user => user.user_id)
  )

  const PAGE = 1000
  const data: Array<{ created_at: string; user_id: string | null; platform: string | null; properties: Record<string, unknown> | null }> = []
  let from = 0

  while (true) {
    const { data: page, error } = await voicecardsSupabase
      .from('anonymous_events')
      .select('created_at, user_id, platform, properties')
      .eq('event_name', 'credits_changed')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error || !page?.length) break
    data.push(...(page as Array<{ created_at: string; user_id: string | null; platform: string | null; properties: Record<string, unknown> | null }>))
    if (page.length < PAGE) break
    from += PAGE
  }

  for (const row of data) {
    if (row.user_id && excludedUserIds.has(row.user_id)) continue
    const props = row.properties || {}
    if (props.reason !== 'purchase') continue
    const price = CREDIT_PRODUCT_PRICES_USD[String(props.product_id)]
    if (!price) continue
    const date = kstDateKey(row.created_at) // KST 날짜
    // 판매 크레딧: 이벤트의 delta(실제 지급량) 우선, 없으면 상품 매핑 폴백.
    // delta 를 먼저 쓰면 보너스 수량이 바뀌어도 과거 구매는 그때 지급한 값 그대로 남는다.
    const credits = Math.max(0, Number(props.delta) || 0) ||
      (CREDIT_PRODUCT_CREDITS[String(props.product_id)] ?? 0)
    result.creditsByDate.set(date, (result.creditsByDate.get(date) || 0) + credits)
    result.creditsTotal += credits
    if (row.platform === 'android') {
      result.androidByDate.set(date, (result.androidByDate.get(date) || 0) + price)
      result.androidTotal += price
    } else {
      // platform 미상은 iOS로 귀속(매출 누락 방지). 실데이터상 platform은 항상 채워짐.
      result.iosByDate.set(date, (result.iosByDate.get(date) || 0) + price)
      result.iosTotal += price
    }
  }

  const payingEvents: Array<{ created_at: string; user_id: string | null; properties: Record<string, unknown> | null }> = []
  from = 0
  while (true) {
    const { data: page, error } = await voicecardsSupabase
      // mv_real_users: anonymous_events_real_users(→deduped 무거움)의 5분 주기 스냅샷. 로드 속도/타임아웃 개선.
      .from('mv_real_users')
      .select('created_at, user_id, properties')
      .eq('event_name', 'credits_changed')
      .eq('is_likely_bot', false)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error || !page?.length) break
    payingEvents.push(...(page as Array<{ created_at: string; user_id: string | null; properties: Record<string, unknown> | null }>))
    if (page.length < PAGE) break
    from += PAGE
  }

  const firstPurchaseByUser = new Map<string, string>()
  for (const row of payingEvents) {
    if (!row.user_id || excludedUserIds.has(row.user_id)) continue
    const props = row.properties || {}
    if (props.reason !== 'purchase') continue
    const productId = String(props.product_id || '')
    if (!CREDIT_PRODUCT_PRICES_USD[productId]) continue
    if (!firstPurchaseByUser.has(row.user_id)) firstPurchaseByUser.set(row.user_id, row.created_at)
  }

  result.totalPaidUsers = firstPurchaseByUser.size
  const newPaidUsersByDate = new Map<string, number>()
  let baselinePaidUsers = 0
  for (const createdAt of firstPurchaseByUser.values()) {
    const date = kstDateKey(createdAt)
    if (date < startDate) {
      baselinePaidUsers += 1
      continue
    }
    newPaidUsersByDate.set(date, (newPaidUsersByDate.get(date) || 0) + 1)
  }

  let runningPaidUsers = baselinePaidUsers
  if (baselinePaidUsers > 0) result.paidUsersByDate.set(startDate, baselinePaidUsers)
  for (const date of Array.from(newPaidUsersByDate.keys()).sort()) {
    runningPaidUsers += newPaidUsersByDate.get(date) || 0
    result.paidUsersByDate.set(date, runningPaidUsers)
  }

  return result
}

// ============================================================
// 통합 통계
// ============================================================

// 통합 통계 조회 (매출=앱DB 결제 이벤트, 그 외=판매 리포트 캐시)
export async function getCombinedStats(
  startDate: string,
  endDate: string
): Promise<CombinedStats> {
  const [iosStats, androidStats, appRevenue] = await Promise.all([
    getCachedStatsRange('ios', startDate, endDate),
    getCachedStatsRange('android', startDate, endDate),
    getAppDbRevenue(startDate, endDate),
  ])

  // 가장 최근 날짜의 통계
  const latestIos = iosStats.length > 0 ? iosStats[iosStats.length - 1] : null
  const latestAndroid = androidStats.length > 0 ? androidStats[androidStats.length - 1] : null

  // 기간 합계 계산
  const sumStats = (stats: IAPStats[]) => ({
    revenue: stats.reduce((sum, s) => sum + s.revenue, 0),
    newSubscriptions: stats.reduce((sum, s) => sum + s.newSubscriptions, 0),
    churnedSubscriptions: stats.reduce((sum, s) => sum + s.churnedSubscriptions, 0),
    refundCount: stats.reduce((sum, s) => sum + s.refundCount, 0),
    newDownloads: stats.reduce((sum, s) => sum + s.newDownloads, 0),
  })

  const iosSum = sumStats(iosStats)
  const androidSum = sumStats(androidStats)

  // 매출은 판매 리포트 캐시 대신 앱 DB 결제 이벤트(그로스, USD)로 산출.
  const iosRevenue = appRevenue.iosTotal
  const androidRevenue = appRevenue.androidTotal

  return {
    ios: latestIos ? { ...latestIos, revenue: iosRevenue } : null,
    android: latestAndroid ? { ...latestAndroid, revenue: androidRevenue } : null,
    combined: {
      totalRevenue: iosRevenue + androidRevenue,
      totalCreditsSold: appRevenue.creditsTotal,
      totalPaidUsers: appRevenue.totalPaidUsers,
      totalActiveSubscriptions: (latestIos?.activeSubscriptions || 0) + (latestAndroid?.activeSubscriptions || 0),
      totalNewSubscriptions: iosSum.newSubscriptions + androidSum.newSubscriptions,
      totalChurnedSubscriptions: iosSum.churnedSubscriptions + androidSum.churnedSubscriptions,
      totalRefunds: iosSum.refundCount + androidSum.refundCount,
      totalNewDownloads: iosSum.newDownloads + androidSum.newDownloads,
    },
    dateRange: {
      start: startDate,
      end: endDate,
    },
    appRevenue,
  }
}

// ============================================================
// Sales Report TSV 파싱
// ============================================================

const DOWNLOAD_TYPES = new Set(['1', '1F', '1T', 'F1', 'FI1'])
const SUBSCRIPTION_TYPES = new Set(['IAC', 'IAY'])

export function parseIosSalesReportTSV(tsv: string, date: string): IAPStats {
  const stats: IAPStats = {
    platform: 'ios', date, revenue: 0, currency: 'KRW',
    activeSubscriptions: 0, newSubscriptions: 0, churnedSubscriptions: 0,
    renewedSubscriptions: 0, refundCount: 0, refundAmount: 0, newDownloads: 0,
  }

  const lines = tsv.split('\n')
  const header = lines[0]?.split('\t') || []
  const colIdx = (name: string) => header.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()))

  const iType = colIdx('Product Type Identifier') !== -1 ? colIdx('Product Type Identifier') : 6
  const iUnits = colIdx('Units') !== -1 ? colIdx('Units') : 7
  const iProceeds = colIdx('Developer Proceeds') !== -1 ? colIdx('Developer Proceeds') : 8

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (cols.length <= iType) continue

    const productType = cols[iType]?.trim()
    const units = parseInt(cols[iUnits]) || 0
    const proceeds = parseFloat(cols[iProceeds]) || 0

    stats.revenue += proceeds

    if (DOWNLOAD_TYPES.has(productType)) {
      stats.newDownloads += Math.max(0, units)
    }
    if (SUBSCRIPTION_TYPES.has(productType)) {
      if (units > 0) stats.newSubscriptions += units
      if (units < 0) stats.churnedSubscriptions += Math.abs(units)
    }
  }

  return stats
}

// ============================================================
// Live fetch (캐시 미스 시 Apple API 직접 호출 + 캐시 저장)
// ============================================================

export async function fetchAndCacheIosStats(date: string): Promise<IAPStats | null> {
  const creds = await getAnyCredentials()
  if (!creds?.ios_issuer_id || !creds?.ios_key_id || !creds?.ios_private_key) {
    console.log('[VoiceCards] No iOS credentials found')
    return null
  }

  console.log(`[VoiceCards] Fetching iOS sales report for ${date}...`)
  const salesResult = await fetchIosSalesReport(creds, { reportDate: date, reportType: 'SALES' })
  console.log(`[VoiceCards] Sales result: success=${salesResult.success}, error=${salesResult.error || 'none'}, dataType=${typeof salesResult.data}, dataLength=${typeof salesResult.data === 'string' ? salesResult.data.length : 'N/A'}`)
  if (salesResult.success && typeof salesResult.data === 'string') {
    // Log first 500 chars of TSV for debugging
    console.log(`[VoiceCards] TSV preview: ${salesResult.data.substring(0, 500)}`)
  }

  const stats = (salesResult.success && typeof salesResult.data === 'string' && salesResult.data.length > 0)
    ? parseIosSalesReportTSV(salesResult.data, date)
    : {
        platform: 'ios' as const, date, revenue: 0, currency: 'KRW',
        activeSubscriptions: 0, newSubscriptions: 0, churnedSubscriptions: 0,
        renewedSubscriptions: 0, refundCount: 0, refundAmount: 0, newDownloads: 0,
      }

  console.log(`[VoiceCards] Parsed stats for ${date}: downloads=${stats.newDownloads}, revenue=${stats.revenue}`)
  await saveCachedStats(stats)
  return stats
}

// ============================================================
// VoiceCards 회원 수 조회 (VoiceCards 자체 Supabase)
// ============================================================

export interface VoicecardsUserStats {
  // 구글 로그인 사용자 수 — 기기 계정(device:<uuid>)은 제외한다. 퍼널의 "구글 로그인"
  // 칸이 이 값을 쓰므로, 로그인한 적 없는 기기 계정을 섞으면 라벨이 거짓이 된다.
  totalUsers: number
  // 기기 계정 수 — 로그인 없이 크레딧을 쓰는 사용자. 병합된 계정은 users 행이 남지만
  // 이미 구글 계정으로 세었으므로 중복 계상하지 않는다(merged_into 있는 행 제외).
  deviceAccounts: number
  // 그중 실제로 덱을 만든 수 — 퍼널 '학습 활성화'에 구글 활성화와 합산된다.
  deviceAccountsActivated: number
  activeUsers: number
  totalSheets: number
  totalCards: number
  totalAttempts: number
  totalCredits: number
  // 일별 학습 활동 (time_series_analytics 기반, 내부 계정 제외)
  dailyLearnActivity: Array<{
    date: string
    cardsLearned: number
    attempts: number
  }>
  // 일별 보유 카드 스냅샷 (daily_inventory_snapshots 테이블 기반, 아직 없으면 빈 배열)
  dailyCardInventory: Array<{
    date: string
    totalCards: number
  }>
  users: Array<{
    id: string
    nickname: string | null
    email: string | null
    appVersion: string | null  // 가장 최근 활동 시 앱 버전
    platform: string | null    // 'ios' | 'android' 등
    locale: string | null      // 'ko' | 'en' | 'de' | 'fr' | 'es' | 'zh' | 'ja' 등
    country: string | null     // IP 기반 국가코드 (백필). anonymous_events.country
    hasPurchased: boolean
    credits: number          // 현재 잔액 (보유 크레딧)
    purchasedCredits: number // 구매 크레딧 누적 (purchase 이벤트 합)
    bonusCredits: number     // 오퍼로 지급된 무상 보너스 크레딧 누적 (user_offers.redeemed_credits 합)
    offerStage: string | null // 타겟 오퍼 단계: sent|seen|snoozed|redeemed|dismissed|expired (없으면 null)
    offerStageAt: string | null // 현재 단계 진입 시각 (발송일/열람일/전환일 등)
    creditsUsed: number      // 듣기 학습 횟수 (tts_played + voice_preview_played + device_tts_played). AI 카드 생성은 사용량 적어 제외
    // creditsUsed 를 재생 엔진으로 가른 값. 판정은 이벤트 이름이 아니라 과금 신호(fractional_cost)로 한다.
    premiumListens: number      // 크레딧이 나갈 수 있는 재생. 크레딧 관련 추정에는 이 값을 쓴다
    freeListens: number         // 0크레딧 재생 = 기기음성. 듣기는 하는데 돈은 안 쓰는 사용량
    unclassifiedListens: number // 과금 신호가 없던 옛 버전(≤1.1.86)의 재생. 어느 쪽인지 알 수 없다
    creditsSpent: number     // 실사용 크레딧 = TTS 차감(tts_premium) + AI 생성(credits_used) — 크레딧 원장 기준
    // 구글연동(Drive) 완료 = users.folder_id 존재. deferred-Drive 가입 이후 시트 0이어도
    // 연동은 끝났을 수 있다(예: AI 생성 후 draft만 두고 이탈) — sheetCount로 판정하지 말 것.
    hasFolder: boolean
    sheetCount: number
    cards: number
    ownCards: number // 데모 덱 제외 보유 카드 — 활성화(미활성/연동후대기) 판정 전용
    flips: number    // 카드 앞뒤 수동 전환 횟수 (card_flipped_manual) — 말하기 없이 눈으로만 학습하는 패턴 감지
    attempts: number
    cardsToday: number        // 오늘 카드 증가분
    attemptsToday: number     // 오늘 말하기 증가분
    listenToday: number       // 오늘 듣기 증가분
    flipsToday: number        // 오늘 뒤집기 증가분
    spentToday: number        // 오늘 크레딧 사용 증가분
    activeDays7d: number      // 최근 7일 중 활동한 날짜 수 (0-7)
    purchasedToday: number    // 오늘 구매 크레딧
    balanceDeltaToday: number // 오늘 보유 잔액 순변동 (±)
    sheetsDeltaToday: number  // 오늘 시트 증가분 (user_sheet_snapshots 대비)
    // 구매 고려(purchase-intent) 신호 — vc_user_intent_signals RPC
    intentPremiumVoice: boolean // 프리미엄 보이스 관심
    intentAi: boolean           // AI 생성 관심
    intentBanner: boolean       // 크레딧/프리미엄 배너 탭
    intentGated: boolean        // 게이트 충돌(약한 신호)
    hotLead: boolean            // 상대 기준: 최근 7일 활성 미구매자 중 purchaseScore 상위 30%
    purchaseScore: number       // 구매 가능성 점수. 헤비 TTS(듣기 볼륨) 최우선 + 프리미엄보이스 오디션/AI·배너 의도 + 최근활동. 구매자=0
    lastIntentAt: string | null // 가장 최근 구매의도 이벤트 시각
    createdAt: string
    activatedAt: string | null // 최초 학습 활성화 시각. 기기 계정은 로컬 덱 생성 이벤트 기준.
    lastActiveAt: string | null
    // 설치일 — 이 사용자의 기기 중 가장 이른 first_seen (vc_device_journeys).
    // null인 경우: 뷰가 생기기 전에 가입했거나 이벤트가 정리된 오래된 계정(현재 22명).
    // 기기 2대인 사용자(현재 4명)는 가장 이른 설치일을 쓴다.
    installedAt: string | null
  }>
}

// 마지막으로 성공한 유저 통계 스냅샷 — 일시 오류(커넥션 풀/경합/RPC 실패 등) 시 사용자 테이블이
// 통째로 500 나는 걸 막고 직전 정상 데이터를 제공한다 (getAnonymousEventStats 와 동일 패턴).
let lastGoodUserStats: VoicecardsUserStats | null = null
const EMPTY_USER_STATS: VoicecardsUserStats = {
  totalUsers: 0, deviceAccounts: 0, deviceAccountsActivated: 0, activeUsers: 0, totalSheets: 0,
  totalCards: 0, totalAttempts: 0, totalCredits: 0,
  dailyLearnActivity: [], dailyCardInventory: [], users: [],
}

// 방어적 래퍼: 내부 집계가 어디서 throw 하든(=RPC null 역참조 등) 500 대신 직전 정상 스냅샷 제공.
export async function getVoicecardsUserStats(): Promise<VoicecardsUserStats> {
  try {
    const result = await computeVoicecardsUserStats()
    // 비정상 empty(0명)는 캐시/노출하지 않고 직전 정상 스냅샷으로 대체
    if (!result.users.length && lastGoodUserStats) return lastGoodUserStats
    return result
  } catch (e) {
    console.error('[VoiceCards] user stats compute failed:', e, lastGoodUserStats ? '— serving last good snapshot' : '')
    return lastGoodUserStats ?? EMPTY_USER_STATS
  }
}

async function computeVoicecardsUserStats(): Promise<VoicecardsUserStats> {
  const empty = EMPTY_USER_STATS

  if (!voicecardsSupabase) {
    console.log('[VoiceCards] VoiceCards Supabase not configured')
    return empty
  }

  const vc = voicecardsSupabase
  // 페이지네이션 헬퍼 — Supabase 기본 1000 row 한도 우회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllPaged<T = any>(makeQuery: () => any): Promise<T[]> {
    const PAGE = 1000
    const all: T[] = []
    let from = 0
    while (true) {
      const { data, error } = await makeQuery().range(from, from + PAGE - 1)
      if (error || !data) break
      all.push(...(data as T[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  }

  // 유저 목록 + 학습 통계 + 마지막 활동일 + 일별 학습 활동 + 크레딧 이벤트 + 앱 버전 병렬 조회
  const [usersRes, analyticsRes, lastActivityRes, timeSeriesRes, rollupRes, metaRes, activityRes, offersRes, journeysRes] = await Promise.all([
    vc.from('users').select('*').order('created_at', { ascending: false }),
    vc.from('user_analytics').select('user_id, total_cards, total_attempts, sheet_id'),
    vc.from('user_analytics').select('user_id, last_updated'),
    fetchAllPaged<{ user_id: string; date: string; problems_learned: number; attempts: number }>(
      () => vc.from('time_series_analytics').select('user_id, date, problems_learned, attempts').order('date', { ascending: true })
    ),
    // 통합 롤업 — 듣기/뒤집기/실사용크레딧 + 구매크레딧 + 구매의도 신호를 mv_real_users 1회 스캔으로.
    // (기존 vc_user_listen_counts + vc_user_purchased_credits + vc_user_intent_signals 3 RPC 대체 —
    //  각각 10만행 MV 전체스캔하던 것을 1회로. 출력은 세 RPC 합집합과 동일 검증됨.)
    vc.rpc('vc_user_rollup'),
    // 사용자별 최신 앱버전/플랫폼/언어/국가 + 최근 이벤트 시각 — user당 1행 (DISTINCT ON)
    vc.rpc('vc_user_latest_meta'),
    // 사용자별 오늘 증가분(카드/말하기/듣기) + 최근 7일 활동일 수
    vc.rpc('vc_user_activity_deltas'),
    // 타겟 오퍼 — 사용자별 오퍼 행(단계 추적 + 지급된 보너스 크레딧). RLS는 anon USING(true)라
    // service 키로 전수 조회 가능. 캠페인 규모가 작아(수십 건) 전수 select로 충분.
    vc.from('user_offers').select('user_id, status, seen_at, snoozed_at, redeemed_at, redeemed_credits, expires_at, created_at'),
    // 사용자 표와 활동 차트가 같은 실사용자 모집단을 쓰도록 기기 저니를 함께 가져온다.
    // 이 뷰는 관리자·봇·App Store 심사 기기를 이미 제외한다.
    vc.from('vc_device_journeys').select('device_id, user_id, first_seen_at, last_seen_at, platform, app_version, locale, country, active_days_7d'),
  ])

  if (usersRes.error) {
    // 일시 오류 시 throw(→500, 테이블 깨짐) 대신 직전 정상 스냅샷 제공. 없으면 empty.
    console.error('[VoiceCards] Error fetching users:', usersRes.error, lastGoodUserStats ? '— serving last good snapshot' : '')
    return lastGoodUserStats ?? empty
  }

  // 듣기 핵심 RPC 실패를 빈 배열로 취급하면 실제 사용량이 모두 0으로 덮이고 그 결과가 캐시된다.
  // 실패 시 직전 정상 스냅샷을 유지하고, 정상 스냅샷이 없는 cold start에서는 route가 500을 반환해
  // Next 캐시의 기존 값을 오염시키지 않게 한다.
  const criticalMetricError = rollupRes.error || activityRes.error
  if (criticalMetricError) {
    console.error(
      '[VoiceCards] Critical user metric RPC failed:',
      rollupRes.error || activityRes.error,
      lastGoodUserStats ? '— serving last good snapshot' : ''
    )
    return lastGoodUserStats ?? empty
  }

  const allUsers = usersRes.data || []
  const journeyRows = (journeysRes.data || []) as VoicecardsDeviceJourneyRow[]
  const mergedDeviceOwners = new Map<string, string>(
    allUsers
      .filter(u => u.user_id?.startsWith('device:') && u.merged_into)
      .map(u => [u.user_id as string, u.merged_into as string]),
  )
  const canonicalOwnerId = (ownerId: string) => voicecardsCanonicalOwnerId(ownerId, mergedDeviceOwners)
  const validDeviceAccountIds = new Set(
    journeyRows
      .filter(row => row.device_id && (!row.user_id || row.user_id === `device:${row.device_id}`))
      .map(row => `device:${row.device_id}`)
  )
  const excludedUserIds = new Set(
    allUsers
      .filter(u => isExcludedVoicecardsUser(u))
      .map(u => u.user_id)
  )
  const users = allUsers.filter(u =>
    !excludedUserIds.has(u.user_id) &&
    // Google 로그인으로 병합된 기기 계정은 대상 Google 행으로 이미 표현된다.
    // 남겨두면 같은 사람이 기기/Google 두 행으로 중복되고 당일 신규 수도 부풀려진다.
    !(u.user_id.startsWith('device:') && u.merged_into) &&
    // users에는 App Store 심사에서도 device:* 계정이 생긴다. 이벤트 통계는 이를 빼지만
    // 사용자 표는 users만 읽어 남기고 있었으므로, 정상 저니에 존재하는 기기 계정만 포함한다.
    (!u.user_id.startsWith('device:') || journeysRes.error || validDeviceAccountIds.has(u.user_id))
  )
  // analytics: 제외 유저 + orphan(users 테이블에 없는 user_id) 모두 제거 — 유저 목록 합계와 상단 통계 일치
  const visibleUserIds = new Set(users.map(u => u.user_id))
  const analytics = (analyticsRes.data || []).filter(a => visibleUserIds.has(a.user_id))

  // 유저별 마지막 활동일 계산 (제외/orphan 필터링)
  const lastActivityMap = new Map<string, string>()
  for (const row of (lastActivityRes.data || [])) {
    if (!visibleUserIds.has(row.user_id)) continue
    const existing = lastActivityMap.get(row.user_id)
    if (!existing || row.last_updated > existing) {
      lastActivityMap.set(row.user_id, row.last_updated)
    }
  }

  let activeUsers = users.filter(u =>
    u.sheet_ids && Array.isArray(u.sheet_ids) && u.sheet_ids.length > 0
  ).length

  // 유저별 보유 카드 수/말하기 시도 맵 (total_cards = 시트별 보유 카드, 합산 = 전체 보유 카드)
  // ownCards = 데모 덱(sheet_id 'demo-' 접두) 제외 — 활성화 판정 전용. 데모 한 세션이
  // total_cards 100을 만들어 "활성화"로 과대 분류되는 것을 막는다(예: sollunamola).
  // '카드' 컬럼/총계는 기존 정의(데모 포함) 유지.
  const userAttemptsMap = new Map<string, number>()
  const userCardsMap = new Map<string, number>()
  const userOwnCardsMap = new Map<string, number>()
  for (const a of analytics) {
    userAttemptsMap.set(a.user_id, (userAttemptsMap.get(a.user_id) || 0) + (Number(a.total_attempts) || 0))
    userCardsMap.set(a.user_id, (userCardsMap.get(a.user_id) || 0) + (Number(a.total_cards) || 0))
    if (!String(a.sheet_id || '').startsWith('demo-')) {
      userOwnCardsMap.set(a.user_id, (userOwnCardsMap.get(a.user_id) || 0) + (Number(a.total_cards) || 0))
    }
  }

  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0)
  let totalSheets = users.reduce((sum, u) => sum + (Array.isArray(u.sheet_ids) ? u.sheet_ids.length : 0), 0)

  // 일별 보유 카드 스냅샷 — daily_inventory_snapshots(관리자 제외 시리즈, liveCards=userStats.totalCards
  // 와 같은 모집단이라 sparkline 끝점·7일 추세가 헤더와 정합). sparkline·7일 추세용.
  // (오늘/전일 diff 는 클라이언트에서 테이블 per-user 델타 합으로 별도 계산.)
  const inventorySnapRes = await vc.from('daily_inventory_snapshots').select('date, total_cards').order('date', { ascending: true })
  const dailyCardInventory = (inventorySnapRes.data || []).map(r => ({
    date: r.date as string,
    totalCards: Number(r.total_cards) || 0,
  }))

  // 일별 학습 활동 (내부 계정 제외, 날짜별 합산)
  const timeSeriesRows = timeSeriesRes.filter(r => visibleUserIds.has(r.user_id))
  const learnByDate = new Map<string, { cardsLearned: number; attempts: number }>()
  for (const row of timeSeriesRows) {
    const date = row.date as string
    const cur = learnByDate.get(date) ?? { cardsLearned: 0, attempts: 0 }
    cur.cardsLearned += Number(row.problems_learned) || 0
    cur.attempts += Number(row.attempts) || 0
    learnByDate.set(date, cur)
  }
  const dailyLearnActivity = Array.from(learnByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, cardsLearned: v.cardsLearned, attempts: v.attempts }))

  // 보유 카드 합계 (user_analytics.total_cards 사용자별 합산)
  let totalCards = Array.from(userCardsMap.values()).reduce((sum, n) => sum + n, 0)
  // 누적 말하기 시도 (user_analytics.total_attempts 합) — 사용자 리스트 "말하기" 합과 일치
  let totalAttempts = Array.from(userAttemptsMap.values()).reduce((sum, n) => sum + n, 0)

  // 사용자별 듣기 학습 횟수 (이벤트 1건 = 1회) + 카드 뒤집기 횟수 + 실사용 크레딧
  // 듣기: tts_played, voice_preview_played, device_tts_played / 뒤집기: card_flipped_manual
  //
  // 재생 엔진은 이벤트 이름이 아니라 **과금 신호(properties.fractional_cost)**로 가른다.
  // device_tts_played 는 배선만 돼 있고 앱이 보낸 적이 없다(전 기간 0건, 1.1.110 미출시).
  // 프리미엄을 끈 뒤의 기기음성 재생도 tts_played 로 들어와서, 이름으로 가르면 0크레딧 재생이
  // 프리미엄에 섞인다(전체로 보면 프리미엄이 2.6배 부풀려져 있었다).
  //   premium       과금 신호가 붙은 재생. 크레딧이 나갈 수 있는 것만
  //   free          신호를 보낼 줄 아는 버전인데 신호가 없다 = 기기음성
  //   unclassified  신호를 보낸 적 없는 옛 버전(≤1.1.86)의 재생. 어느 쪽인지 알 수 없다
  // 실사용 크레딧: credit_transactions 원장 음수 delta 합 (이벤트 집계 아님)
  const userCreditsUsedMap = new Map<string, number>()
  const userPremiumListensMap = new Map<string, number>()
  const userFreeListensMap = new Map<string, number>()
  const userUnclassifiedListensMap = new Map<string, number>()
  const userFlipsMap = new Map<string, number>()
  const userCreditsSpentMap = new Map<string, number>()
  for (const row of ((rollupRes.data || []) as Array<{ user_id: string | null; listen_count: number; premium_listen_count: number; free_listen_count: number; unclassified_listen_count: number; flip_count: number; credits_spent: number }>)) {
    const uid = row.user_id ? canonicalOwnerId(row.user_id) : null
    if (!uid || !visibleUserIds.has(uid)) continue
    userCreditsUsedMap.set(uid, (userCreditsUsedMap.get(uid) || 0) + (Number(row.listen_count) || 0))
    userPremiumListensMap.set(uid, (userPremiumListensMap.get(uid) || 0) + (Number(row.premium_listen_count) || 0))
    userFreeListensMap.set(uid, (userFreeListensMap.get(uid) || 0) + (Number(row.free_listen_count) || 0))
    userUnclassifiedListensMap.set(uid, (userUnclassifiedListensMap.get(uid) || 0) + (Number(row.unclassified_listen_count) || 0))
    userFlipsMap.set(uid, (userFlipsMap.get(uid) || 0) + (Number(row.flip_count) || 0))
    userCreditsSpentMap.set(uid, (userCreditsSpentMap.get(uid) || 0) + (Number(row.credits_spent) || 0))
  }

  // 사용자별 최근 앱 버전 + 플랫폼 + 언어 (vc_user_latest_meta RPC: user당 최신 1행)
  const userAppVersionMap = new Map<string, string>()
  const userPlatformMap = new Map<string, string>()
  const userLocaleMap = new Map<string, string>()
  const userCountryMap = new Map<string, string>()
  // 앱 이벤트 최근 시각 — 듣기/미리듣기만 한 유저는 user_analytics 기록이 없어 last_updated가
  // 비는데, 이벤트 시각을 활동일에 합쳐 "마지막 활동일"이 빈칸으로 뜨지 않게 한다.
  const userLastEventMap = new Map<string, string>()
  // vc_user_latest_meta 는 mv_user_latest_meta 롤업을 읽어 빠르고 안정적(user당 최신 1행)이라 그대로 매핑
  for (const row of ((metaRes.data || []) as Array<{ user_id: string | null; app_version: string | null; platform: string | null; locale: string | null; country: string | null; last_event: string | null }>)) {
    if (!row.user_id) continue
    const uid = canonicalOwnerId(row.user_id)
    const previousLastEvent = userLastEventMap.get(uid)
    const rowIsLatest = !previousLastEvent || !!row.last_event && row.last_event >= previousLastEvent
    if (rowIsLatest && row.app_version) userAppVersionMap.set(uid, row.app_version)
    if (rowIsLatest && row.platform) userPlatformMap.set(uid, row.platform)
    if (rowIsLatest && row.locale) userLocaleMap.set(uid, row.locale)
    if (rowIsLatest && row.country) userCountryMap.set(uid, row.country)
    if (row.last_event && rowIsLatest) userLastEventMap.set(uid, row.last_event)
  }

  // 사용자별 구매 크레딧 합계
  const userPurchasedMap = new Map<string, number>()
  for (const row of ((rollupRes.data || []) as Array<{ user_id: string | null; purchased_credits: number | string | null }>)) {
    if (!row.user_id) continue
    const uid = canonicalOwnerId(row.user_id)
    userPurchasedMap.set(uid, (userPurchasedMap.get(uid) || 0) + (Number(row.purchased_credits) || 0))
  }

  // 사용자별 오늘 증가분 + 7일 활동일
  const userActivityMap = new Map<string, { cardsToday: number; attemptsToday: number; listenToday: number; flipsToday: number; spentToday: number; activeDays7d: number; purchasedToday: number; balanceDeltaToday: number; sheetsDeltaToday: number }>()
  for (const row of ((activityRes.data || []) as Array<{ user_id: string | null; cards_today: number | string | null; attempts_today: number | string | null; listen_today: number | string | null; flips_today: number | string | null; spent_today: number | string | null; active_days_7d: number | null; purchased_today: number | string | null; balance_delta_today: number | string | null; sheets_delta_today: number | string | null }>)) {
    if (!row.user_id) continue
    const uid = canonicalOwnerId(row.user_id)
    const previous = userActivityMap.get(uid)
    userActivityMap.set(uid, {
      cardsToday: (previous?.cardsToday || 0) + (Number(row.cards_today) || 0),
      attemptsToday: (previous?.attemptsToday || 0) + (Number(row.attempts_today) || 0),
      listenToday: (previous?.listenToday || 0) + (Number(row.listen_today) || 0),
      flipsToday: (previous?.flipsToday || 0) + (Number(row.flips_today) || 0),
      spentToday: (previous?.spentToday || 0) + (Number(row.spent_today) || 0),
      activeDays7d: Math.max(previous?.activeDays7d || 0, Number(row.active_days_7d) || 0),
      purchasedToday: (previous?.purchasedToday || 0) + (Number(row.purchased_today) || 0),
      balanceDeltaToday: (previous?.balanceDeltaToday || 0) + (Number(row.balance_delta_today) || 0),
      sheetsDeltaToday: (previous?.sheetsDeltaToday || 0) + (Number(row.sheets_delta_today) || 0),
    })
  }

  // 사용자별 구매 고려 신호
  const userIntentMap = new Map<string, { premiumVoice: boolean; ai: boolean; banner: boolean; gated: boolean; lastIntent: string | null }>()
  for (const row of ((rollupRes.data || []) as Array<{ user_id: string | null; premium_voice: boolean | null; ai_feature: boolean | null; banner_tap: boolean | null; gated: boolean | null; last_intent: string | null }>)) {
    if (!row.user_id) continue
    const uid = canonicalOwnerId(row.user_id)
    const previous = userIntentMap.get(uid)
    userIntentMap.set(uid, {
      premiumVoice: !!row.premium_voice || !!previous?.premiumVoice,
      ai: !!row.ai_feature || !!previous?.ai,
      banner: !!row.banner_tap || !!previous?.banner,
      gated: !!row.gated || !!previous?.gated,
      lastIntent: [previous?.lastIntent, row.last_intent].filter(Boolean).sort().at(-1) || null,
    })
  }

  // 사용자별 타겟 오퍼 단계 + 지급 보너스 크레딧.
  // 단계 = 유저가 가진 오퍼들 중 가장 진행된 것(redeemed > snoozed > seen > sent > dismissed > expired).
  // 보너스 = redeemed_credits 합(오퍼로 지급된 무상 크레딧).
  const nowMsOffer = Date.now()
  const OFFER_SEEN_TTL_MS = 3 * 24 * 60 * 60 * 1000 // 확인(seen) 후 3일 지나면 만료
  const offerStageRank: Record<string, number> = { redeemed: 6, snoozed: 4, seen: 3, sent: 2, dismissed: 1, expired: 0 }
  // 단계 + 그 단계에 진입한 시각(발송일/열람일/전환일 등)
  const perOfferStage = (row: { status: string | null; seen_at: string | null; snoozed_at: string | null; redeemed_at: string | null; expires_at: string | null; created_at: string | null }): { stage: string; at: string | null } => {
    if (row.redeemed_at) return { stage: 'redeemed', at: row.redeemed_at }
    if (row.status === 'dismissed') return { stage: 'dismissed', at: row.created_at }
    if (row.status === 'expired') return { stage: 'expired', at: row.seen_at || row.expires_at || row.created_at }
    // 만료 판정: 확인(seen) 후 3일 경과 또는 하드캡(expires_at) 도래
    if (row.seen_at && new Date(row.seen_at).getTime() + OFFER_SEEN_TTL_MS < nowMsOffer) {
      return { stage: 'expired', at: new Date(new Date(row.seen_at).getTime() + OFFER_SEEN_TTL_MS).toISOString() }
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < nowMsOffer) return { stage: 'expired', at: row.expires_at }
    if (row.snoozed_at) return { stage: 'snoozed', at: row.snoozed_at }
    if (row.seen_at) return { stage: 'seen', at: row.seen_at }
    return { stage: 'sent', at: row.created_at }
  }
  const userOfferMap = new Map<string, { stage: string; stageAt: string | null; bonus: number }>()
  for (const row of ((offersRes.data || []) as Array<{ user_id: string | null; status: string | null; seen_at: string | null; snoozed_at: string | null; redeemed_at: string | null; redeemed_credits: number | string | null; expires_at: string | null; created_at: string | null }>)) {
    const uid = row.user_id
    if (!uid) continue
    const { stage, at } = perOfferStage(row)
    const bonus = Number(row.redeemed_credits) || 0
    const prev = userOfferMap.get(uid)
    if (!prev) userOfferMap.set(uid, { stage, stageAt: at, bonus })
    else {
      const furthest = offerStageRank[stage] > offerStageRank[prev.stage]
      userOfferMap.set(uid, {
        stage: furthest ? stage : prev.stage,
        stageAt: furthest ? at : prev.stageAt,
        bonus: prev.bonus + bonus,
      })
    }
  }

  // 설치일·최근 활동·기기 메타데이터를 같은 소유자에 귀속한다. 비로그인 저니는
  // user_id가 null이므로 device:<uuid> 계정으로 연결해야 사용자 행에서 정보가 사라지지 않는다.
  const journeyMetaMap = buildVoicecardsJourneyMetaMap(journeyRows, mergedDeviceOwners)
  const deviceOwnerMap = new Map<string, string>()
  const localAssetOwnerMap = new Map<string, string>()
  try {
    for (const row of journeyRows) {
      const rawOwnerId = voicecardsJourneyOwnerId(row)
      if (!row.device_id || !rawOwnerId) continue
      localAssetOwnerMap.set(row.device_id, rawOwnerId)
      deviceOwnerMap.set(row.device_id, canonicalOwnerId(rawOwnerId))
    }
  } catch (e) {
    console.error('[VoiceCards] device-owner map failed (non-fatal):', e)
  }

  // 비로그인 학습 이벤트는 user_id가 없어 로그인 사용자 전용 롤업에서 탈락한다.
  // device_id로 현재 소유자에 귀속하고, 로그인으로 병합된 기기는 Google 사용자 행에 합산한다.
  const anonymousLearningMap = new Map<string, VoicecardsAnonymousLearningMetrics>()
  try {
    const deviceIds = Array.from(deviceOwnerMap.keys())
    if (deviceIds.length > 0) {
      const anonymousLearningRows = await fetchAllPaged<VoicecardsAnonymousLearningRow>(() => vc
        .from('anonymous_events')
        .select('device_id, user_id, event_name, created_at, properties')
        .is('user_id', null)
        .in('device_id', deviceIds)
        .in('event_name', ['card_flipped_manual', 'card_attempted', 'tts_played', 'voice_preview_played', 'device_tts_played'])
        .order('created_at', { ascending: true }))
      for (const [ownerId, metrics] of buildVoicecardsAnonymousLearningMap(
        anonymousLearningRows,
        deviceOwnerMap,
        kstDateKey(new Date()),
      )) {
        if (visibleUserIds.has(ownerId)) anonymousLearningMap.set(ownerId, metrics)
      }
    }
  } catch (e) {
    console.error('[VoiceCards] anonymous learning map failed (non-fatal):', e)
  }
  totalAttempts += Array.from(anonymousLearningMap.values()).reduce((sum, metrics) => sum + metrics.attempts, 0)

  // 로컬 덱은 users.sheet_ids/user_analytics에 저장되지 않는다. 생성 이벤트의 card_count를
  // 사용자별로 접어 대시보드 시트·카드 수와 활성화 집계에 포함한다.
  //
  // flush 이벤트까지 함께 읽는 이유는 buildVoicecardsLocalAssetMap 참고 — 백업된
  // 로컬 덱은 Drive 시트가 되어 sheet_ids/user_analytics가 이미 세고 있다.
  let userLocalAssetsMap = new Map<string, VoicecardsLocalAssets>()
  let deviceActivatedIds = new Set<string>()
  try {
    const { data: localSheetRows } = await vc
      .from('anonymous_events')
      .select('device_id, created_at, event_name, properties')
      .in('event_name', [LOCAL_SHEET_CREATED_EVENT, LOCAL_SHEET_FLUSHED_EVENT])
    const { assets, activatedOwnerIds } = buildVoicecardsLocalAssetMap(
      (localSheetRows || []) as VoicecardsLocalSheetRow[],
      (deviceId) => {
        const ownerId = localAssetOwnerMap.get(deviceId) || `device:${deviceId}`
        return visibleUserIds.has(ownerId) ? ownerId : null
      },
      kstDateKey(new Date()),
    )
    userLocalAssetsMap = assets
    deviceActivatedIds = activatedOwnerIds
  } catch (e) {
    console.error('[VoiceCards] local-asset map failed (non-fatal):', e)
  }

  const localAssetsTotal = Array.from(userLocalAssetsMap.values()).reduce(
    (sum, assets) => ({ sheets: sum.sheets + assets.sheets, cards: sum.cards + assets.cards }),
    { sheets: 0, cards: 0 },
  )
  totalSheets += localAssetsTotal.sheets
  totalCards += localAssetsTotal.cards
  activeUsers = users.filter(u =>
    (Array.isArray(u.sheet_ids) && u.sheet_ids.length > 0) || (userLocalAssetsMap.get(u.user_id)?.sheets || 0) > 0
  ).length

  const userList = users.map(u => ({
    id: u.user_id,
    nickname: u.nickname,
    email: u.email || null,
    appVersion: userAppVersionMap.get(u.user_id) || journeyMetaMap.get(u.user_id)?.appVersion || null,
    platform: userPlatformMap.get(u.user_id) || journeyMetaMap.get(u.user_id)?.platform || null,
    locale: userLocaleMap.get(u.user_id) || journeyMetaMap.get(u.user_id)?.locale || null,
    country: userCountryMap.get(u.user_id) || journeyMetaMap.get(u.user_id)?.country || null,
    hasPurchased: !!u.has_purchased,
    credits: u.credits || 0,
    purchasedCredits: userPurchasedMap.get(u.user_id) || 0,
    bonusCredits: userOfferMap.get(u.user_id)?.bonus || 0,
    offerStage: userOfferMap.get(u.user_id)?.stage || null,
    offerStageAt: userOfferMap.get(u.user_id)?.stageAt || null,
    creditsUsed: (userCreditsUsedMap.get(u.user_id) || 0) + (anonymousLearningMap.get(u.user_id)?.listens || 0),
    premiumListens: userPremiumListensMap.get(u.user_id) || 0,
    freeListens: userFreeListensMap.get(u.user_id) || 0,
    unclassifiedListens: userUnclassifiedListensMap.get(u.user_id) || 0,
    creditsSpent: userCreditsSpentMap.get(u.user_id) || 0,
    hasFolder: !!u.folder_id,
    sheetCount: (u.sheet_ids?.length || 0) + (userLocalAssetsMap.get(u.user_id)?.sheets || 0),
    cards: (userCardsMap.get(u.user_id) || 0) + (userLocalAssetsMap.get(u.user_id)?.cards || 0),
    ownCards: (userOwnCardsMap.get(u.user_id) || 0) + (userLocalAssetsMap.get(u.user_id)?.cards || 0),
    flips: (userFlipsMap.get(u.user_id) || 0) + (anonymousLearningMap.get(u.user_id)?.flips || 0),
    attempts: (userAttemptsMap.get(u.user_id) || 0) + (anonymousLearningMap.get(u.user_id)?.attempts || 0),
    // 기기 계정 생성은 Google 로그인이 아니다. 사용자 표의 '로그인' 열은
    // 실제 Google 계정만 표시하고, 기기 계정은 installedAt으로만 신규 시점을 보여준다.
    createdAt: u.user_id.startsWith('device:') ? '' : u.created_at,
    activatedAt: u.user_id.startsWith('device:')
      ? userLocalAssetsMap.get(u.user_id)?.firstCreatedAt || null
      : u.created_at,
    installedAt: journeyMetaMap.get(u.user_id)?.firstSeenAt || null,
    cardsToday: (userActivityMap.get(u.user_id)?.cardsToday || 0) + (userLocalAssetsMap.get(u.user_id)?.cardsToday || 0),
    attemptsToday: (userActivityMap.get(u.user_id)?.attemptsToday || 0) + (anonymousLearningMap.get(u.user_id)?.attemptsToday || 0),
    listenToday: (userActivityMap.get(u.user_id)?.listenToday || 0) + (anonymousLearningMap.get(u.user_id)?.listensToday || 0),
    flipsToday: (userActivityMap.get(u.user_id)?.flipsToday || 0) + (anonymousLearningMap.get(u.user_id)?.flipsToday || 0),
    spentToday: userActivityMap.get(u.user_id)?.spentToday || 0,
    activeDays7d: Math.max(
      userActivityMap.get(u.user_id)?.activeDays7d || 0,
      journeyMetaMap.get(u.user_id)?.activeDays7d || 0,
    ),
    purchasedToday: userActivityMap.get(u.user_id)?.purchasedToday || 0,
    balanceDeltaToday: userActivityMap.get(u.user_id)?.balanceDeltaToday || 0,
    sheetsDeltaToday: (userActivityMap.get(u.user_id)?.sheetsDeltaToday || 0) + (userLocalAssetsMap.get(u.user_id)?.sheetsToday || 0),
    // 구매 신호 (단순화, 2026-07-09). CEO 정의: 핫리드 = 헤비 유저(TTS 많이 듣고 ·
    //   시트 많고 · 카드 많고 · 최근 연속 사용) 이면서 업그레이드 모달을 눌러본 미구매자.
    //   intentBanner = 크레딧/프리미엄(업그레이드) 배너·모달 탭. 나머지 intent 플래그는
    //   데이터로만 유지(표엔 핫리드+점수+업그레이드클릭만 노출).
    intentPremiumVoice: userIntentMap.get(u.user_id)?.premiumVoice || false,
    intentAi: userIntentMap.get(u.user_id)?.ai || false,
    intentBanner: userIntentMap.get(u.user_id)?.banner || false,
    intentGated: userIntentMap.get(u.user_id)?.gated || false,
    // 핫리드는 상대 기준(최근 7일 활성 미구매자 중 purchaseScore 상위 30%)이라 전체
    // 분포를 알아야 함 → 목록 조립 후 후처리에서 설정(아래 hotLead 후처리). 여기선 false.
    hotLead: false,
    // 구매 가능성 점수 — 헤비 유저 복합(결제자=몰입 듣기 패턴). 듣기(TTS) 볼륨을 기저로
    // 시트·카드·연속사용을 가산하고, 의도(배너/프리미엄보이스/AI)와 **소진 임박**(실사용자의
    // 낮은 잔액 — 결제는 크레딧이 바닥나는 순간 일어난다: cavon·elena)을 얹는다. 구매자=0.
    // ⚠️ 공식은 voice-cards migration 046(vc 데일리 다이제스트 SQL)과 동기 유지할 것.
    purchaseScore: (() => {
      if (u.has_purchased) return 0
      const listen = userCreditsUsedMap.get(u.user_id) || 0            // TTS/듣기 (주 신호)
      const sheets = u.sheet_ids?.length || 0
      const cards = userCardsMap.get(u.user_id) || 0
      const streak = userActivityMap.get(u.user_id)?.activeDays7d || 0
      const intent = userIntentMap.get(u.user_id)
      const clickedUpgrade = intent?.banner ? 20 : 0
      const premiumCurious = intent?.premiumVoice ? 10 : 0
      const aiCurious = intent?.ai ? 5 : 0
      const credits = u.credits || 0
      // 소진 임박 가산: 듣기 이력이 실재(≥20)하는 미구매자의 잔액이 낮을수록 타이밍 신호
      const urgency = listen >= 20 ? (credits <= 20 ? 30 : credits <= 50 ? 15 : 0) : 0
      return Math.round(listen + sheets * 5 + Math.min(cards, 300) * 0.2 + streak * 8 + clickedUpgrade + premiumCurious + aiCurious + urgency)
    })(),
    lastIntentAt: userIntentMap.get(u.user_id)?.lastIntent || null,
    // 학습 활동(user_analytics.last_updated)과 앱 이벤트 최근 시각 중 더 최근값
    lastActiveAt: (() => {
      const cands = [
        lastActivityMap.get(u.user_id),
        userLastEventMap.get(u.user_id),
        journeyMetaMap.get(u.user_id)?.lastSeenAt,
      ].filter(Boolean) as string[]
      return cands.length ? cands.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b)) : null
    })(),
  }))

  // 핫리드 = 최근 7일 활성(lastActiveAt ≤ 7일) 미구매자 중 purchaseScore 상위 30%.
  // 상대 기준이라 전체 분포를 본 뒤 후처리로 설정. (절대 임계값 대신 코호트 상위권.)
  {
    const nowMs = Date.now()
    const SEVEN_D = 7 * 864e5
    const pool = userList.filter(u =>
      !u.hasPurchased && u.purchaseScore > 0 &&
      !!u.lastActiveAt && (nowMs - new Date(u.lastActiveAt).getTime()) <= SEVEN_D,
    )
    pool.sort((a, b) => b.purchaseScore - a.purchaseScore)
    const topN = Math.ceil(pool.length * 0.30)
    const hotIds = new Set(pool.slice(0, topN).map(u => u.id))
    for (const u of userList) u.hotLead = hotIds.has(u.id)
  }

  // 최근 활동일 기준 정렬 (활동 있는 유저 먼저, 없으면 가입일 기준)
  userList.sort((a, b) => {
    const aDate = a.lastActiveAt || ''
    const bDate = b.lastActiveAt || ''
    if (aDate && bDate) return bDate.localeCompare(aDate)
    if (aDate) return -1
    if (bDate) return 1
    return b.createdAt.localeCompare(a.createdAt)
  })

  // 기기 계정과 구글 로그인을 가른다. 테이블은 둘 다 보여주지만(같은 사람이 로그인
  // 전후로 두 표에 나뉘지 않게), 퍼널의 "구글 로그인" 칸은 실제로 로그인한 사람만 센다.
  const isDeviceAccount = (uid: string) => uid.startsWith('device:')
  const liveDeviceAccounts = users.filter(u => isDeviceAccount(u.user_id) && !u.merged_into)
  const result: VoicecardsUserStats = {
    totalUsers: users.filter(u => !isDeviceAccount(u.user_id)).length,
    // 병합된 기기 계정(merged_into 있음)은 그 구글 계정으로 이미 세었으므로 뺀다.
    deviceAccounts: liveDeviceAccounts.length,
    // 그중 실제로 덱을 만든 수 — 퍼널의 "학습 활성화"에 구글 활성화와 함께 더해진다.
    deviceAccountsActivated: liveDeviceAccounts.filter(u => deviceActivatedIds.has(u.user_id)).length,
    activeUsers,
    totalSheets,
    totalCards,
    totalAttempts,
    totalCredits,
    dailyLearnActivity,
    dailyCardInventory,
    users: userList,
  }
  if (result.users.length) lastGoodUserStats = result
  return result
}

// ============================================================
// Anonymous Events 통계 (VoiceCards 자체 Supabase)
// ============================================================

export interface AnonymousEventStats {
  summary: {
    totalEvents: number
    totalDevices: number
    learnedDevices: number
    signinDevices: number
    learnConversionPct: number
    signinConversionPct: number
  }
  daily: Array<{
    date: string
    devices: number
    appOpened: number
    cardsLearned: number
    promptShown: number
    signinCompleted: number
    loggedDevices: number   // 그 날 로그인 이벤트가 있던 디바이스
    anonDevices: number     // 그 날 로그인 없던(익명) 디바이스. loggedDevices + anonDevices = devices
    newLoggedDevices?: number    // 그 날 가입한 로그인 디바이스(신규)
    memberLoggedDevices?: number // 그 날 로그인한 기존 회원 디바이스(회원)
    memberActive30?: number      // 직전 30일(당일 포함) 활동 회원 디바이스 distinct — 로그인율 분모(롤링 MAU)
  }>
  cumulativeDistinct: Array<{
    date: string
    devices: number   // 그 날까지 본 distinct device 수
    learned: number   // 학습 시도한 distinct device 수
    signin: number    // 가입 완료한 distinct device 수
  }>
  dailyCreditUsage: Array<{
    date: string
    // 이름과 달리 "일별 듣기 재생 횟수" (듣기 학습 차트 소스).
    // tts_played + voice_preview_played + device_tts_played — 기기 TTS(0크레딧) 포함.
    // 실제 크레딧 소진은 dailyCreditSpend(원장 기반)를 볼 것.
    credits: number
  }>
  // 일별 카드 앞뒤 수동 전환 (card_flipped_manual) — 활동 있는 날만 행 존재
  dailyFlips?: Array<{ date: string; flips: number }>
  // 일별 실제 크레딧 소진 — tts: TTS 차감(credits_changed/tts_premium), ai: AI 생성(ai_generation_success)
  dailyCreditSpend?: Array<{ date: string; tts: number; ai: number }>
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
  countries: Array<{ country: string; devices: number }>
  // 가입(signin_completed) 발화한 디바이스만 필터링한 분포
  signinPlatforms: Array<{ platform: string; devices: number }>
  signinLocales: Array<{ locale: string; devices: number }>
  signinCountries: Array<{ country: string; devices: number }>
  // 결제(credits_changed/reason=purchase) 발생한 디바이스만 필터링한 분포
  payingPlatforms: Array<{ platform: string; devices: number }>
  payingLocales: Array<{ locale: string; devices: number }>
  payingCountries: Array<{ country: string; devices: number }>
  // 스토어 등록정보 방문 (store_visits 테이블, 일별 플랫폼 합산) — 퍼널 최상단. 수집 전엔 빈 배열.
  storeVisits?: Array<{ date: string; visitors: number }>
  // 앱버전 분포 — 최근 30일 활동 기기 기준 (업데이트 전파속도)
  versions?: Array<{ version: string; devices: number }>
  versionsIos?: Array<{ version: string; devices: number }>
  versionsAndroid?: Array<{ version: string; devices: number }>
  // 비로그인 저니 (vc_device_journeys 뷰) — 스테이지 분포(전 기간) + 최근 14일 미로그인 기기
  journeys?: {
    stages: Array<{ stage: string; devices: number }>
    recentAnon: Array<{
      deviceId: string
      stage: string
      platform: string | null
      appVersion: string | null
      country: string | null
      firstSeenAt: string | null
      lastSeenAt: string
      activeDays: number
      activeDays7d: number
      cardsViewed: number
      cardsLearned: number
      flips: number
      creditsSpent: number
      addSheetOpens: number
      aiGenOpens: number
      signinClicks: number
    }>
  }
}

// 마지막 정상 집계 (프로세스 메모리) — RPC가 일시적으로 느려지거나(mv_real_users 리프레시 창)
// 실패할 때 인사이트 블록이 통째로 빠지는 대신 직전 값을 서빙한다.
let lastGoodAnonStats: AnonymousEventStats | null = null

export async function getAnonymousEventStats(): Promise<AnonymousEventStats | null> {
  if (!voicecardsSupabase) return null
  // 집계는 DB 함수 vc_event_stats()에서 1회 수행 — anonymous_events_real_users(중첩 뷰:
  // dedup + IP봇필터)를 페이지마다 재평가하던 전수 스캔(수만 행 전송)을 제거. 결과는 JS 집계와 동일.
  let { data, error } = await voicecardsSupabase.rpc('vc_event_stats')
  if (error || !data) {
    // 일시 오류(커넥션 풀 등)로 인사이트 블록이 통째로 빠지는 걸 막기 위해 1회 재시도
    console.error('[VoiceCards] vc_event_stats RPC failed, retrying once:', error)
    await new Promise(r => setTimeout(r, 700))
    ;({ data, error } = await voicecardsSupabase.rpc('vc_event_stats'))
    if (error || !data) {
      console.error('[VoiceCards] vc_event_stats RPC failed after retry:', error, lastGoodAnonStats ? '— serving last good snapshot' : '')
      return lastGoodAnonStats
    }
  }
  const stats = data as AnonymousEventStats
  // 스토어 방문(퍼널 최상단) — 일별 플랫폼 합산해 붙인다. 테이블이 비어 있으면 빈 배열.
  const { data: sv } = await voicecardsSupabase
    .from('store_visits')
    .select('date, visitors')
    .order('date', { ascending: true })
  const svByDate = new Map<string, number>()
  for (const r of (sv ?? []) as Array<{ date: string; visitors: number }>) {
    svByDate.set(r.date, (svByDate.get(r.date) ?? 0) + (Number(r.visitors) || 0))
  }
  stats.storeVisits = Array.from(svByDate.entries()).map(([date, visitors]) => ({ date, visitors }))
  // 비로그인 저니 — 실패해도 인사이트 블록 전체를 막지 않는다 (best-effort)
  try {
    type JourneyRow = {
      device_id: string
      journey_stage: string
      platform: string | null
      app_version: string | null
      country: string | null
      first_seen_at: string | null
      last_seen_at: string
      active_days: number | null
      active_days_7d: number | null
      anon_cards_viewed: number | null
      anon_cards_learned: number | null
      anon_flips: number | null
      anon_credits_spent: number | null
      add_sheet_opens: number | null
      ai_gen_opens: number | null
      signin_clicks: number | null
      signed_in: boolean
    }
    const fetchJourneys = () => voicecardsSupabase
      .from('vc_device_journeys')
      .select('device_id, journey_stage, platform, app_version, country, first_seen_at, last_seen_at, active_days, active_days_7d, anon_cards_viewed, anon_cards_learned, anon_flips, anon_credits_spent, add_sheet_opens, ai_gen_opens, signin_clicks, signed_in')
      .order('last_seen_at', { ascending: false })
      .limit(1000)
    const [initialJourneysRes, ceilingRes] = await Promise.all([
      fetchJourneys(),
      // 출시 버전 상한 — 개발자/테스트 제외한 실사용자 로그인 iOS 최고 버전 (vc_event_stats 와 동일 RPC).
      // App Store 심사/TestFlight 빌드는 미출시라 항상 이보다 높아 제외된다. 새 버전 출시로 상한 자동 상승.
      voicecardsSupabase.rpc('vc_released_ios_ceiling'),
    ])
    let journeysRes = initialJourneysRes
    if (journeysRes.error) {
      console.error('[VoiceCards] vc_device_journeys fetch failed, retrying once:', journeysRes.error)
      await new Promise(r => setTimeout(r, 700))
      journeysRes = await fetchJourneys()
    }
    if (journeysRes.error || !journeysRes.data) {
      throw journeysRes.error || new Error('vc_device_journeys returned no data')
    }
    const journeyRows = journeysRes.data as JourneyRow[]
    const stageRows = journeyRows
    // 전체 기간. 사용자 테이블과 한 표에 섞이므로 기간 기준이 같아야 한다
    // (2026-08-10 병합 전에는 최근 14일 100개 제한이었다 — 별도 카드였을 때의 기준).
    const anonRows = journeyRows.filter(row => !row.signed_in)
    const ceilingData = ceilingRes.data
    // semver 비교 (문자열 비교는 1.1.9 vs 1.1.10 오류라 숫자 파트로 비교)
    const cmpVer = (a: string, b: string): number => {
      const pa = a.split('.').map(n => parseInt(n, 10) || 0)
      const pb = b.split('.').map(n => parseInt(n, 10) || 0)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d) return d
      }
      return 0
    }
    const iosCeiling: string | null = (ceilingData as string | null) ?? null
    // 심사 빌드 판정: iOS + 출시 상한보다 높은 버전 (상한을 못 구하면 제외 안 함)
    const isReviewBuild = (platform: string | null, version: string | null): boolean =>
      platform === 'ios' && !!version && !!iosCeiling && cmpVer(version, iosCeiling) > 0
    const stageOrder = ['opened', 'demo', 'intent', 'signin_attempted', 'signed_in']
    const counts = new Map<string, number>()
    for (const r of stageRows) {
      if (isReviewBuild(r.platform, r.app_version)) continue
      counts.set(r.journey_stage, (counts.get(r.journey_stage) ?? 0) + 1)
    }
    stats.journeys = {
      stages: stageOrder.map(stage => ({ stage, devices: counts.get(stage) ?? 0 })),
      recentAnon: (anonRows as unknown as Array<Record<string, unknown>>)
        .filter(r => !isReviewBuild((r.platform as string | null) ?? null, (r.app_version as string | null) ?? null))
        .map(r => ({
        deviceId: String(r.device_id),
        stage: String(r.journey_stage),
        platform: (r.platform as string | null) ?? null,
        appVersion: (r.app_version as string | null) ?? null,
        country: (r.country as string | null) ?? null,
        firstSeenAt: (r.first_seen_at as string | null) ?? null,
        lastSeenAt: String(r.last_seen_at),
        activeDays: Number(r.active_days) || 0,
        activeDays7d: Number(r.active_days_7d) || 0,
        cardsViewed: Number(r.anon_cards_viewed) || 0,
        cardsLearned: Number(r.anon_cards_learned) || 0,
        flips: Number(r.anon_flips) || 0,
        creditsSpent: Number(r.anon_credits_spent) || 0,
        addSheetOpens: Number(r.add_sheet_opens) || 0,
        aiGenOpens: Number(r.ai_gen_opens) || 0,
        signinClicks: Number(r.signin_clicks) || 0,
      })),
    }
  } catch (e) {
    console.error('[VoiceCards] vc_device_journeys fetch failed (non-fatal):', e)
    if (lastGoodAnonStats?.journeys) stats.journeys = lastGoodAnonStats.journeys
  }
  if (stats.summary.totalEvents > 0) {
    lastGoodAnonStats = stats
    return stats
  }
  return lastGoodAnonStats
}
