import { NextResponse } from 'next/server'
import {
  getCredentials,
  fetchIosSalesReport,
  fetchIosSubscriptionStats,
  getCachedStats,
  saveCachedStats,
  type IAPStats,
} from '@/lib/voicecards-server'

// GET: iOS 통계 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const forceRefresh = searchParams.get('refresh') === 'true'

    // 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      const cached = await getCachedStats('ios', date)
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached,
          cached: true,
        })
      }
    }

    // 인증 정보 확인
    const creds = await getCredentials()
    if (!creds?.ios_issuer_id || !creds?.ios_key_id || !creds?.ios_private_key) {
      return NextResponse.json(
        { error: 'iOS credentials not configured', code: 'NO_CREDENTIALS' },
        { status: 400 }
      )
    }

    // Sales Report 조회
    const salesResult = await fetchIosSalesReport(creds, {
      reportDate: date,
      reportType: 'SALES',
    })

    // Subscription Report 조회
    const subscriptionResult = creds.ios_app_id
      ? await fetchIosSubscriptionStats(creds, creds.ios_app_id)
      : { success: false, error: 'No app ID configured' }

    // 결과 파싱 및 통계 생성
    // Note: 실제 App Store Connect 응답 형식에 맞게 파싱 로직 구현 필요
    const stats: IAPStats = {
      platform: 'ios',
      date,
      revenue: 0,
      currency: 'KRW',
      activeSubscriptions: 0,
      newSubscriptions: 0,
      churnedSubscriptions: 0,
      renewedSubscriptions: 0,
      refundCount: 0,
      refundAmount: 0,
    }

    // Sales Report 파싱 (TSV 형식)
    if (salesResult.success && typeof salesResult.data === 'string') {
      const lines = salesResult.data.split('\n')
      // TSV 헤더 및 데이터 파싱
      // 실제 형식에 맞게 구현 필요
      for (const line of lines.slice(1)) {
        const cols = line.split('\t')
        if (cols.length > 0) {
          // 매출 합산 로직
          const proceeds = parseFloat(cols[8]) || 0 // Developer Proceeds column
          stats.revenue += proceeds
        }
      }
    }

    // Subscription 데이터 파싱
    if (subscriptionResult.success && subscriptionResult.data) {
      // Subscription groups 데이터에서 통계 추출
      // 실제 응답 형식에 맞게 구현 필요
    }

    // 캐시 저장
    await saveCachedStats(stats)

    return NextResponse.json({
      success: true,
      data: stats,
      cached: false,
      rawSales: salesResult.success ? 'available' : salesResult.error,
      rawSubscriptions: subscriptionResult.success ? 'available' : subscriptionResult.error,
    })
  } catch (error) {
    console.error('Error fetching iOS stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch iOS statistics' },
      { status: 500 }
    )
  }
}
