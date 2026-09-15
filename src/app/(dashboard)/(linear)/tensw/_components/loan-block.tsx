'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { RowDetailDialog } from './row-detail-dialog'
import { LTableHead, LTableScroll, LTableRow, LTableBody, LTableEmpty, LTableBadge, LTableDate, LTableMono, LTableNumber, useTableSort, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { TenswLoan } from '@/types/tensw-mgmt'

interface LoanBlockProps {
  loans: TenswLoan[]
  onEdit: (loan: TenswLoan) => void
  onDelete: (id: string) => Promise<void>
  style?: React.CSSProperties
}

type StatusFilter = 'all' | 'active' | 'pending' | 'closed'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '실행중' },
  { value: 'pending', label: '대기' },
  { value: 'closed', label: '상환완료' },
]

/** 월간 예상 이자 — 원금 × 이율 ÷ 12. 상환 스케줄이 아니라 잔액 기준 어림값이다. */
function monthlyInterest(loan: TenswLoan): number | null {
  if (loan.interest_rate == null || !loan.principal) return null
  return Math.round((loan.principal * loan.interest_rate) / 100 / 12)
}

const COLUMNS: LColumn<TenswLoan>[] = [
  { key: 'status', label: '상태', width: '60px', sortValue: l => l.status },
  { key: 'bank', label: '금융기관', width: 'minmax(100px,1fr)', sortValue: l => l.bank },
  { key: 'loanDate', label: '실행일', width: '70px', sortValue: l => l.loan_date ?? null, sortFirst: 'desc' },
  { key: 'maturity', label: '만기일', width: '70px', sortValue: l => l.maturity_date ?? null, sortFirst: 'desc' },
  { key: 'rate', label: '이율', width: '52px', align: 'right', sortValue: l => l.interest_rate ?? null, sortFirst: 'desc' },
  { key: 'monthly', label: '월 이자', width: 'minmax(84px,90px)', align: 'right', sortValue: l => monthlyInterest(l), sortFirst: 'desc' },
  { key: 'principal', label: '원금', width: 'minmax(100px,120px)', align: 'right', sortValue: l => l.principal, sortFirst: 'desc' },
  { key: 'chevron', label: '', width: '14px' },
]

const STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  active:  tonePalettes.info,
  pending: tonePalettes.pending,
  closed:  tonePalettes.neutral,
}

const STATUS_LABELS: Record<string, string> = {
  active: '실행중', pending: '대기', closed: '상환완료',
}

const REPAYMENT_LABELS: Record<string, string> = {
  bullet: '만기일시상환',
  amortizing: '원리금균등',
  principal_equal: '원금균등',
  custom: '기타',
}

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'tensw-loan-page-size'

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

