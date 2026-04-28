import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

interface QuoteResult {
  price: number
  change: number
  changePercent: number
  currency: string
  marketCap?: number
}

const EXCHANGE_MAP: Record<string, string> = {
  NASDAQ: 'NASDAQ', NMS: 'NASDAQ', NGM: 'NASDAQ',
  NYSE: 'NYSE', NYQ: 'NYSE',
  KSE: 'KRX', KSC: 'KRX', KOE: 'KRX',
}

// Fetch current price from Yahoo Finance chart API
async function fetchYahooQuote(yahooSymbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
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
    const prevClose = meta.chartPreviousClose || meta.previousClose
    const change = prevClose ? price - prevClose : 0
    const changePercent = prevClose ? (change / prevClose) * 100 : 0

    return {
      price,
      change,
      changePercent,
      currency: meta.currency || 'USD',
      _exchange: meta.exchangeName,
    } as QuoteResult & { _exchange?: string }
  } catch {
    return null
  }
}

// Fetch market cap from Google Finance
async function fetchGoogleMarketCap(ticker: string, exchange: string): Promise<number | null> {
  try {
    const gfExchange = EXCHANGE_MAP[exchange] || exchange
    const gfSymbol = `${ticker.replace('.KS', '')}:${gfExchange}`
    const res = await fetch(`https://www.google.com/finance/quote/${gfSymbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const html = await res.text()
    const idx = html.indexOf('Market cap')
    if (idx < 0) return null
    const chunk = html.slice(idx, idx + 500).replace(/<[^>]+>/g, ' ')
    const match = chunk.match(/([\d,.]+)\s*([TBMK조억])\s*(USD|KRW)/)
    if (!match) return null
    const num = parseFloat(match[1].replace(/,/g, ''))
    const unit = match[2]
    const currency = match[3]
    if (currency === 'KRW') {
      if (unit === 'T' || unit === '조') return num * 1e12
      if (unit === 'B' || unit === '억') return num * 1e8
      if (unit === 'M') return num * 1e6
      return num
    }
    if (unit === 'T') return num * 1e12
    if (unit === 'B') return num * 1e9
    if (unit === 'M') return num * 1e6
    return null
  } catch {
    return null
  }
}

// Fallback: fetch market cap from stockanalysis.com (US stocks only)
async function fetchStockAnalysisMarketCap(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`https://stockanalysis.com/stocks/${ticker.toLowerCase()}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const html = await res.text()
    const match = html.match(/Market Cap[\s\S]*?([\d,.]+)\s*([TBMK])/)
    if (!match) return null
    const num = parseFloat(match[1].replace(/,/g, ''))
    const unit = match[2]
    if (unit === 'T') return num * 1e12
    if (unit === 'B') return num * 1e9
    if (unit === 'M') return num * 1e6
    return null
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
  const exchangeMap = new Map<string, string>()
  for (const { ticker, result } of priceResults) {
    if (result) {
      const ex = (result as QuoteResult & { _exchange?: string })._exchange
      if (ex) exchangeMap.set(ticker, ex)
      const { _exchange: _, ...clean } = result as QuoteResult & { _exchange?: string }
      prices[ticker] = clean
    }
  }

  // Fetch market caps for tickers missing marketCap (Google Finance → stockanalysis.com fallback)
  const mcPromises = Object.keys(prices)
    .filter(ticker => !prices[ticker].marketCap)
    .map(async (ticker) => {
      const idx = tickers.indexOf(ticker)
      const market = markets[idx] || 'US'
      const exchange = exchangeMap.get(ticker) || (market === 'KR' ? 'KRX' : 'NASDAQ')
      const symbol = market === 'KR' ? `${ticker}.KS` : ticker
      const mc = await fetchGoogleMarketCap(symbol, exchange)
        || (market !== 'KR' ? await fetchStockAnalysisMarketCap(ticker) : null)
      if (mc) prices[ticker].marketCap = mc
    })
  await Promise.all(mcPromises)

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
