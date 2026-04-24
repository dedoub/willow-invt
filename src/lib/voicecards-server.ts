// VoiceCards API 서버사이드 유틸리티
// App Store Connect API와 Google Play Developer API 연동

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as jose from 'jose'

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
// 통합 통계
// ============================================================

// 통합 통계 조회 (캐시 우선)
export async function getCombinedStats(
  startDate: string,
  endDate: string
): Promise<CombinedStats> {
  const [iosStats, androidStats] = await Promise.all([
    getCachedStatsRange('ios', startDate, endDate),
    getCachedStatsRange('android', startDate, endDate),
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

  return {
    ios: latestIos,
    android: latestAndroid,
    combined: {
      totalRevenue: iosSum.revenue + androidSum.revenue,
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
  users: Array<{
    nickname: string | null
    credits: number
    sheetCount: number
    attempts: number
    createdAt: string
    lastActiveAt: string | null
  }>
}

export async function getVoicecardsUserStats(): Promise<VoicecardsUserStats> {
  const empty: VoicecardsUserStats = {
    totalUsers: 0, activeUsers: 0, totalSheets: 0,
    totalCards: 0, totalAttempts: 0, totalCredits: 0, users: [],
  }

  if (!voicecardsSupabase) {
    console.log('[VoiceCards] VoiceCards Supabase not configured')
    return empty
  }

  // 유저 목록 + 학습 통계 + 마지막 활동일 병렬 조회
  const [usersRes, analyticsRes, lastActivityRes] = await Promise.all([
    voicecardsSupabase.from('users').select('*').order('created_at', { ascending: false }),
    voicecardsSupabase.from('user_analytics').select('user_id, total_cards, total_attempts'),
    voicecardsSupabase.from('user_analytics').select('user_id, last_updated'),
  ])

  if (usersRes.error) {
    console.error('[VoiceCards] Error fetching users:', usersRes.error)
    return empty
  }

  const users = usersRes.data || []
  const analytics = analyticsRes.data || []

  // 유저별 마지막 활동일 계산
  const lastActivityMap = new Map<string, string>()
  for (const row of (lastActivityRes.data || [])) {
    const existing = lastActivityMap.get(row.user_id)
    if (!existing || row.last_updated > existing) {
      lastActivityMap.set(row.user_id, row.last_updated)
    }
  }

  const activeUsers = users.filter(u =>
    u.sheet_ids && Array.isArray(u.sheet_ids) && u.sheet_ids.length > 0
  ).length

  // 유저별 학습 시도 맵
  const userAttemptsMap = new Map<string, number>()
  for (const a of analytics) {
    userAttemptsMap.set(a.user_id, (userAttemptsMap.get(a.user_id) || 0) + (Number(a.total_attempts) || 0))
  }

  const totalCards = analytics.reduce((sum, a) => sum + (Number(a.total_cards) || 0), 0)
  const totalAttempts = analytics.reduce((sum, a) => sum + (Number(a.total_attempts) || 0), 0)
  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0)

  const userList = users.map(u => ({
    nickname: u.nickname,
    credits: u.credits || 0,
    sheetCount: u.sheet_ids?.length || 0,
    attempts: userAttemptsMap.get(u.user_id) || 0,
    createdAt: u.created_at,
    lastActiveAt: lastActivityMap.get(u.user_id) || null,
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
    totalSheets: analytics.length,
    totalCards,
    totalAttempts,
    totalCredits,
    users: userList,
  }
}
