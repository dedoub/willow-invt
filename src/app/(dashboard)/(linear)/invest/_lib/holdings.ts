/**
 * 보유 현황 계산 — 화면과 떼어 둔 순수 함수들.
 *
 * 카드 격자(holdings-block)와 표(holdings-table-block)가 같은 숫자를 보려면 계산이
 * 한 곳에 있어야 한다. 여기 있는 식은 카드 격자가 쓰던 것을 그대로 옮긴 것이다
 * (이동평균 원가, 거래일 환율로 원화 환산, Newton-Raphson IRR, 5백만원 트랜치).
 */

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

export interface Holding {
  ticker: string; company_name: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD'
  netQty: number; avgBuyPrice: number; totalInvested: number; krwInvested: number; totalBought: number
  currentPrice: number; currentValue: number; pnl: number; pnlPercent: number
  dailyChangePercent: number; irr: number | null; holdingDays: number
  parentTheme: string | null; themes: string[]
}

export type MarketFilter = 'all' | 'KR' | 'US'

/* ── 분류 ── */

export const THEME_ORDER = ['벤치마크', 'AI 인프라', '지정학/안보', '넥스트', '미분류']

// 테마별 세부 분류 — 같은 parentTheme 안에서 sub-theme(theme.name)으로 한 번 더 묶는다
export const SUB_GROUP_ORDER: Record<string, string[]> = {
  'AI 인프라':   ['AI 반도체', 'AI 에너지/원전', '저장/냉각/연결'],
  '지정학/안보': ['방산', '우주'],
}

/** 종목의 세부 분류. 화이트리스트 밖이면 '기타', 세부 묶음이 없는 테마면 null. */
export function subThemeOf(h: Pick<Holding, 'parentTheme' | 'themes'>): string | null {
  const parent = h.parentTheme || '미분류'
  const whitelist = SUB_GROUP_ORDER[parent]
  if (!whitelist) return null
  const raw = h.themes[0] || '기타'
  return whitelist.includes(raw) ? raw : '기타'
}

/* ── 피라미딩 ── */

export const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const
const TRANCHE_KRW = 5_000_000

export type PyramidingStatus = 'BUY' | 'HOLD' | 'FREEZE' | 'FULL' | 'NONE'
export const PYRAMIDING_LABEL: Record<PyramidingStatus, string> = {
  BUY: '추매구간', HOLD: '대기', FREEZE: '동결', FULL: '풀', NONE: '-',
}
// 정렬 순서: 추매 → 대기 → 동결 → 풀 → 시세 없음
const PYRAMIDING_RANK: Record<PyramidingStatus, number> = { BUY: 0, HOLD: 1, FREEZE: 2, FULL: 3, NONE: 5 }

export interface Pyramiding {
  tranche: number
  status: PyramidingStatus
  rank: number
  /** 다음 트랜치 진입 수익률(0.10 = +10%). FULL 이면 null. */
  nextTrigger: number | null
  /** 다음 트랜치 진입가. 시세가 없으면 null. */
  nextPrice: number | null
}

export function pyramidingOf(h: Holding, usdKrwRate: number): Pyramiding {
  if (!(h.currentPrice > 0 && h.totalInvested > 0)) {
    return { tranche: 0, status: 'NONE', rank: PYRAMIDING_RANK.NONE, nextTrigger: null, nextPrice: null }
  }
  const trancheSize = h.currency === 'KRW' ? TRANCHE_KRW : TRANCHE_KRW / usdKrwRate
  const tranche = Math.min(10, Math.max(1, Math.round(h.totalInvested / trancheSize)))
  const avgReturn = h.pnlPercent / 100
  const next = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null
  const curr = TRANCHE_TRIGGERS[tranche - 1]
  const status: PyramidingStatus =
    tranche >= 10 ? 'FULL'
      : next !== null && avgReturn >= next ? 'BUY'
        : curr !== null && avgReturn < curr ? 'FREEZE'
          : 'HOLD'
  return {
    tranche, status, rank: PYRAMIDING_RANK[status],
    nextTrigger: next,
    nextPrice: next !== null ? h.avgBuyPrice * (1 + next) : null,
  }
}

/* ── IRR (Newton-Raphson) ── */

