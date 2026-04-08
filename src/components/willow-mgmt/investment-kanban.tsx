'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, Plus, RefreshCw, TrendingUp, AlertTriangle, ArrowUpRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
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
}

interface WatchlistItem {
  name: string; ticker: string; sector: string; axis?: string
}

interface SignalData {
  name: string; ticker: string; sector: string; axis?: string
  group: 'portfolio' | 'watchlist' | 'benchmark'
  price: number; change: number; changePercent: number; currency: string
  signal: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct: number | null; high52w: number | null; low52w: number | null
}

interface StockTrade {
  ticker: string; company_name: string; trade_type: 'buy' | 'sell'
  quantity: number; price: number; currency: string
}

type ResearchFilter = 'all' | 'pass' | 'smallcap'

interface Props {
  stockResearch: StockResearch[]
  smallcapData: SmallcapScreening[]
  loadStockResearch: () => Promise<void>
  loadSmallcapScreening: (scanDate?: string) => Promise<void>
  isLoadingResearch: boolean
  isLoadingSmallcap: boolean
  stockTrades: StockTrade[]
}

export function InvestmentKanban({
  stockResearch, smallcapData, loadStockResearch, loadSmallcapScreening,
  isLoadingResearch, isLoadingSmallcap, stockTrades,
}: Props) {
  const [watchlistData, setWatchlistData] = useState<{ portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null>(null)
  const [isLoadingWatchlist, setIsLoadingWatchlist] = useState(true)
  const [signalData, setSignalData] = useState<SignalData[]>([])
  const [signalSummary, setSignalSummary] = useState<{ newHighs: number; near: number; weak: number; lastUpdated: string } | null>(null)
  const [isLoadingSignals, setIsLoadingSignals] = useState(true)
  const [researchFilter, setResearchFilter] = useState<ResearchFilter>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingResearch, setEditingResearch] = useState<StockResearch | null>(null)

  const loadWatchlist = useCallback(async () => {
    setIsLoadingWatchlist(true)
    try {
      const res = await fetch('/api/willow-mgmt/watchlist')
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
      }
    } catch (error) {
      console.error('Failed to load signals:', error)
    } finally {
      setIsLoadingSignals(false)
    }
  }, [])

  useEffect(() => {
    loadWatchlist()
    loadSignals()
  }, [loadWatchlist, loadSignals])

  // Compute holdings from stock_trades
  const holdingsMap = new Map<string, { qty: number; avgPrice: number; currency: string }>()
  for (const t of stockTrades) {
    const key = t.ticker.replace('.KS', '')
    const prev = holdingsMap.get(key) || { qty: 0, avgPrice: 0, currency: t.currency }
    if (t.trade_type === 'buy') {
      const totalCost = prev.qty * prev.avgPrice + t.quantity * t.price
      prev.qty += t.quantity
      prev.avgPrice = prev.qty > 0 ? totalCost / prev.qty : 0
    } else {
      prev.qty -= t.quantity
    }
    holdingsMap.set(key, prev)
  }

  // Build signal lookup
  const signalMap = new Map<string, SignalData>()
  for (const s of signalData) {
    signalMap.set(s.ticker, s)
    signalMap.set(s.ticker.replace('.KS', ''), s)
  }

  // Watchlist ticker sets for filtering research column
  const watchlistTickers = new Set<string>()
  if (watchlistData) {
    for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
      watchlistTickers.add(item.ticker)
      watchlistTickers.add(item.ticker.replace('.KS', ''))
    }
  }

  // Build portfolio column data
  const portfolioCards: CompactCardData[] = (watchlistData?.portfolio || []).map(item => {
    const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
    const hold = holdingsMap.get(item.ticker.replace('.KS', ''))
    return {
      name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
      group: 'portfolio' as const,
      price: sig?.price, changePercent: sig?.changePercent, currency: sig?.currency,
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
      holdingQty: hold && hold.qty > 0 ? hold.qty : undefined,
      avgPrice: hold?.avgPrice,
    }
  })

  // Build watchlist column data
  const watchlistCards: CompactCardData[] = (watchlistData?.watchlist || []).map(item => {
    const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
    return {
      name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
      group: 'watchlist' as const,
      price: sig?.price, changePercent: sig?.changePercent, currency: sig?.currency,
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
    }
  })

  // Build research column data — only pass + A/B tier, exclude portfolio/watchlist tickers
  const researchCards: ResearchCardData[] = []
  const seenTickers = new Set<string>()

  // stock_research: only pass items, sorted by scan_date desc
  const sortedResearch = [...stockResearch]
    .filter(r => r.verdict?.startsWith('pass'))
    .sort((a, b) => b.scan_date.localeCompare(a.scan_date))
  for (const r of sortedResearch) {
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

  // smallcap: only A/B tier, sorted by composite_score desc
  const sortedSmallcap = [...smallcapData]
    .filter(s => s.tier === 'A' || s.tier === 'B')
    .sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0))
  for (const s of sortedSmallcap) {
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
    })
  }

  // Apply research filter
  const filteredResearch = researchCards.filter(card => {
    if (researchFilter === 'all') return true
    if (researchFilter === 'pass') return card.type === 'research'
    if (researchFilter === 'smallcap') return card.type === 'smallcap'
    return true
  })

  // Move actions
  const handleMoveToWatchlist = async (name: string, ticker: string, sector: string, axis?: string, fromGroup?: string) => {
    try {
      if (fromGroup) {
        await fetch('/api/willow-mgmt/watchlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'move', name, fromGroup, toGroup: 'watchlist' }),
        })
      } else {
        await fetch('/api/willow-mgmt/watchlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name, ticker, sector, axis, toGroup: 'watchlist' }),
        })
      }
      await loadWatchlist()
    } catch (error) {
      console.error('Failed to move to watchlist:', error)
    }
  }

  const handleRemoveFromWatchlist = async (name: string, group: string) => {
    try {
      await fetch('/api/willow-mgmt/watchlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name, fromGroup: group }),
      })
      await loadWatchlist()
    } catch (error) {
      console.error('Failed to remove from watchlist:', error)
    }
  }

  const openNewResearch = () => { setEditingResearch(null); setIsModalOpen(true) }

  const openEditResearch = (id: string) => {
    const found = stockResearch.find(r => r.id === id)
    if (found) { setEditingResearch(found); setIsModalOpen(true) }
  }

  const isLoading = isLoadingWatchlist || isLoadingSignals

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            투자 관제탑
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
              <span className="text-[10px] text-slate-400">{watchlistCards.length}종목</span>
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
                {(['all', 'pass', 'smallcap'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setResearchFilter(f)}
                    className={cn(
                      'px-1.5 py-0.5 text-[10px] font-medium rounded-full transition-colors',
                      researchFilter === f
                        ? 'bg-slate-900 text-white dark:bg-slate-600'
                        : 'bg-slate-200 text-slate-500 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-400'
                    )}
                  >
                    {f === 'all' ? '전체' : f === 'pass' ? 'Pass' : '소형주'}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1" style={{ maxHeight: '600px' }}>
              <div className="space-y-1.5">
                {(isLoadingResearch || isLoadingSmallcap) ? (
                  <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400" /></div>
                ) : filteredResearch.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">리서치 항목이 없습니다</p>
                ) : (
                  filteredResearch.map(card => (
                    <InvestmentCardResearch
                      key={card.id}
                      data={card}
                      onAddToWatchlist={() => handleMoveToWatchlist(card.companyName, card.ticker, card.sectorTags?.[0] || card.sector || '미분류')}
                      onEdit={card.type === 'research' ? () => openEditResearch(card.id) : undefined}
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
    </Card>
  )
}
