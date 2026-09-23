'use client'

/**
 * 종목관리 — 윌로우 매출관리 카드를 본으로 새로 짰다(CEO 2026-09-23).
 *
 * 머리(제목 + 워치리스트/리서치 세그먼트) → 지표 격자 → 분류 칩 + 검색 → 표(정렬·페이지) →
 * 발 줄, 행 클릭은 LDialog 상세. 칸반의 드래그·핀·삭제는 상세 모달의 단추가 대신한다.
 * 기존 페이지에 칸반이 없어 이 카드만 다른 물건이었다. 계산은 _lib/research 가 든다.
 */

import { useMemo, useState, useCallback, type CSSProperties, type ReactNode } from 'react'
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
  type WatchlistData, type SignalData, type StockResearch, type StockQuote, type ThemeMap, type BreakoutMap,
  type ResearchItem, type ResearchGroup,
  buildSignalMap, buildThesisMap, watchlistTickerSet, buildWatchlistItems, buildResearchItems,
  orderParents, SIGNAL_LABEL, fmtQuote, tierLabel,
} from '../_lib/research'
import { fmtPct } from '../_lib/holdings'
import { ResearchDetailDialog } from './research-detail-dialog'

interface Props {
  watchlistData: WatchlistData | null
  signalData: SignalData[]
  stockQuotes: Record<string, StockQuote>
  stockResearch: StockResearch[]
  stockThemes?: ThemeMap
  breakoutMap?: BreakoutMap
  /** 워치리스트 담기·제외·핀 뒤에 데이터를 다시 받는다. */
  onDataChanged?: () => void
  /** 섹션 머리 우측 보조 컨트롤 — 인쇄 버튼 등. */
  headTools?: ReactNode
  style?: CSSProperties
}

const MODE_KEY = 'invest-research-mode'
function getStoredMode(): ResearchGroup {
  if (typeof window === 'undefined') return 'watchlist'
  return localStorage.getItem(MODE_KEY) === 'research' ? 'research' : 'watchlist'
}
const PAGE_SIZE_KEY = 'invest-research-page-size'
const DEFAULT_PAGE_SIZE = 25
function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

// 앞 일곱 열은 두 모드가 같고, 여덟째만 갈린다: 워치리스트는 모니터, 리서치는 등급.
const COMMON: LColumn<ResearchItem>[] = [
  { key: 'sub',    label: '분류',   width: '100px', sortValue: r => r.sub ?? r.parent },
  { key: 'name',   label: '종목',   width: 'minmax(140px,1fr)', sortValue: r => r.name },
  { key: 'cap',    label: '시총',   width: '76px',  align: 'right', hideMobile: true, sortValue: r => r.marketCapLabel ?? '' },
  { key: 'price',  label: '현재가', width: '92px',  align: 'right', hideMobile: true, sortValue: r => r.price ?? null },
  { key: 'r1m',    label: '1M',     width: '64px',  align: 'right', sortValue: r => r.return1m ?? null, sortFirst: 'desc' },
  { key: 'signal', label: '신호',   width: '92px',  hideMobile: true, sortValue: r => (r.breakout ? 2 : 0) + (r.signal === 'new_high' ? 1 : 0) },
  { key: 'm',      label: 'M',      width: '48px',  align: 'right', sortValue: r => r.momentumScore ?? null, sortFirst: 'desc' },
]
const COLUMNS: Record<ResearchGroup, LColumn<ResearchItem>[]> = {
  watchlist: [...COMMON,
    { key: 'monitor', label: '모니터', width: '84px', sortValue: r => r.pinned ? (r.monitor?.stage ?? 0) : -1, sortFirst: 'desc' },
    { key: 'chevron', label: '', width: '14px' },
  ],
  research: [...COMMON,
    { key: 'tier', label: '등급', width: '84px', sortValue: r => r.compositeScore ?? null, sortFirst: 'desc' },
    { key: 'chevron', label: '', width: '14px' },
  ],
}

const cellTone = (v: number | null | undefined): 'pos' | 'neg' | 'muted' => v == null ? 'muted' : v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'

