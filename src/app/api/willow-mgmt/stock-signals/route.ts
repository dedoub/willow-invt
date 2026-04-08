import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const LOCAL_PATH = join(process.cwd(), 'data', 'watchlist.json')
const EXTERNAL_PATH = join(process.cwd(), '..', 'portfolio', 'monitor', 'watchlist.json')
const WATCHLIST_PATH = existsSync(EXTERNAL_PATH) ? EXTERNAL_PATH : LOCAL_PATH

interface QuoteData {
  price: number
  change: number
  changePercent: number
  currency: string
  high52w: number | null
  low52w: number | null
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

async function fetchYahooQuote(yahooSymbol: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=3mo`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null

    const price = meta.regularMarketPrice
    const prevClose = meta.previousClose || meta.chartPreviousClose
    const change = prevClose ? price - prevClose : 0
    const changePercent = prevClose ? (change / prevClose) * 100 : 0

    return {
      price,
      change,
      changePercent,
      currency: meta.currency || 'USD',
      high52w: meta.fiftyTwoWeekHigh || null,
      low52w: meta.fiftyTwoWeekLow || null,
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
    const raw = JSON.parse(readFileSync(WATCHLIST_PATH, 'utf-8'))
    const entries: { name: string; ticker: string; sector: string; axis?: string; group: string }[] = []

    for (const [group, stocks] of Object.entries(raw)) {
      for (const [name, info] of Object.entries(stocks as Record<string, { ticker: string; sector: string; axis?: string }>)) {
        entries.push({ name, ...info, group })
      }
    }

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

    const summary = {
      newHighs: results.filter(r => r.signal === 'new_high').length,
      near: results.filter(r => r.signal === 'near').length,
      weak: results.filter(r => r.signal === 'weak').length,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json({ signals: results, summary })
  } catch (error) {
    console.error('Failed to fetch signals:', error)
    return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 })
  }
}
