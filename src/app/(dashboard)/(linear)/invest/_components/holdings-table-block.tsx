'use client'

/**
 * 보유 현황 — 윌로우 매출관리 카드를 본으로 새로 짰다(CEO 2026-09-23).
 *
 * 머리(제목 + 세그먼트) → 지표 격자(StatRows·LStat) → 분류 요약 표 → 필터 칩 + 검색 →
 * 종목 표(정렬·페이지) → 발 줄(페이지 크기·이동), 행 클릭은 LDialog 상세.
 * 종목 카드 격자는 두지 않는다. 카드 안에 카드를 격자로 깔면 카드 문법이 닿지 않아
 * 이 화면만 다른 물건으로 읽혔다. 계산은 _lib/holdings 가 든다.
 */

import { useMemo, useState, useCallback, type CSSProperties } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { StatRows } from '@/app/(dashboard)/_components/linear-stat-rows'
import {
  LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableMono,
  LTableRow, LTableScroll, useTableSort, type LColumn, LPageSize,
} from '@/app/(dashboard)/_components/linear-table'
import {
  type StockTradeFull, type StockQuoteFull, type TickerTheme, type Holding, type MarketFilter, type Pyramiding,
  computeHoldings, computeSummary, computeRealized, computeTotals, computeThemeStats,
  makeFxRate, pyramidingOf, subThemeOf, valKrwOf, pnlKrwOf, fmtAmount, fmtPct, fmtSigned, PYRAMIDING_LABEL,
} from '../_lib/holdings'
import { HoldingDetailDialog, type HoldingDetail } from './holding-detail-dialog'

interface Props {
  stockTrades: StockTradeFull[]
  stockQuotes: Record<string, StockQuoteFull>
  stockThemes: Record<string, TickerTheme[]>
  usdKrwRate: number
  fxHistory: Record<string, number>
  /** ticker → DB 의 세부 sector 라벨. */
  tickerSectors?: Record<string, string>
  /** ticker → 6개월 모멘텀이 QLD보다 낮은 'QLD전환' 후보인지. */
  qldTransition?: Record<string, boolean>
  /** ticker → 현재가가 직전 20일 고가를 돌파했는지. */
  breakoutMap?: Record<string, { breakout: boolean; gapPct: number }>
  style?: CSSProperties
}

/** 표 한 줄. Holding 에 화면이 정렬·표시에 쓰는 파생값을 붙인 것. */
interface HoldingRow extends Holding {
  theme: string
  sub: string | null
  valKrw: number
  pnlKrw: number
  weightPct: number
  pyr: Pyramiding
  sector?: string
  breakout?: { breakout: boolean; gapPct: number }
  qld: boolean
}

type CurrencyMode = 'native' | 'krw'

// 표에는 매출관리처럼 핵심 여섯 열만 둔다. 수량·평단·현재가·보유일·IRR 은 행을 눌러 여는
// 상세에 있다 — 열을 열 개 세우면 카드가 반폭인 2열 모드에서 손익부터 가로 스크롤 너머로 밀린다.
const COLUMNS: LColumn<HoldingRow>[] = [
  { key: 'theme',  label: '분류',   width: '100px', sortValue: r => r.theme },
  { key: 'name',   label: '종목',   width: 'minmax(110px,1fr)', sortValue: r => r.company_name },
  { key: 'value',  label: '평가액', width: 'minmax(90px,108px)', align: 'right', sortValue: r => r.valKrw, sortFirst: 'desc' },
  { key: 'pnl',    label: '손익',   width: 'minmax(90px,108px)', align: 'right', sortValue: r => r.pnlKrw, sortFirst: 'desc' },
  { key: 'pct',    label: '수익률', width: '60px',  align: 'right', sortValue: r => r.pnlPercent, sortFirst: 'desc' },
  { key: 'state',  label: '상태',   width: '72px',  sortValue: r => r.pyr.rank },
  { key: 'chevron', label: '', width: '14px' },
]

// 분류 요약 표 — 테마별 종목 수·평가액·비중·손익. 종목 표 위에서 묶음의 무게를 먼저 읽는다.
interface ThemeRow { theme: string; depth: 0 | 1; count: number; valKrw: number; weight: number; pnlKrw: number; pct: number }
const THEME_COLUMNS: LColumn<ThemeRow>[] = [
  { key: 'theme',  label: '분류',   width: 'minmax(96px,1fr)' },
  { key: 'count',  label: '종목',   width: '40px', align: 'right' },
  { key: 'value',  label: '평가액', width: 'minmax(84px,auto)', align: 'right' },
  { key: 'weight', label: '비중',   width: '52px', align: 'right' },
  { key: 'pnl',    label: '손익',   width: 'minmax(84px,auto)', align: 'right' },
  { key: 'pct',    label: '수익률', width: '60px', align: 'right' },
]

