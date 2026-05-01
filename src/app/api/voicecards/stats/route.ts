import { NextResponse } from 'next/server'
import {
  getCombinedStats,
  getConnectionStatus,
  getCachedStatsRange,
  fetchAndCacheIosStats,
  getVoicecardsUserStats,
  getAnonymousEventStats,
} from '@/lib/voicecards-server'

export const maxDuration = 300

// GET: 통합 통계 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // 날짜 범위 파라미터 (기본: 올해 1/1 ~ 오늘)
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const startDate = searchParams.get('startDate') || `${new Date().getFullYear()}-01-01`
    const backfill = searchParams.get('backfill') === '1'

    // 연결 상태 확인 + 회원 수 + 익명 이벤트 조회 (병렬)
    const [connectionStatus, userStats, anonymousStats] = await Promise.all([
      getConnectionStatus(),
      getVoicecardsUserStats(),
      getAnonymousEventStats(),
    ])

    // 캐시 확인
    const [iosTimeSeries, androidTimeSeries] = await Promise.all([
      getCachedStatsRange('ios', startDate, endDate),
      getCachedStatsRange('android', startDate, endDate),
    ])

    // 캐시에 없는 날짜만 Apple API로 채우기
    if (connectionStatus.ios.connected) {
      const cachedDates = new Set(iosTimeSeries.map(s => s.date))
      const missingDates: string[] = []
      const cur = new Date(startDate)
      const end = new Date(endDate)
      end.setDate(end.getDate() - 1)
      while (cur <= end) {
        const d = cur.toISOString().split('T')[0]
        if (!cachedDates.has(d)) missingDates.push(d)
        cur.setDate(cur.getDate() + 1)
      }

      if (missingDates.length > 0) {
        // backfill 모드: 전체, 일반 모드: 최근 30일만
        const recentMissing = missingDates.filter(d => {
          const diff = (new Date(endDate).getTime() - new Date(d).getTime()) / 86400000
          return diff <= 30
        })
        const datesToFetch = backfill ? missingDates : recentMissing
        const batchSize = backfill ? 10 : 5

        for (let i = 0; i < datesToFetch.length; i += batchSize) {
          const batch = datesToFetch.slice(i, i + batchSize)
          const results = await Promise.allSettled(
            batch.map(date => fetchAndCacheIosStats(date))
          )
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              iosTimeSeries.push(r.value)
            }
          }
        }
        iosTimeSeries.sort((a, b) => a.date.localeCompare(b.date))
      }
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
      anonymousStats,
    })
  } catch (error) {
    console.error('Error fetching combined stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
