'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell } from 'recharts'
import type { StockTradeFull, StockQuoteFull, TickerTheme } from './holdings-block'

/* ── Types ── */

type ViewMode = 'total' | 'market' | 'group'

interface AnalysisBlockProps {
  stockTrades: StockTradeFull[]
  stockQuotes: Record<string, StockQuoteFull>
  stockThemes: Record<string, TickerTheme[]>
  stockHistory: Record<string, { dates: string[]; prices: number[] }>
  fxHistory: Record<string, number>
  usdKrwRate: number
  loading?: boolean
  /** 추이 차트 컬럼 수 (인쇄용 2단 배치 등). 기본 1. */
  chartColumns?: 1 | 2
}

/* ── Constants ── */
const THEME_KEYS = ['AI 인프라', '지정학/안보', '넥스트', '미분류']
const GROUP_COLORS: Record<string, string> = { 'AI 인프라': '#6366f1', '지정학/안보': '#f97316', '넥스트': '#a855f7', '미분류': '#94a3b8' }
const MARKET_COLORS = { '국내': '#3b82f6', '해외': '#10b981' }
const AI_INFRA_SUB_COLORS: Record<string, string> = {
  'AI 반도체': '#db2777',
  'AI 에너지/원전': '#f59e0b',
  '데이터센터/냉각/네트워킹': '#06b6d4',
  '미분류': '#94a3b8',
}

/* ── Formatters ── */
function fmtDate(d: string) { return `${d.slice(5, 7)}/${d.slice(8, 10)}` }
function fmtKrw(v: number) {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
  return v.toLocaleString()
}

