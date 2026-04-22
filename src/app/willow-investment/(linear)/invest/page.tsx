'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { SignalBar } from './_components/signal-bar'
import { PortfolioKanban, WatchlistItem, SignalData, StockTrade, StockResearch, StockQuote } from './_components/portfolio-kanban'
import { HoldingsBlock, StockTradeFull, StockQuoteFull, TickerTheme } from './_components/holdings-block'
import { AnalysisBlock } from './_components/analysis-block'
import { TradeLog } from './_components/trade-log'

const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

export default function InvestPage() {
  const [loading, setLoading] = useState(true)
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
  const loadStockHistory = useCallback(async (trades: StockTradeFull[]) => {
    const tickerMap = new Map<string, string>()
    for (const tr of trades) {
      if (!tickerMap.has(tr.ticker)) tickerMap.set(tr.ticker, tr.market)
    }
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

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Phase 1: fetch APIs that don't depend on trades
      const [watchlistRes, signalRes, tradesRes, researchRes] = await Promise.all([
        fetch('/api/willow-mgmt/watchlist', { cache: 'no-store' }),
        fetch('/api/willow-mgmt/stock-signals'),
        fetch('/api/willow-mgmt/stock-trades'),
        fetch('/api/willow-mgmt/stock-research'),
      ])

      if (watchlistRes.ok) setWatchlistData(await watchlistRes.json())

      if (signalRes.ok) {
        const data = await signalRes.json()
        setSignalData(data.signals || [])
        if (data.usdKrw) setUsdKrw(data.usdKrw)
      }

      let tradesFull: StockTradeFull[] = []
      if (tradesRes.ok) {
        const data = await tradesRes.json()
        const trades = Array.isArray(data) ? data : data.trades || []
        setStockTrades(trades)
        tradesFull = trades
        setStockTradesFull(trades)
      }

      if (researchRes.ok) {
        const data = await researchRes.json()
        setStockResearch(Array.isArray(data) ? data : data.items || data.research || [])
      }

      // Phase 2: fetch stock quotes, live FX rate, and FX history
      if (tradesFull.length > 0) {
        const tickerMap = new Map<string, string>()
        for (const tr of tradesFull) {
          const ticker = tr.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, tr.market)
        }
        const tickers = Array.from(tickerMap.keys())
        const markets = tickers.map(tk => tickerMap.get(tk)!)

        const [quotesRes, fxRes, fxHistRes] = await Promise.all([
          fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`),
          fetch('/api/willow-mgmt/stock-quotes?tickers=KRW%3DX&markets=US'),
          fetch('/api/willow-mgmt/fx-history'),
        ])

        if (quotesRes.ok) {
          const data = await quotesRes.json()
          const quotes: Record<string, StockQuote> = {}
          const quotesFull: Record<string, StockQuoteFull> = {}

          for (const [ticker, q] of Object.entries(data.prices || {})) {
            const quote = q as { price: number; change: number; changePercent: number; currency: string }
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

        // Load history (non-blocking)
        loadStockHistory(tradesFull)
      }
    } finally {
      setLoading(false)
    }
  }, [loadStockHistory])

  useEffect(() => { loadData() }, [loadData])

  // Compute portfolio summary stats for signal bar
  const portfolioStats = useMemo(() => {
    // Build holdings map from trades
    const holdMap = new Map<string, { qty: number; totalCost: number; currency: string; totalBought: number }>()
    const sorted = [...stockTrades].sort((a, b) => {
      const ta = a.trade_date ? new Date(a.trade_date).getTime() : 0
      const tb = b.trade_date ? new Date(b.trade_date).getTime() : 0
      return ta - tb
    })
    for (const tr of sorted) {
      const key = tr.ticker.replace('.KS', '')
      const prev = holdMap.get(key) || { qty: 0, totalCost: 0, currency: tr.currency, totalBought: 0 }
      const amt = tr.total_amount ?? tr.quantity * tr.price
      if (tr.trade_type === 'buy') {
        prev.qty += tr.quantity; prev.totalCost += amt; prev.totalBought += amt
      } else {
        const avg = prev.qty > 0 ? prev.totalCost / prev.qty : 0
        prev.totalCost -= avg * tr.quantity; prev.qty -= tr.quantity
        if (prev.qty <= 0) { prev.qty = 0; prev.totalCost = 0 }
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

    let totalValKrw = 0, totalCostKrw = 0
    const buyTickers: string[] = [], holdTickers: string[] = []
    for (const [ticker, h] of holdMap) {
      if (h.qty <= 0) continue
      const quote = stockQuotes[ticker]
      if (!quote?.price) continue
      const isUS = h.currency === 'USD' || h.currency === 'US'
      const fx = isUS ? usdKrw : 1
      const val = quote.price * h.qty * fx
      const cost = h.totalCost * fx
      totalValKrw += val; totalCostKrw += cost

      // Pyramiding status
      const avgPrice = h.totalCost / h.qty
      const avgReturnPct = ((quote.price - avgPrice) / avgPrice) * 100
      const trancheSize = isUS ? 5_000_000 / usdKrw : 5_000_000
      const tranche = Math.min(10, Math.max(1, Math.round(h.totalBought / trancheSize)))
      const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
      const currentTrigger = TRANCHE_TRIGGERS[tranche - 1]

      let status: string
      if (avgReturnPct >= 200) status = 'HOUSE_MONEY'
      else if (tranche >= 10) status = 'FULL'
      else if (nextTrigger !== null && avgReturnPct / 100 >= nextTrigger) status = 'BUY'
      else if (currentTrigger !== null && avgReturnPct / 100 < currentTrigger) status = 'FREEZE'
      else status = 'HOLD'

      const name = nameMap.get(ticker) || ticker
      if (status === 'BUY') buyTickers.push(name)
      if (status === 'HOLD') holdTickers.push(name)
    }

    const cumulativeReturnPct = totalCostKrw > 0 ? (totalValKrw - totalCostKrw) / totalCostKrw * 100 : 0
    return { totalValKrw, totalCostKrw, cumulativeReturnPct, buyTickers, holdTickers }
  }, [stockTrades, stockQuotes, usdKrw, watchlistData])

  const totalValKrw = portfolioStats.totalValKrw > 0
    ? portfolioStats.totalValKrw
    : totalValueUsd > 0 ? totalValueUsd * usdKrw : 0
  const totalCostKrw = portfolioStats.totalCostKrw
  const gain = totalValKrw - totalCostKrw
  const afterTaxVal = gain > 0 ? totalValKrw - gain * 0.222 : totalValKrw

  const fmtKrwShort = (v: number) => v >= 1e8 ? `₩${(v / 1e8).toFixed(1)}억` : `₩${Math.round(v / 10000).toLocaleString()}만`
  const fmtTotalValue = totalValKrw > 0
    ? gain > 0
      ? `${fmtKrwShort(totalValKrw)} (${fmtKrwShort(afterTaxVal)})`
      : fmtKrwShort(totalValKrw)
    : undefined

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: t.neutrals.subtle, fontSize: 13,
      }}>
        로딩 중...
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>투자관리</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>
          포트폴리오 · 시그널 · 매매기록
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SignalBar
          totalValue={fmtTotalValue}
          cumulativeReturnPct={portfolioStats.cumulativeReturnPct}
          buyTickers={portfolioStats.buyTickers}
          holdTickers={portfolioStats.holdTickers}
          usdKrw={usdKrw}
        />

        <PortfolioKanban
          watchlistData={watchlistData}
          signalData={signalData}
          stockTrades={stockTrades}
          stockQuotes={stockQuotes}
          stockResearch={stockResearch}
          usdKrw={usdKrw}
          onTotalValueChange={handleTotalValueChange}
          onDataChanged={loadData}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <HoldingsBlock
            stockTrades={stockTradesFull}
            stockQuotes={stockQuotesFull}
            stockThemes={stockThemes}
            usdKrwRate={usdKrw}
            fxHistory={fxHistory}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
            <AnalysisBlock
              stockTrades={stockTradesFull}
              stockQuotes={stockQuotesFull}
              stockThemes={stockThemes}
              stockHistory={stockHistory}
              fxHistory={fxHistory}
              usdKrwRate={usdKrw}
              loading={isLoadingHistory}
            />
            <div style={{ flex: 1, minHeight: 0 }}>
              <TradeLog trades={stockTrades} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