function daysToMaturity(maturityDate: string | null): number | null {
  if (!maturityDate) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const maturity = new Date(maturityDate)
  const diff = maturity.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function LoanBlock({ loans, onEdit, style }: LoanBlockProps) {
  const mobile = useIsMobile()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<TenswLoan>('tensw-loan', COLUMNS)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  // 행을 누르면 상세 모달. 표 안에서 펼치면 아래 행이 통째로 밀린다(CEO 2026-09-15).
  const [selected, setSelected] = useState<TenswLoan | null>(null)

  // Summary KPIs (active loans only)
  const activeLoans = useMemo(() => loans.filter(l => l.status === 'active'), [loans])
  const totalPrincipal = useMemo(() => activeLoans.reduce((s, l) => s + l.principal, 0), [activeLoans])
  const totalMonthlyInterest = useMemo(
    () => activeLoans.reduce((s, l) => s + (l.monthly_interest_avg || 0), 0),
    [activeLoans],
  )
  const avgRate = useMemo(() => {
    const withRate = activeLoans.filter(l => l.interest_rate != null)
    if (withRate.length === 0) return 0
    const totalWeight = withRate.reduce((s, l) => s + l.principal, 0)
    if (totalWeight === 0) return 0
    return withRate.reduce((s, l) => s + (l.interest_rate || 0) * l.principal, 0) / totalWeight
  }, [activeLoans])

  const filtered = useMemo(() => {
    const list = statusFilter === 'all' ? loans : loans.filter(l => l.status === statusFilter)
    return [...list].sort((a, b) => b.principal - a.principal)
  }, [loans, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const sorted = useMemo(() => sortApply(filtered), [filtered, sortApply])
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleFilterChange = (key: StatusFilter) => {
    setStatusFilter(key)
    setPage(0)
  }

  return (
    <LCard pad={0} style={style}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead title="차입금관리" mb={0} />
        </div>

        {/* 지표 — 배경 박스를 벗고 라벨 위·값 아래에 행 구분선만 */}
        {(() => {
          const figures: FigureItem[] = [
            { label: '총 원금', value: `${totalPrincipal.toLocaleString()}원`, mono: true },
            { label: '평균 이율', value: avgRate > 0 ? `${avgRate.toFixed(2)}%` : '-', mono: true },
            { label: '월 이자', value: totalMonthlyInterest > 0 ? `${totalMonthlyInterest.toLocaleString()}원` : '-', mono: true },
            { label: '연 이자', value: totalMonthlyInterest > 0 ? `${(totalMonthlyInterest * 12).toLocaleString()}원` : '-', mono: true },
          ]
          return <FigureGrid items={figures} cols={mobile ? 2 : 4} />
        })()}
        <div style={{ height: t.density.blockGap }} />

        {/* Status filter chips */}
        <LFilterChip
          options={STATUS_FILTERS.map(f => ({ ...f, tone: f.value !== 'all' ? STATUS_TONES[f.value] : undefined }))}
          value={statusFilter}
          onChange={handleFilterChange}
          gap={t.density.gapSm}
        />
      </div>

      {/* Loan rows */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapXs}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>차입금 데이터가 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
        {paged.map((loan) => {
          const statusTone = STATUS_TONES[loan.status] ?? tonePalettes.neutral
          const maturityDays = daysToMaturity(loan.maturity_date)
          const maturityWarning = maturityDays != null && maturityDays >= 0 && maturityDays <= 90
          return (
            <LTableRow key={loan.id} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(loan)}>
              <LTableBadge tone={statusTone}>{STATUS_LABELS[loan.status] ?? loan.status}</LTableBadge>
              <span style={{ fontWeight: t.weight.medium, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {loan.bank}
                {maturityWarning && (
                  <LBadge tone="danger" pill style={{ marginLeft: t.density.gapSm, fontFamily: t.font.mono }}>
                    D-{maturityDays}
                  </LBadge>
                )}
              </span>
              <LTableDate value={loan.loan_date} format="ymd" />
              <LTableDate value={loan.maturity_date} format="ymd" tone={maturityWarning ? 'neg' : 'muted'} />
              <LTableMono align="right">
                {loan.interest_rate != null ? `${loan.interest_rate}%` : '-'}
              </LTableMono>
              <LTableMono align="right" tone="text">
                {monthlyInterest(loan)?.toLocaleString() ?? '-'}
              </LTableMono>
              <LTableNumber value={loan.principal} />
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
                background: 'transparent', border: 'none',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
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
          items={detailItems(selected)}
          extra={selected.attachments?.length ? (
            <div style={{
              paddingTop: t.density.panelPadY, borderTop: `1px solid ${t.neutrals.line}`,
              display: 'flex', flexDirection: 'column', gap: t.density.gapXs,
            }}>
              {selected.attachments.map((att, i) => (
                <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: t.density.gapSm,
                  fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
                  color: t.brand[700], textDecoration: 'none',
                }}>
                  <LIcon name="file" size={11} stroke={1.8} />
                  {att.name}
                </a>
              ))}
            </div>
          ) : undefined}
          onEdit={() => { const loan = selected; setSelected(null); onEdit(loan) }}
          onClose={() => setSelected(null)}
        />
      )}
    </LCard>
  )
}

/** 상세 모달에 실을 항목. 표의 열 순서로 읽히게 둔다. */
function detailItems(loan: TenswLoan): FigureItem[] {
  const items: FigureItem[] = [
    { label: '은행', value: loan.bank, wrap: true },
    { label: '대출유형', value: loan.loan_type },
    { label: '계좌번호', value: loan.account_number, mono: true },
    { label: '원금', value: `${loan.principal.toLocaleString()}원`, mono: true },
    { label: '이자율', value: loan.interest_rate != null ? `${loan.interest_rate}%` : '-', mono: true },
    { label: '월평균 이자', value: loan.monthly_interest_avg != null ? `${loan.monthly_interest_avg.toLocaleString()}원` : '-', mono: true },
    { label: '대출일', value: loan.loan_date || '-', mono: true },
    { label: '만기일', value: loan.maturity_date || '-', mono: true },
    { label: '상환방식', value: REPAYMENT_LABELS[loan.repayment_type] || loan.repayment_type || '-' },
    { label: '이자납입일', value: loan.interest_payment_day != null ? `매월 ${loan.interest_payment_day}일` : '-' },
  ]
  if (loan.last_extension_date) items.push({ label: '최근 연장일', value: loan.last_extension_date, mono: true })
  if (loan.next_interest_date) items.push({ label: '다음 이자일', value: loan.next_interest_date, mono: true })
  if (loan.memo) items.push({ label: '메모', value: loan.memo, prose: true, span: 2 })
  return items
}
