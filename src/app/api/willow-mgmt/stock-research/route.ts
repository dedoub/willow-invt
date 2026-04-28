import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { ensureTickerTheme } from '@/lib/ensure-ticker-theme'

// GET - List all research entries
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const verdict = searchParams.get('verdict')
  const sourceType = searchParams.get('source_type') // valuechain | smallcap
  const track = searchParams.get('track') // profitable | hypergrowth
  const scanDate = searchParams.get('scan_date')
  const limit = parseInt(searchParams.get('limit') || '500')

  const supabase = getServiceSupabase()

  let query = supabase
    .from('stock_research')
    .select('*')
    .order('scan_date', { ascending: false })
    .limit(limit)

  if (verdict) {
    query = query.eq('verdict', verdict)
  }

  if (sourceType) {
    query = query.eq('source_type', sourceType)
  }

  if (track) {
    query = query.eq('track', track)
  }

  if (scanDate) {
    query = query.eq('scan_date', scanDate)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get available scan dates for filter
  const { data: dates } = await supabase
    .from('stock_research')
    .select('scan_date')
    .order('scan_date', { ascending: false })

  const scanDates = [...new Set((dates || []).map(d => d.scan_date))].slice(0, 20)

  const items = (data || []).map((r) => ({
    ...r,
    market_cap_b: r.market_cap_b ? Number(r.market_cap_b) : null,
    market_cap_m: r.market_cap_m ? Number(r.market_cap_m) : null,
    current_price: r.current_price ? Number(r.current_price) : null,
    high_12m: r.high_12m ? Number(r.high_12m) : null,
    gap_from_high_pct: r.gap_from_high_pct ? Number(r.gap_from_high_pct) : null,
    composite_score: r.composite_score ? Number(r.composite_score) : null,
    growth_score: r.growth_score ? Number(r.growth_score) : null,
    value_score: r.value_score ? Number(r.value_score) : null,
    quality_score: r.quality_score ? Number(r.quality_score) : null,
    momentum_score: r.momentum_score ? Number(r.momentum_score) : null,
    insider_score: r.insider_score ? Number(r.insider_score) : null,
    sentiment_score: r.sentiment_score ? Number(r.sentiment_score) : null,
    change_pct: r.change_pct ? Number(r.change_pct) : null,
  }))

  return NextResponse.json({ items, scanDates })
}

// POST - Create a new research entry
export async function POST(request: Request) {
  const body = await request.json()
  const {
    ticker, company_name, scan_date, source, market_cap_b, current_price,
    revenue_growth_yoy, margin, value_chain_position, structural_thesis,
    sector_tags, high_12m, gap_from_high_pct, trend_verdict, verdict, fail_reason, notes,
    source_type, track, market, sector, market_cap_m,
    composite_score, growth_score, value_score, quality_score,
    momentum_score, insider_score, sentiment_score, fail_reasons, change_pct,
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
      source_type: source_type || 'valuechain',
      track: track || null,
      market: market || 'US',
      sector: sector || null,
      market_cap_b: market_cap_b || null,
      market_cap_m: market_cap_m || null,
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
      composite_score: composite_score || null,
      growth_score: growth_score || null,
      value_score: value_score || null,
      quality_score: quality_score || null,
      momentum_score: momentum_score || null,
      insider_score: insider_score || null,
      sentiment_score: sentiment_score || null,
      fail_reasons: fail_reasons || null,
      change_pct: change_pct || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (data && sector) {
    await ensureTickerTheme(supabase, ticker, company_name, sector).catch(() => {})
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

// PATCH - Update thesis/value_chain for a research entry
export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, structural_thesis, value_chain_position } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('stock_research')
    .update({
      structural_thesis: structural_thesis ?? null,
      value_chain_position: value_chain_position ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
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
