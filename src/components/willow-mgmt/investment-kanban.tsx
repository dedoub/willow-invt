'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, Plus, RefreshCw, TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownUp, Pin } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { InvestmentCardCompact, type CompactCardData } from './investment-card-compact'
import { InvestmentCardResearch, type ResearchCardData } from './investment-card-research'
import { InvestmentResearchModal } from './investment-research-modal'

interface StockResearch {
  id: string; ticker: string; company_name: string; scan_date: string; source: string
  market_cap_b: number | null; current_price: number | null; revenue_growth_yoy: string | null
  margin: string | null; value_chain_position: string | null; structural_thesis: string | null
  sector_tags: string[]; high_12m: number | null; gap_from_high_pct: number | null
  trend_verdict: string | null; verdict: string | null; fail_reason: string | null
  notes: string | null; created_at: string; updated_at: string
}

interface SmallcapScreening {
  id: string; ticker: string; company_name: string | null; sector: string | null
  scan_date: string; market_cap_m: number | null; change_pct: number | null
  composite_score: number | null; tier: 'A' | 'B' | 'C' | 'F'
  track: 'profitable' | 'hypergrowth' | null
  growth_score: number | null; value_score: number | null; quality_score: number | null
  momentum_score: number | null; insider_score: number | null; sentiment_score: number | null
  fail_reasons: string[] | null
  structural_thesis: string | null; value_chain_position: string | null
}

interface WatchlistItem {
  name: string; ticker: string; sector: string; axis?: string; pinned?: boolean
  monitorDate?: string; monitorPrice?: number
}

interface SignalData {
  name: string; ticker: string; sector: string; axis?: string
  group: 'portfolio' | 'watchlist' | 'benchmark'
  price: number; change: number; changePercent: number; currency: string
  signal: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct: number | null; high52w: number | null; low52w: number | null
  return1m: number | null; return3m: number | null
  return6m: number | null; return12m: number | null
  momentumScore: number | null
}

interface StockTrade {
  id?: string; trade_date?: string
  ticker: string; company_name: string; trade_type: 'buy' | 'sell'
  quantity: number; price: number; total_amount?: number; currency: string
}

// Pyramiding tranche triggers (avg return rate to trigger each tranche buy)
const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

interface Props {
  stockResearch: StockResearch[]
  smallcapData: SmallcapScreening[]
  loadStockResearch: () => Promise<void>
  loadSmallcapScreening: (scanDate?: string) => Promise<void>
  isLoadingResearch: boolean
  isLoadingSmallcap: boolean
  stockTrades: StockTrade[]
  stockQuotes?: Record<string, { price: number; change: number; changePercent: number; currency: string }>
  usdKrwRate?: number
}

