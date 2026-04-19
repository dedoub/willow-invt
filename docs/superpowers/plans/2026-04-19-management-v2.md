# Management V2 Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone v2 management dashboard page at `/willow-investment/management-v2` implementing the A (Refined) design variant with real data from existing APIs.

**Architecture:** Single-route page with scoped fonts (Inter + JetBrains Mono via `next/font/google`), custom design tokens as CSS variables, and client-side data fetching from existing `/api/willow-mgmt/*` endpoints. All components are colocated — no shared component modifications.

**Tech Stack:** Next.js App Router, React client components, Tailwind CSS (inline styles for design-token precision), next/font/google, SVG sparklines

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/app/willow-investment/management-v2/layout.tsx` | Scoped font loading (Inter + JetBrains Mono), CSS variable injection |
| Create | `src/app/willow-investment/management-v2/page.tsx` | Full page: data fetching, KPI stats, portfolio table, milestones sidebar, invoice table |
| Modify | `src/components/layout/sidebar.tsx` | Add "사업관리 v2" link under Willow Invest section |
| Modify | `src/lib/i18n/locales/ko.ts` | Add `willowManagementV2` sidebar label |
| Modify | `src/lib/i18n/locales/en.ts` | Add `willowManagementV2` sidebar label |

---

### Task 1: Create Layout with Scoped Fonts

**Files:**
- Create: `src/app/willow-investment/management-v2/layout.tsx`

- [ ] **Step 1: Create the layout file**

```tsx
// src/app/willow-investment/management-v2/layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-v2-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-v2-mono',
  display: 'swap',
})

export default function ManagementV2Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify the layout loads**

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds, no errors related to management-v2

- [ ] **Step 3: Commit**

```bash
git add src/app/willow-investment/management-v2/layout.tsx
git commit -m "feat: add management-v2 layout with scoped Inter + JetBrains Mono fonts"
```

---

### Task 2: Create Page Shell with Data Fetching

**Files:**
- Create: `src/app/willow-investment/management-v2/page.tsx`

This task creates the page with all data fetching logic, design tokens, and helper components — but renders only a loading/empty state to verify data flows work before building the sections in subsequent tasks.

- [ ] **Step 1: Create the page file with data fetching and design tokens**

