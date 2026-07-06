// VoiceCards API 서버사이드 유틸리티
// App Store Connect API와 Google Play Developer API 연동

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as jose from 'jose'
import { kstDateKey } from '@/lib/kst'

// Supabase 클라이언트 (service_role) — willow-dash credentials/cache 저장
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// VoiceCards 앱 자체 Supabase — 회원 수 조회용
const voicecardsSupabase = process.env.VOICECARDS_SUPABASE_URL
  ? createClient(process.env.VOICECARDS_SUPABASE_URL, process.env.VOICECARDS_SUPABASE_KEY!)
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
const CREDIT_PRODUCT_PRICES_USD: Record<string, number> = {
  'com.monor.voicecards.credits.1000': 9.99,
  'com.monor.voicecards.credits.5500': 49.99,
  'com.monor.voicecards.credits.12000': 99.99,
}

// 상품별 판매 크레딧 수 (매출을 크레딧 볼륨으로 집계)
const CREDIT_PRODUCT_CREDITS: Record<string, number> = {
  'com.monor.voicecards.credits.1000': 1000,
  'com.monor.voicecards.credits.5500': 5500,
  'com.monor.voicecards.credits.12000': 12000,
}

const EXCLUDED_VOICECARDS_NICKNAMES = new Set(['류하아빠', '큐트도넛'])
const EXCLUDED_VOICECARDS_EMAIL_DOMAINS = ['cloudtestlabaccounts.com']
// Synthetic/bot signup email patterns — kept in sync with the app's own bot
// definition (voice-cards scripts/ceo-report-prompt.md):
//  - Google Play test bots:         name.NNN@gmail.com  (dot + 3+ digits)
//  - structured batch-naming abuse: ...batchNN@gmail.com / waveNNbatchNN
//    (first seen 2026-06-30, e.g. wave31batch01@gmail.com — NOT a dev test acct).
// Excluded from BOTH the insight stat cards and the user list, since
// getVoicecardsUserStats derives both from the same filtered `users` set.
const EXCLUDED_VOICECARDS_EMAIL_PATTERNS: RegExp[] = [
  /\.[0-9]{3,}@gmail\.com$/i,
  /batch[0-9]+@gmail\.com$/i,
  /wave[0-9]+batch[0-9]+/i,
]
// 관리자/내부 테스트 계정 (정확 일치) — 2026-07-03 willowinvt 관리자 계정 추가
const EXCLUDED_VOICECARDS_EMAILS = new Set(['dw.kim@willowinvt.com'])

function isExcludedVoicecardsEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  if (EXCLUDED_VOICECARDS_EMAILS.has(e)) return true
  if (EXCLUDED_VOICECARDS_EMAIL_DOMAINS.some(domain => e.endsWith(`@${domain}`))) return true
  return EXCLUDED_VOICECARDS_EMAIL_PATTERNS.some(re => re.test(e))
}

function isExcludedVoicecardsUser(user: { nickname?: string | null; email?: string | null }): boolean {
  return !!(user.nickname && EXCLUDED_VOICECARDS_NICKNAMES.has(user.nickname)) || isExcludedVoicecardsEmail(user.email)
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
  const data: Array<{ created_at: string; platform: string | null; properties: Record<string, unknown> | null }> = []
  let from = 0

  while (true) {
    const { data: page, error } = await voicecardsSupabase
      .from('anonymous_events')
      .select('created_at, platform, properties')
      .eq('event_name', 'credits_changed')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error || !page?.length) break
    data.push(...(page as Array<{ created_at: string; platform: string | null; properties: Record<string, unknown> | null }>))
    if (page.length < PAGE) break
    from += PAGE
  }

  for (const row of data) {
    const props = row.properties || {}
    if (props.reason !== 'purchase') continue
    const price = CREDIT_PRODUCT_PRICES_USD[String(props.product_id)]
    if (!price) continue
    const date = kstDateKey(row.created_at) // KST 날짜
    // 판매 크레딧: 상품 매핑 우선, 없으면 이벤트의 credits_changed 폴백
    const credits = CREDIT_PRODUCT_CREDITS[String(props.product_id)] ?? Math.max(0, Number(props.credits_changed) || 0)
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
      .from('anonymous_events_real_users')
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
  totalUsers: number
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
    creditsUsed: number      // 듣기 학습 횟수 (tts_played + voice_preview_played). AI 카드 생성은 사용량 적어 제외
    sheetCount: number
    cards: number
    attempts: number
    cardsToday: number        // 오늘 카드 증가분
    attemptsToday: number     // 오늘 말하기 증가분
    listenToday: number       // 오늘 듣기 증가분
    activeDays7d: number      // 최근 7일 중 활동한 날짜 수 (0-7)
    createdAt: string
    lastActiveAt: string | null
  }>
}