export function InvestmentKanban({
  stockResearch, smallcapData, loadStockResearch, loadSmallcapScreening,
  isLoadingResearch, isLoadingSmallcap, stockTrades, stockQuotes, usdKrwRate,
}: Props) {
  const [watchlistData, setWatchlistData] = useState<{ portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null>(null)
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(true)
  const [signalData, setSignalData] = useState<SignalData[]>([])
  const [signalSummary, setSignalSummary] = useState<{ newHighs: number; near: number; weak: number; lastUpdated: string } | null>(null)
  const [isLoadingSignals, setIsLoadingSignals] = useState(true)
  const [usdKrw, setUsdKrw] = useState(1400)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingResearch, setEditingResearch] = useState<StockResearch | null>(null)
  const [isSmallcapModalOpen, setIsSmallcapModalOpen] = useState(false)
  const [editingSmallcap, setEditingSmallcap] = useState<{ id: string; ticker: string; companyName: string; thesis: string; valueChain: string } | null>(null)
  const [isSavingSmallcap, setIsSavingSmallcap] = useState(false)
  const [watchlistSort, setWatchlistSort] = useState<'momentum' | 'signal'>('momentum')
  const [researchSort, setResearchSort] = useState<'recommend' | 'momentum'>('recommend')
  const [pinTarget, setPinTarget] = useState<{ name: string; ticker: string; currency?: string } | null>(null)
  const [pinDate, setPinDate] = useState('')
  const [pinPrice, setPinPrice] = useState<number | string>('')
  const [isPinPriceLoading, setIsPinPriceLoading] = useState(false)

  const loadWatchlist = useCallback(async () => {
    setIsLoadingWatchlist(true)
    try {
      const res = await fetch('/api/willow-mgmt/watchlist', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setWatchlistData(data)
      }
    } catch (error) {
      console.error('Failed to load watchlist:', error)
    } finally {
      setIsLoadingWatchlist(false)
    }
  }, [])

  const loadSignals = useCallback(async () => {
    setIsLoadingSignals(true)
    try {
      const res = await fetch('/api/willow-mgmt/stock-signals')
      if (res.ok) {
        const data = await res.json()
        setSignalData(data.signals || [])
        setSignalSummary(data.summary || null)
        if (data.usdKrw) setUsdKrw(data.usdKrw)
      }
    } catch (error) {
      console.error('Failed to load signals:', error)
    } finally {
      setIsLoadingSignals(false)
    }
  }, [])

  // Prefer shared rate from parent (management page) for consistent pyramiding tranche calculation
  const effectiveUsdKrw = usdKrwRate ?? usdKrw

  useEffect(() => {
    loadWatchlist()
    loadSignals()
  }, [loadWatchlist, loadSignals])

  // Compute holdings from stock_trades (matches management page: moving avg with cost reduction on sell)
  const holdingsMap = new Map<string, { qty: number; totalCost: number; currency: string }>()
  const sortedTrades = [...stockTrades].sort((a, b) => {
    const ta = a.trade_date ? new Date(a.trade_date).getTime() : 0
    const tb = b.trade_date ? new Date(b.trade_date).getTime() : 0
    if (ta !== tb) return ta - tb
    return (a.id || '').localeCompare(b.id || '')
  })
  for (const t of sortedTrades) {
    const key = t.ticker.replace('.KS', '')
    const prev = holdingsMap.get(key) || { qty: 0, totalCost: 0, currency: t.currency }
    const amount = t.total_amount ?? t.quantity * t.price
    if (t.trade_type === 'buy') {
      prev.totalCost += amount
      prev.qty += t.quantity
    } else {
      const currentAvg = prev.qty > 0 ? prev.totalCost / prev.qty : 0
      prev.totalCost -= currentAvg * t.quantity
      prev.qty -= t.quantity
      if (prev.qty <= 0) { prev.qty = 0; prev.totalCost = 0 }
    }
    holdingsMap.set(key, prev)
  }
  const holdingsAvgMap = new Map<string, { qty: number; avgPrice: number; currency: string }>()
  for (const [key, h] of holdingsMap) {
    holdingsAvgMap.set(key, { qty: h.qty, avgPrice: h.qty > 0 ? h.totalCost / h.qty : 0, currency: h.currency })
  }

  // Total bought amount per ticker (for pyramiding tranche count) — uses t.total_amount to match management page
  const totalBoughtMap = new Map<string, number>()
  for (const t of stockTrades) {
    if (t.trade_type !== 'buy') continue
    const key = t.ticker.replace('.KS', '')
    const amount = t.total_amount ?? t.quantity * t.price
    totalBoughtMap.set(key, (totalBoughtMap.get(key) || 0) + amount)
  }

  // Build signal lookup — override current price from shared stockQuotes when available (matches management page)
  const signalMap = new Map<string, SignalData>()
  for (const s of signalData) {
    const key = s.ticker.replace('.KS', '')
    const quote = stockQuotes?.[key]
    const merged: SignalData = quote
      ? { ...s, price: quote.price, change: quote.change, changePercent: s.changePercent, currency: quote.currency }
      : s
    signalMap.set(s.ticker, merged)
    signalMap.set(key, merged)
  }

  // Watchlist ticker sets for filtering research column
  const watchlistTickers = new Set<string>()
  if (watchlistData) {
    for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
      watchlistTickers.add(item.ticker)
      watchlistTickers.add(item.ticker.replace('.KS', ''))
    }
  }

  // Signal priority: new_high > near > weak > none
  const signalOrder: Record<string, number> = { new_high: 0, near: 1, weak: 2 }
  function sortBySignal(a: { signal?: 'new_high' | 'near' | 'weak' | null }, b: { signal?: 'new_high' | 'near' | 'weak' | null }) {
    const oa = a.signal ? (signalOrder[a.signal] ?? 3) : 3
    const ob = b.signal ? (signalOrder[b.signal] ?? 3) : 3
    return oa - ob
  }

  // Build portfolio column — sorted by pyramiding status priority
  const portfolioRaw = (watchlistData?.portfolio || []).map(item => {
    const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
    const hold = holdingsAvgMap.get(item.ticker.replace('.KS', ''))
    const qty = hold && hold.qty > 0 ? hold.qty : 0
    const price = sig?.price ?? 0
    const currency = sig?.currency ?? 'KRW'
    const valueUsd = currency === 'KRW' ? (qty * price) / effectiveUsdKrw : qty * price
    return {
      name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
      group: 'portfolio' as const,
      price: sig?.price, changePercent: sig?.changePercent, currency: sig?.currency,
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
      holdingQty: qty > 0 ? qty : undefined, avgPrice: hold?.avgPrice,
      momentumScore: sig?.momentumScore ?? null,
      _valueUsd: valueUsd,
    }
  })
  const totalValueUsd = portfolioRaw.reduce((s, c) => s + c._valueUsd, 0)
  const withScores = portfolioRaw.map(c => {
    const weightPct = totalValueUsd > 0 ? (c._valueUsd / totalValueUsd) * 100 : 0
    return { ...c, weightPct }
  })
  const portfolioCards: CompactCardData[] = withScores.map(card => {
    const hasHoldings = card._valueUsd > 0
    const tickerKey = card.ticker.replace('.KS', '')
    const totalBought = totalBoughtMap.get(tickerKey)
    const currency = card.currency || 'KRW'

    let pyramiding: CompactCardData['pyramiding'] = undefined
    if (hasHoldings && card.avgPrice && card.price && totalBought) {
      const trancheSize = currency === 'KRW' ? 5_000_000 : 5_000_000 / effectiveUsdKrw
      const tranche = Math.min(10, Math.max(1, Math.round(totalBought / trancheSize)))
      const avgReturnPct = ((card.price - card.avgPrice) / card.avgPrice) * 100
      const currentTrigger = TRANCHE_TRIGGERS[tranche - 1]
      const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null

      let status: 'BUY' | 'HOLD' | 'FREEZE' | 'HOUSE_MONEY' | 'FULL'
      if (avgReturnPct >= 200) {
        status = 'HOUSE_MONEY'
      } else if (tranche >= 10) {
        status = 'FULL'
      } else if (nextTrigger !== null && avgReturnPct / 100 >= nextTrigger) {
        status = 'BUY'
      } else if (currentTrigger !== null && avgReturnPct / 100 < currentTrigger) {
        status = 'FREEZE'
      } else {
        status = 'HOLD'
      }

      pyramiding = {
        tranche,
        avgReturnPct,
        status,
        nextTriggerPct: nextTrigger !== null ? nextTrigger * 100 : null,
        nextTriggerPrice: nextTrigger !== null ? card.avgPrice * (1 + nextTrigger) : null,
      }
    }

    return {
      name: card.name, ticker: card.ticker, sector: card.sector, axis: card.axis,
      group: card.group, price: card.price, changePercent: card.changePercent,
      currency: card.currency, signal: card.signal, gapFromHighPct: card.gapFromHighPct,
      holdingQty: card.holdingQty, avgPrice: card.avgPrice,
      momentumScore: card.momentumScore,
      weightPct: card.weightPct > 0 ? Math.round(card.weightPct * 10) / 10 : undefined,
      pyramiding,
    }
  })
  // Sort by pyramiding status priority: BUY > HOUSE_MONEY > HOLD > FULL > FREEZE > no holdings
  const statusOrder: Record<string, number> = { BUY: 0, HOUSE_MONEY: 1, HOLD: 2, FULL: 3, FREEZE: 4 }
  portfolioCards.sort((a, b) => {
    const aRank = a.pyramiding ? statusOrder[a.pyramiding.status] ?? 5 : 6
    const bRank = b.pyramiding ? statusOrder[b.pyramiding.status] ?? 5 : 6
    if (aRank !== bRank) return aRank - bRank
    return (b.weightPct ?? 0) - (a.weightPct ?? 0)
  })

  // Build watchlist column data — pinned items always on top
  const watchlistCards: CompactCardData[] = (watchlistData?.watchlist || []).map(item => {
    const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
    const currentPrice = sig?.price
    // Compute monitoring stage for pinned items
    let monitor: CompactCardData['monitor'] = undefined
    if (item.pinned && item.monitorDate && item.monitorPrice && currentPrice) {
      const changePct = ((currentPrice - item.monitorPrice) / item.monitorPrice) * 100
      const changeRatio = changePct / 100
      let stage = 1
      for (let i = 1; i < TRANCHE_TRIGGERS.length; i++) {
        if (TRANCHE_TRIGGERS[i] !== null && changeRatio >= (TRANCHE_TRIGGERS[i] as number)) stage = i + 1
        else break
      }
      const nextThreshold = stage < 10 ? TRANCHE_TRIGGERS[stage] : null
      const days = Math.round((Date.now() - new Date(item.monitorDate).getTime()) / (24 * 60 * 60 * 1000))
      monitor = {
        stage,
        changePct,
        days,
        nextThresholdPct: nextThreshold !== null ? nextThreshold * 100 : null,
        nextThresholdPrice: nextThreshold !== null ? item.monitorPrice * (1 + nextThreshold) : null,
        startDate: item.monitorDate,
        startPrice: item.monitorPrice,
      }
    }
    return {
      name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
      group: 'watchlist' as const,
      price: currentPrice, changePercent: sig?.changePercent, currency: sig?.currency,
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
      momentumScore: sig?.momentumScore ?? null,
      pinned: item.pinned,
      monitor,
    }
  }).sort((a, b) => {
    // Pinned items first
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    // Then sort by selected criteria
    if (watchlistSort === 'momentum') return (b.momentumScore ?? -1) - (a.momentumScore ?? -1)
    return sortBySignal(a, b)
  })

  // Build research column data — only pass + A/B tier, exclude portfolio/watchlist tickers
  // Recommendation priority: pass_tier1 (0) > 소형주 A (1) > pass_tier2 (2) > 소형주 B (3)
  const rankOrder: Record<string, number> = { pass_tier1: 0, A: 1, pass_tier2: 2, B: 3 }
  function getRecommendRank(card: ResearchCardData): number {
    const key = card.type === 'research' ? card.verdict : card.tier
    return key ? (rankOrder[key] ?? 4) : 4
  }

  const researchCards: ResearchCardData[] = []
  const seenTickers = new Set<string>()

  // stock_research: only pass items
  for (const r of stockResearch) {
    if (!r.verdict?.startsWith('pass')) continue
    if (seenTickers.has(r.ticker)) continue
    if (watchlistTickers.has(r.ticker)) continue
    seenTickers.add(r.ticker)
    researchCards.push({
      id: r.id, type: 'research', ticker: r.ticker, companyName: r.company_name,
      verdict: r.verdict as 'pass_tier1' | 'pass_tier2' | undefined,
      sectorTags: r.sector_tags, marketCapB: r.market_cap_b, currentPrice: r.current_price,
      thesis: r.structural_thesis, valueChain: r.value_chain_position,
      scanDate: r.scan_date, source: r.source,
      gapFromHighPct: r.gap_from_high_pct, failReason: r.fail_reason, notes: r.notes,
    })
  }

  // smallcap: only A/B tier
  for (const s of smallcapData) {
    if (s.tier !== 'A' && s.tier !== 'B') continue
    if (seenTickers.has(s.ticker)) continue
    if (watchlistTickers.has(s.ticker)) continue
    seenTickers.add(s.ticker)
    researchCards.push({
      id: s.id, type: 'smallcap', ticker: s.ticker, companyName: s.company_name || s.ticker,
      tier: s.tier, track: s.track, compositeScore: s.composite_score,
      marketCapM: s.market_cap_m, changePct: s.change_pct, sector: s.sector,
      growthScore: s.growth_score, valueScore: s.value_score, qualityScore: s.quality_score,
      momentumScore: s.momentum_score, insiderScore: s.insider_score, sentimentScore: s.sentiment_score,
      scanDate: s.scan_date, failReasons: s.fail_reasons,
      thesis: s.structural_thesis, valueChain: s.value_chain_position,
    })
  }

  // Sort research cards
  function getResearchMomentum(card: ResearchCardData): number {
    // smallcap: use momentumScore (0-100), research: use gapFromHighPct (closer to 0 = stronger)
    if (card.type === 'smallcap' && card.momentumScore != null) return card.momentumScore
    if (card.type === 'research' && card.gapFromHighPct != null) return Math.max(0, 100 + card.gapFromHighPct)
    return -1
  }
  if (researchSort === 'recommend') {
    researchCards.sort((a, b) => getRecommendRank(a) - getRecommendRank(b))
  } else {
    researchCards.sort((a, b) => getResearchMomentum(b) - getResearchMomentum(a))
  }

  // Move actions
  const handleMoveToWatchlist = async (name: string, ticker: string, sector: string, axis?: string, fromGroup?: string) => {
    try {
      const res = fromGroup
        ? await fetch('/api/willow-mgmt/watchlist', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'move', name, fromGroup, toGroup: 'watchlist' }),
          })
        : await fetch('/api/willow-mgmt/watchlist', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', name, ticker, sector, axis, toGroup: 'watchlist' }),
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Watchlist move failed:', err)
        return
      }
      await loadWatchlist()
    } catch (error) {
      console.error('Failed to move to watchlist:', error)
    }
  }

  const handleRemoveFromWatchlist = async (name: string, group: string) => {
    try {
      const res = await fetch('/api/willow-mgmt/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name, fromGroup: group }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Watchlist remove failed:', err)
        return
      }
      await loadWatchlist()
    } catch (error) {
      console.error('Failed to remove from watchlist:', error)
    }
  }

  const handleTogglePin = async (name: string, group: string, monitorDate?: string, monitorPrice?: number) => {
    try {
      const body: Record<string, unknown> = { action: 'pin', name, fromGroup: group }
      if (monitorDate) body.monitorDate = monitorDate
      if (monitorPrice) body.monitorPrice = monitorPrice
      const res = await fetch('/api/willow-mgmt/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error('Pin toggle failed:', err)
        return
      }
      await loadWatchlist()
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    }
  }

  const handleConfirmPin = async () => {
    if (!pinTarget) return
    const price = typeof pinPrice === 'string' ? parseFloat(pinPrice) : pinPrice
    await handleTogglePin(pinTarget.name, 'watchlist', pinDate || undefined, price || undefined)
    setPinTarget(null)
  }

  const handlePinDateChange = async (dateToLookup: string) => {
    if (!pinTarget || !dateToLookup) return
    setIsPinPriceLoading(true)
    try {
      const market = pinTarget.ticker.endsWith('.KS') ? 'KR' : 'US'
      const tickerParam = pinTarget.ticker.replace('.KS', '')
      const res = await fetch(`/api/willow-mgmt/stock-history?tickers=${tickerParam}&markets=${market}&range=2y`)
      if (!res.ok) return
      const json = await res.json()
      const history = json.history?.[tickerParam] || Object.values(json.history || {})[0] as { dates: string[]; prices: number[] } | undefined
      if (!history?.dates?.length) return
      const target = new Date(dateToLookup).getTime()
      let bestIdx = 0
      let bestDiff = Infinity
      for (let i = 0; i < history.dates.length; i++) {
        const diff = Math.abs(new Date(history.dates[i]).getTime() - target)
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
      }
      if (history.prices[bestIdx] > 0) setPinPrice(history.prices[bestIdx])
    } catch { /* silent */ }
    finally { setIsPinPriceLoading(false) }
  }

  const openNewResearch = () => { setEditingResearch(null); setIsModalOpen(true) }

  const openEditResearch = (id: string) => {
    const found = stockResearch.find(r => r.id === id)
    if (found) { setEditingResearch(found); setIsModalOpen(true) }
  }

  const openEditSmallcap = (id: string) => {
    const found = smallcapData.find(s => s.id === id)
    if (found) {
      setEditingSmallcap({
        id: found.id,
        ticker: found.ticker,
        companyName: found.company_name || found.ticker,
        thesis: found.structural_thesis || '',
        valueChain: found.value_chain_position || '',
      })
      setIsSmallcapModalOpen(true)
    }
  }

  const handleSaveSmallcap = async () => {
    if (!editingSmallcap) return
    setIsSavingSmallcap(true)
    try {
      const res = await fetch('/api/willow-mgmt/smallcap-screening', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSmallcap.id,
          structural_thesis: editingSmallcap.thesis || null,
          value_chain_position: editingSmallcap.valueChain || null,
        }),
      })
      if (res.ok) {
        setIsSmallcapModalOpen(false)
        await loadSmallcapScreening()
      }
    } catch (error) {
      console.error('Failed to save smallcap thesis:', error)
    } finally {
      setIsSavingSmallcap(false)
    }
  }

  const isLoading = isLoadingWatchlist || isLoadingSignals

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            주식 리서치
          </CardTitle>
          <CardDescription>포트폴리오 · 워치리스트 · 리서치 발굴</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadSignals(); loadWatchlist() }}
            disabled={isLoading}
            className="flex items-center gap-1 rounded-lg bg-slate-200 dark:bg-slate-700 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            시세
          </button>
          <button
            onClick={openNewResearch}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">추가</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Signal Summary Bar */}
        {signalSummary && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-white dark:bg-slate-700">
            <div className="flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">신고가 {signalSummary.newHighs}</span>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">근접 {signalSummary.near}</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">부진 {signalSummary.weak}</span>
            </div>
            {signalSummary.lastUpdated && (
              <span className="text-[10px] text-slate-400 ml-auto">
                {new Date(signalSummary.lastUpdated).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

        {/* 3-Column Kanban */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Column 1: Portfolio */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">포트폴리오</span>
              <span className="text-[10px] text-slate-400">{portfolioCards.length}종목</span>
            </div>
            <ScrollArea className="flex-1" style={{ maxHeight: '600px' }}>
              <div className="space-y-1.5">
                {isLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                ) : portfolioCards.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">포트폴리오가 비어있습니다</p>
                ) : (
                  portfolioCards.map(card => (
                    <InvestmentCardCompact
                      key={card.ticker}
                      data={card}
                      onMove={(dir) => {
                        if (dir === 'demote') handleMoveToWatchlist(card.name, card.ticker, card.sector, card.axis, 'portfolio')
                      }}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Column 2: Watchlist */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">워치리스트</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWatchlistSort('momentum')}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                    watchlistSort === 'momentum'
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  )}
                >
                  모멘텀
                </button>
                <button
                  onClick={() => setWatchlistSort('signal')}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                    watchlistSort === 'signal'
                      ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  )}
                >
                  시그널
                </button>
                {watchlistCards.some(c => c.pinned) && (
                  <span className="text-[10px] text-amber-500 ml-0.5">
                    <Pin className="h-2.5 w-2.5 inline fill-amber-500" />{watchlistCards.filter(c => c.pinned).length}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 ml-1">{watchlistCards.length}종목</span>
              </div>
            </div>
            <ScrollArea className="flex-1" style={{ maxHeight: '600px' }}>
              <div className="space-y-1.5">
                {isLoading ? (
                  <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                ) : watchlistCards.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">워치리스트가 비어있습니다</p>
                ) : (
                  watchlistCards.map(card => (
                    <InvestmentCardCompact
                      key={card.ticker}
                      data={card}
                      onMove={(dir) => {
                        if (dir === 'demote') handleRemoveFromWatchlist(card.name, 'watchlist')
                      }}
                      onPin={() => {
                        if (card.pinned) {
                          handleTogglePin(card.name, 'watchlist')
                        } else {
                          setPinDate(new Date().toISOString().slice(0, 10))
                          setPinPrice(card.price || '')
                          setPinTarget({ name: card.name, ticker: card.ticker, currency: card.currency })
                        }
                      }}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Column 3: Research */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">리서치 발굴</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setResearchSort('recommend')}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                    researchSort === 'recommend'
                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  )}
                >
                  추천순
                </button>
                <button
                  onClick={() => setResearchSort('momentum')}
                  className={cn(
                    'px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors',
                    researchSort === 'momentum'
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  )}
                >
                  모멘텀
                </button>
                <span className="text-[10px] text-slate-400 ml-1">{researchCards.length}종목</span>
              </div>
            </div>
            <ScrollArea className="flex-1" style={{ maxHeight: '600px' }}>
              <div className="space-y-1.5">
                {(isLoadingResearch || isLoadingSmallcap) ? (
                  <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                ) : researchCards.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">리서치 항목이 없습니다</p>
                ) : (
                  researchCards.map(card => (
                    <InvestmentCardResearch
                      key={card.id}
                      data={card}
                      onAddToWatchlist={() => handleMoveToWatchlist(card.companyName, card.ticker, card.sectorTags?.[0] || card.sector || '미분류')}
                      onEdit={card.type === 'research' ? () => openEditResearch(card.id) : () => openEditSmallcap(card.id)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>

      <InvestmentResearchModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        editing={editingResearch}
        onSaved={loadStockResearch}
      />

      {/* Smallcap thesis/value chain edit modal */}
      <Dialog open={isSmallcapModalOpen} onOpenChange={setIsSmallcapModalOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>
              {editingSmallcap?.ticker} {editingSmallcap?.companyName} — 리서치 메모
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">밸류체인 포지션</label>
              <Input
                value={editingSmallcap?.valueChain || ''}
                onChange={(e) => setEditingSmallcap(prev => prev ? { ...prev, valueChain: e.target.value } : prev)}
                placeholder="AI 데이터센터 냉각/전력 인프라"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">투자논거</label>
              <Textarea
                value={editingSmallcap?.thesis || ''}
                onChange={(e) => setEditingSmallcap(prev => prev ? { ...prev, thesis: e.target.value } : prev)}
                rows={4}
                placeholder="구조적 성장 논거..."
                className="resize-none"
              />
            </div>
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSmallcapModalOpen(false)}>취소</Button>
              <Button size="sm" onClick={handleSaveSmallcap} disabled={isSavingSmallcap}>
                {isSavingSmallcap && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pin monitoring start dialog */}
      <Dialog open={!!pinTarget} onOpenChange={(open) => !open && setPinTarget(null)}>
        <DialogContent className="max-h-[90vh] flex flex-col max-w-sm">
          <DialogHeader className="flex-shrink-0 pb-4">
            <DialogTitle className="text-base">모니터링 시작</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm font-medium">{pinTarget?.ticker}</div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">시작일</label>
              <Input type="date" value={pinDate} onChange={(e) => { setPinDate(e.target.value); handlePinDateChange(e.target.value) }} />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block flex items-center gap-1">
                시작 기준가 {pinTarget?.currency === 'KRW' ? '(원)' : '($)'}
                {isPinPriceLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              </label>
              <Input
                type="number"
                step={pinTarget?.currency === 'KRW' ? '100' : '0.01'}
                value={pinPrice}
                onChange={(e) => setPinPrice(e.target.value)}
                placeholder="모니터링 시작 시점의 가격"
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPinTarget(null)}>취소</Button>
              <Button size="sm" onClick={handleConfirmPin}>시작</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
