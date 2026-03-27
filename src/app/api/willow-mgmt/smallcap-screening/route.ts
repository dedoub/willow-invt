import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - List smallcap screening results
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tier = searchParams.get('tier') // A, B, C, F or null for all
  const track = searchParams.get('track') // profitable, hypergrowth, or null for all
  const limit = parseInt(searchParams.get('limit') || '200')
  const scanDate = searchParams.get('scan_date') // specific scan date or null for latest

  const supabase = getServiceSupabase()

  let query = supabase
    .from('smallcap_screening')
    .select('*')
    .order('composite_score', { ascending: false })
    .limit(limit)

  if (tier) {
    query = query.eq('tier', tier)
  }

  if (track) {
    query = query.eq('track', track)
  }

  if (scanDate) {
    query = query.eq('scan_date', scanDate)
  } else {
    // Get the latest scan date first
    const { data: latestRow } = await supabase
      .from('smallcap_screening')
      .select('scan_date')
      .order('scan_date', { ascending: false })
      .limit(1)
      .single()

    if (latestRow?.scan_date) {
      query = query.eq('scan_date', latestRow.scan_date)
    }
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get available scan dates for filter
  const { data: dates } = await supabase
    .from('smallcap_screening')
    .select('scan_date')
    .order('scan_date', { ascending: false })

  const uniqueDates = [...new Set((dates || []).map(d => d.scan_date))].slice(0, 10)

  const items = (data || []).map((r) => ({
    ...r,
    market_cap_m: r.market_cap_m ? Number(r.market_cap_m) : null,
    price: r.price ? Number(r.price) : null,
    composite_score: r.composite_score ? Number(r.composite_score) : null,
    rs_rank: r.rs_rank != null ? Number(r.rs_rank) : null,
    growth_score: r.growth_score ? Number(r.growth_score) : null,
    value_score: r.value_score ? Number(r.value_score) : null,
    quality_score: r.quality_score ? Number(r.quality_score) : null,
    momentum_score: r.momentum_score ? Number(r.momentum_score) : null,
    insider_score: r.insider_score ? Number(r.insider_score) : null,
    sentiment_score: r.sentiment_score ? Number(r.sentiment_score) : null,
    pe: r.pe ? Number(r.pe) : null,
    forward_pe: r.forward_pe ? Number(r.forward_pe) : null,
    peg: r.peg ? Number(r.peg) : null,
    roe: r.roe ? Number(r.roe) : null,
    roa: r.roa ? Number(r.roa) : null,
    profit_margin: r.profit_margin ? Number(r.profit_margin) : null,
    operating_margin: r.operating_margin ? Number(r.operating_margin) : null,
    gross_margin: r.gross_margin ? Number(r.gross_margin) : null,
    debt_to_equity: r.debt_to_equity ? Number(r.debt_to_equity) : null,
    current_ratio: r.current_ratio ? Number(r.current_ratio) : null,
    short_float_pct: r.short_float_pct ? Number(r.short_float_pct) : null,
    insider_own_pct: r.insider_own_pct ? Number(r.insider_own_pct) : null,
    insider_buys_3m: r.insider_buys_3m ? Number(r.insider_buys_3m) : 0,
    insider_buy_value_3m: r.insider_buy_value_3m ? Number(r.insider_buy_value_3m) : 0,
    reddit_mentions: r.reddit_mentions ? Number(r.reddit_mentions) : 0,
    reddit_sentiment: r.reddit_sentiment ? Number(r.reddit_sentiment) : null,
    change_pct: r.change_pct ? Number(r.change_pct) : null,
    perf_week: r.perf_week ? Number(r.perf_week) : null,
    perf_month: r.perf_month ? Number(r.perf_month) : null,
    perf_quarter: r.perf_quarter ? Number(r.perf_quarter) : null,
    volume: r.volume ? Number(r.volume) : null,
    avg_volume: r.avg_volume ? Number(r.avg_volume) : null,
  }))

  // Summary stats
  const summary = {
    total: items.length,
    byTier: {
      A: items.filter(i => i.tier === 'A').length,
      B: items.filter(i => i.tier === 'B').length,
      C: items.filter(i => i.tier === 'C').length,
      F: items.filter(i => i.tier === 'F').length,
    },
    byTrack: {
      profitable: items.filter(i => i.track === 'profitable').length,
      hypergrowth: items.filter(i => i.track === 'hypergrowth').length,
    },
    scanDate: items[0]?.scan_date || null,
  }

  return NextResponse.json({ items, summary, scanDates: uniqueDates })
}