export function calculateIRR(cashFlows: { date: string; amount: number }[]): number | null {
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

/* ── 환율 ── */

/** 거래일 환율. 그날이 비어 있으면 닷새까지 거슬러 올라가고, 그래도 없으면 현재 환율. */
export function makeFxRate(fxHistory: Record<string, number>, usdKrwRate: number) {
  return (date: string): number => {
    const d = new Date(date)
    for (let i = 0; i < 5; i++) {
      const key = d.toISOString().slice(0, 10)
      if (fxHistory[key]) return fxHistory[key]
      d.setDate(d.getDate() - 1)
    }
    return usdKrwRate
  }
}

/* ── 포맷 ── */

export function fmtAmount(v: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const abs = Math.abs(v)
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}억원`
  if (abs >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`
  return `${Math.round(v).toLocaleString()}원`
}

export function fmtPrice(v: number, currency: 'KRW' | 'USD'): string {
  if (currency === 'USD') return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${Math.round(v).toLocaleString()}원`
}

export const fmtSigned = (v: number, currency: 'KRW' | 'USD') => `${v > 0 ? '+' : ''}${fmtAmount(v, currency)}`
export const fmtPct = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`

/* ── 계산 ── */

export function computeHoldings(
  stockTrades: StockTradeFull[],
  stockQuotes: Record<string, StockQuoteFull>,
  stockThemes: Record<string, TickerTheme[]>,
  getFxRate: (date: string) => number,
): Holding[] {
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

  const now = Date.now()
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
      if (currentPrice > 0 && h.netQty > 0) cashFlows.push({ date: new Date(now).toISOString().slice(0, 10), amount: currentValue })
      const irr = calculateIRR(cashFlows)

      const buyTrades = tickerTrades.filter(tr => tr.trade_type === 'buy')
      const totalBuyQty = buyTrades.reduce((s, tr) => s + tr.quantity, 0)
      const weightedBuyDate = totalBuyQty > 0 ? buyTrades.reduce((s, tr) => s + new Date(tr.trade_date).getTime() * tr.quantity, 0) / totalBuyQty : now
      const holdingDays = Math.round((now - weightedBuyDate) / (24 * 60 * 60 * 1000))

      const tickerThemes = stockThemes[h.ticker] || []
      const totalBought = buyTrades.reduce((s, tr) => s + tr.total_amount, 0)

      return {
        ticker: h.ticker, company_name: h.company_name, market: h.market, currency: h.currency,
        netQty: h.netQty, avgBuyPrice, totalInvested, krwInvested: h.currency === 'USD' ? h.krwCost : totalInvested,
        totalBought, currentPrice, currentValue, pnl, pnlPercent, dailyChangePercent, irr, holdingDays,
        parentTheme: tickerThemes[0]?.parentTheme || null,
        themes: tickerThemes.map(th => th.theme),
      }
    })
    .sort((a, b) => b.currentValue - a.currentValue)
}

export const valKrwOf = (h: Holding, usdKrwRate: number) => h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue
export const pnlKrwOf = (h: Holding, usdKrwRate: number) => h.currency === 'USD' ? h.pnl * usdKrwRate : h.pnl

export interface HoldingsSummary {
  krH: Holding[]; usH: Holding[]
  krInv: number; krVal: number; usInv: number; usVal: number; usKrwInv: number
  totalInv: number; totalVal: number; totalPnl: number; totalPct: number; count: number
}

export function computeSummary(holdings: Holding[], usdKrwRate: number): HoldingsSummary {
  const krH = holdings.filter(h => h.currency === 'KRW')
  const usH = holdings.filter(h => h.currency === 'USD')
  const krInv = krH.reduce((s, h) => s + h.totalInvested, 0)
  const krVal = krH.reduce((s, h) => s + h.currentValue, 0)
  const usInv = usH.reduce((s, h) => s + h.totalInvested, 0)
  const usVal = usH.reduce((s, h) => s + h.currentValue, 0)
  const usKrwInv = usH.reduce((s, h) => s + h.krwInvested, 0)
  const totalInv = krInv + usKrwInv
  const totalVal = krVal + usVal * usdKrwRate
  const totalPnl = totalVal - totalInv
  const totalPct = totalInv > 0 ? (totalPnl / totalInv) * 100 : 0
  return { krH, usH, krInv, krVal, usInv, usVal, usKrwInv, totalInv, totalVal, totalPnl, totalPct, count: holdings.length }
}

export interface Realized {
  kr: number; us: number; total: number
  krSoldCost: number; usSoldCost: number; totalSoldCost: number; sellCount: number
}

/**
 * 실현손익 누적(KRW) — 매도 시점에 확정된 손익. 포트폴리오분석 '수익금'과 같은 이동평균 원가 방식.
 * 매도대금(거래일 환율 KRW) − 차감원가(그 시점 평균단가 × 매도수량). soldCost 는 수익률 분모용.
 */