export function ResearchTableBlock({
  watchlistData, signalData, stockQuotes, stockResearch, stockThemes = {}, breakoutMap = {},
  onDataChanged, headTools, style,
}: Props) {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<ResearchGroup>(getStoredMode)
  const [parentFilter, setParentFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState<number>(getStoredPageSize)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<ResearchItem | null>(null)
  const [busy, setBusy] = useState(false)

  const signalMap = useMemo(() => buildSignalMap(signalData, stockQuotes), [signalData, stockQuotes])
  const thesisMap = useMemo(() => buildThesisMap(stockResearch), [stockResearch])
  const watchlistTickers = useMemo(() => watchlistTickerSet(watchlistData), [watchlistData])
  const watchlistItems = useMemo(() => buildWatchlistItems({ watchlistData, signalMap, quotes: stockQuotes, thesisMap, breakoutMap, themes: stockThemes }),
    [watchlistData, signalMap, stockQuotes, thesisMap, breakoutMap, stockThemes])
  const researchItems = useMemo(() => buildResearchItems({ research: stockResearch, signalMap, quotes: stockQuotes, watchlistTickers, breakoutMap, themes: stockThemes }),
    [stockResearch, signalMap, stockQuotes, watchlistTickers, breakoutMap, stockThemes])
  const items = mode === 'watchlist' ? watchlistItems : researchItems

  const parentOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const it of items) counts.set(it.parent, (counts.get(it.parent) ?? 0) + 1)
    return [{ value: 'all', label: '전체' }, ...orderParents(counts.keys()).map(p => ({ value: p, label: p }))]
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(it =>
      (parentFilter === 'all' || it.parent === parentFilter)
      && (!q || it.name.toLowerCase().includes(q) || it.ticker.toLowerCase().includes(q)
        || it.sector.toLowerCase().includes(q) || (it.sub ?? '').toLowerCase().includes(q) || it.parent.toLowerCase().includes(q)))
  }, [items, parentFilter, search])

  const columns = COLUMNS[mode]
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<ResearchItem>(`invest-research:${mode}`, columns)
  const sorted = useMemo(() => sortApply(filtered), [sortApply, filtered])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyMode = useCallback((m: ResearchGroup) => {
    setMode(m); setParentFilter('all'); setPage(0)
    localStorage.setItem(MODE_KEY, m)
  }, [])
  const applyPageSize = useCallback((n: number) => {
    setPageSize(n); setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }, [])

  /* ── 액션: 칸반의 드래그·핀·삭제와 같은 API 를 부른다 ── */
  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await fetch('/api/willow-mgmt/watchlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setSelected(null)
      onDataChanged?.()
    } finally { setBusy(false) }
  }, [onDataChanged])
  const onRemove = useCallback((it: ResearchItem) => post({ action: 'remove', name: it.name, fromGroup: 'watchlist' }), [post])
  const onTogglePin = useCallback((it: ResearchItem) => post({
    action: 'pin', name: it.name, fromGroup: 'watchlist',
    monitorDate: new Date().toISOString().slice(0, 10), monitorPrice: it.price,
  }), [post])
  const onAddToWatchlist = useCallback((it: ResearchItem) => post({
    action: 'add', name: it.name, ticker: it.ticker, sector: it.sector, axis: it.axis, toGroup: 'watchlist',
  }), [post])
  const onDropResearch = useCallback(async (it: ResearchItem) => {
    if (!it.researchId) return
    setBusy(true)
    try {
      await fetch(`/api/willow-mgmt/stock-research?id=${encodeURIComponent(it.researchId)}`, { method: 'DELETE' })
      setSelected(null)
      onDataChanged?.()
    } finally { setBusy(false) }
  }, [onDataChanged])

  // 지표 — 모드별로 셋. 값은 검정, 뜻은 라벨이 말한다.
  const stats = mode === 'watchlist'
    ? [
      { label: '워치리스트', value: String(watchlistItems.length), sub: `${parentOptions.length - 1}개 분류` },
      { label: '돌파', value: String(watchlistItems.filter(i => i.breakout).length), sub: '직전 20일 고가 상향' },
      { label: '핀 · 모니터', value: String(watchlistItems.filter(i => i.pinned).length), sub: '핀 시점 대비 단계 추적' },
    ]
    : [
      { label: '리서치', value: String(researchItems.length), sub: `${parentOptions.length - 1}개 분류 · 워치리스트 제외` },
      { label: 'Tier 1', value: String(researchItems.filter(i => i.verdict === 'pass_tier1').length), sub: '밸류체인 1등급' },
      { label: '돌파', value: String(researchItems.filter(i => i.breakout).length), sub: '직전 20일 고가 상향' },
    ]

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="종목관리"
            tools={
              <LSegmented
                value={mode}
                onChange={applyMode}
                options={[
                  { value: 'watchlist', label: `워치리스트 ${watchlistItems.length}` },
                  { value: 'research', label: `리서치 ${researchItems.length}` },
                ]}
              />
            }
            action={headTools}
            toolsInline
            mb={0}
          />
        </div>
        <StatRows cols={mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))'}>
          {stats.map(s => <LStat key={s.label} label={s.label} value={s.value} sub={s.sub} />)}
        </StatRows>
      </div>

      {/* 분류 칩 + 검색 — 매출관리와 같은 줄 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap',
        padding: `0 ${t.density.cardPad}px ${t.density.kpiGap}px`,
      }}>
        <LFilterChip options={parentOptions} value={parentFilter} onChange={v => { setParentFilter(v); setPage(0) }} gap={t.density.gapXs} />
        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 160 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="종목명 · 티커 · 섹터 · 분류 검색"
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

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={columns} mobile={mobile}>
          <LTableHead columns={columns} mobile={mobile} sort={sort} onSort={toggleSort} />
          {paged.length === 0 && <LTableEmpty>{search ? '검색 결과가 없습니다' : mode === 'watchlist' ? '워치리스트가 비어 있습니다' : '리서치 통과 종목이 없습니다'}</LTableEmpty>}
          <LTableBody columns={columns} mobile={mobile}>
            {paged.map(it => {
              const signals: string[] = []
              if (it.breakout) signals.push(`돌파${it.breakoutGap != null ? ` ${fmtPct(it.breakoutGap)}` : ''}`)
              if (it.signal) signals.push(SIGNAL_LABEL[it.signal])
              return (
                <LTableRow key={`${it.group}-${it.ticker}`} columns={columns} mobile={mobile} onClick={() => setSelected(it)}>
                  <LTableBadge tone={tonePalettes.neutral}>{it.sub ?? it.parent}</LTableBadge>
                  <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${it.name} ${it.ticker}`}>
                    <span style={{ fontWeight: t.weight.medium }}>{it.name}</span>
                    <span style={{ color: t.neutrals.muted, marginLeft: t.density.gapXs, fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>
                      {it.ticker.replace('.KS', '')}
                    </span>
                  </span>
                  {!mobile && <LTableMono align="right" tone="muted">{it.marketCapLabel ?? '-'}</LTableMono>}
                  {!mobile && <LTableMono align="right">{fmtQuote(it.price, it.currency)}</LTableMono>}
                  <LTableMono align="right" strong tone={cellTone(it.return1m)}>{it.return1m != null ? fmtPct(it.return1m) : '-'}</LTableMono>
                  {!mobile && (
                    <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: signals.length ? t.neutrals.text : t.neutrals.subtle }}>
                      {signals.length ? signals.join(' · ') : '-'}
                    </span>
                  )}
                  <LTableMono align="right" tone="muted">{it.momentumScore != null ? String(it.momentumScore) : '-'}</LTableMono>
                  {mode === 'watchlist' ? (
                    <span style={{ display: 'flex', minWidth: 0 }}>
                      {it.pinned
                        ? <LTableBadge tone={tonePalettes.neutral}>{it.monitor ? `M${it.monitor.stage} ${fmtPct(it.monitor.changePct)}` : '핀'}</LTableBadge>
                        : <span style={{ color: t.neutrals.subtle }}>-</span>}
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs, minWidth: 0 }}>
                      <LTableBadge tone={tonePalettes.neutral}>{tierLabel(it.verdict)}</LTableBadge>
                      {it.compositeScore != null && <span style={{ color: t.neutrals.subtle, fontFamily: t.font.mono, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>{it.compositeScore}</span>}
                    </span>
                  )}
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
            {sorted.length !== items.length ? `${sorted.length}/${items.length}종목` : `${items.length}종목`}
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

      <ResearchDetailDialog
        item={selected}
        busy={busy}
        onClose={() => setSelected(null)}
        onRemove={onRemove}
        onTogglePin={onTogglePin}
        onAddToWatchlist={onAddToWatchlist}
        onDropResearch={onDropResearch}
      />
    </LCard>
  )
}
