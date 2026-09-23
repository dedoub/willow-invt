/**
 * 종목관리(워치리스트·리서치) 계산 — 화면과 떼어 둔 순수 함수들.
 *
 * 칸반(portfolio-kanban)이 카드를 만들던 식을 그대로 옮겼다: 시그널에 시세를 덮고,
 * 리서치 논지를 티커별로 모으고, 핀 종목의 모니터 단계를 트랜치 트리거로 센다.
 * 정렬은 여기서 하지 않는다 — 표가 제 열로 정렬한다.
 */

import { TRANCHE_TRIGGERS } from './holdings'

/* ── Types (API 응답 모양) ── */

export interface WatchlistItem {
  name: string; ticker: string; sector: string; axis?: string
  pinned?: boolean; monitorDate?: string; monitorPrice?: number
}
export interface WatchlistData { portfolio: WatchlistItem[]; watchlist: WatchlistItem[]; benchmark: WatchlistItem[] }

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

export interface StockResearch {
  id: string; ticker: string; company_name: string; scan_date: string
  source: string; source_type: 'valuechain' | 'smallcap'
  current_price: number | null; verdict: string | null
  sector_tags: string[]; sector: string | null
  composite_score: number | null; momentum_score: number | null
  gap_from_high_pct: number | null; change_pct: number | null
  structural_thesis: string | null; track: string | null
  value_chain_position: string | null
  market_cap_b: number | null; market_cap_m: number | null
  axis: string | null
}

export interface StockQuote {
  price: number; change: number; changePercent: number; currency: string
  marketCap?: number
}

export type ThemeMap = Record<string, Array<{ theme: string; parentTheme: string | null }>>
export type BreakoutMap = Record<string, { breakout: boolean; gapPct: number }>

/** 핀 종목의 모니터 — 핀을 꽂은 날의 가격을 0으로 놓고 트랜치 트리거로 단계를 센다. */
export interface MonitorInfo {
  stage: number
  changePct: number
  days: number
  nextThresholdPct: number | null
  nextThresholdPrice: number | null
  startDate: string
  startPrice: number
}

export type ResearchGroup = 'watchlist' | 'research'

/** 표 한 줄. 워치리스트와 리서치가 같은 모양을 쓰고, 없는 값은 비운다. */
export interface ResearchItem {
  group: ResearchGroup
  name: string; ticker: string; sector: string; axis?: string
  /** 분류 — parent(axis) 와 세부(sub). 표의 분류 배지는 sub, 필터 칩은 parent. */
  parent: string; sub: string | null
  price?: number; changePercent?: number; currency?: string
  signal?: 'new_high' | 'near' | 'weak' | null
  gapFromHighPct?: number | null
  momentumScore?: number | null
  return1m?: number | null
  marketCapLabel?: string
  breakout: boolean; breakoutGap?: number
  structuralThesis?: string | null; valueChainPosition?: string | null
  // watchlist
  pinned?: boolean; monitor?: MonitorInfo
  // research
  verdict?: string | null; compositeScore?: number | null
  sourceType?: string; researchId?: string; scanDate?: string
}

/* ── 분류 ── */

export const PARENT_ORDER = ['AI 인프라', '지정학/안보', '넥스트', '스캔 후보', '미분류']
export const SUB_ORDER: Record<string, string[]> = {
  'AI 인프라':   ['AI 반도체', 'AI 에너지/원전', '저장/냉각/연결'],
  '지정학/안보': ['방산', '우주'],
}

export const SIGNAL_LABEL: Record<'new_high' | 'near' | 'weak', string> = { new_high: '신고가', near: '근접', weak: '부진' }

// stock_watchlist/stock_research.sector → holdings 의 sub-theme 묶음 매핑
export function mapSectorToSubTheme(sector: string | undefined | null): string {
  if (!sector) return '기타'
  if (/반도체|semiconductor|chip|메모리|memory|패키징|장비|HBM|ASIC|GPU|테스터/i.test(sector)) return 'AI 반도체'
  if (/에너지|원전|원자력|nuclear|우라늄|연료전지|fuel cell|가스터빈|발전|터빈/i.test(sector)) return 'AI 에너지/원전'
  if (/데이터센터|냉각|네트워킹|네트워크|cooling|datacenter|storage|스토리지|저장|인프라|광|cloud|클라우드|NAND|SSD|HDD|서버/i.test(sector)) return '저장/냉각/연결'
  if (/방산|defense|military/i.test(sector)) return '방산'
  if (/우주|space|satellite|SpaceX|위성|달|lunar/i.test(sector)) return '우주'
  return '기타'
}

