'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { TenswLoan } from '@/types/tensw-mgmt'

interface LoanBlockProps {
  loans: TenswLoan[]
  onAdd: () => void
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
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

function daysToMaturity(maturityDate: string | null): number | null {
  if (!maturityDate) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const maturity = new Date(maturityDate)
  const diff = maturity.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function LoanBlock({ loans, onAdd, onEdit, style }: LoanBlockProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
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
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="LOANS"
          title="차입금관리"
          action={
            <button
              onClick={onAdd}
              style={{
                width: 24, height: 24, borderRadius: t.radius.sm, border: 'none',
                background: t.neutrals.inner, color: t.neutrals.muted,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}
            >
              <LIcon name="plus" size={12} stroke={2.5} />
            </button>
          }
        />

        {/* Summary KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
          <LStat label="총 원금" value={`${totalPrincipal.toLocaleString()}원`} tone="info" />
          <LStat label="평균 이율" value={avgRate > 0 ? `${avgRate.toFixed(2)}%` : '-'} tone="default" />
          <LStat label="월 이자" value={totalMonthlyInterest > 0 ? `${totalMonthlyInterest.toLocaleString()}원` : '-'} tone="warn" />
          <LStat label="연 이자" value={totalMonthlyInterest > 0 ? `${(totalMonthlyInterest * 12).toLocaleString()}원` : '-'} tone="neg" />
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 5 }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.value
            const tone = f.value !== 'all' ? STATUS_TONES[f.value] : null
            return (
              <button
                key={f.value}
                onClick={() => handleFilterChange(f.value)}
                style={{
                  border: 'none', cursor: 'pointer',
                  padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
                  fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
                  background: active && tone ? tone.bg : active ? t.brand[100] : t.neutrals.inner,
                  color: active && tone ? tone.fg : active ? t.brand[700] : t.neutrals.muted,
                  transition: 'all .12s',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Loan rows */}
      <div style={{ padding: '0 0 4px' }}>
        {paged.length === 0 && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>
            차입금 데이터가 없습니다
          </div>
        )}
        {paged.map((loan) => {
          const statusTone = STATUS_TONES[loan.status] ?? tonePalettes.neutral
          const expanded = expandedId === loan.id
          const maturityDays = daysToMaturity(loan.maturity_date)
          const maturityWarning = maturityDays != null && maturityDays >= 0 && maturityDays <= 90

          return (
            <div key={loan.id} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
              {/* Compact row */}
              <div
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onClick={() => setExpandedId(expanded ? null : loan.id)}
              >
                {/* Status badge */}
                <span style={{
                  display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
                  fontSize: 10, fontWeight: t.weight.medium, textAlign: 'center',
                  background: statusTone.bg, color: statusTone.fg,
                  flexShrink: 0,
                }}>
                  {STATUS_LABELS[loan.status] ?? loan.status}
                </span>

                {/* Bank name */}
                <span style={{ fontSize: 12.5, fontWeight: 500, color: t.neutrals.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loan.bank}
                </span>

                {/* Principal */}
                <span style={{ fontSize: 11, fontFamily: t.font.mono, fontWeight: 500, color: t.neutrals.text, whiteSpace: 'nowrap' }}>
                  {loan.principal.toLocaleString()}원
                </span>

                {/* Rate */}
                {loan.interest_rate != null && (
                  <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted, whiteSpace: 'nowrap' }}>
                    {loan.interest_rate}%
                  </span>
                )}

                {/* Maturity warning */}
                {maturityWarning && (
                  <span style={{
                    fontSize: 9, fontFamily: t.font.mono, fontWeight: 600,
                    padding: '1px 5px', borderRadius: t.radius.sm,
                    background: tonePalettes.danger.bg, color: tonePalettes.danger.fg,
                    whiteSpace: 'nowrap',
                  }}>
                    D-{maturityDays}
                  </span>
                )}

                {/* Expand chevron */}
                <span style={{ color: t.neutrals.subtle, flexShrink: 0 }}>
                  <LIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2} />
                </span>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div style={{ padding: '0 16px 12px' }}>
                  <div style={{
                    background: t.neutrals.inner, borderRadius: t.radius.md,
                    padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    fontSize: 11, fontFamily: t.font.sans,
                  }}>
                    <DetailRow label="대출유형" value={loan.loan_type} />
                    <DetailRow label="계좌번호" value={loan.account_number} mono />
                    <DetailRow label="이자율" value={loan.interest_rate != null ? `${loan.interest_rate}%` : '-'} />
                    <DetailRow label="월평균 이자" value={loan.monthly_interest_avg != null ? `${loan.monthly_interest_avg.toLocaleString()}원` : '-'} />
                    <DetailRow label="대출일" value={loan.loan_date || '-'} mono />
                    <DetailRow label="만기일" value={loan.maturity_date || '-'} mono />
                    <DetailRow label="상환방식" value={REPAYMENT_LABELS[loan.repayment_type] || loan.repayment_type || '-'} />
                    <DetailRow label="이자납입일" value={loan.interest_payment_day != null ? `매월 ${loan.interest_payment_day}일` : '-'} />
                    {loan.last_extension_date && (
                      <DetailRow label="최근 연장일" value={loan.last_extension_date} mono />
                    )}
                    {loan.next_interest_date && (
                      <DetailRow label="다음 이자일" value={loan.next_interest_date} mono />
                    )}
                  </div>

                  {/* Memo */}
                  {loan.memo && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: t.radius.md,
                      background: t.neutrals.inner, fontSize: 11, color: t.neutrals.muted,
                      lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    }}>
                      {loan.memo}
                    </div>
                  )}

                  {/* Attachments */}
                  {loan.attachments?.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {loan.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 8px', borderRadius: t.radius.sm,
                            background: t.neutrals.inner, fontSize: 11,
                            color: t.brand[700], textDecoration: 'none',
                          }}
                        >
                          <LIcon name="file" size={11} stroke={1.8} />
                          {att.name}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Edit button */}
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(loan) }}
                      style={{
                        padding: '4px 12px', borderRadius: t.radius.sm,
                        background: t.neutrals.inner, border: 'none',
                        fontSize: 11, fontFamily: t.font.sans, fontWeight: 500,
                        color: t.neutrals.text, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <LIcon name="pencil" size={10} stroke={2} />
                      수정
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
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
              width: 32, textAlign: 'center',
              border: 'none', background: t.neutrals.inner,
              borderRadius: t.radius.sm, fontSize: 11,
              fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: 4, borderRadius: 4,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: 4, borderRadius: 4,
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
    </LCard>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? t.font.mono : t.font.sans, color: t.neutrals.text }}>
        {value}
      </div>
    </div>
  )
}
