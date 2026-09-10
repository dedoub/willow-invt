'use client'

import { useMemo, useState } from 'react'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LTableScroll, LTableBadge, LTableBody, LTableDate, LTableEmpty, LTableHead, LTableNumber, LTableRow, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import type { FinanceTaxObligation, TaxObligationSource, TaxObligationStatus } from '@/types/finance-tax'

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
  { key: 'due', label: '납부기한', width: '92px' },
  { key: 'title', label: '고지내역', width: 'minmax(130px,1fr)' },
  { key: 'amount', label: '금액', width: 'minmax(80px,110px)', align: 'right' },
]

const STATUS_LABELS = { unpaid: '납부예정', paid: '납부완료', overdue: '연체', cancelled: '취소' }

// Notices are filed under the year they fall due; the taxable period stands in
// when a notice carries no due date.
function obligationYear(item: FinanceTaxObligation): string | null {
  return item.due_date?.slice(0, 4) ?? item.period_label?.slice(0, 4) ?? null
}

export function TaxManagementBlock({ obligations }: { obligations: FinanceTaxObligation[] }) {
  const mobile = useIsMobile()
  const [source, setSource] = useState<SourceFilter>('all')
  const [year, setYear] = useState(new Date().getFullYear())
  const [status, setStatus] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(storedPageSize)

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
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadX }}>
        <LSectionHead
          eyebrow="TAX & INSURANCE"
          title="세금관리"
          tools={
            <LSegmented
              value={source}
              onChange={handleSourceChange}
              options={SOURCE_FILTERS}
            />
          }
        />
        {/* Year navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: t.density.kpiGap, marginBottom: t.density.gapMd,
        }}>
          <button onClick={() => { setYear(current => current - 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium, fontFamily: t.font.sans, minWidth: 60, textAlign: 'center' }}>
            {year}년
          </span>
          <button onClick={() => { setYear(current => current + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: t.density.kpiGap }}>
          <LStat label="납부예정" value={`${unpaid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={unpaid.length ? 'warn' : 'default'} sub={`${unpaid.length.toLocaleString()}건`} />
          <LStat label="납부완료" value={`${paid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone="pos" sub={`${paid.length.toLocaleString()}건`} />
          <LStat label="연체" value={`${overdue.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={overdue.length ? 'neg' : 'default'} sub={`${overdue.length.toLocaleString()}건`} />
        </div>

        {/* Status filter — 현금관리·매출관리와 같은 자리에서 같은 모양으로 고른다. */}
        <div style={{ marginTop: t.density.blockGap }}>
          <LFilterChip options={STATUS_FILTERS} value={status} onChange={v => { setStatus(v); setPage(0) }} />
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginTop: t.density.gapMd }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="세목 · 기관 · 전자납부번호 검색"
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

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapXs}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} />
        {rows.length === 0 && <LTableEmpty>{year}년에 수집된 세금·4대보험 고지가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
          {paged.map(item => {
            const tone = item.status === 'paid'
              ? tonePalettes.done
              : item.status === 'overdue'
                ? tonePalettes.danger
                : item.status === 'cancelled'
                  ? tonePalettes.neutral
                  : tonePalettes.pending
            return (
              <LTableRow key={item.id} columns={COLUMNS} mobile={mobile}>
                <LTableBadge tone={tone}>{STATUS_LABELS[item.status]}</LTableBadge>
                <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{SOURCES[item.source]}</span>
                <LTableDate value={item.due_date} />
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
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}`,
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
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
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
    </LCard>
  )
}
