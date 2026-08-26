'use client'

import { useMemo, useState } from 'react'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LTableBadge, LTableBody, LTableEmpty, LTableHead, LTableRow, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import type { FinanceTaxObligation, TaxObligationSource } from '@/types/finance-tax'

type SourceFilter = 'all' | TaxObligationSource

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

const STATUS_LABELS = { unpaid: '미납', paid: '납부완료', overdue: '연체', cancelled: '취소' }

// Notices are filed under the year they fall due; the taxable period stands in
// when a notice carries no due date.
function obligationYear(item: FinanceTaxObligation): string | null {
  return item.due_date?.slice(0, 4) ?? item.period_label?.slice(0, 4) ?? null
}

export function TaxManagementBlock({ obligations }: { obligations: FinanceTaxObligation[] }) {
  const mobile = useIsMobile()
  const [source, setSource] = useState<SourceFilter>('all')
  const [year, setYear] = useState(new Date().getFullYear())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(storedPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(() => String(storedPageSize()))

  const yearScoped = useMemo(
    () => obligations.filter(item => obligationYear(item) === String(year)),
    [obligations, year],
  )

  const rows = useMemo(
    () => yearScoped
      .filter(item => source === 'all' || item.source === source)
      .sort((a, b) => (b.due_date || '').localeCompare(a.due_date || '')),
    [yearScoped, source],
  )

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  // A reload can shrink the list under the page being viewed; clamping keeps the
  // table from rendering blank until the next click.
  const safePage = Math.min(page, totalPages - 1)
  const paged = rows.slice(safePage * pageSize, (safePage + 1) * pageSize)

  const commitPageSize = () => {
    const next = Math.max(1, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(next))
    setPageSize(next)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(next))
  }

  const handleSourceChange = (next: SourceFilter) => {
    setSource(next)
    setPage(0)
  }

  // The three figures split the ledger rather than overlap: an overdue notice is
  // counted under 연체 only, so 미납 + 연체 is what still has to be paid.
  const unpaid = yearScoped.filter(item => item.status === 'unpaid')
  const overdue = yearScoped.filter(item => item.status === 'overdue')
  const paid = yearScoped.filter(item => item.status === 'paid')

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead
          eyebrow="TAX & INSURANCE"
          title="세금관리"
          meta="은행 출금 자동 매칭"
          tools={
            <LSegmented
              value={source}
              onChange={handleSourceChange}
              options={[
                { value: 'all', label: '전체' },
                { value: 'hometax', label: '홈택스' },
                { value: 'wetax', label: '위택스' },
                { value: 'nhis', label: '4대보험' },
              ]}
            />
          }
        />
        {/* Year navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
        }}>
          <button onClick={() => { setYear(current => current - 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{ fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans, minWidth: 60, textAlign: 'center' }}>
            {year}년
          </span>
          <button onClick={() => { setYear(current => current + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: t.density.kpiGap }}>
          <LStat label="미납" value={`${unpaid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={unpaid.length ? 'warn' : 'default'} sub={`${unpaid.length.toLocaleString()}건`} />
          <LStat label="연체" value={`${overdue.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone={overdue.length ? 'neg' : 'default'} sub={`${overdue.length.toLocaleString()}건`} />
          <LStat label="납부완료" value={`${paid.reduce((sum, item) => sum + item.amount, 0).toLocaleString()}원`} tone="pos" sub={`${paid.length.toLocaleString()}건`} />
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
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
                <span style={{ color: t.neutrals.muted }}>{SOURCES[item.source]}</span>
                <span style={{ color: t.neutrals.muted, fontFamily: t.font.mono, whiteSpace: 'nowrap' }}>{item.due_date || '-'}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={`${item.agency} · ${item.title}`}>
                  {item.title}
                </span>
                <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {item.amount.toLocaleString()}
                </span>
              </LTableRow>
            )
          })}
        </LTableBody>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px', borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={pageSizeInput}
            onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPageSize}
            onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
            style={{
              width: 32, textAlign: 'center', border: 'none',
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
                cursor: safePage === 0 ? 'default' : 'pointer',
                color: safePage === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: safePage === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, rows.length)} / {rows.length}
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
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