/* ── Donut palette ── */
const STOCK_COLORS = ['#6366f1', '#10b981', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#d946ef', '#0ea5e9']

/* ── 수익률 발산형 그라데이션 (미국식: 음수=빨강, 양수=녹색, 0%=연회색) ──
   clamp ±50%: 절댓값이 클수록 진하게. 0 근처는 채도 낮은 회색으로 보간. */
function returnGradientColor(retPct: number): string {
  const CLAMP = 50
  const x = Math.max(-1, Math.min(1, retPct / CLAMP))  // -1..1
  const mag = Math.abs(x)                               // 0..1
  const hue = retPct >= 0 ? 145 : 0                     // 녹색 / 빨강
  const sat = Math.round(10 + mag * 65)                 // 10%(회색) → 75%
  const light = Math.round(72 - mag * 30)               // 72%(연함) → 42%(진함)
  return `hsl(${hue}, ${sat}%, ${light}%)`
}

/* ── Donut mini-component ──
   colorMode='category': colors[i] 사용. 'return': returns[i] 수익률을 그라데이션으로 인코딩(슬라이스 크기는 비중 유지). */
function DonutChart({ title, data, colors, fixedWidth, colorMode = 'category', returns }: {
  title: string
  data: { subject: string; pct: number }[]
  colors: string[]
  fixedWidth?: number
  colorMode?: 'category' | 'return'
  returns?: number[]
}) {
  const sliceColor = (i: number) =>
    colorMode === 'return' && returns ? returnGradientColor(returns[i] ?? 0) : colors[i % colors.length]
  // 수익률 모드: 채우기=수익률 그라데이션, 테두리=카테고리 색 → 분류 식별 유지
  const isReturn = colorMode === 'return' && !!returns
  const categoryColor = (i: number) => colors[i % colors.length]
  // 슬라이스 안쪽에 표시할 라벨 — 비중 ≥ 6% 인 슬라이스에만 흰색 % 표시
  const renderInsideLabel = (props: any) => {
    const cx = Number(props.cx); const cy = Number(props.cy)
    const midAngle = Number(props.midAngle)
    const innerRadius = Number(props.innerRadius); const outerRadius = Number(props.outerRadius)
    const percent = Number(props.percent)
    if (!Number.isFinite(percent) || percent < 0.06) return null
    const r = (innerRadius + outerRadius) / 2
    const x = cx + r * Math.cos((-midAngle * Math.PI) / 180)
    const y = cy + r * Math.sin((-midAngle * Math.PI) / 180)
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600}>
        {Math.round(percent * 100)}%
      </text>
    )
  }
  const chart = (
    <PieChart width={fixedWidth || undefined} height={140}>
      <Pie
        data={data} dataKey="pct" nameKey="subject" cx="50%" cy="50%"
        innerRadius={30} outerRadius={55} paddingAngle={2}
        label={renderInsideLabel} labelLine={false} isAnimationActive={false}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={sliceColor(i)}
            stroke={isReturn ? categoryColor(i) : undefined}
            strokeWidth={isReturn ? 2 : 0} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={{ background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md, fontSize: 10, padding: '4px 8px' }}
        formatter={(value: any, name: any) => [`${value}%`, name]}
      />
    </PieChart>
  )
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 2 }}>{title}</div>
      {fixedWidth ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>{chart}</div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>{chart}</ResponsiveContainer>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2px 8px', marginTop: 2 }}>
        {data.map((d, i) => (
          <span key={d.subject} style={{ fontSize: 9, color: t.neutrals.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* 수익률 모드: 점 안쪽=수익률색, 테두리=카테고리색 (파이와 동일 인코딩) */}
            <span style={{
              width: isReturn ? 8 : 6, height: isReturn ? 8 : 6, borderRadius: '50%',
              background: sliceColor(i), display: 'inline-block', boxSizing: 'border-box',
              border: isReturn ? `2px solid ${categoryColor(i)}` : undefined,
            }} />
            {d.subject} {d.pct}%
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── Component ── */

type ValueScale = 'linear' | 'log'
const VALUE_SCALE_KEY = 'invest-analysis-value-scale'

type DonutColorMode = 'category' | 'return'
const DONUT_COLOR_KEY = 'invest-analysis-donut-color'

export function AnalysisBlock({
  stockTrades, stockQuotes, stockThemes, stockHistory, fxHistory, usdKrwRate, loading, chartColumns = 1,
}: AnalysisBlockProps) {
  const mobile = useIsMobile()
  const [viewMode, setViewMode] = useState<ViewMode>('total')
  const [valueScale, setValueScale] = useState<ValueScale>(() => {
    if (typeof window === 'undefined') return 'linear'
    return (localStorage.getItem(VALUE_SCALE_KEY) as ValueScale) === 'log' ? 'log' : 'linear'
  })
  const handleScaleChange = (s: ValueScale) => {
    setValueScale(s)
    if (typeof window !== 'undefined') localStorage.setItem(VALUE_SCALE_KEY, s)
  }
  const [donutColorMode, setDonutColorMode] = useState<DonutColorMode>(() => {
    if (typeof window === 'undefined') return 'category'
    return (localStorage.getItem(DONUT_COLOR_KEY) as DonutColorMode) === 'return' ? 'return' : 'category'
  })
  const handleDonutColorChange = (m: DonutColorMode) => {
    setDonutColorMode(m)
    if (typeof window !== 'undefined') localStorage.setItem(DONUT_COLOR_KEY, m)
  }

  const trendData = useMemo(() => {
    if (Object.keys(stockHistory).length === 0) return []

    // 1. Collect all dates
    const allDates = new Set<string>()
    for (const [, hist] of Object.entries(stockHistory)) {
      for (const d of hist.dates) allDates.add(d)
    }
    const sortedDates = Array.from(allDates).sort()

    // 2. Forward-filled price lookup
    const priceLookup = new Map<string, Map<string, number>>()
    for (const [ticker, hist] of Object.entries(stockHistory)) {
      const rawMap = new Map<string, number>()
      for (let i = 0; i < hist.dates.length; i++) rawMap.set(hist.dates[i], hist.prices[i])
      const dateMap = new Map<string, number>()
      let last = 0
      for (const d of sortedDates) {
        const p = rawMap.get(d)
        if (p && p > 0) last = p
        if (last > 0) dateMap.set(d, last)
      }
      priceLookup.set(ticker, dateMap)
    }

    // 3. Forward-filled FX
    const fxForDate = new Map<string, number>()
    let lastFx = usdKrwRate
    for (const d of sortedDates) {
      if (fxHistory[d]) lastFx = fxHistory[d]
      fxForDate.set(d, lastFx)
    }

    // 4. Detect stock splits (trade prices vs split-adjusted Yahoo history)
    const tradesSorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id))
    const splitRatios = new Map<string, number>()
    for (const tr of tradesSorted) {
      if (tr.trade_type !== 'buy' || splitRatios.has(tr.ticker)) continue
      const histPrices = priceLookup.get(tr.ticker)
      if (!histPrices) continue
      let histPrice: number | undefined
      for (const d of sortedDates) {
        if (d >= tr.trade_date) { histPrice = histPrices.get(d); if (histPrice) break }
      }
      if (!histPrice || histPrice <= 0) continue
      const ratio = tr.price / histPrice
      if (ratio > 1.5) splitRatios.set(tr.ticker, Math.round(ratio))
    }

    // ── QLD benchmark: dollar-matched ("동액 적립") replica of the portfolio cashflow ──
    // Mirror every trade into a QLD position using QLD's close on the trade date (USD→KRW).
    const qldPrices = priceLookup.get('QLD')  // Map<date, qldCloseUsd> (forward-filled)
    const qldState = { shares: 0, krwCost: 0 }
    let qldTradeIdx = 0
    const qldPriceOnOrAfter = (tradeDate: string): number | undefined => {
      if (!qldPrices) return undefined
      for (const d of sortedDates) {
        if (d >= tradeDate) { const p = qldPrices.get(d); if (p && p > 0) return p }
      }
      return undefined
    }
    // Advance qldState to include all trades with trade_date <= date.
    const advanceQld = (date: string) => {
      while (qldTradeIdx < tradesSorted.length && tradesSorted[qldTradeIdx].trade_date <= date) {
        const tr = tradesSorted[qldTradeIdx]
        const isUS = tr.market === 'US'
        const tradeFx = isUS ? (fxForDate.get(tr.trade_date) || usdKrwRate) : 1
        const krwAmount = tr.total_amount * tradeFx
        const qPrice = qldPriceOnOrAfter(tr.trade_date)
        if (qPrice && qPrice > 0) {
          const qFx = fxForDate.get(tr.trade_date) || usdKrwRate  // QLD is USD
          const qSharesPerKrw = 1 / (qPrice * qFx)
          if (tr.trade_type === 'buy') {
            qldState.shares += krwAmount * qSharesPerKrw
            qldState.krwCost += krwAmount
          } else {
            const avgCost = qldState.shares > 0 ? qldState.krwCost / qldState.shares : 0
            const soldShares = krwAmount * qSharesPerKrw
            qldState.shares -= soldShares
            qldState.krwCost -= avgCost * soldShares
            if (qldState.shares <= 0) { qldState.shares = 0; qldState.krwCost = 0 }
          }
        }
        qldTradeIdx++
      }
    }
    // qldPct at a given date using that date's QLD close.
    const qldPctForDate = (date: string): number | null => {
      if (!qldPrices || qldState.krwCost <= 0) return null
      const px = qldPrices.get(date)
      if (!px || px <= 0) return null
      const fx = fxForDate.get(date) || usdKrwRate
      const val = qldState.shares * px * fx
      return Math.round((val - qldState.krwCost) / qldState.krwCost * 1000) / 10
    }

    // 5. Build holdings timeline
    type HState = { qty: number; cost: number; krwCost: number; market: string; parentTheme: string | null }
    const holdingStates = new Map<string, HState>()
    let tradeIdx = 0
    const firstDate = tradesSorted.length > 0 ? tradesSorted[0].trade_date : ''

    const data: Record<string, number | string>[] = []

    for (const date of sortedDates) {
      if (date < firstDate) continue

      while (tradeIdx < tradesSorted.length && tradesSorted[tradeIdx].trade_date <= date) {
        const tr = tradesSorted[tradeIdx]
        const state = holdingStates.get(tr.ticker) || {
          qty: 0, cost: 0, krwCost: 0, market: tr.market,
          parentTheme: (stockThemes[tr.ticker] || [])[0]?.parentTheme || null,
        }
        const isUS = tr.market === 'US'
        const tradeFx = isUS ? (fxForDate.get(tr.trade_date) || usdKrwRate) : 1
        const splitR = splitRatios.get(tr.ticker) || 1
        if (tr.trade_type === 'buy') {
          state.cost += tr.total_amount; state.krwCost += tr.total_amount * tradeFx; state.qty += tr.quantity * splitR
        } else {
          const adjQty = tr.quantity * splitR
          const avg = state.qty > 0 ? state.cost / state.qty : 0
          const krwAvg = state.qty > 0 ? state.krwCost / state.qty : 0
          state.cost -= avg * adjQty; state.krwCost -= krwAvg * adjQty; state.qty -= adjQty
          if (state.qty <= 0) { state.qty = 0; state.cost = 0; state.krwCost = 0 }
        }
        holdingStates.set(tr.ticker, state)
        tradeIdx++
      }

      let totalVal = 0, totalCost = 0, krVal = 0, krCost = 0, usVal = 0, usCost = 0
      const themeVal: Record<string, number> = {}; const themeCost: Record<string, number> = {}
      for (const k of THEME_KEYS) { themeVal[k] = 0; themeCost[k] = 0 }
      let hasAll = true

      for (const [ticker, state] of holdingStates) {
        if (state.qty <= 0) continue
        const price = priceLookup.get(ticker)?.get(date)
        if (!price) { hasAll = false; continue }
        const isUS = state.market === 'US'
        const fx = isUS ? (fxForDate.get(date) || usdKrwRate) : 1
        const val = price * state.qty * fx
        const cost = isUS ? state.krwCost : state.cost
        totalVal += val; totalCost += cost
        if (isUS) { usVal += val; usCost += cost } else { krVal += val; krCost += cost }
        const group = state.parentTheme || '미분류'
        themeVal[group] = (themeVal[group] || 0) + val
        themeCost[group] = (themeCost[group] || 0) + cost
      }

      if (totalCost === 0 || !hasAll) continue

      const entry: Record<string, number | string> = {
        date,
        '전체value': Math.round(totalVal), '전체pnl': Math.round(totalVal - totalCost),
        '전체pct': totalCost > 0 ? Math.round((totalVal - totalCost) / totalCost * 1000) / 10 : 0,
        '국내value': Math.round(krVal), '국내pnl': Math.round(krVal - krCost),
        '국내pct': krCost > 0 ? Math.round((krVal - krCost) / krCost * 1000) / 10 : 0,
        '해외value': Math.round(usVal), '해외pnl': Math.round(usVal - usCost),
        '해외pct': usCost > 0 ? Math.round((usVal - usCost) / usCost * 1000) / 10 : 0,
      }
      for (const k of THEME_KEYS) {
        entry[`${k}value`] = Math.round(themeVal[k] || 0)
        entry[`${k}pnl`] = Math.round((themeVal[k] || 0) - (themeCost[k] || 0))
        entry[`${k}pct`] = (themeCost[k] || 0) > 0 ? Math.round(((themeVal[k] || 0) - (themeCost[k] || 0)) / (themeCost[k] || 0) * 1000) / 10 : 0
      }
      advanceQld(date)
      const qPct = qldPctForDate(date)
      if (qPct !== null) entry['qldPct'] = qPct
      data.push(entry)
    }

    // Append today using live quotes
    if (Object.keys(stockQuotes).length > 0) {
      const today = new Date().toISOString().slice(0, 10)
      let todayTotal = 0, todayCost = 0, todayKr = 0, todayKrC = 0, todayUs = 0, todayUsC = 0
      const todayThV: Record<string, number> = {}; const todayThC: Record<string, number> = {}
      for (const k of THEME_KEYS) { todayThV[k] = 0; todayThC[k] = 0 }
      let has = false
      for (const [ticker, state] of holdingStates) {
        if (state.qty <= 0) continue
        const quote = stockQuotes[ticker]
        if (!quote?.price) continue
        has = true
        const isUS = state.market === 'US'
        const fx = isUS ? usdKrwRate : 1
        const val = quote.price * state.qty * fx
        const cost = isUS ? state.krwCost : state.cost
        todayTotal += val; todayCost += cost
        if (isUS) { todayUs += val; todayUsC += cost } else { todayKr += val; todayKrC += cost }
        const group = state.parentTheme || '미분류'
        todayThV[group] = (todayThV[group] || 0) + val
        todayThC[group] = (todayThC[group] || 0) + cost
      }
      if (has && todayCost > 0) {
        const e: Record<string, number | string> = {
          date: today,
          '전체value': Math.round(todayTotal), '전체pnl': Math.round(todayTotal - todayCost),
          '전체pct': todayCost > 0 ? Math.round((todayTotal - todayCost) / todayCost * 1000) / 10 : 0,
          '국내value': Math.round(todayKr), '국내pnl': Math.round(todayKr - todayKrC),
          '국내pct': todayKrC > 0 ? Math.round((todayKr - todayKrC) / todayKrC * 1000) / 10 : 0,
          '해외value': Math.round(todayUs), '해외pnl': Math.round(todayUs - todayUsC),
          '해외pct': todayUsC > 0 ? Math.round((todayUs - todayUsC) / todayUsC * 1000) / 10 : 0,
        }
        for (const k of THEME_KEYS) {
          e[`${k}value`] = Math.round(todayThV[k] || 0)
          e[`${k}pnl`] = Math.round((todayThV[k] || 0) - (todayThC[k] || 0))
          e[`${k}pct`] = (todayThC[k] || 0) > 0 ? Math.round(((todayThV[k] || 0) - (todayThC[k] || 0)) / (todayThC[k] || 0) * 1000) / 10 : 0
        }
        advanceQld(today)
        // Prefer live QLD quote for the today point; fall back to last series close.
        const qldQuote = stockQuotes['QLD']?.price
        if (qldState.krwCost > 0) {
          let qVal: number | null = null
          if (qldQuote && qldQuote > 0) {
            qVal = qldState.shares * qldQuote * usdKrwRate
          } else {
            const lastPx = qldPrices?.get(today) ?? (sortedDates.length ? qldPrices?.get(sortedDates[sortedDates.length - 1]) : undefined)
            if (lastPx && lastPx > 0) qVal = qldState.shares * lastPx * usdKrwRate
          }
          if (qVal !== null) e['qldPct'] = Math.round((qVal - qldState.krwCost) / qldState.krwCost * 1000) / 10
        }
        if (data.length > 0 && data[data.length - 1].date === today) data[data.length - 1] = e
        else data.push(e)
      }
    }

    return data
  }, [stockTrades, stockQuotes, stockThemes, stockHistory, fxHistory, usdKrwRate])

  /* ── Radar / spider chart data ── */
  const radarData = useMemo(() => {
    // Compute current holdings value per ticker
    const holdMap = new Map<string, { qty: number; cost: number; market: string; name: string; parentTheme: string; subTheme: string }>()
    const sorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime())
    for (const tr of sorted) {
      const key = tr.ticker
      const themeRow = (stockThemes[key] || [])[0]
      const prev = holdMap.get(key) || {
        qty: 0, cost: 0, market: tr.market, name: tr.company_name || tr.ticker,
        parentTheme: themeRow?.parentTheme || '미분류',
        subTheme: themeRow?.theme || '미분류',
      }
      if (tr.trade_type === 'buy') { prev.qty += tr.quantity; prev.cost += tr.total_amount }
      else {
        const avg = prev.qty > 0 ? prev.cost / prev.qty : 0
        prev.cost -= avg * tr.quantity; prev.qty -= tr.quantity
        if (prev.qty <= 0) { prev.qty = 0; prev.cost = 0 }
      }
      holdMap.set(key, prev)
    }

    // valKrw=평가액(현재 환율 KRW), costKrw=원금(현재 환율 KRW). 수익률 = (val-cost)/cost.
    const items: { ticker: string; name: string; market: string; theme: string; subTheme: string; valKrw: number; costKrw: number }[] = []
    let total = 0
    for (const [ticker, h] of holdMap) {
      if (h.qty <= 0) continue
      const q = stockQuotes[ticker]
      if (!q?.price) continue
      const fx = h.market === 'US' ? usdKrwRate : 1
      const val = q.price * h.qty * fx
      items.push({ ticker, name: h.name, market: h.market, theme: h.parentTheme, subTheme: h.subTheme, valKrw: val, costKrw: h.cost * fx })
      total += val
    }

    const retOf = (val: number, cost: number) => cost > 0 ? Math.round((val - cost) / cost * 1000) / 10 : 0

    // By stock
    const byStock = items.map(i => ({
      subject: i.name.length > 6 ? i.name.slice(0, 6) + '..' : i.name,
      pct: total > 0 ? Math.round(i.valKrw / total * 1000) / 10 : 0,
      retPct: retOf(i.valKrw, i.costKrw),
    })).sort((a, b) => b.pct - a.pct)

    // By theme
    const themeMap = new Map<string, { val: number; cost: number }>()
    for (const i of items) {
      if (i.theme === '미분류') continue
      const prev = themeMap.get(i.theme) || { val: 0, cost: 0 }
      prev.val += i.valKrw; prev.cost += i.costKrw
      themeMap.set(i.theme, prev)
    }
    const byTheme = Array.from(themeMap.entries()).map(([k, v]) => ({
      subject: k,
      pct: total > 0 ? Math.round(v.val / total * 1000) / 10 : 0,
      retPct: retOf(v.val, v.cost),
    }))

    // By market
    let krVal = 0, usVal = 0, krCost = 0, usCost = 0
    for (const i of items) {
      if (i.market === 'US') { usVal += i.valKrw; usCost += i.costKrw }
      else { krVal += i.valKrw; krCost += i.costKrw }
    }
    const byMarket = [
      { subject: '국내', pct: total > 0 ? Math.round(krVal / total * 1000) / 10 : 0, retPct: retOf(krVal, krCost) },
      { subject: '해외', pct: total > 0 ? Math.round(usVal / total * 1000) / 10 : 0, retPct: retOf(usVal, usCost) },
    ]

    // AI 인프라 sub-theme 세부 비중 (drilldown)
    const aiInfraMap = new Map<string, { val: number; cost: number }>()
    let aiInfraTotal = 0
    for (const i of items) {
      if (i.theme !== 'AI 인프라') continue
      const prev = aiInfraMap.get(i.subTheme) || { val: 0, cost: 0 }
      prev.val += i.valKrw; prev.cost += i.costKrw
      aiInfraMap.set(i.subTheme, prev)
      aiInfraTotal += i.valKrw
    }
    const byAiInfraSub = Array.from(aiInfraMap.entries())
      .map(([k, v]) => ({
        subject: k,
        pct: aiInfraTotal > 0 ? Math.round(v.val / aiInfraTotal * 1000) / 10 : 0,
        retPct: retOf(v.val, v.cost),
      }))
      .sort((a, b) => b.pct - a.pct)

    return { byStock, byTheme, byMarket, byAiInfraSub }
  }, [stockTrades, stockQuotes, stockThemes, usdKrwRate])

  const getLines = (suffix: string) => {
    if (viewMode === 'total') return [{ key: `전체${suffix}`, color: '#6366f1', name: '전체' }]
    if (viewMode === 'market') return [
      { key: `국내${suffix}`, color: MARKET_COLORS['국내'], name: '국내' },
      { key: `해외${suffix}`, color: MARKET_COLORS['해외'], name: '해외' },
    ]
    return THEME_KEYS
      .filter(k => k !== '미분류' && trendData.some(d => (d[`${k}value`] as number) > 0))
      .map(k => ({ key: `${k}${suffix}`, color: GROUP_COLORS[k], name: k }))
  }

  const charts = [
    { label: '평가액 추이', suffix: 'value', fmt: fmtKrw, unit: '원' },
    { label: '수익금 추이', suffix: 'pnl', fmt: fmtKrw, unit: '원' },
    { label: '수익률 추이', suffix: 'pct', fmt: (v: number) => `${v.toFixed(1)}`, unit: '%' },
  ]

  const viewModes: { value: ViewMode; label: string }[] = [
    { value: 'total', label: '전체' },
    { value: 'market', label: '마켓' },
    { value: 'group', label: '테마' },
  ]

  if (loading) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="ANALYSIS" title="포트폴리오 분석" />
        </div>
        <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
          추이 데이터 로딩 중...
        </div>
      </LCard>
    )
  }

  if (trendData.length < 2) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="ANALYSIS" title="포트폴리오 분석" />
        </div>
        <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
          분석에 필요한 데이터가 부족합니다
        </div>
      </LCard>
    )
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="ANALYSIS" title="포트폴리오 분석" action={
          <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
            {viewModes.map(m => (
              <button key={m.value} onClick={() => setViewMode(m.value)} style={{
                border: 'none', background: viewMode === m.value ? t.neutrals.card : 'transparent',
                padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                fontWeight: viewMode === m.value ? t.weight.medium : t.weight.regular,
                color: t.neutrals.text, fontFamily: t.font.sans,
              }}>{m.label}</button>
            ))}
          </div>
        } />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 14px 14px' }}>
        <div style={{
          display: chartColumns === 2 ? 'grid' : 'flex',
          gridTemplateColumns: chartColumns === 2 ? 'repeat(2, minmax(0, 1fr))' : undefined,
          flexDirection: chartColumns === 2 ? undefined : 'column',
          gap: 12,
        }}>
        {charts.map(chart => {
          const lines = getLines(chart.suffix)
          const isValue = chart.suffix === 'value'
          const useLog = isValue && valueScale === 'log'
          const last = trendData.length > 0 ? trendData[trendData.length - 1] : null
          return (
            <div key={chart.suffix}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8, flexWrap: 'wrap', minHeight: 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.muted }}>
                    {chart.label}
                  </div>
                  {last && lines.map(line => {
                    const v = Number(last[line.key])
                    if (!Number.isFinite(v)) return null
                    const sign = (chart.suffix === 'pnl' || chart.suffix === 'pct') && v > 0 ? '+' : ''
                    return (
                      <span key={line.key} style={{
                        fontSize: 11, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums',
                        color: line.color,
                      }}>
                        {lines.length > 1 && <span style={{ fontSize: 9, color: t.neutrals.muted, marginRight: 3, fontWeight: t.weight.regular }}>{line.name}</span>}
                        {sign}{chart.fmt(v)}{chart.unit}
                      </span>
                    )
                  })}
                </div>
                {isValue && (
                  <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
                    {(['linear', 'log'] as ValueScale[]).map(s => (
                      <button key={s} onClick={() => handleScaleChange(s)} style={{
                        border: 'none', background: valueScale === s ? t.neutrals.card : 'transparent',
                        padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                        fontFamily: t.font.sans,
                        fontWeight: valueScale === s ? t.weight.medium : t.weight.regular,
                        color: t.neutrals.text,
                      }}>{s === 'linear' ? '일반' : '로그'}</button>
                    ))}
                  </div>
                )}
              </div>
              <ResponsiveContainer width={chartColumns === 2 ? 400 : '100%'} height={160}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: t.neutrals.subtle }}
                    axisLine={false} tickLine={false} interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v: number) => chart.fmt(v)} tick={{ fontSize: 9, fill: t.neutrals.subtle }}
                    axisLine={false} tickLine={false} width={50}
                    scale={useLog ? 'log' : 'linear'}
                    domain={
                      useLog
                        ? [(dataMin: number) => Math.max(1, dataMin * 0.9), (dataMax: number) => dataMax * 1.15]
                        : isValue
                          ? [(dataMin: number) => Math.max(0, dataMin * 0.92), (dataMax: number) => dataMax * 1.15]
                          : ['auto', 'auto']
                    }
                    allowDataOverflow={useLog || isValue}
                  />
                  {chart.suffix === 'pnl' || chart.suffix === 'pct' ? (
                    <ReferenceLine y={0} stroke={t.neutrals.line} strokeDasharray="3 3" />
                  ) : null}
                  <Tooltip
                    contentStyle={{
                      background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                      borderRadius: t.radius.md, fontSize: 11, fontFamily: t.font.sans, padding: '6px 10px',
                    }}
                    labelFormatter={(v) => String(v)}
                    formatter={(value, name) => [`${chart.fmt(Number(value))}${chart.unit}`, name]}
                  />
                  {lines.map(line => (
                    <Line
                      key={line.key} type="monotone" dataKey={line.key} name={line.name}
                      stroke={line.color} strokeWidth={1.5} dot={false} connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        })}
        </div>

        {/* Donut charts: allocation breakdown */}
        {radarData.byTheme.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.muted }}>
                포트폴리오 비중
              </div>
              <LSegmented
                options={[
                  { value: 'category', label: '기본' },
                  { value: 'return', label: '수익률' },
                ]}
                value={donutColorMode}
                onChange={handleDonutColorChange}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : (radarData.byAiInfraSub.length > 0 ? 'repeat(3, 1fr)' : '1fr 1fr'), gap: 8 }}>
              <DonutChart title="테마별" data={radarData.byTheme}
                colors={radarData.byTheme.map(d => GROUP_COLORS[d.subject] || '#94a3b8')}
                colorMode={donutColorMode} returns={radarData.byTheme.map(d => d.retPct)}
                fixedWidth={chartColumns === 2 ? 280 : undefined} />
              {radarData.byAiInfraSub.length > 0 && (
                <DonutChart title="AI 인프라 세부" data={radarData.byAiInfraSub}
                  colors={radarData.byAiInfraSub.map(d => AI_INFRA_SUB_COLORS[d.subject] || '#94a3b8')}
                  colorMode={donutColorMode} returns={radarData.byAiInfraSub.map(d => d.retPct)}
                  fixedWidth={chartColumns === 2 ? 280 : undefined} />
              )}
              <DonutChart title="국내/해외" data={radarData.byMarket}
                colors={[MARKET_COLORS['국내'], MARKET_COLORS['해외']]}
                colorMode={donutColorMode} returns={radarData.byMarket.map(d => d.retPct)}
                fixedWidth={chartColumns === 2 ? 280 : undefined} />
            </div>
            {/* 수익률 모드 범례 (차트 아래): 색=수익률(파랑 손실 ↔ 빨강 수익), 테두리=분류, 크기=비중 */}
            {donutColorMode === 'return' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontSize: 9, color: t.neutrals.subtle }}>
                <span>손실</span>
                <span style={{ width: 96, height: 7, borderRadius: 4, background: `linear-gradient(90deg, ${returnGradientColor(-50)}, ${returnGradientColor(0)}, ${returnGradientColor(50)})`, display: 'inline-block' }} />
                <span>수익</span>
                <span style={{ opacity: 0.7 }}>(색=수익률, 테두리=분류, 크기=비중)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </LCard>
  )
}