```tsx
// src/app/willow-investment/management-v2/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────
interface StockTrade {
  id: string
  ticker: string
  company_name: string
  market: 'KR' | 'US'
  trade_date: string
  trade_type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  currency: 'KRW' | 'USD'
  broker: string | null
  memo: string | null
  created_at: string
}

interface StockQuote {
  price: number
  change: number
  changePercent: number
  currency: string
}

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: 'issued' | 'completed'
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}

interface Milestone {
  id: string
  project_id: string
  name: string
  description: string | null
  order_index: number
  status: 'pending' | 'in_progress' | 'review_pending' | 'completed'
  target_date: string | null
  completed_at: string | null
  review_completed: boolean
  created_at: string
  project?: {
    id: string
    name: string
    client_id: string
    client?: { id: string; name: string; color: string }
  }
}

interface Holding {
  ticker: string
  company_name: string
  market: 'KR' | 'US'
  currency: 'KRW' | 'USD'
  netQty: number
  avgBuyPrice: number
  totalInvested: number
  currentPrice: number
  currentValue: number
  pnl: number
  pnlPercent: number
  dailyChangePercent: number
}

// ── Design Tokens ──────────────────────────────────────
const T = {
  color: {
    page: '#F7F6F3',
    card: '#EFEDE8',
    inner: '#FFFFFF',
    line: 'rgba(17,24,39,0.06)',
    text: '#1C1917',
    muted: '#6B6760',
    subtle: '#9A9590',
    brand: {
      50: '#EAF5FB', 100: '#CFE7F5', 200: '#A8D3EB', 300: '#7CBCDF',
      400: '#5AA8D4', 500: '#3F93C6', 600: '#3078AA', 700: '#265E87',
      800: '#1E4867', 900: '#163449',
    },
    pos: '#2F8F5B',
    neg: '#B0413E',
    warn: '#B88A2A',
  },
  radius: { sm: 6, md: 8, lg: 10, pill: 999 },
  spacing: { rowH: 40, cardPad: 16, gapSm: 8, gapMd: 12, gapLg: 20 },
  badge: { radius: 6, weight: 500, padX: 8, padY: 2, size: 11.5 },
} as const

const BADGE_PALETTES: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: '#E8E6E0', fg: '#2A2824' },
  pending: { bg: '#FBEFD5', fg: '#8B5A12' },
  progress: { bg: '#DCE8F5', fg: '#1F4E79' },
  done: { bg: '#DAEEDD', fg: '#1F5F3D' },
  brand: { bg: T.color.brand[100], fg: T.color.brand[700] },
  warn: { bg: '#F9E8D0', fg: '#8A5A1A' },
  danger: { bg: '#F3DADA', fg: '#8A2A2A' },
  pos: { bg: '#DAEEDD', fg: '#1F5F3D' },
  neg: { bg: '#F3DADA', fg: '#8A2A2A' },
}

// ── Helper Components ──────────────────────────────────

function Badge({ tone = 'neutral', children }: { tone?: string; children: React.ReactNode }) {
  const p = BADGE_PALETTES[tone] || BADGE_PALETTES.neutral
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: `${T.badge.padY}px ${T.badge.padX}px`,
        fontSize: T.badge.size,
        fontWeight: T.badge.weight,
        borderRadius: T.badge.radius,
        backgroundColor: p.bg,
        color: p.fg,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        backgroundColor: T.color.card,
        borderRadius: T.radius.lg,
        padding: T.spacing.cardPad,
        fontFamily: 'var(--font-v2-sans), Inter, sans-serif',
        color: T.color.text,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: T.spacing.gapMd }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, color: T.color.subtle }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.color.text, letterSpacing: -0.2 }}>
          {title}
        </div>
      </div>
      {action}
    </div>
  )
}

function Spark({ data, width = 80, height = 28, color = T.color.brand[500] }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={color}
        opacity={0.12}
      />
      <polyline
        points={points}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StatCard({ label, value, unit, delta, deltaColor, sparkData }: {
  label: string
  value: string
  unit?: string
  delta?: string
  deltaColor?: string
  sparkData?: number[]
}) {
  return (
    <Card>
      <div style={{ fontSize: 11, fontWeight: 500, color: T.color.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: T.color.text, fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5 }}>
          {value}
          {unit && <span style={{ fontSize: '0.55em', color: T.color.muted, marginLeft: 2 }}>{unit}</span>}
        </span>
        {delta && (
          <span style={{ fontSize: 11, fontWeight: 500, color: deltaColor || T.color.muted }}>{delta}</span>
        )}
      </div>
      {sparkData && sparkData.length > 1 && (
        <div style={{ marginTop: 8 }}>
          <Spark data={sparkData} color={deltaColor || T.color.brand[500]} />
        </div>
      )}
    </Card>
  )
}

// ── Holdings computation ───────────────────────────────

function computeHoldings(
  trades: StockTrade[],
  quotes: Record<string, StockQuote>,
  usdKrwRate: number,
  fxHistory: Record<string, number>
): Holding[] {
  const getFxRate = (date: string): number => {
    const d = new Date(date)
    for (let i = 0; i < 5; i++) {
      const key = d.toISOString().slice(0, 10)
      if (fxHistory[key]) return fxHistory[key]
      d.setDate(d.getDate() - 1)
    }
    return usdKrwRate
  }

  const holdingsMap = new Map<string, {
    ticker: string; company_name: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD'
    netQty: number; totalCost: number; krwCost: number
  }>()

  const sorted = [...trades].sort(
    (a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id)
  )

  for (const trade of sorted) {
    const existing = holdingsMap.get(trade.ticker) || {
      ticker: trade.ticker, company_name: trade.company_name,
      market: trade.market, currency: trade.currency,
      netQty: 0, totalCost: 0, krwCost: 0,
    }
    const histRate = trade.market === 'US' ? getFxRate(trade.trade_date) : 1

    if (trade.trade_type === 'buy') {
      existing.totalCost += trade.total_amount
      existing.netQty += trade.quantity
      existing.krwCost += trade.total_amount * histRate
    } else {
      const avgCost = existing.netQty > 0 ? existing.totalCost / existing.netQty : 0
      const avgKrw = existing.netQty > 0 ? existing.krwCost / existing.netQty : 0
      existing.totalCost -= avgCost * trade.quantity
      existing.krwCost -= avgKrw * trade.quantity
      existing.netQty -= trade.quantity
      if (existing.netQty <= 0) { existing.netQty = 0; existing.totalCost = 0; existing.krwCost = 0 }
    }
    holdingsMap.set(trade.ticker, existing)
  }

  return Array.from(holdingsMap.values())
    .filter(h => h.netQty > 0)
    .map(h => {
      const avgBuyPrice = h.netQty > 0 ? h.totalCost / h.netQty : 0
      const quote = quotes[h.ticker]
      const currentPrice = quote?.price || 0
      const currentValue = currentPrice * h.netQty
      const pnl = currentPrice > 0 ? currentValue - h.totalCost : 0
      const pnlPercent = h.totalCost > 0 && currentPrice > 0 ? (pnl / h.totalCost) * 100 : 0
      return {
        ticker: h.ticker, company_name: h.company_name, market: h.market, currency: h.currency,
        netQty: h.netQty, avgBuyPrice, totalInvested: h.totalCost,
        currentPrice, currentValue, pnl, pnlPercent,
        dailyChangePercent: quote?.changePercent || 0,
      }
    })
    .sort((a, b) => b.currentValue - a.currentValue)
}

// ── Main Page Component ────────────────────────────────

export default function ManagementV2Page() {
  const [trades, setTrades] = useState<StockTrade[]>([])
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({})
  const [stockHistory, setStockHistory] = useState<Record<string, { dates: string[]; prices: number[] }>>({})
  const [usdKrwRate, setUsdKrwRate] = useState(1400)
  const [fxHistory, setFxHistory] = useState<Record<string, number>>({})
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  const loadQuotes = useCallback(async (tradeList: StockTrade[]) => {
    const tickerMap = new Map<string, string>()
    for (const t of tradeList) {
      if (!tickerMap.has(t.ticker)) tickerMap.set(t.ticker, t.market)
    }
    const tickers = Array.from(tickerMap.keys())
    if (tickers.length === 0) return
    const markets = tickers.map(t => tickerMap.get(t)!)

    const [res, fxRes, fxHistRes, histRes] = await Promise.all([
      fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`),
      fetch('/api/willow-mgmt/stock-quotes?tickers=KRW%3DX&markets=US'),
      fetch('/api/willow-mgmt/fx-history'),
      fetch(`/api/willow-mgmt/stock-history?tickers=${tickers.join(',')}&markets=${markets.join(',')}`),
    ])

    if (res.ok) {
      const data = await res.json()
      setQuotes(data.prices || {})
    }
    if (fxRes.ok) {
      const data = await fxRes.json()
      const rate = data.prices?.['KRW=X']?.price
      if (rate && rate > 0) setUsdKrwRate(rate)
    }
    if (fxHistRes.ok) {
      const data = await fxHistRes.json()
      if (data.rates) setFxHistory(data.rates)
    }
    if (histRes.ok) {
      const data = await histRes.json()
      setStockHistory(data.history || {})
    }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [tradesRes, invoicesRes, milestonesRes] = await Promise.all([
          fetch('/api/willow-mgmt/stock-trades'),
          fetch('/api/willow-mgmt/invoices'),
          fetch('/api/willow-mgmt/milestones'),
        ])

        if (tradesRes.ok) {
          const data = await tradesRes.json()
          const tradeList = data.trades || []
          setTrades(tradeList)
          loadQuotes(tradeList)
        }
        if (invoicesRes.ok) {
          const data = await invoicesRes.json()
          setInvoices(data.invoices || [])
        }
        if (milestonesRes.ok) {
          const data = await milestonesRes.json()
          setMilestones(data)
        }
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [loadQuotes])

  // ── Computed data ──
  const holdings = computeHoldings(trades, quotes, usdKrwRate, fxHistory)

  // AUM: sum of all current values in KRW
  const totalAumKrw = holdings.reduce((sum, h) => {
    const val = h.market === 'US' ? h.currentValue * usdKrwRate : h.currentValue
    return sum + val
  }, 0)

  // Monthly P&L: trades this month
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const monthlyTrades = trades.filter(t => t.trade_date >= monthStart)
  const monthlyPnl = monthlyTrades.reduce((sum, t) => {
    if (t.trade_type === 'sell') {
      // Approximate: sell amount minus average cost * qty
      const holding = holdings.find(h => h.ticker === t.ticker)
      const avgCost = holding ? holding.avgBuyPrice : t.price
      return sum + (t.price - avgCost) * t.quantity
    }
    return sum
  }, 0)

  // Active milestones
  const activeMilestones = milestones.filter(m => m.status !== 'completed')

  // Receivables: sum of issued invoices (revenue type)
  const receivables = invoices
    .filter(inv => inv.status === 'issued' && inv.type === 'revenue')
    .reduce((sum, inv) => sum + inv.amount, 0)

  // Upcoming milestones sorted by target_date
  const upcomingMilestones = milestones
    .filter(m => m.target_date && m.status !== 'completed')
    .sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''))
    .slice(0, 8)

  // Recent invoices sorted by date desc
  const recentInvoices = [...invoices]
    .sort((a, b) => (b.issue_date || b.created_at).localeCompare(a.issue_date || a.created_at))
    .slice(0, 15)

  // KR / US counts
  const krCount = holdings.filter(h => h.market === 'KR').length
  const usCount = holdings.filter(h => h.market === 'US').length

  const fmt = (n: number) => Math.round(n).toLocaleString()
  const fmtM = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1e8) return (n / 1e8).toFixed(1)
    if (abs >= 1e4) return (n / 1e4).toFixed(0)
    return fmt(n)
  }
  const fmtUnit = (n: number) => {
    const abs = Math.abs(n)
    if (abs >= 1e8) return '억'
    if (abs >= 1e4) return '만'
    return '원'
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: T.color.page,
        fontFamily: 'var(--font-v2-sans), Inter, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: T.color.muted,
        fontSize: 14,
      }}>
        데이터를 불러오는 중...
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: T.color.page,
      fontFamily: 'var(--font-v2-sans), Inter, sans-serif',
      color: T.color.text,
      padding: T.spacing.gapLg,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: T.spacing.gapLg }}>

        {/* ── Section 1: KPI Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: T.spacing.gapMd }}>
          <StatCard
            label="총 운용자산"
            value={fmtM(totalAumKrw)}
            unit={fmtUnit(totalAumKrw)}
          />
          <StatCard
            label="이번달 수익"
            value={(monthlyPnl >= 0 ? '+' : '') + fmtM(monthlyPnl)}
            unit={fmtUnit(monthlyPnl)}
            delta={monthlyPnl !== 0 ? (monthlyPnl > 0 ? '수익' : '손실') : undefined}
            deltaColor={monthlyPnl >= 0 ? T.color.pos : T.color.neg}
          />
          <StatCard
            label="진행 프로젝트"
            value={String(activeMilestones.length)}
            unit="건"
          />
          <StatCard
            label="미수금"
            value={fmtM(receivables)}
            unit={fmtUnit(receivables)}
          />
        </div>

        {/* ── Section 2: Portfolio + Milestones ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: T.spacing.gapMd }}>
          {/* Portfolio Table */}
          <Card>
            <SectionHead
              eyebrow="PORTFOLIO"
              title="주식 포트폴리오"
              action={
                <div style={{ display: 'flex', gap: 6 }}>
                  {krCount > 0 && <Badge tone="brand">KR {krCount}</Badge>}
                  {usCount > 0 && <Badge tone="neutral">US {usCount}</Badge>}
                </div>
              }
            />
            <div style={{ backgroundColor: T.color.inner, borderRadius: T.radius.md, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    {['종목', '시장', '평균단가', '현재가', '수익률', '추이'].map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '8px 12px',
                          fontSize: 10.5,
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          color: T.color.subtle,
                          letterSpacing: 0.6,
                          textAlign: col === '수익률' || col === '평균단가' || col === '현재가' ? 'right' : 'left',
                          borderBottom: `1px solid ${T.color.line}`,
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const hist = stockHistory[h.ticker]
                    return (
                      <tr
                        key={h.ticker}
                        style={{
                          height: T.spacing.rowH,
                          backgroundColor: i % 2 === 0 ? T.color.inner : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0 12px' }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{h.company_name}</div>
                          <div style={{ fontSize: 10.5, color: T.color.subtle }}>{h.ticker}</div>
                        </td>
                        <td style={{ padding: '0 12px' }}>
                          <Badge tone={h.market === 'KR' ? 'brand' : 'neutral'}>{h.market}</Badge>
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5 }}>
                          {h.market === 'US' ? `$${h.avgBuyPrice.toFixed(2)}` : `₩${fmt(h.avgBuyPrice)}`}
                        </td>
                        <td style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5 }}>
                          {h.market === 'US' ? `$${h.currentPrice.toFixed(2)}` : `₩${fmt(h.currentPrice)}`}
                        </td>
                        <td style={{
                          padding: '0 12px',
                          textAlign: 'right',
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: h.pnlPercent >= 0 ? T.color.pos : T.color.neg,
                        }}>
                          {h.pnlPercent >= 0 ? '+' : ''}{h.pnlPercent.toFixed(1)}%
                        </td>
                        <td style={{ padding: '0 12px' }}>
                          {hist && <Spark data={hist.prices} width={60} height={24} color={h.pnlPercent >= 0 ? T.color.pos : T.color.neg} />}
                        </td>
                      </tr>
                    )
                  })}
                  {holdings.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: T.color.subtle, fontSize: 13 }}>
                        보유 종목이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Milestones Sidebar */}
          <Card>
            <SectionHead eyebrow="MILESTONES" title="이번 주 일정" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.spacing.gapSm }}>
              {upcomingMilestones.map(m => {
                const d = m.target_date ? new Date(m.target_date) : null
                const day = d ? d.getDate() : '?'
                const month = d ? d.toLocaleDateString('en', { month: 'short' }).toUpperCase() : ''
                return (
                  <div key={m.id} style={{ display: 'flex', gap: T.spacing.gapMd, alignItems: 'center' }}>
                    <div style={{
                      width: 38,
                      minWidth: 38,
                      backgroundColor: T.color.inner,
                      borderRadius: T.radius.sm,
                      padding: '4px 0',
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{day}</div>
                      <div style={{
                        fontSize: 9,
                        fontFamily: 'var(--font-v2-mono), monospace',
                        color: T.color.subtle,
                        textTransform: 'uppercase',
                      }}>
                        {month}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </div>
                      {m.project && (
                        <Badge tone={m.project.client?.color === 'blue' ? 'brand' : 'neutral'}>
                          {m.project.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
              {upcomingMilestones.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: T.color.subtle, fontSize: 13 }}>
                  예정된 일정이 없습니다
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Section 3: Invoice Table ── */}
        <Card>
          <SectionHead eyebrow="FINANCE" title="세금계산서 · 입출금" />
          <div style={{ backgroundColor: T.color.inner, borderRadius: T.radius.md, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr>
                  {['일자', '거래처', '적요', '구분', '금액', '상태'].map(col => (
                    <th
                      key={col}
                      style={{
                        padding: '8px 12px',
                        fontSize: 10.5,
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        color: T.color.subtle,
                        letterSpacing: 0.6,
                        textAlign: col === '금액' ? 'right' : 'left',
                        borderBottom: `1px solid ${T.color.line}`,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv, i) => {
                  const isRevenue = inv.type === 'revenue'
                  const typeLabels: Record<string, string> = {
                    revenue: '매출', expense: '비용', asset: '자산', liability: '부채',
                  }
                  const typeTones: Record<string, string> = {
                    revenue: 'pos', expense: 'neg', asset: 'brand', liability: 'warn',
                  }
                  const statusLabels: Record<string, string> = {
                    completed: '완료', issued: '발행',
                  }
                  const statusTones: Record<string, string> = {
                    completed: 'done', issued: 'pending',
                  }
                  const dateStr = inv.issue_date || inv.created_at.slice(0, 10)
                  return (
                    <tr
                      key={inv.id}
                      style={{
                        height: T.spacing.rowH,
                        backgroundColor: i % 2 === 0 ? T.color.inner : 'transparent',
                      }}
                    >
                      <td style={{
                        padding: '0 12px',
                        fontFamily: 'var(--font-v2-mono), monospace',
                        color: T.color.muted,
                        fontSize: 11.5,
                      }}>
                        {dateStr}
                      </td>
                      <td style={{ padding: '0 12px', fontSize: 13 }}>{inv.counterparty}</td>
                      <td style={{ padding: '0 12px', fontSize: 12.5, color: T.color.muted }}>{inv.description || '—'}</td>
                      <td style={{ padding: '0 12px' }}>
                        <Badge tone={typeTones[inv.type]}>{typeLabels[inv.type]}</Badge>
                      </td>
                      <td style={{
                        padding: '0 12px',
                        textAlign: 'right',
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: isRevenue ? T.color.pos : T.color.neg,
                      }}>
                        {isRevenue ? '+' : '-'}₩{fmt(inv.amount)}
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: `${T.badge.padY}px ${T.badge.padX}px`,
                          fontSize: T.badge.size,
                          fontWeight: T.badge.weight,
                          borderRadius: T.radius.pill,
                          backgroundColor: (BADGE_PALETTES[statusTones[inv.status]] || BADGE_PALETTES.neutral).bg,
                          color: (BADGE_PALETTES[statusTones[inv.status]] || BADGE_PALETTES.neutral).fg,
                        }}>
                          {statusLabels[inv.status] || inv.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: T.color.subtle, fontSize: 13 }}>
                      인보이스가 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page builds without errors**

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Start dev server and verify the page renders at `/willow-investment/management-v2`**

Run: `npm run dev`
Open browser at `http://localhost:3000/willow-investment/management-v2`
Expected: Page renders with warm off-white background, 4 KPI stat cards, portfolio table with real stock data, milestones sidebar, invoice table

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/management-v2/page.tsx
git commit -m "feat: add management-v2 page with full A (Refined) design and real data"
```

---

### Task 3: Add Sidebar Link

**Files:**
- Modify: `src/lib/i18n/locales/ko.ts`
- Modify: `src/lib/i18n/locales/en.ts`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add i18n keys for the v2 sidebar label**

In `src/lib/i18n/locales/ko.ts`, add after the `willowManagement` line inside `sidebar`:

```typescript
willowManagementV2: '사업관리 v2',
```

In `src/lib/i18n/locales/en.ts`, add after the `willowManagement` line inside `sidebar`:

```typescript
willowManagementV2: 'Management v2',
```

- [ ] **Step 2: Add the sidebar menu item**

In `src/components/layout/sidebar.tsx`, find the `willowInvest` section items array (around line 67):

```typescript
items: [
  { title: t.sidebar.willowManagement, href: '/willow-investment/management' },
],
```

Change it to:

```typescript
items: [
  { title: t.sidebar.willowManagement, href: '/willow-investment/management' },
  { title: t.sidebar.willowManagementV2, href: '/willow-investment/management-v2' },
],
```

- [ ] **Step 3: Verify the sidebar link appears and navigates correctly**

Run: `npm run dev`
Open browser, check sidebar shows "사업관리 v2" under Willow Invest section.
Click the link — should navigate to `/willow-investment/management-v2`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/ko.ts src/lib/i18n/locales/en.ts src/components/layout/sidebar.tsx
git commit -m "feat: add management-v2 sidebar link"
```

---

### Task 4: Visual Polish and Verification

**Files:**
- Modify: `src/app/willow-investment/management-v2/page.tsx` (if adjustments needed)

- [ ] **Step 1: Start dev server and open the page**

Run: `npm run dev`
Open `http://localhost:3000/willow-investment/management-v2`

- [ ] **Step 2: Verify each section against the spec**

Check against `docs/superpowers/specs/2026-04-19-management-v2-design.md`:

1. **Page background:** Warm off-white `#F7F6F3` — not pure white
2. **KPI cards:** 4 cards in horizontal grid, card bg `#EFEDE8`, values at 22px semibold with tabular-nums
3. **Portfolio table:** Zebra striping (alternating rows), market badges (KR=brand, US=neutral), sparklines visible, P&L colored
4. **Milestones sidebar:** Date blocks with day/month, project badges
5. **Invoice table:** Date in mono font, type badges, amount colored, status as pill badges
6. **Typography:** Inter font loaded (check devtools), JetBrains Mono on date columns
7. **No borders/shadows anywhere** — all separation via color contrast

- [ ] **Step 3: Fix any visual discrepancies found**

Apply any needed adjustments to match the spec precisely.

- [ ] **Step 4: Verify existing pages are unaffected**

Navigate to `/willow-investment/management` — should look identical to before (no style leakage).

- [ ] **Step 5: Commit any polish changes**

```bash
git add src/app/willow-investment/management-v2/
git commit -m "fix: visual polish for management-v2 page"
```