export async function getVoicecardsUserStats(): Promise<VoicecardsUserStats> {
  const empty: VoicecardsUserStats = {
    totalUsers: 0, activeUsers: 0, totalSheets: 0,
    totalCards: 0, totalAttempts: 0, totalCredits: 0,
    dailyLearnActivity: [], dailyCardInventory: [], users: [],
  }

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
  const [usersRes, analyticsRes, lastActivityRes, timeSeriesRes, listenRes, metaRes, purchasedRes, activityRes] = await Promise.all([
    vc.from('users').select('*').order('created_at', { ascending: false }),
    vc.from('user_analytics').select('user_id, total_cards, total_attempts'),
    vc.from('user_analytics').select('user_id, last_updated'),
    fetchAllPaged<{ user_id: string; date: string; problems_learned: number; attempts: number }>(
      () => vc.from('time_series_analytics').select('user_id, date, problems_learned, attempts').order('date', { ascending: true })
    ),
    // 듣기 학습 횟수 — user당 1행으로 DB 집계 (전수 이벤트 스캔 5만+행 회피)
    vc.rpc('vc_user_listen_counts'),
    // 사용자별 최신 앱버전/플랫폼/언어/국가 + 최근 이벤트 시각 — user당 1행 (DISTINCT ON)
    vc.rpc('vc_user_latest_meta'),
    // 사용자별 구매 크레딧 합계 (purchase 이벤트, 봇 제외)
    vc.rpc('vc_user_purchased_credits'),
    // 사용자별 오늘 증가분(카드/말하기/듣기) + 최근 7일 활동일 수
    vc.rpc('vc_user_activity_deltas'),
  ])

  if (usersRes.error) {
    console.error('[VoiceCards] Error fetching users:', usersRes.error)
    return empty
  }

  const allUsers = usersRes.data || []
  const excludedUserIds = new Set(
    allUsers
      .filter(u => isExcludedVoicecardsUser(u))
      .map(u => u.user_id)
  )
  const users = allUsers.filter(u => !excludedUserIds.has(u.user_id))
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

  const activeUsers = users.filter(u =>
    u.sheet_ids && Array.isArray(u.sheet_ids) && u.sheet_ids.length > 0
  ).length

  // 유저별 보유 카드 수/말하기 시도 맵 (total_cards = 시트별 보유 카드, 합산 = 전체 보유 카드)
  const userAttemptsMap = new Map<string, number>()
  const userCardsMap = new Map<string, number>()
  for (const a of analytics) {
    userAttemptsMap.set(a.user_id, (userAttemptsMap.get(a.user_id) || 0) + (Number(a.total_attempts) || 0))
    userCardsMap.set(a.user_id, (userCardsMap.get(a.user_id) || 0) + (Number(a.total_cards) || 0))
  }

  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0)
  const totalSheets = users.reduce((sum, u) => sum + (Array.isArray(u.sheet_ids) ? u.sheet_ids.length : 0), 0)

  // 일별 보유 카드 스냅샷 — 테이블 존재 시에만 채움 (미존재 시 조용히 빈 배열)
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
  const totalCards = Array.from(userCardsMap.values()).reduce((sum, n) => sum + n, 0)
  // 누적 말하기 시도 (user_analytics.total_attempts 합) — 사용자 리스트 "말하기" 합과 일치
  const totalAttempts = Array.from(userAttemptsMap.values()).reduce((sum, n) => sum + n, 0)

  // 사용자별 듣기 학습 횟수 (이벤트 1건 = 1회)
  // 포함: tts_played, voice_preview_played (AI 카드 생성은 사용량 적어 제외)
  const userCreditsUsedMap = new Map<string, number>()
  for (const row of ((listenRes.data || []) as Array<{ user_id: string | null; listen_count: number }>)) {
    const uid = row.user_id
    if (!uid || !visibleUserIds.has(uid)) continue
    userCreditsUsedMap.set(uid, Number(row.listen_count) || 0)
  }

  // 사용자별 최근 앱 버전 + 플랫폼 + 언어 (vc_user_latest_meta RPC: user당 최신 1행)
  const userAppVersionMap = new Map<string, string>()
  const userPlatformMap = new Map<string, string>()
  const userLocaleMap = new Map<string, string>()
  const userCountryMap = new Map<string, string>()
  // 앱 이벤트 최근 시각 — 듣기/미리듣기만 한 유저는 user_analytics 기록이 없어 last_updated가
  // 비는데, 이벤트 시각을 활동일에 합쳐 "마지막 활동일"이 빈칸으로 뜨지 않게 한다.
  const userLastEventMap = new Map<string, string>()
  // RPC가 user당 1행(최신)을 반환하므로 첫 등장 판별 없이 그대로 매핑
  for (const row of ((metaRes.data || []) as Array<{ user_id: string | null; app_version: string | null; platform: string | null; locale: string | null; country: string | null; last_event: string | null }>)) {
    if (!row.user_id) continue
    if (row.app_version) userAppVersionMap.set(row.user_id, row.app_version)
    if (row.platform) userPlatformMap.set(row.user_id, row.platform)
    if (row.locale) userLocaleMap.set(row.user_id, row.locale)
    if (row.country) userCountryMap.set(row.user_id, row.country)
    if (row.last_event) userLastEventMap.set(row.user_id, row.last_event)
  }

  // 사용자별 구매 크레딧 합계
  const userPurchasedMap = new Map<string, number>()
  for (const row of ((purchasedRes.data || []) as Array<{ user_id: string | null; purchased_credits: number | string | null }>)) {
    if (row.user_id) userPurchasedMap.set(row.user_id, Number(row.purchased_credits) || 0)
  }

  // 사용자별 오늘 증가분 + 7일 활동일
  const userActivityMap = new Map<string, { cardsToday: number; attemptsToday: number; listenToday: number; activeDays7d: number }>()
  for (const row of ((activityRes.data || []) as Array<{ user_id: string | null; cards_today: number | string | null; attempts_today: number | string | null; listen_today: number | string | null; active_days_7d: number | null }>)) {
    if (row.user_id) userActivityMap.set(row.user_id, {
      cardsToday: Number(row.cards_today) || 0,
      attemptsToday: Number(row.attempts_today) || 0,
      listenToday: Number(row.listen_today) || 0,
      activeDays7d: Number(row.active_days_7d) || 0,
    })
  }

  const userList = users.map(u => ({
    id: u.user_id,
    nickname: u.nickname,
    email: u.email || null,
    appVersion: userAppVersionMap.get(u.user_id) || null,
    platform: userPlatformMap.get(u.user_id) || null,
    locale: userLocaleMap.get(u.user_id) || null,
    country: userCountryMap.get(u.user_id) || null,
    hasPurchased: !!u.has_purchased,
    credits: u.credits || 0,
    purchasedCredits: userPurchasedMap.get(u.user_id) || 0,
    creditsUsed: userCreditsUsedMap.get(u.user_id) || 0,
    sheetCount: u.sheet_ids?.length || 0,
    cards: userCardsMap.get(u.user_id) || 0,
    attempts: userAttemptsMap.get(u.user_id) || 0,
    createdAt: u.created_at,
    cardsToday: userActivityMap.get(u.user_id)?.cardsToday || 0,
    attemptsToday: userActivityMap.get(u.user_id)?.attemptsToday || 0,
    listenToday: userActivityMap.get(u.user_id)?.listenToday || 0,
    activeDays7d: userActivityMap.get(u.user_id)?.activeDays7d || 0,
    // 학습 활동(user_analytics.last_updated)과 앱 이벤트 최근 시각 중 더 최근값
    lastActiveAt: (() => {
      const cands = [lastActivityMap.get(u.user_id), userLastEventMap.get(u.user_id)].filter(Boolean) as string[]
      return cands.length ? cands.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b)) : null
    })(),
  }))

  // 최근 활동일 기준 정렬 (활동 있는 유저 먼저, 없으면 가입일 기준)
  userList.sort((a, b) => {
    const aDate = a.lastActiveAt || ''
    const bDate = b.lastActiveAt || ''
    if (aDate && bDate) return bDate.localeCompare(aDate)
    if (aDate) return -1
    if (bDate) return 1
    return b.createdAt.localeCompare(a.createdAt)
  })

  return {
    totalUsers: users.length,
    activeUsers,
    totalSheets,
    totalCards,
    totalAttempts,
    totalCredits,
    dailyLearnActivity,
    dailyCardInventory,
    users: userList,
  }
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
  }>
  cumulativeDistinct: Array<{
    date: string
    devices: number   // 그 날까지 본 distinct device 수
    learned: number   // 학습 시도한 distinct device 수
    signin: number    // 가입 완료한 distinct device 수
  }>
  dailyCreditUsage: Array<{
    date: string
    // 크레딧 사용 = AI 생성 카드 수 + tts_played 재생 횟수 (둘 다 1크레딧/건 가정)
    credits: number
  }>
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
}

export async function getAnonymousEventStats(): Promise<AnonymousEventStats | null> {
  if (!voicecardsSupabase) return null
  // 집계는 DB 함수 vc_event_stats()에서 1회 수행 — anonymous_events_real_users(중첩 뷰:
  // dedup + IP봇필터)를 페이지마다 재평가하던 전수 스캔(수만 행 전송)을 제거. 결과는 JS 집계와 동일.
  const { data, error } = await voicecardsSupabase.rpc('vc_event_stats')
  if (error || !data) {
    console.error('[VoiceCards] vc_event_stats RPC failed:', error)
    return null
  }
  const stats = data as AnonymousEventStats
  return stats.summary.totalEvents > 0 ? stats : null
}
