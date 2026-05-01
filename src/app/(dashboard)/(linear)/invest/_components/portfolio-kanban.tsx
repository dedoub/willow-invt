'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { StockCard, StockCardData, PyramidingInfo, MonitorInfo } from './stock-card'

/* ── Shared types ── */

export interface WatchlistItem {
  name: string; ticker: string; sector: string; axis?: string
  pinned?: boolean; monitorDate?: string; monitorPrice?: number
}

export interface SignalData {
  name: string; ticker: string; sector: string; axis?: string
  group: 'portfolio' | 'watchlist' | 'benchmark'
  price: number; change: number; changePercent: number; currency: string
  signal: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct: number | null; high52w: number | null; low52w: number | null
  return1m: number | null; return3m: number | null
  return6m: number | null; return12m: number | null
  momentumScore: number | null
}

export interface StockTrade {
  id?: string; trade_date?: string
  ticker: string; company_name: string; trade_type: 'buy' | 'sell'
  quantity: number; price: number; total_amount?: number; currency: string
}

export interface StockResearch {
  id: string; ticker: string; company_name: string; scan_date: string
  source: string; source_type: 'valuechain' | 'smallcap'
  current_price: number | null; verdict: string | null
  sector_tags: string[]; sector: string | null
  composite_score: number | null; momentum_score: number | null
  gap_from_high_pct: number | null; change_pct: number | null
  structural_thesis: string | null; track: string | null
  market_cap_b: number | null; market_cap_m: number | null
}

export interface StockQuote {
  price: number; change: number; changePercent: number; currency: string
  marketCap?: number
}

/* ── Pyramiding triggers (avg return rate per tranche) ── */
const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

/* ── Component ── */

interface KanbanProps {
  watchlistData: { portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] } | null
  signalData: SignalData[]
  stockTrades: StockTrade[]
  stockQuotes: Record<string, StockQuote>
  stockResearch: StockResearch[]
  usdKrw: number
  onTotalValueChange?: (totalUsd: number) => void
  onDataChanged?: () => void
}

