'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'

/* ── Types ── */

export interface StockTradeFull {
  id: string; trade_date: string; ticker: string; company_name: string
  market: 'KR' | 'US'; trade_type: 'buy' | 'sell'
  quantity: number; price: number; total_amount: number; currency: 'KRW' | 'USD'
}

export interface StockQuoteFull {
  price: number; change: number; changePercent: number; currency: string
  marketCap?: number
}

export interface TickerTheme {
  theme: string; parentTheme: string | null
}

/* ── Pyramiding triggers ── */
const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

const PYRAMID_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  BUY:         { label: '추매',   ...tonePalettes.done },
  HOLD:        { label: '대기',   ...tonePalettes.neutral },
  FREEZE:      { label: '동결',   ...tonePalettes.warn },
  HOUSE_MONEY: { label: '원금회수', bg: '#EDE5F5', fg: '#5B3A8C' },
  FULL:        { label: '풀',     ...tonePalettes.done },
}

const THEME_COLORS: Record<string, { bg: string; fg: string }> = {
  'AI 인프라':   { bg: '#E0E7FF', fg: '#4338CA' },
  '지정학/안보':  { bg: '#FFEDD5', fg: '#C2410C' },
  '넥스트':      { bg: '#F3E8FF', fg: '#7E22CE' },
  '미분류':      { bg: '#F1F5F9', fg: '#475569' },
}
const THEME_ORDER = ['AI 인프라', '미분류', '지정학/안보', '넥스트']

/* ── IRR (Newton-Raphson) ── */
function calculateIRR(cashFlows: { date: string; amount: number }[]): number | null {
  if (cashFlows.length < 2) return null
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
  const t0 = new Date(sorted[0].date).getTime()
  const ms365 = 365.25 * 24 * 60 * 60 * 1000
  const data = sorted.map(cf => ({ years: (new Date(cf.date).getTime() - t0) / ms365, amount: cf.amount }))
  const npv = (r: number) => data.reduce((sum, d) => sum + d.amount / Math.pow(1 + r, d.years), 0)
  const dnpv = (r: number) => data.reduce((sum, d) => sum + (-d.years * d.amount) / Math.pow(1 + r, d.years + 1), 0)
  let rate = 0.1
  for (let i = 0; i < 100; i++) {
    const f = npv(rate)
    const df = dnpv(rate)
    if (Math.abs(df) < 1e-10) break
    const next = rate - f / df
    if (Math.abs(next - rate) < 1e-8) { rate = next; break }
    rate = next
    if (rate < -0.99 || rate > 100) return null
  }
  return Math.abs(npv(rate)) < 1 ? rate : null
}

/* ── Formatters ── */
function fmtAmount(v: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const abs = Math.abs(v)
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}억원`
  if (abs >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
}

function fmtPrice(v: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${v.toFixed(2)}`
  return `${v.toLocaleString()}원`
}

function pnlColor(v: number): string {
  return v > 0 ? t.accent.neg : v < 0 ? t.brand[600] : t.neutrals.subtle
}

/* ── Component ── */

interface HoldingsBlockProps {
  stockTrades: StockTradeFull[]
  stockQuotes: Record<string, StockQuoteFull>
  stockThemes: Record<string, TickerTheme[]>
  usdKrwRate: number
  fxHistory: Record<string, number>
}

interface Holding {
  ticker: string; company_name: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD'
  netQty: number; avgBuyPrice: number; totalInvested: number; krwInvested: number; totalBought: number
  currentPrice: number; currentValue: number; pnl: number; pnlPercent: number
  dailyChangePercent: number; irr: number | null; holdingDays: number
  parentTheme: string | null; themes: string[]
}

type MarketFilter = 'all' | 'KR' | 'US'

