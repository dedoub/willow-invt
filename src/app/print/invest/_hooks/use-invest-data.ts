'use client'

import { useEffect, useState } from 'react'
import type { StockTradeFull, StockQuoteFull, TickerTheme } from '@/app/(dashboard)/(linear)/invest/_components/holdings-block'
import type { WatchlistItem, SignalData, StockTrade, StockResearch, StockQuote } from '@/app/(dashboard)/(linear)/invest/_components/portfolio-kanban'

export interface InvestData {
  loading: boolean
  watchlistData: { portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null
  stockTrades: StockTrade[]
  stockTradesFull: StockTradeFull[]
  stockResearch: StockResearch[]
  signalData: SignalData[]
  stockQuotes: Record<string, StockQuote>
  stockQuotesFull: Record<string, StockQuoteFull>
  stockThemes: Record<string, TickerTheme[]>
  stockHistory: Record<string, { dates: string[]; prices: number[] }>
  fxHistory: Record<string, number>
  usdKrw: number
}

/**
 * 인쇄용 페이지에서 사용하는 invest 데이터 통합 fetch.
 * /invest 페이지의 progressive loading과 달리 한 번에 모든 데이터 가져옴.
 */
export function useInvestData(): InvestData {
  const [state, setState] = useState<InvestData>({
    loading: true,
    watchlistData: null,
    stockTrades: [], stockTradesFull: [],
    stockResearch: [], signalData: [],
    stockQuotes: {}, stockQuotesFull: {},
    stockThemes: {}, stockHistory: {}, fxHistory: {},
    usdKrw: 1400,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [watchlistRes, tradesRes, researchRes] = await Promise.all([
          fetch('/api/willow-mgmt/watchlist', { cache: 'no-store' }),
          fetch('/api/willow-mgmt/stock-trades'),
          fetch('/api/willow-mgmt/stock-research'),
        ])

        const watchlistData = watchlistRes.ok ? await watchlistRes.json() : null
        let trades: StockTrade[] = []
        if (tradesRes.ok) {
          const data = await tradesRes.json()
          trades = Array.isArray(data) ? data : data.trades || []
        }
        let research: StockResearch[] = []
        if (researchRes.ok) {
          const data = await researchRes.json()
          research = Array.isArray(data) ? data : data.items || data.research || []
        }

        const extraTickers = research
          .filter(r => r.verdict?.startsWith('pass') && r.track !== 'ETF')
          .map(r => r.ticker)
        const signalUrl = extraTickers.length > 0
          ? `/api/willow-mgmt/stock-signals?extra=${extraTickers.join(',')}`
          : '/api/willow-mgmt/stock-signals'
        const signalRes = await fetch(signalUrl)
        let signalData: SignalData[] = []
        let usdKrw = 1400
        if (signalRes.ok) {
          const data = await signalRes.json()
          signalData = data.signals || []
          if (data.usdKrw) usdKrw = data.usdKrw
        }

        // Quotes + FX history + stock history 병렬
        const tickerMap = new Map<string, string>()
        for (const tr of trades as Array<StockTrade & { market?: string }>) {
          const ticker = tr.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, tr.market || 'US')
        }
        for (const r of research as Array<StockResearch & { market?: string }>) {
          if (!r.verdict?.startsWith('pass') || r.track === 'ETF') continue
          const ticker = r.ticker.replace('.KS', '')
          if (!tickerMap.has(ticker)) tickerMap.set(ticker, r.market || 'US')
        }
        const tickers = Array.from(tickerMap.keys())
        const markets = tickers.map(tk => tickerMap.get(tk)!)

        const [quotesRes, fxRes, fxHistRes, histRes] = await Promise.all([
          tickers.length > 0
            ? fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`)
            : null,
          fetch('/api/willow-mgmt/stock-quotes?tickers=KRW%3DX&markets=US'),
          fetch('/api/willow-mgmt/fx-history'),
          tickers.length > 0
            ? fetch(`/api/willow-mgmt/stock-history?tickers=${tickers.join(',')}&markets=${markets.join(',')}`)
            : null,
        ])

        const stockQuotes: Record<string, StockQuote> = {}
        const stockQuotesFull: Record<string, StockQuoteFull> = {}
        let stockThemes: Record<string, TickerTheme[]> = {}
        if (quotesRes?.ok) {
          const data = await quotesRes.json()
          for (const [ticker, q] of Object.entries(data.prices || {})) {
            const quote = q as StockQuote & { marketCap?: number }
            stockQuotes[ticker] = quote
            stockQuotesFull[ticker] = quote
          }
          if (data.themes) stockThemes = data.themes
        }

        if (fxRes.ok) {
          const fxData = await fxRes.json()
          const krwRate = fxData.prices?.['KRW=X']?.price
          if (krwRate && krwRate > 0) usdKrw = krwRate
        }

        const fxHistory: Record<string, number> = {}
        if (fxHistRes.ok) {
          const d = await fxHistRes.json()
          if (d.rates) Object.assign(fxHistory, d.rates)
        }

        const stockHistory: Record<string, { dates: string[]; prices: number[] }> = {}
        if (histRes?.ok) {
          const d = await histRes.json()
          Object.assign(stockHistory, d.history || {})
        }

        if (cancelled) return
        setState({
          loading: false,
          watchlistData,
          stockTrades: trades,
          stockTradesFull: trades as unknown as StockTradeFull[],
          stockResearch: research,
          signalData,
          stockQuotes,
          stockQuotesFull,
          stockThemes,
          stockHistory,
          fxHistory,
          usdKrw,
        })
      } catch (err) {
        console.error('[print] data load failed:', err)
        if (!cancelled) setState(s => ({ ...s, loading: false }))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return state
}