export function PortfolioKanban({
  watchlistData, signalData, stockTrades, stockQuotes, stockResearch, usdKrw,
  onTotalValueChange, onDataChanged,
}: KanbanProps) {
  const mobile = useIsMobile()
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [sortBy1m, setSortBy1m] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('kanban-sort-1m') === '1'
  )

  const handleRemoveWatchlist = useCallback(async (name: string, group: string) => {
    await fetch('/api/willow-mgmt/watchlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', name, fromGroup: group }),
    })
    onDataChanged?.()
  }, [onDataChanged])

  const handleRemoveResearch = useCallback(async (id: string) => {
    await fetch(`/api/willow-mgmt/stock-research?id=${id}`, { method: 'DELETE' })
    onDataChanged?.()
  }, [onDataChanged])

  const handleTogglePin = useCallback(async (name: string, group: string, currentPrice?: number) => {
    await fetch('/api/willow-mgmt/watchlist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pin', name, fromGroup: group,
        monitorDate: new Date().toISOString().slice(0, 10),
        monitorPrice: currentPrice,
      }),
    })
    onDataChanged?.()
  }, [onDataChanged])

  const handleDrop = useCallback(async (targetGroup: string, e: React.DragEvent) => {
    e.preventDefault()
    setDragOverCol(null)
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const item = JSON.parse(raw) as { ticker: string; name: string; sector: string; axis?: string; group: string; researchId?: string }
      if (item.group === targetGroup) return

      if (item.group === 'research') {
        // Research → watchlist/portfolio: add to watchlist
        await fetch('/api/willow-mgmt/watchlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis, toGroup: targetGroup }),
        })
      } else {
        // watchlist ↔ portfolio: move
        await fetch('/api/willow-mgmt/watchlist', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'move', name: item.name, fromGroup: item.group, toGroup: targetGroup }),
        })
      }
      onDataChanged?.()
    } catch { /* ignore parse errors */ }
  }, [onDataChanged])

  /* ── Holdings from trades ── */
  const { holdingsAvgMap, totalBoughtMap } = useMemo(() => {
    const holdingsMap = new Map<string, { qty: number; totalCost: number; currency: string }>()
    const sorted = [...stockTrades].sort((a, b) => {
      const ta = a.trade_date ? new Date(a.trade_date).getTime() : 0
      const tb = b.trade_date ? new Date(b.trade_date).getTime() : 0
      if (ta !== tb) return ta - tb
      return (a.id || '').localeCompare(b.id || '')
    })
    for (const tr of sorted) {
      const key = tr.ticker.replace('.KS', '')
      const prev = holdingsMap.get(key) || { qty: 0, totalCost: 0, currency: tr.currency }
      const amount = tr.total_amount ?? tr.quantity * tr.price
      if (tr.trade_type === 'buy') {
        prev.totalCost += amount; prev.qty += tr.quantity
      } else {
        const avg = prev.qty > 0 ? prev.totalCost / prev.qty : 0
        prev.totalCost -= avg * tr.quantity; prev.qty -= tr.quantity
        if (prev.qty <= 0) { prev.qty = 0; prev.totalCost = 0 }
      }
      holdingsMap.set(key, prev)
    }
    const avgMap = new Map<string, { qty: number; avgPrice: number; currency: string }>()
    for (const [key, h] of holdingsMap) {
      avgMap.set(key, { qty: h.qty, avgPrice: h.qty > 0 ? h.totalCost / h.qty : 0, currency: h.currency })
    }
    const boughtMap = new Map<string, number>()
    for (const tr of stockTrades) {
      if (tr.trade_type !== 'buy') continue
      const key = tr.ticker.replace('.KS', '')
      const amount = tr.total_amount ?? tr.quantity * tr.price
      boughtMap.set(key, (boughtMap.get(key) || 0) + amount)
    }
    return { holdingsAvgMap: avgMap, totalBoughtMap: boughtMap }
  }, [stockTrades])

  /* ── Signal lookup ── */
  const signalMap = useMemo(() => {
    const m = new Map<string, SignalData>()
    for (const s of signalData) {
      const key = s.ticker.replace('.KS', '')
      const quote = stockQuotes[key]
      const merged: SignalData = quote
        ? { ...s, price: quote.price, change: quote.change, changePercent: s.changePercent, currency: quote.currency }
        : s
      m.set(s.ticker, merged)
      m.set(key, merged)
    }
    return m
  }, [signalData, stockQuotes])

  /* ── Watchlist ticker set ── */
  const watchlistTickers = useMemo(() => {
    const set = new Set<string>()
    if (!watchlistData) return set
    for (const item of [...watchlistData.portfolio, ...watchlistData.watchlist]) {
      set.add(item.ticker); set.add(item.ticker.replace('.KS', ''))
    }
    return set
  }, [watchlistData])

  /* ── Portfolio column ── */
  const portfolioCards = useMemo((): StockCardData[] => {
    if (!watchlistData) return []
    const raw = watchlistData.portfolio.map(item => {
      const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
      const hold = holdingsAvgMap.get(item.ticker.replace('.KS', ''))
      const qty = hold && hold.qty > 0 ? hold.qty : 0
      const price = sig?.price ?? 0
      const currency = sig?.currency ?? 'KRW'
      const valueUsd = currency === 'KRW' ? (qty * price) / usdKrw : qty * price
      return { item, sig, hold, qty, price, currency, valueUsd }
    })
    const totalUsd = raw.reduce((s, c) => s + c.valueUsd, 0)

    const cards: StockCardData[] = raw.map(({ item, sig, hold, qty, price, currency, valueUsd }) => {
      const weightPct = totalUsd > 0 ? (valueUsd / totalUsd) * 100 : 0
      const tickerKey = item.ticker.replace('.KS', '')
      const holdInfo = holdingsAvgMap.get(tickerKey)
      const totalInvested = holdInfo ? holdInfo.avgPrice * holdInfo.qty : 0

      let pyramiding: PyramidingInfo | undefined
      if (valueUsd > 0 && hold?.avgPrice && price && totalInvested > 0) {
        const trancheSize = currency === 'KRW' ? 5_000_000 : 5_000_000 / usdKrw
        const tranche = Math.min(10, Math.max(1, Math.round(totalInvested / trancheSize)))
        const avgReturnPct = ((price - hold.avgPrice) / hold.avgPrice) * 100
        const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
        const currentTrigger = TRANCHE_TRIGGERS[tranche - 1]

        let status: PyramidingInfo['status']
        if (tranche >= 10) status = 'FULL'
        else if (nextTrigger !== null && avgReturnPct / 100 >= nextTrigger) status = 'BUY'
        else if (currentTrigger !== null && avgReturnPct / 100 < currentTrigger) status = 'FREEZE'
        else status = 'HOLD'

        pyramiding = {
          tranche, avgReturnPct, status,
          nextTriggerPct: nextTrigger !== null ? nextTrigger * 100 : null,
          nextTriggerPrice: nextTrigger !== null ? hold.avgPrice * (1 + nextTrigger) : null,
        }
      }

      return {
        name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
        group: 'portfolio' as const,
        price: sig?.price, changePercent: sig?.changePercent, currency: sig?.currency,
        signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
        holdingQty: qty > 0 ? qty : undefined, avgPrice: hold?.avgPrice,
        momentumScore: sig?.momentumScore ?? null,
        return1m: sig?.return1m ?? null,
        weightPct: weightPct > 0 ? Math.round(weightPct * 10) / 10 : undefined,
        pyramiding,
      }
    })

    if (sortBy1m) {
      cards.sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999))
    } else {
      const statusOrder: Record<string, number> = { BUY: 0, HOLD: 1, FULL: 2, FREEZE: 3 }
      cards.sort((a, b) => {
        const ar = a.pyramiding ? statusOrder[a.pyramiding.status] ?? 5 : 6
        const br = b.pyramiding ? statusOrder[b.pyramiding.status] ?? 5 : 6
        if (ar !== br) return ar - br
        return (b.weightPct ?? 0) - (a.weightPct ?? 0)
      })
    }
    return cards
  }, [watchlistData, signalMap, holdingsAvgMap, usdKrw, sortBy1m])

  const portfolioTotalUsd = useMemo(() => {
    if (!watchlistData) return 0
    return watchlistData.portfolio.reduce((s, item) => {
      const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
      const hold = holdingsAvgMap.get(item.ticker.replace('.KS', ''))
      const qty = hold && hold.qty > 0 ? hold.qty : 0
      const price = sig?.price ?? 0
      const currency = sig?.currency ?? 'KRW'
      return s + (currency === 'KRW' ? (qty * price) / usdKrw : qty * price)
    }, 0)
  }, [watchlistData, signalMap, holdingsAvgMap, usdKrw])

  useEffect(() => {
    onTotalValueChange?.(portfolioTotalUsd)
  }, [portfolioTotalUsd, onTotalValueChange])

  /* ── Watchlist column ── */
  const watchlistCards = useMemo((): StockCardData[] => {
    if (!watchlistData) return []
    return watchlistData.watchlist.map(item => {
      const sig = signalMap.get(item.ticker) || signalMap.get(item.ticker.replace('.KS', ''))
      const currentPrice = sig?.price

      let monitor: MonitorInfo | undefined
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
          stage, changePct, days,
          nextThresholdPct: nextThreshold !== null ? nextThreshold * 100 : null,
          nextThresholdPrice: nextThreshold !== null ? item.monitorPrice * (1 + nextThreshold) : null,
          startDate: item.monitorDate, startPrice: item.monitorPrice,
        }
      }

      return {
        name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
        group: 'watchlist' as const,
        price: currentPrice, changePercent: sig?.changePercent, currency: sig?.currency,
        signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
        momentumScore: sig?.momentumScore ?? null,
        return1m: sig?.return1m ?? null,
        pinned: item.pinned, monitor,
      }
    }).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (sortBy1m) return (b.return1m ?? -999) - (a.return1m ?? -999)
      return (b.momentumScore ?? -1) - (a.momentumScore ?? -1)
    })
  }, [watchlistData, signalMap, sortBy1m])

  /* ── Research column ── */
  const researchCards = useMemo((): StockCardData[] => {
    const seen = new Set<string>()
    const cards: StockCardData[] = []
    for (const r of stockResearch) {
      if (!r.verdict?.startsWith('pass')) continue
      if (r.track === 'ETF') continue
      if (seen.has(r.ticker)) continue
      if (watchlistTickers.has(r.ticker)) continue
      seen.add(r.ticker)
      const sig = signalMap.get(r.ticker) || signalMap.get(r.ticker.replace('.KS', ''))
      const quote = stockQuotes[r.ticker] || stockQuotes[r.ticker.replace('.KS', '')]
      // Market cap: prefer live quote, fallback to DB research data
      let marketCapLabel: string | undefined
      if (quote?.marketCap && quote.marketCap > 0) {
        if (quote.currency === 'KRW') {
          const capOk = quote.marketCap / 1e8
          marketCapLabel = capOk >= 10000 ? `${(capOk / 10000).toFixed(1)}조` : `${Math.round(capOk).toLocaleString()}억`
        } else {
          const capB = quote.marketCap / 1e9
          marketCapLabel = capB >= 1 ? `$${capB.toFixed(1)}B` : `$${Math.round(capB * 1000)}M`
        }
      } else {
        const mcap = (r.market_cap_b || r.market_cap_m)
          ? r
          : stockResearch.find(sr => sr.ticker === r.ticker && (sr.market_cap_b || sr.market_cap_m))
        if (mcap?.market_cap_b != null && mcap.market_cap_b > 0) {
          marketCapLabel = mcap.market_cap_b >= 1 ? `$${mcap.market_cap_b.toFixed(1)}B` : `$${Math.round(mcap.market_cap_b * 1000)}M`
        } else if (mcap?.market_cap_m != null && mcap.market_cap_m > 0) {
          marketCapLabel = mcap.market_cap_m >= 10000 ? `${(mcap.market_cap_m / 10000).toFixed(1)}조` : `${Math.round(mcap.market_cap_m).toLocaleString()}억`
        }
      }

      cards.push({
        name: r.company_name || r.ticker, ticker: r.ticker,
        sector: r.sector || '', group: 'research',
        price: sig?.price ?? r.current_price ?? undefined,
        changePercent: sig?.changePercent ?? r.change_pct ?? undefined, currency: sig?.currency,
        signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct ?? r.gap_from_high_pct ?? undefined,
        momentumScore: sig?.momentumScore ?? r.momentum_score ?? null,
        return1m: sig?.return1m ?? r.change_pct ?? null,
        verdict: r.verdict, compositeScore: r.composite_score,
        sourceType: r.source_type, researchId: r.id,
        marketCapLabel,
      })
    }
    if (sortBy1m) {
      cards.sort((a, b) => (b.return1m ?? -999) - (a.return1m ?? -999))
    } else {
      cards.sort((a, b) => -(a.compositeScore ?? 0) + (b.compositeScore ?? 0))
    }
    return cards
  }, [stockResearch, stockQuotes, watchlistTickers, signalMap, sortBy1m])

  /* ── Render ── */
  const colStyle = (group: string): React.CSSProperties => ({
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
    borderRadius: t.radius.md, padding: 4,
    background: dragOverCol === group ? `${t.brand[600]}10` : 'transparent',
    transition: 'background .15s',
  })
  const headerCount = (label: string, count: number) => `${label} (${count})`
  const dropHandlers = (group: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverCol(group) },
    onDragLeave: () => setDragOverCol(null),
    onDrop: (e: React.DragEvent) => handleDrop(group, e),
  })

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="PORTFOLIO · KANBAN" title="종목관리" action={
          <button
            onClick={() => setSortBy1m(v => { localStorage.setItem('kanban-sort-1m', v ? '0' : '1'); return !v })}
            style={{
              fontSize: 10, fontFamily: t.font.mono, fontWeight: t.weight.medium,
              padding: '3px 8px', borderRadius: t.radius.sm, border: 'none',
              background: sortBy1m ? t.brand[600] : t.neutrals.inner,
              color: sortBy1m ? '#fff' : t.neutrals.muted,
              cursor: 'pointer', transition: 'all .15s',
            }}
          >1M ↓</button>
        } />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? 'repeat(3, minmax(220px, 1fr))' : '1fr 1fr 1fr',
        gap: 10, padding: '0 10px 14px',
        overflowX: mobile ? 'auto' : undefined,
      }}>
        {/* Portfolio */}
        <div style={colStyle('portfolio')} {...dropHandlers('portfolio')}>
          <div style={{
            fontSize: 11, fontWeight: t.weight.semibold, color: t.neutrals.text,
            padding: '6px 8px', background: t.neutrals.inner, borderRadius: t.radius.sm,
          }}>
            {headerCount('포트폴리오', portfolioCards.length)}
          </div>
          {portfolioCards.map(card => (
            <StockCard key={card.ticker} data={card} draggable />
          ))}
          {portfolioCards.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: t.neutrals.subtle }}>종목 없음</div>
          )}
        </div>

        {/* Watchlist */}
        <div style={colStyle('watchlist')} {...dropHandlers('watchlist')}>
          <div style={{
            fontSize: 11, fontWeight: t.weight.semibold, color: t.neutrals.text,
            padding: '6px 8px', background: t.neutrals.inner, borderRadius: t.radius.sm,
          }}>
            {headerCount('워치리스트', watchlistCards.length)}
          </div>
          {watchlistCards.map(card => (
            <StockCard key={card.ticker} data={card} draggable
              onRemove={() => handleRemoveWatchlist(card.name, 'watchlist')}
              onPin={() => handleTogglePin(card.name, 'watchlist', card.price)}
              pinned={card.pinned}
            />
          ))}
          {watchlistCards.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: t.neutrals.subtle }}>종목 없음</div>
          )}
        </div>

        {/* Research */}
        <div style={colStyle('research')} {...dropHandlers('research')}>
          <div style={{
            fontSize: 11, fontWeight: t.weight.semibold, color: t.neutrals.text,
            padding: '6px 8px', background: t.neutrals.inner, borderRadius: t.radius.sm,
          }}>
            {headerCount('리서치', researchCards.length)}
          </div>
          {researchCards.map(card => (
            <StockCard key={card.ticker} data={card} draggable
              onRemove={card.researchId ? () => handleRemoveResearch(card.researchId!) : undefined}
            />
          ))}
          {researchCards.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: t.neutrals.subtle }}>종목 없음</div>
          )}
        </div>
      </div>
    </LCard>
  )
}
