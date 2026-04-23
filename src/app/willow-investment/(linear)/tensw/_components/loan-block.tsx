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

type StatusFilter = 'all' | 'active' | 'completed'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '진행' },
  { value: 'completed', label: '완료' },
]

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'tensw-loan-page-size'

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

export function LoanBlock({ loans, onAdd, onEdit, style }: LoanBlockProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  const activePrincipal = useMemo(
    () => loans.filter(l => l.status === 'active').reduce((s, l) => s + l.principal, 0),
    [loans],
  )

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return loans
    return loans.filter(l => l.status === statusFilter)
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

        {/* Summary stat */}
        <div style={{ marginBottom: 10 }}>
          <LStat label="총 원금" value={`${activePrincipal.toLocaleString()}원`} tone="info" />
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 5 }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.value
            const tone = f.value === 'active'
              ? tonePalettes.info
              : f.value === 'completed'
                ? tonePalettes.done
                : null
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
      <div>
        {paged.length === 0 && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>
            차입금 데이터가 없습니다
          </div>
        )}
        {paged.map((loan) => (
          <div
            key={loan.id}
            style={{
              padding: '10px 16px', borderTop: `1px solid ${t.neutrals.line}`,
              cursor: 'pointer',
            }}
            onClick={() => onEdit(loan)}
          >
            {/* Line 1: lender + loan_type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: t.neutrals.text }}>
                {loan.lender}
              </span>
              <span style={{
                padding: '1px 6px', borderRadius: t.radius.sm, fontSize: 10,
                background: t.neutrals.inner, color: t.neutrals.muted,
              }}>
                {loan.loan_type}
              </span>
            </div>
            {/* Line 2: principal + rate + end_date */}
            <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              <span>{loan.principal.toLocaleString()}원</span>
              <span>{loan.interest_rate}%</span>
              {loan.end_date && <span>만기 {loan.end_date}</span>}
            </div>
          </div>
        ))}
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
