'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { RowDetailDialog, DetailList } from './row-detail-dialog'
import { LTableHead, LTableScroll, LTableRow, LTableBody, LTableEmpty, LTableBadge, LTableDate, LTableNumber, useTableSort, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { TenswTaxInvoice } from '@/types/tensw-mgmt'

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'tensw-sales-page-size'

// 매출과 매입은 같은 테이블(invoice_type)에 있고 화면만 탭으로 갈린다.
// 상태값(payment_status)도 공유하되 읽히는 말이 달라 라벨만 다르게 붙인다.
//   매출: planned 계약예정 → scheduled 발행예정 → pending 계산서발행 → paid 수금완료
//   매입: pending 계산서수취 → paid 지급완료 (매입에는 계약 단계가 없다)
type Mode = 'sales' | 'purchase'
type StatusFilter = 'all' | 'scheduled' | 'planned' | 'pending' | 'paid'

const FILTERS: Record<Mode, { value: StatusFilter; label: string }[]> = {
  sales: [
    { value: 'all', label: '전체' },
    { value: 'planned', label: '계약예정' },
    { value: 'scheduled', label: '발행예정' },
    { value: 'pending', label: '계산서발행' },
    { value: 'paid', label: '수금완료' },
  ],
  purchase: [
    { value: 'all', label: '전체' },
    { value: 'pending', label: '계산서수취' },
    { value: 'paid', label: '지급완료' },
  ],
}

const COLUMNS: LColumn<TenswTaxInvoice>[] = [
  { key: 'status', label: '상태', width: '68px', sortValue: inv => inv.payment_status },
  { key: 'date', label: '발행일', width: '46px', sortValue: inv => inv.issue_date, sortFirst: 'desc' },
  { key: 'counterparty', label: '거래처', width: 'minmax(110px,1fr)', sortValue: inv => inv.counterparty },
  { key: 'detail', label: '상세', width: 'minmax(130px,1.2fr)', hideMobile: true, sortValue: inv => inv.notes ?? '' },
  { key: 'amount', label: '합계', width: 'minmax(100px,110px)', align: 'right', sortValue: inv => inv.total_amount, sortFirst: 'desc' },
  { key: 'chevron', label: '', width: '14px' },
]

const STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  planned:   tonePalettes.neutral,
  scheduled: tonePalettes.info,
  pending:   tonePalettes.pending,
  paid:      tonePalettes.done,
}

