import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - List all research entries
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const verdict = searchParams.get('verdict')

  const supabase = getServiceSupabase()

  let query = supabase
    .from('stock_research')
    .select('*')
    .order('scan_date', { ascending: false })

  if (verdict) {
    query = query.eq('verdict', verdict)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data || []).map((r) => ({
    ...r,
    market_cap_b: r.market_cap_b ? Number(r.market_cap_b) : null,
    current_price: r.current_price ? Number(r.current_price) : null,
    high_12m: r.high_12m ? Number(r.high_12m) : null,
    gap_from_high_pct: r.gap_from_high_pct ? Number(r.gap_from_high_pct) : null,
  }))

  return NextResponse.json({ items })
}

// POST - Create a new research entry
export async function POST(request: Request) {
  const body = await request.json()
  const {
    ticker, company_name, scan_date, source, market_cap_b, current_price,
    revenue_growth_yoy, margin, value_chain_position, structural_thesis,
    sector_tags, high_12m, gap_from_high_pct, trend_verdict, verdict, fail_reason, notes,
  } = body

  if (!ticker || !company_name) {
    return NextResponse.json({ error: 'ticker and company_name are required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_research')
    .insert({
      ticker,
      company_name,
      scan_date: scan_date || new Date().toISOString().split('T')[0],
      source: source || 'manual',
      market_cap_b: market_cap_b || null,
      current_price: current_price || null,
      revenue_growth_yoy: revenue_growth_yoy || null,
      margin: margin || null,
      value_chain_position: value_chain_position || null,
      structural_thesis: structural_thesis || null,
      sector_tags: sector_tags || [],
      high_12m: high_12m || null,
      gap_from_high_pct: gap_from_high_pct || null,
      trend_verdict: trend_verdict || null,
      verdict: verdict || null,
      fail_reason: fail_reason || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update a research entry
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_research')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete a research entry
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('stock_research')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