const MARKET_FILTERS: { value: MarketFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'KR', label: '국내' },
  { value: 'US', label: '해외' },
]

const PAGE_SIZE_KEY = 'invest-holdings-page-size'
const DEFAULT_PAGE_SIZE = 10
function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

const CURRENCY_KEY = 'invest-holdings-currency'
function getStoredCurrency(): CurrencyMode {
  if (typeof window === 'undefined') return 'native'
  return localStorage.getItem(CURRENCY_KEY) === 'krw' ? 'krw' : 'native'
}

/** 지표 타일의 증감 줄. 값은 검정, 부호가 붙은 변동만 색을 갖는다(카드 문법 2026-09-10). */
function ChangeLine({ value, base, pct, currency }: { value: number; base?: number; pct?: number; currency: 'KRW' | 'USD' }) {
  const ratio = pct ?? (base && base > 0 ? (value / base) * 100 : null)
  const color = value > 0 ? t.accent.pos : value < 0 ? t.accent.neg : t.neutrals.subtle
  return (
    <div style={{
      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, marginTop: t.density.gapXs,
      color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.4,
    }}>
      {value > 0 ? '+' : ''}{fmtAmount(value, currency)}
      {ratio !== null && ` (${ratio > 0 ? '+' : ''}${ratio.toFixed(1)}%)`}
    </div>
  )
}

