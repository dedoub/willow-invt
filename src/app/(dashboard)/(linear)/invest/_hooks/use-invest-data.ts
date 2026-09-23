'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import type { WatchlistItem, SignalData, StockTrade, StockResearch, StockQuote } from '../_components/portfolio-kanban'
import type { StockTradeFull, StockQuoteFull, TickerTheme } from '../_components/holdings-block'

// 포트폴리오 벤치마크 (2x 나스닥) — 수익률 추이 차트 오버레이용
const BENCHMARK_TICKER = 'QLD'
const BENCHMARK_MARKET = 'US'

type WatchlistData = { portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] }

/**
 * 주식 화면 두 장(주식포트폴리오·주식리서치)이 함께 쓰는 데이터.
 *
 * 한 페이지였을 때의 적재 순서를 그대로 옮겼다 — 칸반과 보유현황이 같은 시세·시계열을
 * 보게 하려면 두 화면이 같은 호출을 써야 한다. 페이지마다 따로 받으면 돌파·QLD전환 판정이
 * 화면에 따라 갈린다.
 */
export function useInvestData() {
  // 0=nothing, 1=base(칸반·거래기록), 2=시세까지
  const [loadPhase, setLoadPhase] = useState(0)
  const [watchlistData, setWatchlistData] = useState<WatchlistData | null>(null)
  const [signalData, setSignalData] = useState<SignalData[]>([])
  const [stockTrades, setStockTrades] = useState<StockTrade[]>([])
  const [stockTradesFull, setStockTradesFull] = useState<StockTradeFull[]>([])
  const [stockQuotes, setStockQuotes] = useState<Record<string, StockQuote>>({})
  const [stockQuotesFull, setStockQuotesFull] = useState<Record<string, StockQuoteFull>>({})
  const [stockResearch, setStockResearch] = useState<StockResearch[]>([])
  const [usdKrw, setUsdKrw] = useState(1400)
  const [stockThemes, setStockThemes] = useState<Record<string, TickerTheme[]>>({})
  const [stockHistory, setStockHistory] = useState<Record<string, { dates: string[]; prices: number[]; highs?: number[] }>>({})
  const [fxHistory, setFxHistory] = useState<Record<string, number>>({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Load stock history (prices + FX) after trades are fetched
  const loadStockHistory = useCallback(async (trades: StockTradeFull[], extra?: { ticker: string; market?: string }[]) => {
    const tickerMap = new Map<string, string>()
    for (const tr of trades) {
      if (!tickerMap.has(tr.ticker)) tickerMap.set(tr.ticker, tr.market)
    }
    // 워치리스트/리서치 종목도 포함 — 미보유 종목의 20일 고가 돌파 표시용 (DB-우선이라 부하 낮음)
    for (const e of extra || []) {
      const key = e.ticker.replace('.KS', '')
      if (!tickerMap.has(key)) tickerMap.set(key, e.market || 'US')
    }
    // Benchmark: QLD (2x Nasdaq) — always fetch its series for the return-trend overlay
    if (!tickerMap.has(BENCHMARK_TICKER)) tickerMap.set(BENCHMARK_TICKER, BENCHMARK_MARKET)
    if (tickerMap.size === 0) return
    const tickers = Array.from(tickerMap.keys())
    const markets = tickers.map(tk => tickerMap.get(tk)!)
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/willow-mgmt/stock-history?tickers=${tickers.join(',')}&markets=${markets.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setStockHistory(data.history || {})
        if (data.fxHistory) setFxHistory(data.fxHistory)
      }
    } catch (e) {
      console.error('Failed to load stock history:', e)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  const loadData = useCallback(async (opts?: { background?: boolean }) => {
    const bg = opts?.background ?? false
    if (!bg) setLoadPhase(0)
    try {
      // Phase 1a: fetch watchlist, trades, research in parallel
      const [watchlistRes, tradesRes, researchRes] = await Promise.all([
        fetch('/api/willow-mgmt/watchlist', { cache: 'no-store' }),
        fetch('/api/willow-mgmt/stock-trades'),
        fetch('/api/willow-mgmt/stock-research'),
      ])

      let watchlistFull: WatchlistData | null = null
      if (watchlistRes.ok) {
        watchlistFull = await watchlistRes.json()
        setWatchlistData(watchlistFull)
      }

      let tradesFull: StockTradeFull[] = []
      if (tradesRes.ok) {
        const data = await tradesRes.json()
        const trades = Array.isArray(data) ? data : data.trades || []
        setStockTrades(trades)
        tradesFull = trades
        setStockTradesFull(trades)
      }

      let researchFull: { ticker: string; market?: string; verdict?: string | null; track?: string | null }[] = []
      if (researchRes.ok) {
        const data = await researchRes.json()
        const items = Array.isArray(data) ? data : data.items || data.research || []
        setStockResearch(items)
        researchFull = items
      }

      // Show kanban + trade log immediately — don't gate first paint on signals.
      if (!bg) setLoadPhase(1)

      // Phase 1b: fetch signals with research tickers included.
      // Signals only feed the signal bar, so resolve them into state after first paint.
      const extraTickers = researchFull
        .filter(r => r.verdict?.startsWith('pass') && r.track !== 'ETF')
        .map(r => r.ticker)
      const signalUrl = extraTickers.length > 0
        ? `/api/willow-mgmt/stock-signals?extra=${extraTickers.join(',')}`
        : '/api/willow-mgmt/stock-signals'
      const signalRes = await fetch(signalUrl)

      if (signalRes.ok) {
        const data = await signalRes.json()
        setSignalData(data.signals || [])
        if (data.usdKrw) setUsdKrw(data.usdKrw)
      }

      // Phase 2: fetch stock quotes, live FX rate, and FX history
      {
        const tickerMap = new Map<string, string>()
        for (const tr of tradesFull) {
          const ticker = tr.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, tr.market)
        }
        // Benchmark quote: QLD current price for the return-trend "today" point
        if (!tickerMap.has(BENCHMARK_TICKER)) tickerMap.set(BENCHMARK_TICKER, BENCHMARK_MARKET)
        // Include research tickers (pass only) for market cap in kanban
        for (const r of researchFull) {
          if (!r.verdict?.startsWith('pass') || r.track === 'ETF') continue
          const ticker = r.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, r.market || 'US')
        }
        // 워치리스트 종목도 현재가 포함 — 돌파 판정에 필요. market은 ticker로 추론(.KS/6자리=KR).
        for (const w of [...(watchlistFull?.portfolio || []), ...(watchlistFull?.watchlist || [])]) {
          const isKR = w.ticker.endsWith('.KS') || /^\d{6}$/.test(w.ticker)
          const ticker = w.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, isKR ? 'KR' : 'US')
        }
        // Include live FX (KRW=X) in the main quotes request so we only make one call.
        if (!tickerMap.has('KRW=X')) tickerMap.set('KRW=X', 'US')
        const tickers = Array.from(tickerMap.keys())
        const markets = tickers.map(tk => tickerMap.get(tk)!)

        const [quotesRes, fxHistRes] = await Promise.all([
          fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`),
          fetch('/api/willow-mgmt/fx-history'),
        ])

        if (quotesRes?.ok) {
          const data = await quotesRes.json()
          const quotes: Record<string, StockQuote> = {}
          const quotesFull: Record<string, StockQuoteFull> = {}

          for (const [ticker, q] of Object.entries(data.prices || {})) {
            const quote = q as { price: number; change: number; changePercent: number; currency: string; marketCap?: number }
            quotes[ticker] = quote
            quotesFull[ticker] = quote
          }
          setStockQuotes(quotes)
          setStockQuotesFull(quotesFull)

          if (data.themes) setStockThemes(data.themes)

          // Live USD/KRW rate from the same response.
          const krwRate = (data.prices?.['KRW=X'] as { price?: number } | undefined)?.price
          if (krwRate && krwRate > 0) setUsdKrw(krwRate)
        }

        if (fxHistRes.ok) {
          const histData = await fxHistRes.json()
          if (histData.rates) setFxHistory(histData.rates)
        }

        // 워치리스트 전체 + 리서치(pass만) 종목도 시계열 로드 → 미보유 종목 돌파 표시
        const inferMarket = (tk: string) => (tk.endsWith('.KS') || /^\d{6}$/.test(tk)) ? 'KR' : 'US'
        const extraForHistory: { ticker: string; market?: string }[] = [
          ...[...(watchlistFull?.portfolio || []), ...(watchlistFull?.watchlist || [])].map(w => ({ ticker: w.ticker, market: inferMarket(w.ticker) })),
          ...researchFull.filter(r => r.verdict?.startsWith('pass') && r.track !== 'ETF').map(r => ({ ticker: r.ticker, market: r.market })),
        ]
        loadStockHistory(tradesFull, extraForHistory)
      }
    } finally {
      if (!bg) setLoadPhase(2)
    }
  }, [loadStockHistory])

  useEffect(() => { loadData() }, [loadData])
  useAgentRefresh(['stock_'], loadData)

  // 현재가 자동 갱신 폴링 — 활성 탭일 때만 5분마다 조용히 refetch(스켈레톤 없음).
  // 서버단 stock-quotes는 5분 캐시이므로 실제 Yahoo 호출 부하는 낮음.
  // 비활성 탭은 건너뛰고, 탭으로 돌아오면 즉시 1회 갱신.
  useEffect(() => {
    const POLL_MS = 300_000
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      loadData({ background: true })
    }
    const id = setInterval(tick, POLL_MS)
    const onVisible = () => { if (!document.hidden) loadData({ background: true }) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadData])

  // 칸반 액션 후에는 전체 데이터를 refetch하되 setLoadPhase는 건드리지 않음 →
  // 칸반이 unmount되지 않고 다른 블록 스켈레톤도 다시 뜨지 않음.
  const reloadQuiet = useCallback(() => { loadData({ background: true }) }, [loadData])

  // 내 portfolio + watchlist axis 집합 — SectorRotation 하이라이트에 사용
  const myAxes = useMemo(() => {
    const set = new Set<string>()
    if (!watchlistData) return set
    for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
      if (item.axis) set.add(item.axis)
    }
    return set
  }, [watchlistData])

  // ticker → DB의 세부 sector. holdings 카드에서 sub-group과 중복되지 않는 세부 라벨로 사용.
  const tickerSectors = useMemo(() => {
    const map: Record<string, string> = {}
    if (!watchlistData) return map
    for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
      if (!item.sector) continue
      const key = item.ticker.replace('.KS', '')
      map[key] = item.sector
    }
    return map
  }, [watchlistData])

  // QLD 강등 시그널: 종목의 6개월(≈126 거래일) 수익률이 QLD보다 낮으면 'QLD전환' 후보.
  // 모멘텀이 벤치마크(2x 나스닥) 밑으로 꺾인 자본은 베타로 회수한다는 청산룰. 시그널만, 매매는 수동.
  // 6개월 기준(보수적): 단기 조정에 큰 추세 종목을 강등하지 않고, 진짜 추세 훼손만 잡는다.
  const qldTransition = useMemo(() => {
    const map: Record<string, boolean> = {}
    const WINDOW = 126
    const ret3m = (series?: { dates: string[]; prices: number[] }): number | null => {
      if (!series || series.prices.length < 2) return null
      const p = series.prices
      const last = p[p.length - 1]
      const past = p[Math.max(0, p.length - 1 - WINDOW)]
      if (!last || !past || past <= 0) return null
      return (last - past) / past
    }
    const qldRet = ret3m(stockHistory['QLD'])
    if (qldRet === null) return map
    for (const [ticker, series] of Object.entries(stockHistory)) {
      if (ticker === 'QLD') continue
      const r = ret3m(series)
      if (r === null) continue
      map[ticker.replace('.KS', '')] = r < qldRet
    }
    return map
  }, [stockHistory])

  // 돌파 시그널: 현재가(실시간 stockQuotes)가 직전 20거래일 고가(stockHistory)를 넘으면 'breakout'.
  // CEO 핵심 매매 트리거 — 가격이 이전 매물대(저항선)를 상향 돌파했는가. 시그널만, 매매는 수동.
  const breakoutMap = useMemo(() => {
    const map: Record<string, { breakout: boolean; gapPct: number }> = {}
    const WINDOW = 20
    for (const [rawTicker, series] of Object.entries(stockHistory)) {
      if (rawTicker === 'QLD') continue
      const key = rawTicker.replace('.KS', '')
      const cur = stockQuotes[key]?.price
      if (!cur || cur <= 0) continue
      const prices = series?.prices
      if (!prices || prices.length < 2) continue
      // 저항선은 직전 N거래일 '고가'의 최댓값(Donchian). 고가 누락 시 종가로 폴백.
      const levelSeries = (series?.highs && series.highs.length === prices.length) ? series.highs : prices
      // 오늘 바는 제외하고 직전 N일만 본다.
      const prior = levelSeries.slice(Math.max(0, levelSeries.length - 1 - WINDOW), levelSeries.length - 1)
      if (prior.length === 0) continue
      const resistance = Math.max(...prior)
      if (!(resistance > 0)) continue
      map[key] = { breakout: cur >= resistance, gapPct: Math.round((cur / resistance - 1) * 1000) / 10 }
    }
    return map
  }, [stockHistory, stockQuotes])

  return {
    loadPhase,
    watchlistData, signalData,
    stockTrades, stockTradesFull,
    stockQuotes, stockQuotesFull,
    stockResearch, stockThemes,
    stockHistory, fxHistory, usdKrw,
    isLoadingHistory,
    myAxes, tickerSectors, qldTransition, breakoutMap,
    reload: loadData,
    reloadQuiet,
  }
}
