// VoiceCards API 서버사이드 유틸리티
// App Store Connect API와 Google Play Developer API 연동

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import * as jose from 'jose'

// Supabase 클라이언트 (service_role)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// 타입 정의
export interface VoicecardsCredentials {
  id?: string
  user_id: string
  // App Store Connect
  ios_issuer_id?: string | null
  ios_key_id?: string | null
  ios_private_key?: string | null
  ios_app_id?: string | null
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

// 인증 정보 저장
export async function saveCredentials(creds: Partial<VoicecardsCredentials>): Promise<{ success: boolean; error?: string }> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('voicecards_credentials')
    .upsert({
      user_id: userId,
      ios_issuer_id: creds.ios_issuer_id,
      ios_key_id: creds.ios_key_id,
      ios_private_key: creds.ios_private_key,
      ios_app_id: creds.ios_app_id,
      android_service_account: creds.android_service_account,
      android_package_name: creds.android_package_name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('Error saving credentials:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// 인증 정보 조회
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

// 연결 상태 확인
export async function getConnectionStatus(): Promise<{
  ios: { connected: boolean; appId?: string }
  android: { connected: boolean; packageName?: string }
}> {
  const creds = await getCredentials()

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
    const endpoint = `/v1/salesReports?filter[reportDate]=${params.reportDate}&filter[reportType]=${reportType}&filter[reportSubType]=SUMMARY&filter[vendorNumber]=${creds.ios_app_id || ''}&filter[frequency]=DAILY`

    const response = await callAppStoreAPI(endpoint, jwt)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `App Store API error: ${response.status} - ${JSON.stringify(errorData)}`
      }
    }

    // Sales reports return gzip-compressed TSV
    const data = await response.text()
    return { success: true, data }
  } catch (error) {
    console.error('Error fetching iOS sales report:', error)
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
    },
    dateRange: {
      start: startDate,
      end: endDate,
    },
  }
}