export function HoldingsTableBlock({
  stockTrades, stockQuotes, stockThemes, usdKrwRate, fxHistory,
  tickerSectors = {}, qldTransition = {}, breakoutMap = {}, style,
}: Props) {
  const mobile = useIsMobile()
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all')
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>(getStoredCurrency)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<number>(getStoredPageSize)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<HoldingRow | null>(null)

  const getFxRate = useMemo(() => makeFxRate(fxHistory, usdKrwRate), [fxHistory, usdKrwRate])
  const holdings = useMemo(() => computeHoldings(stockTrades, stockQuotes, stockThemes, getFxRate), [stockTrades, stockQuotes, stockThemes, getFxRate])
  const filtered = useMemo(() => marketFilter === 'all' ? holdings : holdings.filter(h => h.market === marketFilter), [holdings, marketFilter])
  const summary = useMemo(() => computeSummary(filtered, usdKrwRate), [filtered, usdKrwRate])
  const realized = useMemo(() => computeRealized(stockTrades, getFxRate), [stockTrades, getFxRate])
  const totals = useMemo(() => computeTotals(summary, realized, marketFilter), [summary, realized, marketFilter])
  const themeStats = useMemo(() => computeThemeStats(filtered, usdKrwRate), [filtered, usdKrwRate])
  const hasQuotes = holdings.some(h => h.currentPrice > 0)

  const rows = useMemo((): HoldingRow[] => {
    const totalValKrw = summary.totalVal
    return filtered.map(h => {
      const key = h.ticker.replace('.KS', '')
      const valKrw = valKrwOf(h, usdKrwRate)
      return {
        ...h,
        theme: h.parentTheme || '미분류',
        sub: subThemeOf(h),
        valKrw,
        pnlKrw: pnlKrwOf(h, usdKrwRate),
        weightPct: totalValKrw > 0 ? (valKrw / totalValKrw) * 100 : 0,
        pyr: pyramidingOf(h, usdKrwRate),
        sector: tickerSectors[h.ticker] ?? tickerSectors[key],
        breakout: breakoutMap[h.ticker] ?? breakoutMap[key],
        qld: !!(qldTransition[h.ticker] ?? qldTransition[key]),
      }
    })
  }, [filtered, summary.totalVal, usdKrwRate, tickerSectors, breakoutMap, qldTransition])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.company_name.toLowerCase().includes(q) || r.ticker.toLowerCase().includes(q)
      || r.theme.toLowerCase().includes(q) || (r.sub ?? '').toLowerCase().includes(q) || (r.sector ?? '').toLowerCase().includes(q))
  }, [rows, search])

  // 정렬 상태는 표마다 기억한다 — 키가 같으면 매출관리처럼 마지막 정렬로 갈아탄다.
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<HoldingRow>('invest-holdings', COLUMNS)
  const sorted = useMemo(() => sortApply(searched), [sortApply, searched])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyPageSize = useCallback((n: number) => {
    setPageSize(n); setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }, [])
  const applyCurrency = useCallback((v: CurrencyMode) => {
    setCurrencyMode(v)
    localStorage.setItem(CURRENCY_KEY, v)
  }, [])

  // 해외 종목의 금액: 발행 통화 그대로(native) 또는 원화 환산(krw). 국내는 늘 원화.
  const krw = currencyMode === 'krw'
  const showValue = (r: HoldingRow) => krw ? fmtAmount(r.valKrw, 'KRW') : fmtAmount(r.currentValue, r.currency)
  const showPnl = (r: HoldingRow) => krw ? fmtSigned(r.pnlKrw, 'KRW') : fmtSigned(r.pnl, r.currency)
  const cellTone = (v: number): 'pos' | 'neg' | 'muted' => v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'

  const themeRows = useMemo((): ThemeRow[] => {
    const out: ThemeRow[] = []
    for (const p of themeStats.parents) {
      out.push({ theme: p.theme, depth: 0, count: p.count, valKrw: p.valKrw, weight: p.weight, pnlKrw: p.pnlKrw, pct: p.pct })
      for (const s of p.subs) out.push({ theme: s.theme, depth: 1, count: s.count, valKrw: s.valKrw, weight: s.weight, pnlKrw: s.pnlKrw, pct: s.pct })
    }
    return out
  }, [themeStats])

  const detail: HoldingDetail | null = selected ? {
    holding: selected, pyramiding: selected.pyr, weightPct: selected.weightPct,
    breakout: selected.breakout, qldTransition: selected.qld, sector: selected.sector,
  } : null

  // 해외 지표 타일 — 세그먼트에 따라 달러 그대로 또는 원화 환산.
  const usVal = krw ? summary.usVal * usdKrwRate : summary.usVal
  const usInv = krw ? summary.usKrwInv : summary.usInv
  const usCur: 'KRW' | 'USD' = krw ? 'KRW' : 'USD'

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="보유 현황"
            tools={
              <LSegmented
                value={currencyMode}
                onChange={applyCurrency}
                options={[
                  { value: 'native', label: '원화/달러' },
                  { value: 'krw', label: '₩ 통합' },
                ]}
              />
            }
            toolsInline
            mb={0}
          />
        </div>

        {/* 지표 격자 — 국내·해외·전체 보유분과 청산 확정분을 한 격자에. 회색 판은 두지 않는다. */}
        {hasQuotes && (
          <StatRows cols={mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))'}>
            <LStat
              label={`국내 ${summary.krH.length}종목`}
              value={fmtAmount(summary.krVal, 'KRW')}
              subExtra={<ChangeLine value={summary.krVal - summary.krInv} base={summary.krInv} currency="KRW" />}
            />
            <LStat
              label={`해외 ${summary.usH.length}종목`}
              value={fmtAmount(usVal, usCur)}
              subExtra={<ChangeLine value={usVal - usInv} base={usInv} currency={usCur} />}
            />
            <LStat
              label={`전체 ${summary.count}종목 · ${Math.round(usdKrwRate).toLocaleString()}원/$`}
              value={fmtAmount(summary.totalVal, 'KRW')}
              subExtra={<ChangeLine value={summary.totalPnl} pct={summary.totalPct} currency="KRW" />}
            />
            {realized.sellCount > 0 && (
              <LStat
                label="실현손익"
                value={`${totals.rPnl > 0 ? '+' : ''}${fmtAmount(totals.rPnl, 'KRW')}`}
                sub={marketFilter === 'all'
                  ? `국내 ${realized.kr > 0 ? '+' : ''}${fmtAmount(realized.kr, 'KRW')} · 해외 ${realized.us > 0 ? '+' : ''}${fmtAmount(realized.us, 'KRW')}`
                  : undefined}
              />
            )}
            {realized.sellCount > 0 && (
              <LStat
                label="총손익 (미실현+실현)"
                value={`${totals.combinedPnl > 0 ? '+' : ''}${fmtAmount(totals.combinedPnl, 'KRW')}`}
                sub={fmtPct(totals.combinedPct)}
              />
            )}
          </StatRows>
        )}
      </div>

      {/* 분류 요약 — 테마별 무게. 종목 표 위에서 묶음부터 읽는다. */}
      {hasQuotes && themeRows.length > 0 && (
        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.blockGap}px` }}>
          <LTableScroll columns={THEME_COLUMNS} mobile={mobile}>
            <LTableHead columns={THEME_COLUMNS} mobile={mobile} />
            <LTableBody columns={THEME_COLUMNS} mobile={mobile}>
              {themeRows.map(r => (
                <LTableRow key={`${r.depth}-${r.theme}`} columns={THEME_COLUMNS} mobile={mobile}>
                  <span style={{ paddingLeft: r.depth ? t.density.gapMd : 0, minWidth: 0, display: 'flex' }}>
                    <LTableBadge tone={tonePalettes.neutral}>{r.theme}</LTableBadge>
                  </span>
                  <LTableMono align="right">{r.count}</LTableMono>
                  <LTableMono align="right" strong>{fmtAmount(r.valKrw, 'KRW')}</LTableMono>
                  <LTableMono align="right" tone="muted">{r.weight.toFixed(1)}%</LTableMono>
                  <LTableMono align="right" strong tone={cellTone(r.pnlKrw)}>{fmtSigned(r.pnlKrw, 'KRW')}</LTableMono>
                  <LTableMono align="right" tone={cellTone(r.pct)}>{fmtPct(r.pct)}</LTableMono>
                </LTableRow>
              ))}
              <LTableRow columns={THEME_COLUMNS} mobile={mobile}>
                <span style={{ color: t.neutrals.muted }}>합계</span>
                <LTableMono align="right">{summary.count}</LTableMono>
                <LTableMono align="right" strong>{fmtAmount(summary.totalVal, 'KRW')}</LTableMono>
                <LTableMono align="right" tone="muted">100.0%</LTableMono>
                <LTableMono align="right" strong tone={cellTone(summary.totalPnl)}>{fmtSigned(summary.totalPnl, 'KRW')}</LTableMono>
                <LTableMono align="right" tone={cellTone(summary.totalPct)}>{fmtPct(summary.totalPct)}</LTableMono>
              </LTableRow>
            </LTableBody>
          </LTableScroll>
        </div>
      )}

      {/* 필터 + 검색 — 매출관리와 같은 줄 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap',
        padding: `0 ${t.density.cardPad}px ${t.density.kpiGap}px`,
      }}>
        <LFilterChip options={MARKET_FILTERS} value={marketFilter} onChange={v => { setMarketFilter(v); setPage(0) }} gap={t.density.gapXs} />
        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 160 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="종목명 · 티커 · 분류 검색"
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
              padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
        </div>
      </div>

      {/* 종목 표 */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
          {paged.length === 0 && <LTableEmpty>{search ? '검색 결과가 없습니다' : '보유 종목이 없습니다'}</LTableEmpty>}
          <LTableBody columns={COLUMNS} mobile={mobile}>
            {paged.map(r => {
              const quoted = r.currentPrice > 0
              return (
                <LTableRow key={r.ticker} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(r)}>
                  <LTableBadge tone={tonePalettes.neutral}>{r.sub ?? r.theme}</LTableBadge>
                  <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${r.company_name} ${r.ticker}`}>
                    <span style={{ fontWeight: t.weight.medium }}>{r.company_name}</span>
                    <span style={{ color: t.neutrals.muted, marginLeft: t.density.gapXs, fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>
                      {r.ticker.replace('.KS', '')}
                    </span>
                  </span>
                  <LTableMono align="right" strong>{quoted ? showValue(r) : '-'}</LTableMono>
                  <LTableMono align="right" strong tone={quoted ? cellTone(r.pnl) : 'muted'}>{quoted ? showPnl(r) : '-'}</LTableMono>
                  <LTableMono align="right" tone={quoted ? cellTone(r.pnlPercent) : 'muted'}>{quoted ? fmtPct(r.pnlPercent) : '-'}</LTableMono>
                  <span style={{ display: 'flex', minWidth: 0 }}>
                    {r.pyr.status === 'NONE'
                      ? <span style={{ color: t.neutrals.subtle }}>-</span>
                      : <LTableBadge tone={tonePalettes.neutral}>T{r.pyr.tranche} {PYRAMIDING_LABEL[r.pyr.status]}</LTableBadge>}
                  </span>
                  <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                    <LIcon name="chevronRight" size={12} stroke={2} />
                  </span>
                </LTableRow>
              )
            })}
          </LTableBody>
        </LTableScroll>
      </div>

      {/* 발 줄 — 페이지 크기·이동 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
          <span style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>
            {search && sorted.length !== rows.length ? `${sorted.length}/${rows.length}종목` : `${rows.length}종목`}
          </span>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={safePage === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage === 0 ? 'default' : 'pointer',
                color: safePage === 0 ? t.neutrals.line : t.neutrals.muted, opacity: safePage === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                color: safePage >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted, opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      <HoldingDetailDialog detail={detail} usdKrwRate={usdKrwRate} onClose={() => setSelected(null)} />
    </LCard>
  )
}
