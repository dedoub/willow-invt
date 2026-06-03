'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { SignalBar } from './_components/signal-bar'
import { PortfolioKanban, WatchlistItem, SignalData, StockTrade, StockResearch, StockQuote } from './_components/portfolio-kanban'
import { HoldingsBlock, StockTradeFull, StockQuoteFull, TickerTheme } from './_components/holdings-block'
import { AnalysisBlock } from './_components/analysis-block'
import { TradeLog } from './_components/trade-log'
import { SectorRotationBlock } from './_components/sector-rotation-block'
import { InvestSkeleton, InvestHoldingsSkeleton } from '@/app/(dashboard)/_components/linear-skeleton'

const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

// 포트폴리오 벤치마크 (2x 나스닥) — 수익률 추이 차트 오버레이용
const BENCHMARK_TICKER = 'QLD'
const BENCHMARK_MARKET = 'US'

export default function InvestPage() {
  const mobile = useIsMobile()
  const [loadPhase, setLoadPhase] = useState(0) // 0=nothing, 1=base, 2=quotes
  const [watchlistData, setWatchlistData] = useState<{ portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null>(null)
  const [signalData, setSignalData] = useState<SignalData[]>([])
  const [stockTrades, setStockTrades] = useState<StockTrade[]>([])
  const [stockTradesFull, setStockTradesFull] = useState<StockTradeFull[]>([])
  const [stockQuotes, setStockQuotes] = useState<Record<string, StockQuote>>({})
  const [stockQuotesFull, setStockQuotesFull] = useState<Record<string, StockQuoteFull>>({})
  const [stockResearch, setStockResearch] = useState<StockResearch[]>([])
  const [usdKrw, setUsdKrw] = useState(1400)
  const [totalValueUsd, setTotalValueUsd] = useState(0)

  // Holdings / Analysis specific states
  const [stockThemes, setStockThemes] = useState<Record<string, TickerTheme[]>>({})
  const [stockHistory, setStockHistory] = useState<Record<string, { dates: string[]; prices: number[] }>>({})
  const [fxHistory, setFxHistory] = useState<Record<string, number>>({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Prevent stale callback from causing re-renders
  const totalValueRef = useRef(setTotalValueUsd)
  totalValueRef.current = setTotalValueUsd
  const handleTotalValueChange = useCallback((v: number) => totalValueRef.current(v), [])

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

      let watchlistFull: { portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null = null
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

      // Phase 1b: fetch signals with research tickers included
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

      // Show kanban + trade log immediately
      if (!bg) setLoadPhase(1)

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
        const tickers = Array.from(tickerMap.keys())
        const markets = tickers.map(tk => tickerMap.get(tk)!)

        const [quotesRes, fxRes, fxHistRes] = await Promise.all([
          tickers.length > 0
            ? fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`)
            : null,
          fetch('/api/willow-mgmt/stock-quotes?tickers=KRW%3DX&markets=US'),
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
        }

        if (fxRes.ok) {
          const fxData = await fxRes.json()
          const krwRate = fxData.prices?.['KRW=X']?.price
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

  // 현재가 자동 갱신 폴링 — 활성 탭일 때만 60초마다 조용히 refetch(스켈레톤 없음).
  // 서버단 stock-quotes는 5분 캐시이므로 실제 Yahoo 호출 부하는 낮음.
  // 비활성 탭은 건너뛰고, 탭으로 돌아오면 즉시 1회 갱신.
  useEffect(() => {
    const POLL_MS = 60_000
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
  // PortfolioKanban이 unmount되지 않고 다른 블록 스켈레톤도 다시 뜨지 않음.
  const handleKanbanDataChanged = useCallback(() => {
    loadData({ background: true })
  }, [loadData])

  // Compute portfolio summary stats for signal bar
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
      // 오늘 종가가 시계열에 이미 있으면 제외하고 직전 N일 고가를 본다.
      const prior = prices.slice(Math.max(0, prices.length - 1 - WINDOW), prices.length - 1)
      if (prior.length === 0) continue
      const resistance = Math.max(...prior)
      if (!(resistance > 0)) continue
      map[key] = { breakout: cur >= resistance, gapPct: Math.round((cur / resistance - 1) * 1000) / 10 }
    }
    return map
  }, [stockHistory, stockQuotes])

  const portfolioStats = useMemo(() => {
    // Build holdings map from trades (using historical FX for cost, matching holdings-block)
    const getFxRate = (date: string): number => {
      const d = new Date(date)
      for (let i = 0; i < 5; i++) {
        const key = d.toISOString().slice(0, 10)
        if (fxHistory[key]) return fxHistory[key]
        d.setDate(d.getDate() - 1)
      }
      return usdKrw
    }

    const holdMap = new Map<string, { qty: number; totalCost: number; krwCost: number; currency: string; totalBought: number }>()
    const sorted = [...stockTrades].sort((a, b) => {
      const ta = a.trade_date ? new Date(a.trade_date).getTime() : 0
      const tb = b.trade_date ? new Date(b.trade_date).getTime() : 0
      return ta - tb
    })
    for (const tr of sorted) {
      const key = tr.ticker.replace('.KS', '')
      const prev = holdMap.get(key) || { qty: 0, totalCost: 0, krwCost: 0, currency: tr.currency, totalBought: 0 }
      const amt = tr.total_amount ?? tr.quantity * tr.price
      const isUS = tr.currency === 'USD' || tr.currency === 'US'
      const histRate = isUS && tr.trade_date ? getFxRate(tr.trade_date) : 1
      if (tr.trade_type === 'buy') {
        prev.qty += tr.quantity; prev.totalCost += amt; prev.totalBought += amt
        prev.krwCost += amt * histRate
      } else {
        const avg = prev.qty > 0 ? prev.totalCost / prev.qty : 0
        const krwAvg = prev.qty > 0 ? prev.krwCost / prev.qty : 0
        prev.totalCost -= avg * tr.quantity; prev.qty -= tr.quantity
        prev.krwCost -= krwAvg * tr.quantity
        if (prev.qty <= 0) { prev.qty = 0; prev.totalCost = 0; prev.krwCost = 0 }
      }
      holdMap.set(key, prev)
    }

    // Build ticker→name map from watchlist
    const nameMap = new Map<string, string>()
    if (watchlistData) {
      for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
        nameMap.set(item.ticker.replace('.KS', ''), item.name)
      }
    }

    let totalValKrw = 0, totalCostKrw = 0, usGainKrw = 0
    // 3분류: 추매+돌파(buyBreakout) / 추매(buyOnly, 박스권) / 돌파(breakoutOnly, 트리거 미달이나 돌파)
    const buyBreakoutTickers: string[] = [], buyOnlyTickers: string[] = [], breakoutOnlyTickers: string[] = []
    const holdTickers: string[] = []
    for (const [ticker, h] of holdMap) {
      if (h.qty <= 0) continue
      const quote = stockQuotes[ticker]
      if (!quote?.price) continue
      const isUS = h.currency === 'USD' || h.currency === 'US'
      const fx = isUS ? usdKrw : 1
      const val = quote.price * h.qty * fx
      const cost = isUS ? h.krwCost : h.totalCost
      totalValKrw += val; totalCostKrw += cost
      if (isUS && val > cost) usGainKrw += val - cost

      // Pyramiding status
      const avgPrice = h.totalCost / h.qty
      const avgReturnPct = ((quote.price - avgPrice) / avgPrice) * 100
      const trancheSize = isUS ? 5_000_000 / usdKrw : 5_000_000
      const tranche = Math.min(10, Math.max(1, Math.round(h.totalCost / trancheSize)))
      const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
      const currentTrigger = TRANCHE_TRIGGERS[tranche - 1]

      let status: string
      if (tranche >= 10) status = 'FULL'
      else if (nextTrigger !== null && avgReturnPct / 100 >= nextTrigger) status = 'BUY'
      else if (currentTrigger !== null && avgReturnPct / 100 < currentTrigger) status = 'FREEZE'
      else status = 'HOLD'

      const name = nameMap.get(ticker) || ticker
      const isBreakout = (breakoutMap[ticker] ?? breakoutMap[ticker.replace('.KS', '')])?.breakout ?? false
      if (status === 'BUY' && isBreakout) buyBreakoutTickers.push(name)
      else if (status === 'BUY') buyOnlyTickers.push(name)
      else if (isBreakout) breakoutOnlyTickers.push(name)
      if (status === 'HOLD') holdTickers.push(name)
    }

    const cumulativeReturnPct = totalCostKrw > 0 ? (totalValKrw - totalCostKrw) / totalCostKrw * 100 : 0
    return { totalValKrw, totalCostKrw, cumulativeReturnPct, buyBreakoutTickers, buyOnlyTickers, breakoutOnlyTickers, holdTickers, usGainKrw }
  }, [stockTrades, stockQuotes, usdKrw, fxHistory, watchlistData, breakoutMap])

  const totalValKrw = portfolioStats.totalValKrw > 0
    ? portfolioStats.totalValKrw
    : totalValueUsd > 0 ? totalValueUsd * usdKrw : 0
  const totalCostKrw = portfolioStats.totalCostKrw
  const gain = totalValKrw - totalCostKrw
  const usTax = portfolioStats.usGainKrw * 0.222
  const afterTaxVal = totalValKrw - usTax

  const fmtKrwShort = (v: number) => v >= 1e8 ? `₩${(v / 1e8).toFixed(1)}억` : `₩${Math.round(v / 10000).toLocaleString()}만`
  const fmtTotalValue = totalValKrw > 0
    ? usTax > 0
      ? `${fmtKrwShort(totalValKrw)} (${fmtKrwShort(afterTaxVal)})`
      : fmtKrwShort(totalValKrw)
    : undefined

  const afterTaxGain = gain - usTax
  const gainSub = totalValKrw > 0
    ? usTax > 0
      ? `${fmtKrwShort(gain)} (세후 ${fmtKrwShort(afterTaxGain)})`
      : fmtKrwShort(gain)
    : undefined

  const printActions = (
    <div style={{ display: 'flex', gap: 6 }}>
      <button
        onClick={() => window.open('/print/invest/holdings', '_blank')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: 11, fontWeight: t.weight.regular,
          background: t.neutrals.inner, color: t.neutrals.muted,
          border: 'none', borderRadius: t.radius.sm, cursor: 'pointer',
          fontFamily: t.font.sans,
        }}
        title="보유현황 + 분석 인쇄/PDF용 페이지 열기"
      >
        <LIcon name="download" size={11} stroke={1.6} />
        보유현황
      </button>
      <button
        onClick={() => window.open('/print/invest/kanban', '_blank')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: 11, fontWeight: t.weight.regular,
          background: t.neutrals.inner, color: t.neutrals.muted,
          border: 'none', borderRadius: t.radius.sm, cursor: 'pointer',
          fontFamily: t.font.sans,
        }}
        title="종목관리 칸반 인쇄/PDF용 페이지 열기"
      >
        <LIcon name="download" size={11} stroke={1.6} />
        종목관리
      </button>
    </div>
  )

  return (
    <>
      {loadPhase === 0 ? <InvestSkeleton /> : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SignalBar
          totalValue={fmtTotalValue}
          cumulativeReturnPct={portfolioStats.cumulativeReturnPct}
          gainSub={gainSub}
          buyBreakoutTickers={portfolioStats.buyBreakoutTickers}
          buyOnlyTickers={portfolioStats.buyOnlyTickers}
          breakoutOnlyTickers={portfolioStats.breakoutOnlyTickers}
          usdKrw={usdKrw}
          actions={printActions}
        />

        {loadPhase < 2 ? <InvestHoldingsSkeleton /> : (
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <HoldingsBlock
              stockTrades={stockTradesFull}
              stockQuotes={stockQuotesFull}
              stockThemes={stockThemes}
              usdKrwRate={usdKrw}
              fxHistory={fxHistory}
              tickerSectors={tickerSectors}
              qldTransition={qldTransition}
              breakoutMap={breakoutMap}
              cardColumns={mobile ? 1 : 2}
            />
            <TradeLog trades={stockTrades} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, minHeight: 0 }}>
            <AnalysisBlock
              stockTrades={stockTradesFull}
              stockQuotes={stockQuotesFull}
              stockThemes={stockThemes}
              stockHistory={stockHistory}
              fxHistory={fxHistory}
              usdKrwRate={usdKrw}
              loading={isLoadingHistory}
            />
            <SectorRotationBlock myAxes={myAxes} />
          </div>
        </div>
        )}

        <PortfolioKanban
          watchlistData={watchlistData}
          signalData={signalData}
          stockTrades={stockTrades}
          stockQuotes={stockQuotes}
          stockResearch={stockResearch}
          stockThemes={stockThemes}
          usdKrw={usdKrw}
          qldTransition={qldTransition}
          breakoutMap={breakoutMap}
          onTotalValueChange={handleTotalValueChange}
          onDataChanged={handleKanbanDataChanged}
        />
      </div>
      )}
    </>
  )
}
