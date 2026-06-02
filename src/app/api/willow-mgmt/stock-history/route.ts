import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - Fetch historical daily closes for multiple tickers.
//
// Source priority: sector_index_quotes (our DB) FIRST, Yahoo Finance as fallback.
// Why: Yahoo throttles/limits Vercel's server IPs and returns near-empty series for
// some tickers in production (e.g. QBTS → 1 day) while returning full data locally.
// A single short series breaks the whole trend chart (hasAll gate skips those days).
// Our daily sector-rotation-fetch keeps sector_index_quotes populated for all held
// tickers, so the DB is the reliable source; Yahoo only fills genuinely-missing ones.

const RANGE_DAYS: Record<string, number> = {
  '1mo': 31, '3mo': 93, '6mo': 186, '1y': 372, '2y': 744, '5y': 1860,
}

// Minimum DB rows to trust the DB source for a ticker (else try Yahoo fallback).
const MIN_DB_ROWS = 20

function cutoffDate(range: string): string {
  const days = RANGE_DAYS[range] ?? 372
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

async function fetchFromYahoo(yahooSymbol: string, range: string): Promise<{ dates: string[]; prices: number[] } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=${range}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []
    const dates: string[] = []
    const prices: number[] = []
    for (let j = 0; j < timestamps.length; j++) {
      const date = new Date(timestamps[j] * 1000).toISOString().slice(0, 10)
      const price = closes[j]
      if (price && price > 0) {
        dates.push(date)
        prices.push(Math.round(price * 100) / 100)
      }
    }
    return { dates, prices }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get('tickers')
  const marketsParam = searchParams.get('markets')
  const range = searchParams.get('range') || '1y'

  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers parameter is required' }, { status: 400 })
  }

  const tickers = tickersParam.split(',')
  const markets = marketsParam?.split(',') || []
  const cutoff = cutoffDate(range)

  // yahoo symbol per ticker (KR → .KS) — also the key used in sector_index_quotes
  const symbolOf = tickers.map((t, i) => (markets[i] || 'US') === 'KR' ? `${t}.KS` : t)

  // ── 1) Bulk-read DB for all symbols at once (paginated) ──
  const supabase = getServiceSupabase()
  const dbSeries = new Map<string, { dates: string[]; prices: number[] }>()
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('sector_index_quotes')
      .select('ticker, date, close')
      .in('ticker', symbolOf)
      .gte('date', cutoff)
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) break
    if (!data || data.length === 0) break
    for (const row of data) {
      let s = dbSeries.get(row.ticker)
      if (!s) { s = { dates: [], prices: [] }; dbSeries.set(row.ticker, s) }
      s.dates.push(row.date)
      s.prices.push(Math.round(Number(row.close) * 100) / 100)
    }
    if (data.length < PAGE) break
  }

  // ── 2) Assemble result: DB first, Yahoo fallback for missing/thin ──
  const results: Record<string, { dates: string[]; prices: number[] }> = {}
  await Promise.all(tickers.map(async (ticker, i) => {
    const sym = symbolOf[i]
    const fromDb = dbSeries.get(sym)
    if (fromDb && fromDb.dates.length >= MIN_DB_ROWS) {
      results[ticker] = fromDb
      return
    }
    const fromYahoo = await fetchFromYahoo(sym, range)
    if (fromYahoo && fromYahoo.dates.length > 0) {
      results[ticker] = fromYahoo
    } else if (fromDb && fromDb.dates.length > 0) {
      results[ticker] = fromDb // thin DB beats nothing
    }
  }))

  return NextResponse.json({ history: results })
}
