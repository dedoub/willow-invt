import { NextResponse } from 'next/server'
import {
  getCredentials,
  fetchAndroidEarningsReport,
  getCachedStats,
  saveCachedStats,
  type IAPStats,
} from '@/lib/voicecards-server'

// GET: Android 통계 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
    const forceRefresh = searchParams.get('refresh') === 'true'

    // 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      const cached = await getCachedStats('android', date)
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
    if (!creds?.android_service_account || !creds?.android_package_name) {
      return NextResponse.json(
        { error: 'Android credentials not configured', code: 'NO_CREDENTIALS' },
        { status: 400 }
      )
    }

    // YYYYMM 형식으로 변환
    const yearMonth = date.replace(/-/g, '').substring(0, 6)

    // Earnings Report 조회
    const earningsResult = await fetchAndroidEarningsReport(creds, {
      yearMonth,
    })

    // 결과 파싱 및 통계 생성
    // Note: 실제 Google Play Console API 응답 형식에 맞게 파싱 로직 구현 필요
    const stats: IAPStats = {
      platform: 'android',
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

    // Earnings Report 파싱
    if (earningsResult.success && earningsResult.data) {
      // Google Play 응답 형식에 맞게 파싱
      // 실제 구현 시 API 문서 참조 필요
    }

    // 캐시 저장
    await saveCachedStats(stats)

    return NextResponse.json({
      success: true,
      data: stats,
      cached: false,
      rawEarnings: earningsResult.success ? 'available' : earningsResult.error,
    })
  } catch (error) {
    console.error('Error fetching Android stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Android statistics' },
      { status: 500 }
    )
  }
}
