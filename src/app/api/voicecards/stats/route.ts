import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import {
  getCombinedStats,
  getConnectionStatus,
} from '@/lib/voicecards-server'
import { kstToday } from '@/lib/kst'

export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const revalidate = 0

// 매출/차트 집계(getCombinedStats)는 연간 anonymous_events 를 스캔해 ~2.2s. 캐시가 없어 매
// 자동 새로고침마다 재계산되던 것을 300초 캐싱으로 전환 (분석 지표라 5분 staleness 무방, 2026-07-22).
// ⚠️ appRevenue.*ByDate 는 Map 이라 unstable_cache(JSON)에서 살아남지 못한다 → chartData 생성을
//    캐시 함수 '안'에서 끝내 배열로 반환. 캐시-히트 시 stats.appRevenue Map 은 비지만 클라이언트는
//    chartData(배열)로 자체 집계하므로 무관.
const getCachedStatsPayload = unstable_cache(
  async (startDate: string, endDate: string) => {
    const stats = await getCombinedStats(startDate, endDate)
    const appRevenue = stats.appRevenue
    const dateMap = new Map<string, { ios: number; android: number; total: number; credits: number; paidUsers?: number }>()

    for (const [date, rev] of appRevenue.iosByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0, credits: 0 }
      existing.ios += rev
      existing.total += rev
      dateMap.set(date, existing)
    }
    for (const [date, rev] of appRevenue.androidByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0, credits: 0 }
      existing.android += rev
      existing.total += rev
      dateMap.set(date, existing)
    }
    for (const [date, credits] of appRevenue.creditsByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0, credits: 0 }
      existing.credits += credits
      dateMap.set(date, existing)
    }
    for (const [date, paidUsers] of appRevenue.paidUsersByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0, credits: 0 }
      existing.paidUsers = paidUsers
      dateMap.set(date, existing)
    }

    const chartData = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }))

    return { stats, chartData }
  },
  ['voicecards-combined-stats'],
  { revalidate: 300, tags: ['voicecards-stats'] }
)

// GET: 매출/차트 통계 (사용자 통계는 /users, 익명 이벤트는 /events 사용)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // 날짜 범위 파라미터 (기본: 올해 1/1 ~ 오늘, KST 기준)
    const endDate = searchParams.get('endDate') || kstToday()
    const startDate = searchParams.get('startDate') || `${kstToday().slice(0, 4)}-01-01`
    // 연결 상태(가벼움, 매요청) + 통합 통계(300초 캐시)를 병렬 조회
    const [connectionStatus, { stats, chartData }] = await Promise.all([
      getConnectionStatus(),
      getCachedStatsPayload(startDate, endDate),
    ])

    return NextResponse.json({
      success: true,
      connection: connectionStatus,
      stats,
      chartData,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Error fetching combined stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