export function HoldingsBlock({ stockTrades, stockQuotes, stockThemes, usdKrwRate, fxHistory }: HoldingsBlockProps) {
  const [currencyMode, setCurrencyMode] = useState<'original' | 'KRW'>('original')
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all')
  const isKrw = currencyMode === 'KRW'

  const holdings = useMemo((): Holding[] => {
    const getFxRate = (date: string): number => {
      const d = new Date(date)
      for (let i = 0; i < 5; i++) {
        const key = d.toISOString().slice(0, 10)
        if (fxHistory[key]) return fxHistory[key]
        d.setDate(d.getDate() - 1)
      }
      return usdKrwRate
    }

    const holdingsMap = new Map<string, { ticker: string; company_name: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD'; netQty: number; totalCost: number; krwCost: number }>()
    const sorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id))

    for (const trade of sorted) {
      const key = trade.ticker
      const prev = holdingsMap.get(key) || { ticker: trade.ticker, company_name: trade.company_name, market: trade.market, currency: trade.currency, netQty: 0, totalCost: 0, krwCost: 0 }
      const isUS = trade.market === 'US'
      const histRate = isUS ? getFxRate(trade.trade_date) : 1

      if (trade.trade_type === 'buy') {
        prev.totalCost += trade.total_amount
        prev.netQty += trade.quantity
        prev.krwCost += trade.total_amount * histRate
      } else {
        const avg = prev.netQty > 0 ? prev.totalCost / prev.netQty : 0
        const krwAvg = prev.netQty > 0 ? prev.krwCost / prev.netQty : 0
        prev.totalCost -= avg * trade.quantity
        prev.krwCost -= krwAvg * trade.quantity
        prev.netQty -= trade.quantity
        if (prev.netQty <= 0) { prev.netQty = 0; prev.totalCost = 0; prev.krwCost = 0 }
      }
      holdingsMap.set(key, prev)
    }

    return Array.from(holdingsMap.values())
      .filter(h => h.netQty > 0)
      .map(h => {
        const avgBuyPrice = h.netQty > 0 ? h.totalCost / h.netQty : 0
        const totalInvested = h.totalCost
        const quote = stockQuotes[h.ticker]
        const currentPrice = quote?.price || 0
        const dailyChangePercent = quote?.changePercent || 0
        const currentValue = currentPrice * h.netQty
        const pnl = currentPrice > 0 ? currentValue - totalInvested : 0
        const pnlPercent = totalInvested > 0 && currentPrice > 0 ? (pnl / totalInvested) * 100 : 0

        const tickerTrades = stockTrades.filter(tr => tr.ticker === h.ticker)
        const cashFlows = tickerTrades.map(tr => ({ date: tr.trade_date, amount: tr.trade_type === 'buy' ? -tr.total_amount : tr.total_amount }))
        if (currentPrice > 0 && h.netQty > 0) cashFlows.push({ date: new Date().toISOString().slice(0, 10), amount: currentValue })
        const irr = calculateIRR(cashFlows)

        const buyTrades = tickerTrades.filter(tr => tr.trade_type === 'buy')
        const totalBuyQty = buyTrades.reduce((s, tr) => s + tr.quantity, 0)
        const weightedBuyDate = totalBuyQty > 0 ? buyTrades.reduce((s, tr) => s + new Date(tr.trade_date).getTime() * tr.quantity, 0) / totalBuyQty : Date.now()
        const holdingDays = Math.round((Date.now() - weightedBuyDate) / (24 * 60 * 60 * 1000))

        const tickerThemes = stockThemes[h.ticker] || []
        const totalBought = stockTrades.filter(tr => tr.ticker === h.ticker && tr.trade_type === 'buy').reduce((s, tr) => s + tr.total_amount, 0)

        return {
          ticker: h.ticker, company_name: h.company_name, market: h.market, currency: h.currency,
          netQty: h.netQty, avgBuyPrice, totalInvested, krwInvested: h.currency === 'USD' ? h.krwCost : totalInvested,
          totalBought, currentPrice, currentValue, pnl, pnlPercent, dailyChangePercent, irr, holdingDays,
          parentTheme: tickerThemes[0]?.parentTheme || null,
          themes: tickerThemes.map(th => th.theme),
        }
      })
      .sort((a, b) => b.currentValue - a.currentValue)
  }, [stockTrades, stockQuotes, stockThemes, usdKrwRate, fxHistory])

  const filteredHoldings = useMemo(() => {
    if (marketFilter === 'all') return holdings
    return holdings.filter(h => h.market === marketFilter)
  }, [holdings, marketFilter])

  // Group by theme
  const themeGroups = useMemo(() => {
    const groups = new Map<string, Holding[]>()
    for (const h of filteredHoldings) {
      const g = h.parentTheme || '미분류'
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(h)
    }
    // Sort within groups by pyramiding status
    for (const [, items] of groups) {
      items.sort((a, b) => {
        const rank = (h: Holding) => {
          if (!(h.currentPrice > 0 && h.totalBought > 0)) return 6
          const trancheSize = h.currency === 'KRW' ? 5_000_000 : 5_000_000 / usdKrwRate
          const tranche = Math.min(10, Math.max(1, Math.round(h.totalBought / trancheSize)))
          const avgReturn = h.pnlPercent / 100
          const next = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
          const curr = TRANCHE_TRIGGERS[tranche - 1]
          if (avgReturn >= 2.00) return 1
          if (tranche >= 10) return 3
          if (next !== null && avgReturn >= next) return 0
          if (curr !== null && avgReturn < curr) return 4
          return 2
        }
        return rank(a) - rank(b) || (b.currency === 'USD' ? b.pnl * usdKrwRate : b.pnl) - (a.currency === 'USD' ? a.pnl * usdKrwRate : a.pnl)
      })
    }
    return THEME_ORDER.filter(th => groups.has(th)).map(th => ({ theme: th, items: groups.get(th)! }))
  }, [filteredHoldings, usdKrwRate])

  // Portfolio summary
  const summary = useMemo(() => {
    const krH = filteredHoldings.filter(h => h.currency === 'KRW')
    const usH = filteredHoldings.filter(h => h.currency === 'USD')
    const krInv = krH.reduce((s, h) => s + h.totalInvested, 0)
    const krVal = krH.reduce((s, h) => s + h.currentValue, 0)
    const usInv = usH.reduce((s, h) => s + h.totalInvested, 0)
    const usVal = usH.reduce((s, h) => s + h.currentValue, 0)
    const usKrwInv = usH.reduce((s, h) => s + h.krwInvested, 0)
    const totalInv = krInv + usKrwInv
    const totalVal = krVal + usVal * usdKrwRate
    const totalPnl = totalVal - totalInv
    const totalPct = totalInv > 0 ? (totalPnl / totalInv) * 100 : 0
    return { krH, usH, krInv, krVal, usInv, usVal, totalInv, totalVal, totalPnl, totalPct, count: filteredHoldings.length }
  }, [filteredHoldings, usdKrwRate])

  const hasQuotes = Object.keys(stockQuotes).length > 0

  if (holdings.length === 0) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad }}>
          <LSectionHead eyebrow="HOLDINGS" title="보유 현황" />
        </div>
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
          보유 종목이 없습니다
        </div>
      </LCard>
    )
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="HOLDINGS" title="보유 현황" action={
          <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
            {([['all', '전체'], ['KR', '국내'], ['US', '해외']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setMarketFilter(val)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: 11,
                  borderRadius: 4, fontFamily: t.font.sans, fontWeight: marketFilter === val ? t.weight.medium : t.weight.regular,
                  background: marketFilter === val ? t.neutrals.card : 'transparent',
                  color: t.neutrals.text,
                }}>{label}</button>
            ))}
            <span style={{ width: 1, margin: '3px 1px', background: t.neutrals.line }} />
            {([['original', '원화/달러'], ['KRW', '₩ 통합']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setCurrencyMode(val)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: 11,
                  borderRadius: 4, fontFamily: t.font.sans, fontWeight: currencyMode === val ? t.weight.medium : t.weight.regular,
                  background: currencyMode === val ? t.neutrals.card : 'transparent',
                  color: t.neutrals.text,
                }}>{label}</button>
            ))}
          </div>
        } />
      </div>

      {/* Summary cards */}
      {hasQuotes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 14px 12px' }}>
          {/* KR */}
          <div style={{ background: t.neutrals.inner, borderRadius: t.radius.md, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 2 }}>국내 {summary.krH.length}종목</div>
            <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(summary.krVal, 'KRW')}</div>
            <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: pnlColor(summary.krVal - summary.krInv), fontVariantNumeric: 'tabular-nums' }}>
              {(summary.krVal - summary.krInv) > 0 ? '+' : ''}{fmtAmount(summary.krVal - summary.krInv, 'KRW')}
              {summary.krInv > 0 && ` (${((summary.krVal - summary.krInv) / summary.krInv * 100).toFixed(1)}%)`}
            </div>
          </div>
          {/* US */}
          {(() => {
            const usValKrw = summary.usVal * usdKrwRate
            const usKrwInv = summary.usH.reduce((s, h) => s + h.krwInvested, 0)
            const displayVal = isKrw ? usValKrw : summary.usVal
            const displayInv = isKrw ? usKrwInv : summary.usInv
            const displayPnl = displayVal - displayInv
            const displayCur: 'KRW' | 'USD' = isKrw ? 'KRW' : 'USD'
            return (
              <div style={{ background: t.neutrals.inner, borderRadius: t.radius.md, padding: '8px 10px' }}>
                <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 2 }}>해외 {summary.usH.length}종목</div>
                <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(displayVal, displayCur)}</div>
                <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: pnlColor(displayPnl), fontVariantNumeric: 'tabular-nums' }}>
                  {displayPnl > 0 ? '+' : ''}{fmtAmount(displayPnl, displayCur)}
                  {displayInv > 0 && ` (${(displayPnl / displayInv * 100).toFixed(1)}%)`}
                </div>
              </div>
            )
          })()}
          {/* Total */}
          <div style={{ background: t.neutrals.inner, borderRadius: t.radius.md, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 2 }}>전체 {summary.count}종목 · {Math.round(usdKrwRate).toLocaleString()}원/$</div>
            <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(summary.totalVal, 'KRW')}</div>
            <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: pnlColor(summary.totalPnl), fontVariantNumeric: 'tabular-nums' }}>
              {summary.totalPnl > 0 ? '+' : ''}{fmtAmount(summary.totalPnl, 'KRW')} ({summary.totalPnl > 0 ? '+' : ''}{summary.totalPct.toFixed(1)}%)
            </div>
          </div>
        </div>
      )}

      {/* Theme groups */}
      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {themeGroups.map(({ theme, items }) => {
          const tc = THEME_COLORS[theme] || THEME_COLORS['미분류']
          const groupValKrw = items.reduce((s, h) => s + (h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue), 0)
          const groupInvKrw = items.reduce((s, h) => s + h.krwInvested, 0)
          const groupPnl = groupValKrw - groupInvKrw
          const groupPct = groupInvKrw > 0 ? (groupPnl / groupInvKrw) * 100 : 0

          return (
            <div key={theme}>
              {/* Theme header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10.5, fontWeight: t.weight.semibold, padding: '2px 8px',
                  borderRadius: t.radius.sm, background: tc.bg, color: tc.fg,
                }}>{theme}</span>
                <span style={{ fontSize: 10, color: t.neutrals.subtle }}>{items.length}종목</span>
                {hasQuotes && groupValKrw > 0 && (
                  <span style={{ fontSize: 11, fontWeight: t.weight.medium, color: pnlColor(groupPnl), marginLeft: 'auto' }}>
                    {groupPnl > 0 ? '+' : ''}{groupPct.toFixed(1)}% ({groupPnl > 0 ? '+' : ''}{fmtAmount(groupPnl, 'KRW')})
                  </span>
                )}
              </div>

              {/* Holdings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map(h => {
                  // Pyramiding
                  let pyramiding: { tranche: number; status: string; nextPct: number | null; nextPrice: number | null } | null = null
                  if (h.currentPrice > 0 && h.totalBought > 0) {
                    const trancheSize = h.currency === 'KRW' ? 5_000_000 : 5_000_000 / usdKrwRate
                    const tranche = Math.min(10, Math.max(1, Math.round(h.totalBought / trancheSize)))
                    const avgReturn = h.pnlPercent / 100
                    const curr = TRANCHE_TRIGGERS[tranche - 1]
                    const next = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
                    let status: string
                    if (avgReturn >= 2.00) status = 'HOUSE_MONEY'
                    else if (tranche >= 10) status = 'FULL'
                    else if (next !== null && avgReturn >= next) status = 'BUY'
                    else if (curr !== null && avgReturn < curr) status = 'FREEZE'
                    else status = 'HOLD'
                    pyramiding = { tranche, status, nextPct: next !== null ? next * 100 : null, nextPrice: next !== null ? h.avgBuyPrice * (1 + next) : null }
                  }
                  const ps = pyramiding ? PYRAMID_STATUS[pyramiding.status] : null

                  // Currency display conversion
                  const dCur: 'KRW' | 'USD' = isKrw ? 'KRW' : h.currency
                  const toD = (v: number) => isKrw && h.currency === 'USD' ? v * usdKrwRate : v
                  const dInvested = isKrw && h.currency === 'USD' ? h.krwInvested : h.totalInvested
                  const dValue = toD(h.currentValue)
                  const dPnl = dValue - dInvested
                  const dPnlPct = dInvested > 0 ? (dPnl / dInvested) * 100 : 0

                  return (
                    <div key={h.ticker} style={{ background: t.neutrals.inner, borderRadius: t.radius.md, padding: '8px 10px' }}>
                      {/* Row 1: name + ticker + themes + daily % */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: t.weight.medium }}>{h.company_name}</span>
                          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.mono }}>{h.ticker}</span>
                          {h.themes.map(th => (
                            <span key={th} style={{ fontSize: 9, padding: '1px 4px', borderRadius: t.radius.sm, background: t.neutrals.card, color: t.neutrals.muted }}>{th}</span>
                          ))}
                        </div>
                        {h.dailyChangePercent !== 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: t.weight.medium, padding: '1px 5px',
                            borderRadius: t.radius.sm, flexShrink: 0,
                            background: h.dailyChangePercent > 0 ? tonePalettes.neg.bg : tonePalettes.info.bg,
                            color: h.dailyChangePercent > 0 ? tonePalettes.neg.fg : tonePalettes.info.fg,
                          }}>
                            {h.dailyChangePercent > 0 ? '+' : ''}{h.dailyChangePercent.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Row 2: 2-col grid — buy/invest/hold vs current/value/pnl */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', marginTop: 4, fontSize: 11 }}>
                        <span style={{ color: t.neutrals.muted }}>
                          <span style={{ fontSize: 10, color: t.neutrals.subtle }}>매수 </span>
                          {fmtPrice(h.avgBuyPrice, h.currency)} × {h.netQty.toLocaleString()}주
                        </span>
                        {h.currentPrice > 0 ? (
                          <span style={{ color: t.neutrals.muted }}>
                            <span style={{ fontSize: 10, color: t.neutrals.subtle }}>현재 </span>
                            {fmtPrice(h.currentPrice, h.currency)}
                          </span>
                        ) : <span style={{ color: t.neutrals.subtle }}>-</span>}

                        <span style={{ color: t.neutrals.muted }}>
                          <span style={{ fontSize: 10, color: t.neutrals.subtle }}>투자 </span>
                          {fmtAmount(dInvested, dCur)}
                        </span>
                        {h.currentPrice > 0 ? (
                          <span style={{ fontWeight: t.weight.medium }}>
                            <span style={{ fontSize: 10, color: t.neutrals.subtle, fontWeight: t.weight.regular }}>평가 </span>
                            {fmtAmount(dValue, dCur)}
                          </span>
                        ) : <span style={{ color: t.neutrals.subtle }}>-</span>}

                        {h.currentPrice > 0 && (
                          <>
                            <span style={{ color: t.neutrals.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span><span style={{ fontSize: 10, color: t.neutrals.subtle }}>보유 </span>{h.holdingDays.toLocaleString()}일</span>
                              {h.irr != null && h.irr !== 0 && (
                                <span>· <span style={{ fontSize: 10, color: t.neutrals.subtle }}>IRR </span>{h.irr > 0 ? '+' : ''}{(h.irr * 100).toFixed(1)}%</span>
                              )}
                            </span>
                            <span style={{ fontWeight: t.weight.medium, color: pnlColor(dPnl) }}>
                              <span style={{ fontSize: 10, color: t.neutrals.subtle, fontWeight: t.weight.regular }}>누적 </span>
                              {dPnl > 0 ? '+' : ''}{fmtAmount(dPnl, dCur)} ({dPnl > 0 ? '+' : ''}{dPnlPct.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row 3: Pyramiding */}
                      {pyramiding && ps && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{
                              fontSize: 9, fontWeight: t.weight.bold, padding: '1px 4px', borderRadius: t.radius.sm,
                              background: pyramiding.tranche >= 8 ? tonePalettes.done.bg : pyramiding.tranche >= 5 ? tonePalettes.info.bg : tonePalettes.neutral.bg,
                              color: pyramiding.tranche >= 8 ? tonePalettes.done.fg : pyramiding.tranche >= 5 ? tonePalettes.info.fg : tonePalettes.neutral.fg,
                            }}>T{pyramiding.tranche}</span>
                            <span style={{ fontSize: 10, fontWeight: t.weight.medium, fontFamily: t.font.mono, color: pnlColor(h.pnlPercent) }}>
                              {h.pnlPercent > 0 ? '+' : ''}{h.pnlPercent.toFixed(1)}%
                            </span>
                            {pyramiding.status === 'HOUSE_MONEY' ? (
                              <span style={{ fontSize: 10, color: '#5B3A8C' }}>→ 1/3 매도</span>
                            ) : pyramiding.nextPct != null && (
                              <span style={{ fontSize: 10, color: t.neutrals.subtle }}>
                                → +{pyramiding.nextPct.toFixed(0)}%
                                {pyramiding.nextPrice != null && (
                                  <span style={{ marginLeft: 2, opacity: 0.6 }}>
                                    {h.currency === 'KRW' ? `${Math.round(pyramiding.nextPrice / 10000).toLocaleString()}만` : `$${pyramiding.nextPrice.toFixed(0)}`}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: t.weight.bold, padding: '1px 6px',
                            borderRadius: t.radius.pill, background: ps.bg, color: ps.fg,
                          }}>{ps.label}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
