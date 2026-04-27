'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { TenswTaxInvoice } from '@/types/tensw-mgmt'

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'tensw-sales-page-size'

type StatusFilter = 'all' | 'scheduled' | 'pending' | 'paid'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'scheduled', label: '예정' },
  { value: 'pending', label: '미수금' },
  { value: 'paid', label: '수금완료' },
]

const STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  scheduled: tonePalettes.info,
  pending:   tonePalettes.pending,
  paid:      tonePalettes.done,
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: '예정', pending: '미수금', paid: '수금완료',
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 3 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SalesBlockProps {
  invoices: TenswTaxInvoice[]
  onAdd: () => void
  onEdit: (inv: TenswTaxInvoice) => void
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
  style?: React.CSSProperties
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesBlock({ invoices, onAdd, onEdit, onRefresh, style }: SalesBlockProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter by year
  const yearFiltered = useMemo(() => {
    return invoices.filter(inv => inv.issue_date?.startsWith(String(year)))
  }, [invoices, year])

  // Filter by payment_status
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return yearFiltered
    return yearFiltered.filter(inv => inv.payment_status === statusFilter)
  }, [yearFiltered, statusFilter])

  // Sorted by date desc
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.issue_date.localeCompare(a.issue_date))
  }, [filtered])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const commitPageSize = () => {
    const n = Math.max(3, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f)
    setPage(0)
  }

  // Summary stats (from yearFiltered, not status-filtered)
  const totalSupply = yearFiltered.reduce((s, i) => s + i.supply_amount, 0)
  const totalTax = yearFiltered.reduce((s, i) => s + i.tax_amount, 0)
  const totalAmount = yearFiltered.reduce((s, i) => s + i.total_amount, 0)
  const paidAmount = yearFiltered.filter(i => i.payment_status === 'paid').reduce((s, i) => s + i.total_amount, 0)
  const unpaidAmount = totalAmount - paidAmount

  return (
    <LCard pad={0} style={style}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="TAX INVOICES"
          title="매출관리"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onRefresh} style={{
                width: 24, height: 24, borderRadius: t.radius.sm, border: 'none',
                background: t.neutrals.inner, color: t.neutrals.muted,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}>
                <LIcon name="refresh" size={12} stroke={2} />
              </button>
              <button onClick={onAdd} style={{
                width: 24, height: 24, borderRadius: t.radius.sm, border: 'none',
                background: t.neutrals.inner, color: t.neutrals.muted,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}>
                <LIcon name="plus" size={12} stroke={2.5} />
              </button>
            </div>
          }
        />

        {/* Year navigation */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
        }}>
          <button onClick={() => { setYear(y => y - 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans, minWidth: 60, textAlign: 'center' }}>
            {year}년
          </span>
          <button onClick={() => { setYear(y => y + 1); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          <LStat label="공급가액" value={`${totalSupply.toLocaleString()}원`} tone="default" />
          <LStat label="합계" value={`${totalAmount.toLocaleString()}원`} tone="pos" />
          <LStat label="미수금" value={`${unpaidAmount.toLocaleString()}원`} tone={unpaidAmount > 0 ? 'warn' : 'pos'} />
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 5 }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.value
            return (
              <button key={f.value} onClick={() => handleFilterChange(f.value)} style={{
                border: 'none', cursor: 'pointer',
                padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
                fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
                background: active ? t.brand[100] : t.neutrals.inner,
                color: active ? t.brand[700] : t.neutrals.muted,
                transition: 'all .12s',
              }}>{f.label}</button>
            )
          })}
        </div>
      </div>

      {/* Invoice rows */}
      <div style={{ padding: '0 0 4px' }}>
        {paged.length === 0 && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>
            해당 연도 세금계산서가 없습니다
          </div>
        )}
        {paged.map(inv => {
          const tone = STATUS_TONES[inv.payment_status] ?? tonePalettes.neutral
          const dateSlice = inv.issue_date.slice(5)
          const expanded = expandedId === inv.id

          return (
            <div key={inv.id} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
              {/* Compact row */}
              <div
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onClick={() => setExpandedId(expanded ? null : inv.id)}
              >
                {/* Status badge */}
                <span style={{
                  display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
                  fontSize: 10, fontWeight: t.weight.medium, textAlign: 'center',
                  background: tone.bg, color: tone.fg, flexShrink: 0,
                }}>
                  {STATUS_LABELS[inv.payment_status] ?? inv.payment_status}
                </span>

                {/* Date */}
                <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 11, flexShrink: 0 }}>
                  {dateSlice}
                </span>

                {/* Counterparty */}
                <span style={{
                  flex: 1, fontWeight: 500, fontSize: 12.5,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {inv.counterparty}
                </span>

                {/* Total amount */}
                <span style={{
                  fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                  color: t.neutrals.text, whiteSpace: 'nowrap', fontSize: 11,
                  fontFamily: t.font.mono, flexShrink: 0,
                }}>
                  {inv.total_amount.toLocaleString()}원
                </span>

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
                    <DetailRow label="거래처" value={inv.counterparty} />
                    <DetailRow label="발행일" value={inv.issue_date} mono />
                    <DetailRow label="사업자번호" value={inv.business_number || '-'} mono />
                    <DetailRow label="대표자" value={inv.representative || '-'} />
                    <DetailRow label="공급가액" value={`${inv.supply_amount.toLocaleString()}원`} mono />
                    <DetailRow label="세액" value={`${inv.tax_amount.toLocaleString()}원`} mono />
                    <DetailRow label="합계" value={`${inv.total_amount.toLocaleString()}원`} mono />
                    <DetailRow label="수금상태" value={STATUS_LABELS[inv.payment_status] || inv.payment_status} />
                    <DetailRow label="입금예정일" value={inv.expected_payment_date || '-'} mono />
                    {inv.paid_amount != null && (
                      <DetailRow label="수금액" value={`${inv.paid_amount.toLocaleString()}원`} mono />
                    )}
                    {inv.bank_ref && (
                      <DetailRow label="은행참조" value={inv.bank_ref} mono />
                    )}
                  </div>

                  {/* Items */}
                  {inv.items && inv.items.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: t.neutrals.subtle,
                        fontFamily: t.font.mono, marginBottom: 4, letterSpacing: 0.3,
                      }}>
                        품목
                      </div>
                      <div style={{
                        background: t.neutrals.inner, borderRadius: t.radius.md,
                        padding: '8px 12px',
                      }}>
                        {inv.items.map((item, i) => (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            fontSize: 11, padding: '3px 0',
                            borderTop: i > 0 ? `1px solid ${t.neutrals.line}` : 'none',
                          }}>
                            <span style={{ color: t.neutrals.text }}>{item.description}</span>
                            <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted }}>
                              {item.quantity} x {item.unit_price.toLocaleString()} = {item.supply_amount.toLocaleString()}원
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {inv.notes && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: t.radius.md,
                      background: t.neutrals.inner, fontSize: 11, color: t.neutrals.muted,
                      lineHeight: 1.5, whiteSpace: 'pre-wrap',
                    }}>
                      {inv.notes}
                    </div>
                  )}

                  {/* Edit button */}
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(inv) }}
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
              width: 32, textAlign: 'center', border: 'none',
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
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
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
