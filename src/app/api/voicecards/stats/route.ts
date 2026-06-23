import { NextResponse } from 'next/server'
import {
  getCombinedStats,
  getConnectionStatus,
} from '@/lib/voicecards-server'

export const maxDuration = 300

// GET: 매출/차트 통계 (사용자 통계는 /users, 익명 이벤트는 /events 사용)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // 날짜 범위 파라미터 (기본: 올해 1/1 ~ 오늘)
    const endDate = searchParams.get('endDate') || new Date().toISOString().split('T')[0]
    const startDate = searchParams.get('startDate') || `${new Date().getFullYear()}-01-01`
    // 연결 상태 + 통합 통계를 병렬 조회 (서로 독립적)
    // 매출은 getCombinedStats 내부에서 앱 DB 결제 이벤트로 산출되며, 차트용 appRevenue도 함께 반환됨
    const [connectionStatus, stats] = await Promise.all([
      getConnectionStatus(),
      getCombinedStats(startDate, endDate),
    ])

    // 날짜별 매출 차트 데이터 — 앱 DB(anonymous_events) 결제 이벤트 기반 (그로스, USD)
    // getCombinedStats가 이미 계산한 결과 재사용 (중복 스캔 제거)
    const appRevenue = stats.appRevenue
    const dateMap = new Map<string, { ios: number; android: number; total: number }>()

    for (const [date, rev] of appRevenue.iosByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0 }
      existing.ios += rev
      existing.total += rev
      dateMap.set(date, existing)
    }

    for (const [date, rev] of appRevenue.androidByDate) {
      const existing = dateMap.get(date) || { ios: 0, android: 0, total: 0 }
      existing.android += rev
      existing.total += rev
      dateMap.set(date, existing)
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
    })
  } catch (error) {
    console.error('Error fetching combined stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
