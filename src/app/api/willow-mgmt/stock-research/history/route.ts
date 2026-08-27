import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')?.trim()
  const limit = Math.min(Number(searchParams.get('limit') || 30), 100)

  if (!ticker) {
    return NextResponse.json({ error: 'ticker is required' }, { status: 400 })
  }

  const { data, error } = await getServiceSupabase()
    .from('stock_research_scan_history')
    .select('id, ticker, scan_date, scanned_at, source_type, source, previous_verdict, current_verdict, previous_composite_score, current_composite_score, change_kind, snapshot')
    .eq('ticker', ticker)
    .order('scanned_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data || []).map((row) => ({
    ...row,
    previous_composite_score: row.previous_composite_score == null ? null : Number(row.previous_composite_score),
    current_composite_score: row.current_composite_score == null ? null : Number(row.current_composite_score),
  }))

  return NextResponse.json({ items })
}
