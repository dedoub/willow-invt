import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

interface QuoteResult {
  price: number
  change: number
  changePercent: number
  currency: string
  marketCap?: number
}

// Fetch current price from Yahoo Finance chart API
async function fetchYahooQuote(yahooSymbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 }, // cache 5 minutes
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null

    const price = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose || meta.previousClose
    const change = prevClose ? price - prevClose : 0
    const changePercent = prevClose ? (change / prevClose) * 100 : 0

    const marketCap = meta.marketCap || (meta.regularMarketPrice && meta.sharesOutstanding
      ? meta.regularMarketPrice * meta.sharesOutstanding : undefined)

    return {
      price,
      change,
      changePercent,
      currency: meta.currency || 'USD',
      ...(marketCap ? { marketCap } : {}),
    }
  } catch {
    return null
  }
}

// GET - Fetch current prices and theme mappings for given tickers
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get('tickers') // comma-separated: "005930,000660,VRT,CIEN"
  const marketsParam = searchParams.get('markets') // comma-separated: "KR,KR,US,US"

  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers parameter is required' }, { status: 400 })
  }

  const tickers = tickersParam.split(',')
  const markets = marketsParam?.split(',') || []

  // 1. Fetch current prices from Yahoo Finance
  const pricePromises = tickers.map((ticker, i) => {
    const market = markets[i] || 'US'
    const yahooSymbol = market === 'KR' ? `${ticker}.KS` : ticker
    return fetchYahooQuote(yahooSymbol).then((result) => ({ ticker, result }))
  })

  const priceResults = await Promise.all(pricePromises)
  const prices: Record<string, QuoteResult> = {}
  for (const { ticker, result } of priceResults) {
    if (result) {
      prices[ticker] = result
    }
  }

  // 2. Fetch theme mappings from DB
  const supabase = getServiceSupabase()

  const { data: tickerThemes } = await supabase
    .from('investment_ticker_themes')
    .select(`
      investment_tickers!inner(ticker, name, market),
      investment_themes!inner(id, name, parent_id)
    `)

  // Also fetch parent themes
  const { data: allThemes } = await supabase
    .from('investment_themes')
    .select('id, name, parent_id')

  const parentThemeMap = new Map<string, string>()
  for (const theme of allThemes || []) {
    if (!theme.parent_id) {
      parentThemeMap.set(theme.id, theme.name)
    }
  }

  // Build ticker → themes mapping (normalize KR tickers by stripping .KS)
  const themes: Record<string, { theme: string; parentTheme: string | null }[]> = {}
  for (const row of tickerThemes || []) {
    const inv = row.investment_tickers as unknown as { ticker: string; name: string; market: string }
    const theme = row.investment_themes as unknown as { id: string; name: string; parent_id: string | null }

    // Normalize ticker: strip .KS suffix for matching with stock_trades
    const normalizedTicker = inv.ticker.replace(/\.KS$/, '')
    const parentThemeName = theme.parent_id ? (parentThemeMap.get(theme.parent_id) || null) : null

    if (!themes[normalizedTicker]) {
      themes[normalizedTicker] = []
    }
    themes[normalizedTicker].push({
      theme: theme.name,
      parentTheme: parentThemeName,
    })
  }

  return NextResponse.json({ prices, themes })
}
