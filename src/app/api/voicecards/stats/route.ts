import { NextResponse } from 'next/server'
import {
  getCombinedStats,
  getConnectionStatus,
  getCachedStatsRange,
} from '@/lib/voicecards-server'

// GET: 통합 통계 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // 날짜 범위 파라미터
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const startDate = searchParams.get('startDate') || (() => {
      const d = new Date(endDate)
      d.setDate(d.getDate() - 30) // 기본 30일
      return d.toISOString().split('T')[0]
    })()

    // 연결 상태 확인
    const connectionStatus = await getConnectionStatus()

    // 통합 통계 조회
    const stats = await getCombinedStats(startDate, endDate)

    // 차트용 시계열 데이터
    const [iosTimeSeries, androidTimeSeries] = await Promise.all([
      getCachedStatsRange('ios', startDate, endDate),
      getCachedStatsRange('android', startDate, endDate),
    ])

    // 날짜별 통합 데이터 생성
    const dateMap = new Map<string, { ios: number; android: number; total: number }>()

    for (const stat of iosTimeSeries) {
      const existing = dateMap.get(stat.date) || { ios: 0, android: 0, total: 0 }
      existing.ios = stat.revenue
      existing.total += stat.revenue
      dateMap.set(stat.date, existing)
    }

    for (const stat of androidTimeSeries) {
      const existing = dateMap.get(stat.date) || { ios: 0, android: 0, total: 0 }
      existing.android = stat.revenue
      existing.total += stat.revenue
      dateMap.set(stat.date, existing)
    }

    // 정렬된 시계열 데이터
    const chartData = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        ...values,
      }))

    return NextResponse.json({
      success: true,
      connection: connectionStatus,
      stats,
      chartData,
    })
  } catch (error) {
    console.error('Error fetching combined stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
