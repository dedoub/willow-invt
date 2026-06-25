import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getPrices, getStocks, getPrevClose, getExchangeRate } from '@/lib/toss'
import { FX_SNAPSHOT_KEY } from '@/lib/toss-prices'

interface QuoteResult {
  price: number
  change: number
  changePercent: number
  currency: string
  marketCap?: number
}

// 동시 실행 상한을 둔 map (토스 캔들은 종목당 1콜이라 변동률 계산 시 부하 분산).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

// 토스 미커버 종목(예: 미국 OTC)만 야후로 폴백 — 카드가 비지 않도록.
async function fetchYahooQuote(yahooSymbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d&includePrePost=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta
    if (!meta) return null
    const price = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose || meta.previousClose
    const change = prevClose ? price - prevClose : 0
    const changePercent = prevClose ? (change / prevClose) * 100 : 0
    return { price, change, changePercent, currency: meta.currency || 'USD' }
  } catch {
    return null
  }
}

// GET - 토스증권 기준 현재가/시총/변동률 + DB 테마 매핑 조회
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get('tickers') // "005930,000660,VRT,CIEN,KRW=X"
  const marketsParam = searchParams.get('markets')

  if (!tickersParam) {
    return NextResponse.json({ error: 'tickers parameter is required' }, { status: 400 })
  }

  const tickers = tickersParam.split(',')
  const markets = marketsParam?.split(',') || []
  // 토스 심볼: KR=6자리 숫자, US=티커 (페이지에서 이미 .KS 제거). 환율(KRW=X)은 별도 처리.
  const symbols = tickers.filter((t) => t !== 'KRW=X')

  // 토스 Open API는 IP 허용목록이 걸려 있어 Vercel(고정 IP 없음)에서는 실패한다.
  // 게다가 클라이언트당 토큰 1개 제약 탓에 Vercel이 토큰을 발급하면 launchd 동기화
  // 스크립트의 토큰까지 무효화한다. 따라서 Vercel에서는 토스를 직접 호출하지 않고,
  // launchd 잡이 적재한 toss_price_snapshot(토스 기준 가격)을 읽는다. 로컬은 직접 호출.
  const useToss = !process.env.VERCEL

  const prices: Record<string, QuoteResult> = {}
  const supabase = getServiceSupabase()

  // Vercel: 토스 스냅샷 테이블에서 토스 기준 가격을 읽어 토스앱과 잔고를 맞춘다.
  let snapFx: number | null = null
  if (!useToss) {
    const { data: snap } = await supabase
      .from('toss_price_snapshot')
      .select('symbol, last_price, market_cap, change_percent, currency')
    const snapMap = new Map((snap || []).map((r) => [r.symbol as string, r]))
    for (const s of symbols) {
      const row = snapMap.get(s)
      if (!row) continue
      prices[s] = {
        price: Number(row.last_price),
        change: 0,
        changePercent: row.change_percent != null ? Number(row.change_percent) : 0,
        currency: (row.currency as string) || 'USD',
        ...(row.market_cap != null ? { marketCap: Number(row.market_cap) } : {}),
      }
    }
    const fxRow = snapMap.get(FX_SNAPSHOT_KEY)
    if (fxRow) snapFx = Number(fxRow.last_price)
  }

  if (useToss) {
    // 1. 토스 배치: 현재가 + 발행주식수(시총용)
    const [tossPrices, tossStocks] = await Promise.all([
      getPrices(symbols).catch(() => new Map()),
      getStocks(symbols).catch(() => new Map()),
    ])

    // 2. 변동률: 토스 일봉 전일 종가 대비 (종목당 1콜, 동시 8개 제한, 5분 캐시)
    const covered = symbols.filter((s) => tossPrices.has(s))
    const prevCloses = new Map<string, number | null>()
    await mapLimit(covered, 8, async (s) => {
      prevCloses.set(s, await getPrevClose(s))
    })

    for (const s of covered) {
      const p = tossPrices.get(s)!
      const price = Number(p.lastPrice)
      const prev = prevCloses.get(s)
      const change = prev ? price - prev : 0
      const changePercent = prev ? (change / prev) * 100 : 0
      const shares = tossStocks.get(s)?.sharesOutstanding
      prices[s] = {
        price,
        change,
        changePercent,
        currency: p.currency,
        ...(shares ? { marketCap: price * Number(shares) } : {}),
      }
    }
  }

  // 3. 토스 미커버(또는 Vercel=전체) 종목 야후 폴백
  const uncovered = symbols.filter((s) => !prices[s])
  await Promise.all(
    uncovered.map(async (s) => {
      const idx = tickers.indexOf(s)
      const market = markets[idx] || (/^\d{6}$/.test(s) ? 'KR' : 'US')
      const yahooSymbol = market === 'KR' ? `${s}.KS` : s
      const q = await fetchYahooQuote(yahooSymbol)
      if (q) prices[s] = q
    }),
  )

  // 4. 환율(USD/KRW) — 페이지가 KRW=X price로 읽음. 로컬=토스, Vercel=스냅샷, 폴백 야후.
  if (tickers.includes('KRW=X')) {
    let rate: number | null = useToss ? await getExchangeRate('USD', 'KRW') : snapFx
    if (rate == null) {
      const q = await fetchYahooQuote('KRW=X')
      if (q) rate = q.price
    }
    if (rate && rate > 0) {
      prices['KRW=X'] = { price: rate, change: 0, changePercent: 0, currency: 'KRW' }
    }
  }

  // 5. DB 테마 매핑 (기존과 동일)
  const { data: tickerThemes } = await supabase
    .from('investment_ticker_themes')
    .select(`
      investment_tickers!inner(ticker, name, market),
      investment_themes!inner(id, name, parent_id)
    `)

  const { data: allThemes } = await supabase
    .from('investment_themes')
    .select('id, name, parent_id')

  const parentThemeMap = new Map<string, string>()
  for (const theme of allThemes || []) {
    if (!theme.parent_id) parentThemeMap.set(theme.id, theme.name)
  }

  const themes: Record<string, { theme: string; parentTheme: string | null }[]> = {}
  for (const row of tickerThemes || []) {
    const inv = row.investment_tickers as unknown as { ticker: string; name: string; market: string }
    const theme = row.investment_themes as unknown as { id: string; name: string; parent_id: string | null }
    const normalizedTicker = inv.ticker.replace(/\.KS$/, '')
    const parentThemeName = theme.parent_id ? parentThemeMap.get(theme.parent_id) || null : null
    if (!themes[normalizedTicker]) themes[normalizedTicker] = []
    themes[normalizedTicker].push({ theme: theme.name, parentTheme: parentThemeName })
  }

  return NextResponse.json({ prices, themes })
}