/** 세부 분류. 세부 묶음이 없는 parent 는 null. */
export function subThemeFor(parent: string, ticker: string, sector: string | undefined, themes: ThemeMap): string | null {
  const subOrder = SUB_ORDER[parent]
  if (!subOrder) return null
  const key = ticker.replace('.KS', '')
  const themeFallback = themes[key]?.[0]?.theme || themes[ticker]?.[0]?.theme
  const raw = sector ? mapSectorToSubTheme(sector) : (themeFallback || '기타')
  return subOrder.includes(raw) ? raw : '기타'
}

/** parent 순서 — PARENT_ORDER 먼저, 나머지는 나온 순서. */
export function orderParents(parents: Iterable<string>): string[] {
  const set = new Set(parents)
  return [...PARENT_ORDER.filter(p => set.has(p)), ...[...set].filter(p => !PARENT_ORDER.includes(p))]
}

/* ── 시총 ── */

export function formatMarketCap(cap: number, currency: string | undefined): string | undefined {
  if (!cap || cap <= 0) return undefined
  if (currency === 'KRW') {
    const ok = cap / 1e8
    return ok >= 10000 ? `${(ok / 10000).toFixed(1)}조` : `${Math.round(ok).toLocaleString()}억`
  }
  const capB = cap / 1e9
  return capB >= 1 ? `$${capB.toFixed(1)}B` : `$${Math.round(capB * 1000)}M`
}

function marketCapFromResearch(r: StockResearch, all: StockResearch[]): string | undefined {
  const mcap = (r.market_cap_b || r.market_cap_m) ? r : all.find(sr => sr.ticker === r.ticker && (sr.market_cap_b || sr.market_cap_m))
  if (mcap?.market_cap_b != null && mcap.market_cap_b > 0) {
    return mcap.market_cap_b >= 1 ? `$${mcap.market_cap_b.toFixed(1)}B` : `$${Math.round(mcap.market_cap_b * 1000)}M`
  }
  if (mcap?.market_cap_m != null && mcap.market_cap_m > 0) {
    return mcap.market_cap_m >= 10000 ? `${(mcap.market_cap_m / 10000).toFixed(1)}조` : `${Math.round(mcap.market_cap_m).toLocaleString()}억`
  }
  return undefined
}

/* ── 조회 맵 ── */

const key = (ticker: string) => ticker.replace('.KS', '')
/** 시그널이 없어 통화를 모르면 티커로 판단한다 — 6자리 숫자·.KS 는 원화. 비워 두면 국내 종목이 달러로 찍힌다(2026-09-23 심텍). */
const inferCurrency = (ticker: string) => (ticker.endsWith('.KS') || /^\d{6}$/.test(ticker)) ? 'KRW' : 'USD'
const pick = <T,>(m: Map<string, T> | Record<string, T>, ticker: string): T | undefined =>
  m instanceof Map ? (m.get(ticker) ?? m.get(key(ticker))) : (m[ticker] ?? m[key(ticker)])

/** 시그널에 실시간 시세를 덮는다. 시그널은 5분 캐시라 값이 시세보다 늦다. */
export function buildSignalMap(signalData: SignalData[], quotes: Record<string, StockQuote>): Map<string, SignalData> {
  const m = new Map<string, SignalData>()
  for (const s of signalData) {
    const k = key(s.ticker)
    const quote = quotes[k]
    const merged: SignalData = quote
      ? { ...s, price: quote.price, change: quote.change, changePercent: s.changePercent, currency: quote.currency }
      : s
    m.set(s.ticker, merged); m.set(k, merged)
  }
  return m
}

/** 티커 → 가장 나은 논지(structural_thesis)와 밸류체인 위치. */
export function buildThesisMap(research: StockResearch[]): Map<string, { thesis: string | null; vcp: string | null }> {
  const m = new Map<string, { thesis: string | null; vcp: string | null }>()
  for (const r of research) {
    const k = key(r.ticker)
    const prev = m.get(k)
    if (!prev || (!prev.thesis && r.structural_thesis) || (!prev.vcp && r.value_chain_position)) {
      m.set(k, { thesis: r.structural_thesis || prev?.thesis || null, vcp: r.value_chain_position || prev?.vcp || null })
    }
  }
  return m
}

export function watchlistTickerSet(data: WatchlistData | null): Set<string> {
  const set = new Set<string>()
  if (!data) return set
  for (const item of [...data.portfolio, ...data.watchlist]) { set.add(item.ticker); set.add(key(item.ticker)) }
  return set
}

/* ── 항목 만들기 ── */