const LABELS: Record<Mode, Record<string, string>> = {
  sales:    { planned: '계약예정', scheduled: '발행예정', pending: '계산서발행', paid: '수금완료' },
  purchase: { pending: '계산서수취', paid: '지급완료' },
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SalesBlockProps {
  invoices: TenswTaxInvoice[]
  onEdit: (inv: TenswTaxInvoice) => void
  onDelete: (id: string) => Promise<void>
  style?: React.CSSProperties
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesBlock({ invoices, onEdit, style }: SalesBlockProps) {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('sales')
  const [year, setYear] = useState(new Date().getFullYear())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  // 행을 누르면 상세 모달. 표 안에서 펼치면 아래 행이 통째로 밀린다(CEO 2026-09-15).
  const [selected, setSelected] = useState<TenswTaxInvoice | null>(null)
  const [search, setSearch] = useState('')
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<TenswTaxInvoice>('tensw-sales', COLUMNS)

  const statusFilters = FILTERS[mode]
  const statusLabels = LABELS[mode]

  // 매출/매입 분리. invoice_type이 비어 있는 과거 행은 매출로 본다.
  const scoped = useMemo(
    () => invoices.filter(inv => (inv.invoice_type === 'purchase' ? 'purchase' : 'sales') === mode),
    [invoices, mode]
  )

  // Filter by year
  const yearFiltered = useMemo(() => {
    return scoped.filter(inv => inv.issue_date?.startsWith(String(year)))
  }, [scoped, year])

  // Filter by payment_status + 검색(거래처·품목·메모)
  const filtered = useMemo(() => {
    let rows = yearFiltered
    if (statusFilter !== 'all') rows = rows.filter(inv => inv.payment_status === statusFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(inv => {
        const items = (inv.items ?? []).map(it => it.description ?? '').join(' ')
        return `${inv.counterparty} ${items} ${inv.notes ?? ''}`.toLowerCase().includes(q)
      })
    }
    return rows
  }, [yearFiltered, statusFilter, search])

  // 헤더 정렬이 걸리면 그게 우선, 없으면 기본은 최신 발행일순.
  const sorted = useMemo(() => {
    const base = [...filtered].sort((a, b) => b.issue_date.localeCompare(a.issue_date))
    return sortApply(base)
  }, [filtered, sortApply])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f)
    setPage(0)
  }

  const handleModeChange = (m: Mode) => {
    setMode(m)
    setStatusFilter('all')
    setPage(0)
    setSelected(null)
  }

  // Summary stats (부가세 포함 = total_amount 기준). 부분수금(paid_amount)을 반영해
  // 수금완료 = 완납 총액 + 미완납 건의 수금액, 미수금 = 미완납 건의 잔액(총액 − 수금액).
  // 매입도 같은 계산을 쓰되 지급완료/미지급으로 읽는다.
  const paidTotal =
    yearFiltered.filter(i => i.payment_status === 'paid').reduce((s, i) => s + i.total_amount, 0) +
    yearFiltered.filter(i => i.payment_status === 'pending').reduce((s, i) => s + (i.paid_amount || 0), 0)
  const pendingTotal = yearFiltered.filter(i => i.payment_status === 'pending').reduce((s, i) => s + (i.total_amount - (i.paid_amount || 0)), 0)
  const scheduledTotal = yearFiltered.filter(i => i.payment_status === 'scheduled').reduce((s, i) => s + i.total_amount, 0)
  const plannedTotal = yearFiltered.filter(i => i.payment_status === 'planned').reduce((s, i) => s + i.total_amount, 0)

  return (
    <LCard pad={0} style={style}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead
          eyebrow="TAX INVOICES"
          title={mode === 'purchase' ? '매입관리' : '매출관리'}
          tools={
            <LSegmented
              value={mode}
              onChange={handleModeChange}
              options={[
                { value: 'sales', label: '매출' },
                { value: 'purchase', label: '매입' },
              ]}
            />
          }
        />

        {/* 연도 — 카드 전체에 걸리는 조건이라 지표 위 가운데에 둔다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, padding: `${t.density.panelPadX}px 0`,
        }}>
          <button onClick={() => { setYear(y => y - 1); setPage(0) }} style={{
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
          <button onClick={() => { setYear(y => y + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* 지표 — 배경 박스를 벗고 라벨 위·값 아래에 행 구분선만 */}
        {(() => {
          const cols = mode === 'purchase' ? 2 : (mobile ? 2 : 4)
          const figures: FigureItem[] = mode === 'sales'
            ? [
              { label: '수금완료', value: `${paidTotal.toLocaleString()}원`, mono: true },
              { label: '미수금', value: `${pendingTotal.toLocaleString()}원`, mono: true, tone: pendingTotal > 0 ? 'neg' : undefined },
              { label: '계약예정', value: `${plannedTotal.toLocaleString()}원`, mono: true, title: '계약 미체결 가안·전망 매출' },
              { label: '발행예정', value: `${scheduledTotal.toLocaleString()}원`, mono: true, title: '계약이 체결돼 계산서 발행만 남은 매출' },
            ]
            : [
              { label: '지급완료', value: `${paidTotal.toLocaleString()}원`, mono: true },
              { label: '미지급', value: `${pendingTotal.toLocaleString()}원`, mono: true, tone: pendingTotal > 0 ? 'neg' : undefined, title: '계산서는 받았으나 아직 지급하지 않은 금액' },
            ]
          return <FigureGrid items={figures} cols={cols} />
        })()}

        {/* 상태 칩 — 표 바로 위 한 줄 */}
        <div style={{ marginTop: t.density.blockGap }}>
          <LFilterChip options={statusFilters} value={statusFilter} onChange={handleFilterChange} gap={t.density.gapXs} />
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginTop: t.density.gapMd }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="거래처 · 품목 · 메모 검색"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px 7px 30px', fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.inner, border: 'none',
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
      </div>

      {/* Invoice rows */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapXs}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>해당 연도 세금계산서가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
        {paged.map(inv => {
          const tone = STATUS_TONES[inv.payment_status] ?? tonePalettes.neutral
          return (
            <LTableRow key={inv.id} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(inv)}>
              <LTableBadge tone={tone}>{statusLabels[inv.payment_status] ?? inv.payment_status}</LTableBadge>
              <LTableDate value={inv.issue_date} />
              <span style={{ minWidth: 0, fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {inv.counterparty}
              </span>
              {!mobile && (
                <span style={{ minWidth: 0, color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {inv.notes ?? ''}
                </span>
              )}
              <LTableNumber value={inv.total_amount} />
              <span style={{ color: t.neutrals.subtle, display: 'flex' }}>
                <LIcon name="chevronRight" size={12} stroke={2} />
              </span>
            </LTableRow>
          )
        })}
        </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      {selected && (
        <RowDetailDialog
          items={detailItems(selected, mode, statusLabels)}
          extra={
            <DetailList
              title="품목"
              rows={(selected.items ?? []).map(item => ({
                left: item.description,
                right: item.quantity != null && item.unit_price != null
                  ? `${item.quantity} x ${item.unit_price.toLocaleString()} = ${item.supply_amount.toLocaleString()}원`
                  : `${(item.supply_amount ?? 0).toLocaleString()}원`,
              }))}
            />
          }
          onEdit={() => { const inv = selected; setSelected(null); onEdit(inv) }}
          onClose={() => setSelected(null)}
        />
      )}
    </LCard>
  )
}

/** 상세 모달에 실을 항목. 표의 열 순서로 읽히게 둔다 — 눈이 표에서 오던 순서 그대로다. */
function detailItems(
  inv: TenswTaxInvoice, mode: string, statusLabels: Record<string, string>,
): FigureItem[] {
  const items: FigureItem[] = [
    { label: '거래처', value: inv.counterparty, wrap: true },
    { label: '발행일', value: inv.issue_date, mono: true },
    { label: '사업자번호', value: inv.business_number || '-', mono: true },
    { label: '대표자', value: inv.representative || '-' },
    { label: '공급가액', value: `${inv.supply_amount.toLocaleString()}원`, mono: true },
    { label: '세액', value: `${inv.tax_amount.toLocaleString()}원`, mono: true },
    { label: '합계', value: `${inv.total_amount.toLocaleString()}원`, mono: true },
    { label: mode === 'purchase' ? '지급상태' : '수금상태', value: statusLabels[inv.payment_status] || inv.payment_status },
    { label: '입금예정일', value: inv.expected_payment_date || '-', mono: true },
  ]
  if (inv.paid_amount != null) {
    items.push({ label: '수금액', value: `${inv.paid_amount.toLocaleString()}원`, mono: true })
    if (inv.paid_amount < inv.total_amount) {
      items.push({ label: '미수잔액', value: `${(inv.total_amount - inv.paid_amount).toLocaleString()}원`, mono: true, tone: 'neg' })
    }
  }
  if (inv.bank_ref) items.push({ label: '은행참조', value: inv.bank_ref, mono: true })
  if (inv.notes) items.push({ label: '비고', value: inv.notes, prose: true, span: 2 })
  return items
}
