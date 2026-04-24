import { NextResponse } from 'next/server'
import {
  getCombinedStats,
  getConnectionStatus,
  getCachedStatsRange,
  fetchAndCacheIosStats,
  getVoicecardsUserStats,
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

    // 연결 상태 확인 + 회원 수 조회 (병렬)
    const [connectionStatus, userStats] = await Promise.all([
      getConnectionStatus(),
      getVoicecardsUserStats(),
    ])

    // 캐시 확인
    const [iosTimeSeries, androidTimeSeries] = await Promise.all([
      getCachedStatsRange('ios', startDate, endDate),
      getCachedStatsRange('android', startDate, endDate),
    ])

    // 캐시가 비어있고 iOS 연결됨 → Apple API 직접 호출하여 캐시 채우기
    if (iosTimeSeries.length === 0 && connectionStatus.ios.connected) {
      // 최근 7일치만 live fetch (Apple API rate limit 고려)
      const dates: string[] = []
      const d = new Date(endDate)
      for (let i = 0; i < 7; i++) {
        d.setDate(d.getDate() - (i === 0 ? 0 : 1))
        dates.push(d.toISOString().split('T')[0])
      }

      const results = await Promise.allSettled(
        dates.map(date => fetchAndCacheIosStats(date))
      )

      // 성공한 결과를 timeSeries에 추가
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          iosTimeSeries.push(r.value)
        }
      }
      iosTimeSeries.sort((a, b) => a.date.localeCompare(b.date))
    }

    // 통합 통계 조회 (캐시 기반 — 위에서 채웠으므로 다시 조회)
    const stats = await getCombinedStats(startDate, endDate)

    // 날짜별 통합 차트 데이터
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
      userStats,
    })
  } catch (error) {
    console.error('Error fetching combined stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
