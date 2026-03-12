import { NextResponse } from 'next/server'

// GET - Fetch historical prices for multiple tickers from Yahoo Finance
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get('tickers') // comma-separated
  const marketsParam = searchParams.get('markets') // comma-separated
  const range = searchParams.get('range') || '1y' // default 1 year

  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers parameter is required' }, { status: 400 })
  }

  const tickers = tickersParam.split(',')
  const markets = marketsParam?.split(',') || []

  const results: Record<string, { dates: string[]; prices: number[] }> = {}

  // Fetch all tickers in parallel
  const promises = tickers.map(async (ticker, i) => {
    const market = markets[i] || 'US'
    const yahooSymbol = market === 'KR' ? `${ticker}.KS` : ticker
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=${range}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          next: { revalidate: 3600 }, // cache 1 hour
        }
      )
      if (!res.ok) return

      const data = await res.json()
      const result = data?.chart?.result?.[0]
      if (!result) return

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

      results[ticker] = { dates, prices }
    } catch {
      // skip failed tickers
    }
  })

  await Promise.all(promises)

  return NextResponse.json({ history: results })
}
