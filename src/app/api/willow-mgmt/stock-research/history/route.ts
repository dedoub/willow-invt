import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export async function GET(request: Request) {
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
