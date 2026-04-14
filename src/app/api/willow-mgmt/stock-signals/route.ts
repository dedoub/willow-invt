import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface QuoteData {
  price: number
  change: number
  changePercent: number
  currency: string
  high52w: number | null
  low52w: number | null
  return1m: number | null
  return3m: number | null
  return6m: number | null
  return12m: number | null
  momentumScore: number | null
}

interface SignalResult extends QuoteData {
  name: string
  ticker: string
  sector: string
  axis?: string
  group: 'portfolio' | 'watchlist' | 'benchmark'
  signal: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct: number | null
}

/** AQR-style composite momentum score (0–100) */
function calcMomentumScore(
  return1m: number | null, return3m: number | null,
  return6m: number | null, return12m: number | null,
  price: number, high52w: number | null
): number | null {
  if (return3m == null) return null
  const norm = (val: number, min: number, max: number) =>
    Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100))

  // 12-1M momentum (Jegadeesh-Titman: exclude recent 1M to avoid short-term reversal)
  const r12_1m = (return12m ?? return6m ?? return3m) - (return1m ?? 0)
  const score12_1m = norm(r12_1m, -50, 100)
  // 6M return
  const score6m = norm(return6m ?? return3m ?? 0, -40, 80)
  // 3M return
  const score3m = norm(return3m, -30, 60)
  // 52W high proximity (0% = at high)
  const gap52w = high52w ? ((price - high52w) / high52w) * 100 : 0
  const score52w = norm(gap52w, -60, 0)

  return Math.round(score12_1m * 0.35 + score6m * 0.25 + score3m * 0.20 + score52w * 0.20)
}

async function fetchYahooQuote(yahooSymbol: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1wk&range=1y`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result?.meta) return null

    const meta = result.meta
    const price = meta.regularMarketPrice
    const currency = meta.currency || 'USD'
    const high52w = meta.fiftyTwoWeekHigh || null
    const low52w = meta.fiftyTwoWeekLow || null

    // Parse weekly time series for multi-period returns
    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []
    const prices: { ts: number; close: number }[] = []
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) prices.push({ ts: timestamps[i], close: closes[i] as number })
    }

    const nowTs = Date.now() / 1000
    const findPriceAt = (weeksAgo: number): number | null => {
      if (prices.length === 0) return null
      const targetTs = nowTs - weeksAgo * 7 * 86400
      let closest = prices[0]
      for (const p of prices) {
        if (Math.abs(p.ts - targetTs) < Math.abs(closest.ts - targetTs)) closest = p
      }
      return closest.close
    }

    const calcReturn = (ref: number | null) =>
      ref && ref > 0 ? Math.round(((price - ref) / ref) * 1000) / 10 : null

    const return1m = calcReturn(findPriceAt(4))
    const return3m = calcReturn(findPriceAt(13))
    const return6m = calcReturn(findPriceAt(26))
    const return12m = calcReturn(prices.length > 0 ? prices[0].close : null)

    const changePercent = return3m ?? 0
    const change = findPriceAt(13) ? price - findPriceAt(13)! : 0

    const momentumScore = calcMomentumScore(return1m, return3m, return6m, return12m, price, high52w)

    return {
      price, change, changePercent, currency, high52w, low52w,
      return1m, return3m, return6m, return12m, momentumScore,
    }
  } catch {
    return null
  }
}

function calcSignal(price: number, high52w: number | null): { signal: 'new_high' | 'near' | 'weak' | null; gapPct: number | null } {
  if (!high52w) return { signal: null, gapPct: null }
  const gapPct = ((price - high52w) / high52w) * 100
  if (gapPct >= -3) return { signal: 'new_high', gapPct }
  if (gapPct >= -10) return { signal: 'near', gapPct }
  if (gapPct <= -20) return { signal: 'weak', gapPct }
  return { signal: null, gapPct }
}

export async function GET() {
  try {
    const db = getServiceSupabase()
    const { data: rows, error } = await db
      .from('stock_watchlist')
      .select('name, ticker, sector, axis, group_name')
      .order('created_at')
    if (error) throw error

    const entries: { name: string; ticker: string; sector: string; axis?: string; group: string }[] =
      (rows || []).map((r) => ({
        name: r.name as string,
        ticker: r.ticker as string,
        sector: (r.sector as string) || '',
        ...(r.axis ? { axis: r.axis as string } : {}),
        group: r.group_name as string,
      }))

    // Fetch all quotes in parallel (batch of 10 to avoid rate limiting)
    const results: SignalResult[] = []
    const batchSize = 10
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const quotes = await Promise.all(
        batch.map(async (entry) => {
          const quote = await fetchYahooQuote(entry.ticker)
          if (!quote) return null
          const { signal, gapPct } = calcSignal(quote.price, quote.high52w)
          return {
            ...quote,
            name: entry.name,
            ticker: entry.ticker,
            sector: entry.sector,
            axis: entry.axis,
            group: entry.group as 'portfolio' | 'watchlist' | 'benchmark',
            signal,
            gapFromHighPct: gapPct,
          }
        })
      )
      results.push(...(quotes.filter(Boolean) as SignalResult[]))
    }

    // Fetch live USD/KRW rate
    let usdKrw = 1400
    try {
      const fxRes = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=1d',
        { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } }
      )
      if (fxRes.ok) {
        const fxData = await fxRes.json()
        const fxPrice = fxData?.chart?.result?.[0]?.meta?.regularMarketPrice
        if (fxPrice) usdKrw = fxPrice
      }
    } catch { /* fallback to 1400 */ }

    const summary = {
      newHighs: results.filter(r => r.signal === 'new_high').length,
      near: results.filter(r => r.signal === 'near').length,
      weak: results.filter(r => r.signal === 'weak').length,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json({ signals: results, summary, usdKrw })
  } catch (error) {
    console.error('Failed to fetch signals:', error)
    return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
  }
}
