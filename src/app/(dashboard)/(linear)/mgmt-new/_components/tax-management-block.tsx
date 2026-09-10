'use client'

import { useMemo, useState } from 'react'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LTableScroll, LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableNumber, LTableRow, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import type { FinanceTaxObligation, TaxObligationSource, TaxObligationStatus } from '@/types/finance-tax'
import { FigureGrid, type FigureItem } from './figure-grid'
import { TaxDetailDialog } from './tax-detail-dialog'

type SourceFilter = 'all' | TaxObligationSource

type StatusFilter = 'all' | TaxObligationStatus

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'unpaid', label: '납부예정' },
  { value: 'paid', label: '납부완료' },
  { value: 'overdue', label: '연체' },
]

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'hometax', label: '홈택스' },
  { value: 'wetax', label: '위택스' },
  { value: 'nhis', label: '4대보험' },
]

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'finance-tax-page-size'

function storedPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const value = Number(localStorage.getItem(PAGE_SIZE_KEY))
  return value >= 1 && value <= 100 ? value : DEFAULT_PAGE_SIZE
}

const SOURCES: Record<TaxObligationSource, string> = {
  hometax: '홈택스',
  wetax: '위택스',
  nhis: '4대보험',
}

const COLUMNS: LColumn<FinanceTaxObligation>[] = [
  { key: 'status', label: '상태', width: '68px' },
  { key: 'source', label: '출처', width: '62px' },
  { key: 'due', label: '납부기한', width: '72px' },
  // 기한 옆에 실제 납부일을 둔다 — 언제까지였는지와 언제 나갔는지를 나란히 읽는다(CEO 2026-09-10)
  { key: 'paid', label: '납부일', width: '64px' },
  { key: 'title', label: '고지내역', width: 'minmax(130px,1fr)' },
  { key: 'amount', label: '금액', width: 'minmax(80px,110px)', align: 'right' },
]

const STATUS_LABELS = { unpaid: '납부예정', paid: '납부완료', overdue: '연체', cancelled: '취소' }

// 상태 칩은 색조 대신 회색 명도로 나눈다 — 연체가 가장 진하고 취소가 가장 옅다
// (2026-09-10 카드 문법: 단색은 유지하되 분간은 되게).
const STATUS_TONES: Record<TaxObligationStatus, { bg: string; fg: string }> = {
  overdue:   { bg: '#C7CCD3', fg: '#171B21' },
  unpaid:    { bg: '#E4E7EB', fg: '#2C323A' },
  paid:      { bg: '#EDEFF2', fg: '#3A4048' },
  cancelled: { bg: '#F5F6F8', fg: '#4B525A' },
}

// Notices are filed under the year they fall due; the taxable period stands in
// when a notice carries no due date.
function obligationYear(item: FinanceTaxObligation): string | null {
  return item.due_date?.slice(0, 4) ?? item.period_label?.slice(0, 4) ?? null
}