export function computeRealized(stockTrades: StockTradeFull[], getFxRate: (date: string) => number): Realized {
  const state = new Map<string, { qty: number; krwCost: number }>()
  const sorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id))
  let kr = 0, us = 0, krSoldCost = 0, usSoldCost = 0, sellCount = 0

  for (const tr of sorted) {
    const s = state.get(tr.ticker) || { qty: 0, krwCost: 0 }
    const isUS = tr.market === 'US'
    const fx = isUS ? getFxRate(tr.trade_date) : 1

    if (tr.trade_type === 'buy') {
      s.qty += tr.quantity
      s.krwCost += tr.total_amount * fx
    } else {
      const krwAvg = s.qty > 0 ? s.krwCost / s.qty : 0
      const basis = krwAvg * tr.quantity
      const pnl = tr.total_amount * fx - basis
      if (isUS) { us += pnl; usSoldCost += basis } else { kr += pnl; krSoldCost += basis }
      sellCount++
      s.qty -= tr.quantity
      s.krwCost -= basis
      if (s.qty <= 0) { s.qty = 0; s.krwCost = 0 }
    }
    state.set(tr.ticker, s)
  }

  return { kr, us, total: kr + us, krSoldCost, usSoldCost, totalSoldCost: krSoldCost + usSoldCost, sellCount }
}

/** 시장 필터에 맞춘 실현손익 + 총손익(미실현 + 실현). 분모 = 보유원가 + 청산원가. */
export function computeTotals(summary: HoldingsSummary, realized: Realized, marketFilter: MarketFilter) {
  const rPnl = marketFilter === 'KR' ? realized.kr : marketFilter === 'US' ? realized.us : realized.total
  const rCost = marketFilter === 'KR' ? realized.krSoldCost : marketFilter === 'US' ? realized.usSoldCost : realized.totalSoldCost
  const combinedPnl = summary.totalPnl + rPnl
  const base = summary.totalInv + rCost
  return { rPnl, rCost, combinedPnl, combinedPct: base > 0 ? (combinedPnl / base) * 100 : 0 }
}

export interface ThemeStat { theme: string; count: number; valKrw: number; invKrw: number; pnlKrw: number; pct: number; weight: number }
export interface ThemeStats { totalValKrw: number; parents: Array<ThemeStat & { subs: ThemeStat[] }> }

/** 테마(parent) + 세부 분류 통계 — 모두 KRW 환산. 순서는 THEME_ORDER · SUB_GROUP_ORDER, 나머지는 '기타'. */
export function computeThemeStats(holdings: Holding[], usdKrwRate: number): ThemeStats {
  const totalValKrw = holdings.reduce((s, h) => s + valKrwOf(h, usdKrwRate), 0)
  type Acc = { count: number; valKrw: number; invKrw: number }
  const parentMap = new Map<string, Acc>()
  const subMap = new Map<string, Map<string, Acc>>()

  for (const h of holdings) {
    const parent = h.parentTheme || '미분류'
    const valKrw = valKrwOf(h, usdKrwRate)
    const invKrw = h.krwInvested
    const ps = parentMap.get(parent) || { count: 0, valKrw: 0, invKrw: 0 }
    ps.count++; ps.valKrw += valKrw; ps.invKrw += invKrw
    parentMap.set(parent, ps)

    const sub = subThemeOf(h)
    if (sub) {
      const sm = subMap.get(parent) || new Map<string, Acc>()
      const ss = sm.get(sub) || { count: 0, valKrw: 0, invKrw: 0 }
      ss.count++; ss.valKrw += valKrw; ss.invKrw += invKrw
      sm.set(sub, ss)
      subMap.set(parent, sm)
    }
  }

  const stat = (theme: string, a: Acc): ThemeStat => ({
    theme, count: a.count, valKrw: a.valKrw, invKrw: a.invKrw,
    pnlKrw: a.valKrw - a.invKrw,
    pct: a.invKrw > 0 ? ((a.valKrw - a.invKrw) / a.invKrw) * 100 : 0,
    weight: totalValKrw > 0 ? (a.valKrw / totalValKrw) * 100 : 0,
  })

  const ordered = [...THEME_ORDER.filter(th => parentMap.has(th)), ...[...parentMap.keys()].filter(k => !THEME_ORDER.includes(k))]
  const parents = ordered.map(parent => {
    const sm = subMap.get(parent)
    const subOrder = [...(SUB_GROUP_ORDER[parent] ?? []), '기타']
    const subs = sm ? subOrder.filter(s => sm.has(s)).map(s => stat(s, sm.get(s)!)) : []
    return { ...stat(parent, parentMap.get(parent)!), subs }
  })
  return { totalValKrw, parents }
}