export function monitorOf(item: WatchlistItem, currentPrice: number | undefined, now = Date.now()): MonitorInfo | undefined {
  if (!(item.pinned && item.monitorDate && item.monitorPrice && currentPrice)) return undefined
  const changePct = ((currentPrice - item.monitorPrice) / item.monitorPrice) * 100
  const changeRatio = changePct / 100
  let stage = 1
  for (let i = 1; i < TRANCHE_TRIGGERS.length; i++) {
    if (TRANCHE_TRIGGERS[i] !== null && changeRatio >= (TRANCHE_TRIGGERS[i] as number)) stage = i + 1
    else break
  }
  const nextThreshold = stage < 10 ? TRANCHE_TRIGGERS[stage] : null
  const days = Math.round((now - new Date(item.monitorDate).getTime()) / (24 * 60 * 60 * 1000))
  return {
    stage, changePct, days,
    nextThresholdPct: nextThreshold !== null ? nextThreshold * 100 : null,
    nextThresholdPrice: nextThreshold !== null ? item.monitorPrice * (1 + nextThreshold) : null,
    startDate: item.monitorDate, startPrice: item.monitorPrice,
  }
}

export function buildWatchlistItems(args: {
  watchlistData: WatchlistData | null
  signalMap: Map<string, SignalData>
  quotes: Record<string, StockQuote>
  thesisMap: Map<string, { thesis: string | null; vcp: string | null }>
  breakoutMap: BreakoutMap
  themes: ThemeMap
}): ResearchItem[] {
  const { watchlistData, signalMap, quotes, thesisMap, breakoutMap, themes } = args
  if (!watchlistData) return []
  return watchlistData.watchlist.map(item => {
    const sig = pick(signalMap, item.ticker)
    const quote = pick(quotes, item.ticker)
    const bo = pick(breakoutMap, item.ticker)
    const th = thesisMap.get(key(item.ticker))
    const parent = item.axis || '미분류'
    return {
      group: 'watchlist',
      name: item.name, ticker: item.ticker, sector: item.sector, axis: item.axis,
      parent, sub: subThemeFor(parent, item.ticker, item.sector, themes),
      price: sig?.price, changePercent: sig?.changePercent, currency: sig?.currency ?? inferCurrency(item.ticker),
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct,
      momentumScore: sig?.momentumScore ?? null, return1m: sig?.return1m ?? null,
      marketCapLabel: quote?.marketCap ? formatMarketCap(quote.marketCap, sig?.currency || quote.currency) : undefined,
      breakout: bo?.breakout ?? false, breakoutGap: bo?.gapPct,
      structuralThesis: th?.thesis, valueChainPosition: th?.vcp,
      pinned: item.pinned, monitor: monitorOf(item, sig?.price),
    }
  })
}

export function buildResearchItems(args: {
  research: StockResearch[]
  signalMap: Map<string, SignalData>
  quotes: Record<string, StockQuote>
  watchlistTickers: Set<string>
  breakoutMap: BreakoutMap
  themes: ThemeMap
}): ResearchItem[] {
  const { research, signalMap, quotes, watchlistTickers, breakoutMap, themes } = args
  const seen = new Set<string>()
  const out: ResearchItem[] = []
  for (const r of research) {
    if (!r.verdict?.startsWith('pass')) continue
    if (r.track === 'ETF') continue
    if (seen.has(r.ticker)) continue
    if (watchlistTickers.has(r.ticker)) continue
    seen.add(r.ticker)
    const sig = pick(signalMap, r.ticker)
    const quote = pick(quotes, r.ticker)
    const bo = pick(breakoutMap, r.ticker)
    const parent = r.axis || '미분류'
    const sector = r.sector || ''
    out.push({
      group: 'research',
      name: r.company_name || r.ticker, ticker: r.ticker, sector, axis: r.axis || undefined,
      parent, sub: subThemeFor(parent, r.ticker, sector, themes),
      price: sig?.price ?? r.current_price ?? undefined,
      changePercent: sig?.changePercent ?? r.change_pct ?? undefined, currency: sig?.currency ?? inferCurrency(r.ticker),
      signal: sig?.signal, gapFromHighPct: sig?.gapFromHighPct ?? r.gap_from_high_pct ?? undefined,
      momentumScore: sig?.momentumScore ?? r.momentum_score ?? null,
      return1m: sig?.return1m ?? r.change_pct ?? null,
      marketCapLabel: (quote?.marketCap && quote.marketCap > 0)
        ? formatMarketCap(quote.marketCap, quote.currency)
        : marketCapFromResearch(r, research),
      breakout: bo?.breakout ?? false, breakoutGap: bo?.gapPct,
      structuralThesis: r.structural_thesis, valueChainPosition: r.value_chain_position,
      verdict: r.verdict, compositeScore: r.composite_score,
      sourceType: r.source_type, researchId: r.id, scanDate: r.scan_date,
    })
  }
  return out
}

/* ── 포맷 ── */

export function fmtQuote(price: number | undefined, currency: string | undefined): string {
  if (price == null) return '-'
  if (currency === 'KRW') return `${Math.round(price).toLocaleString()}원`
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const tierLabel = (verdict: string | null | undefined) =>
  verdict === 'pass_tier1' ? 'Tier 1' : verdict?.startsWith('pass') ? 'Tier 2' : '-'