export function TaxManagementBlockNew({ obligations }: { obligations: FinanceTaxObligation[] }) {
  const mobile = useIsMobile()
  const [source, setSource] = useState<SourceFilter>('all')
  const [year, setYear] = useState(new Date().getFullYear())
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(storedPageSize)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<FinanceTaxObligation | null>(null)

  const yearScoped = useMemo(
    () => obligations.filter(item => obligationYear(item) === String(year)),
    [obligations, year],
  )

  const rows = useMemo(() => {
    let list = source === 'all' ? yearScoped : yearScoped.filter(item => item.source === source)
    if (status !== 'all') list = list.filter(item => item.status === status)
    const query = search.trim().toLowerCase()
    if (query) {
      list = list.filter(item =>
        `${item.title} ${item.agency} ${item.notice_number ?? ''} ${item.period_label ?? ''}`
          .toLowerCase().includes(query))
    }
    return [...list].sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
  }, [yearScoped, source, status, search])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  // A reload can shrink the list under the page being viewed; clamping keeps the
  // table from rendering blank until the next click.
  const safePage = Math.min(page, totalPages - 1)
  const paged = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleSourceChange = (next: SourceFilter) => {
    setSource(next)
    setPage(0)
  }

  // The three figures split the ledger rather than overlap: an overdue notice is
  // counted under 연체 only, so 납부예정 + 연체 is what still has to be paid.
  const unpaid = yearScoped.filter(item => item.status === 'unpaid')
  const overdue = yearScoped.filter(item => item.status === 'overdue')
  const paid = yearScoped.filter(item => item.status === 'paid')

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="세금관리"
            tools={
              <LSegmented
                value={source}
                onChange={handleSourceChange}
                options={SOURCE_FILTERS}
              />
            }
            toolsInline
            mb={0}
          />
        </div>

        {/* 연도 — 카드 전체에 걸리는 조건이라 지표 위 가운데에 둔다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, padding: `${t.density.panelPadX}px 0`,
        }}>
          <button onClick={() => { setYear(current => current - 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, minWidth: 104, textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            {year}년
          </span>
          <button onClick={() => { setYear(current => current + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* 지표 — 배경 박스를 벗고 라벨 위·값 아래에 행 구분선만.
             색은 부호가 뜻을 갖는 값에만 남긴다 — 여기서는 연체뿐이다. */}
        {(() => {
          const cols = mobile ? 2 : 3
          const figures: FigureItem[] = [
            { label: '납부예정', value: `${unpaid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`, mono: true, sub: `${unpaid.length.toLocaleString()}건` },
            { label: '납부완료', value: `${paid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`, mono: true, sub: `${paid.length.toLocaleString()}건` },
            { label: '연체', value: `${overdue.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`, mono: true, tone: overdue.length ? 'neg' : undefined, sub: `${overdue.length.toLocaleString()}건` },
          ]
          return <FigureGrid items={figures} cols={cols} />
        })()}

        {/* 상태 칩 · 검색 한 줄 — 검색에 들어가면 칩은 접혀 자리를 내준다 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          marginTop: t.density.blockGap, flexWrap: mobile ? 'wrap' : 'nowrap',
        }}>
          <div style={{
            maxWidth: searchOpen ? 0 : 520,
            opacity: searchOpen ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-width .26s ease, opacity .16s ease',
          }}>
            <LFilterChip options={STATUS_FILTERS} value={status} onChange={v => { setStatus(v); setPage(0) }} gap={t.density.gapXs} />
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 160 }}>
            <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
            </div>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!search) setSearchOpen(false) }}
              placeholder="세목 · 기관 · 전자납부번호 검색"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
                padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                fontFamily: t.font.sans, color: t.neutrals.text,
                background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                borderRadius: t.radius.sm, outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(0); setSearchOpen(false) }} style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={12} stroke={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} />
        {rows.length === 0 && <LTableEmpty>{year}년에 수집된 세금·4대보험 고지가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {paged.map(item => {
            return (
              <LTableRow key={item.id} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(item)}>
                <LTableBadge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status]}</LTableBadge>
                <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{SOURCES[item.source]}</span>
                <LTableDate value={item.due_date} />
                <LTableDate value={item.paid_at ? item.paid_at.slice(0, 10) : null} tone="muted" />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: t.weight.medium }} title={`${item.agency} · ${item.title}`}>
                  {item.title}
                </span>
                <LTableNumber value={item.amount} />
              </LTableRow>
            )
          })}
        </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
          <span style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>은행 출금 자동 매칭</span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage === 0 ? 'default' : 'pointer',
                color: safePage === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: safePage === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, rows.length)} / {rows.length}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: safePage >= totalPages - 1 ? 'default' : 'pointer',
                color: safePage >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      <TaxDetailDialog obligation={selected} onClose={() => setSelected(null)} />
    </LCard>
  )
}
