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
      newDownloads: 0,
    }

    // Sales Report 파싱 (TSV 형식)
    // Apple TSV 컬럼:
    //  0: Provider  1: Provider Country  2: SKU  3: Developer  4: Title
    //  5: Version  6: Product Type Identifier  7: Units  8: Developer Proceeds
    //  9: Begin Date  10: End Date  11: Customer Currency  12: Country Code
    //  13: Currency of Proceeds  14: Apple Identifier  15: Customer Price
    //  16: Promo Code  17: Parent Identifier  18: Subscription  19: Period
    //  20: Category  21: CMB  22: Device  23: Supported Platforms
    //
    // Product Type Identifiers:
    //  1, 1F, 1T, F1, FI1 = App download (new installs)
    //  7, 7F, 7T          = Update (not new download)
    //  IA1, IA9, IAC, IAY = In-App Purchase / Subscription
    const DOWNLOAD_TYPES = new Set(['1', '1F', '1T', 'F1', 'FI1'])
    const SUBSCRIPTION_TYPES = new Set(['IAC', 'IAY'])

    if (salesResult.success && typeof salesResult.data === 'string') {
      const lines = salesResult.data.split('\n')
      const header = lines[0]?.split('\t') || []
      const colIdx = (name: string) => header.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()))

      // 컬럼 인덱스 (헤더 기반, 없으면 고정 위치 fallback)
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

        // 매출 합산 (모든 항목)
        stats.revenue += proceeds

        // 신규 다운로드 (앱 설치만)
        if (DOWNLOAD_TYPES.has(productType)) {
          stats.newDownloads += Math.max(0, units)
        }

        // 구독 관련
        if (SUBSCRIPTION_TYPES.has(productType)) {
          if (units > 0) stats.newSubscriptions += units
          if (units < 0) stats.churnedSubscriptions += Math.abs(units)
        }
      }
    }

    // Subscription groups 데이터에서 활성 구독자 수 추출
    if (subscriptionResult.success && subscriptionResult.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subData = subscriptionResult.data as any
      if (subData?.data && Array.isArray(subData.data)) {
        stats.activeSubscriptions = subData.data.length
      }
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
