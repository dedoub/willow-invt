'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
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
  /** 현재 열려 있는 탭을 넘겨 매입 탭에서 추가하면 매입 계산서로 만들어지게 한다. */
  onAdd: (invoiceType: 'sales' | 'purchase') => void
  onEdit: (inv: TenswTaxInvoice) => void
  onDelete: (id: string) => Promise<void>
  onRefresh: () => void
  style?: React.CSSProperties
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesBlock({ invoices, onAdd, onEdit, onRefresh, style }: SalesBlockProps) {
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('sales')
  const [year, setYear] = useState(new Date().getFullYear())
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(false)

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

  // Filter by payment_status
  const filtered = useMemo(() => {
    if (statusFilter === 'all') return yearFiltered
    return yearFiltered.filter(inv => inv.payment_status === statusFilter)
  }, [yearFiltered, statusFilter])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      sortAsc ? a.issue_date.localeCompare(b.issue_date) : b.issue_date.localeCompare(a.issue_date)
    )
  }, [filtered, sortAsc])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const commitPageSize = () => {
    const n = Math.max(1, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
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
    setExpandedId(null)
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
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="TAX INVOICES"
          title={mode === 'purchase' ? '매입관리' : '매출관리'}
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
              <button onClick={() => onAdd(mode)} style={{
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

        {/* 매출/매입 탭 */}
        <div style={{ marginBottom: 10 }}>
          <LSegmented
            value={mode}
            onChange={handleModeChange}
            options={[
              { value: 'sales', label: '매출' },
              { value: 'purchase', label: '매입' },
            ]}
          />
        </div>

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
          <span style={{ fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans, minWidth: 60, textAlign: 'center' }}>
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: mode === 'purchase' ? 'repeat(2, 1fr)' : (mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'),
          gap: 8, marginBottom: 12,
        }}>
          {mode === 'sales' ? (
            <>
              <LStat label="수금완료" value={`${paidTotal.toLocaleString()}원`} tone="pos" />
              <LStat label="미수금" value={`${pendingTotal.toLocaleString()}원`} tone={pendingTotal > 0 ? 'warn' : 'default'} />
              <LStat label="계약예정" value={`${plannedTotal.toLocaleString()}원`} tone="default" title="계약 미체결 가안·전망 매출" />
              <LStat label="발행예정" value={`${scheduledTotal.toLocaleString()}원`} tone="info" title="계약이 체결돼 계산서 발행만 남은 매출" />
            </>
          ) : (
            <>
              <LStat label="지급완료" value={`${paidTotal.toLocaleString()}원`} tone="pos" />
              <LStat label="미지급" value={`${pendingTotal.toLocaleString()}원`} tone={pendingTotal > 0 ? 'warn' : 'default'} title="계산서는 받았으나 아직 지급하지 않은 금액" />
            </>
          )}
        </div>

        {/* Status filter chips + sort toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {statusFilters.map(f => {
            const active = statusFilter === f.value
            return (
              <button key={f.value} onClick={() => handleFilterChange(f.value)} style={{
                border: 'none', cursor: 'pointer',
                padding: '4px 10px', fontSize: 'calc(11px * var(--fz, 1))', borderRadius: t.radius.pill,
                fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
                background: active ? t.brand[100] : t.neutrals.inner,
                color: active ? t.brand[700] : t.neutrals.muted,
                transition: 'all .12s',
              }}>{f.label}</button>
            )
          })}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setSortAsc(v => !v); setPage(0) }}
            style={{
              border: 'none', cursor: 'pointer', background: t.neutrals.inner,
              borderRadius: t.radius.sm, padding: '3px 6px',
              display: 'flex', alignItems: 'center', gap: 2,
              color: t.neutrals.muted, fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono,
            }}
          >
            <LIcon name={sortAsc ? 'arrowUp' : 'arrowDown'} size={10} stroke={2} />
            날짜
          </button>
        </div>
      </div>

      {/* Invoice rows */}
      <div style={{ padding: '0 0 4px' }}>
        {paged.length === 0 && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle,
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
                  fontSize: 'calc(10px * var(--fz, 1))', fontWeight: t.weight.medium, textAlign: 'center',
                  background: tone.bg, color: tone.fg, flexShrink: 0,
                }}>
                  {statusLabels[inv.payment_status] ?? inv.payment_status}
                </span>

                {/* Date */}
                <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))', flexShrink: 0 }}>
                  {dateSlice}
                </span>

                {/* Counterparty + notes */}
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 'calc(12px * var(--fz, 1))',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  <span style={{ fontWeight: 500 }}>{inv.counterparty}</span>
                  {inv.notes && (
                    <span style={{ color: t.neutrals.muted, fontWeight: 400 }}> · {inv.notes}</span>
                  )}
                </span>

                {/* Total amount */}
                <span style={{
                  fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                  color: t.neutrals.text, whiteSpace: 'nowrap', fontSize: 'calc(11px * var(--fz, 1))',
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
                    fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans,
                  }}>
                    <DetailRow label="거래처" value={inv.counterparty} />
                    <DetailRow label="발행일" value={inv.issue_date} mono />
                    <DetailRow label="사업자번호" value={inv.business_number || '-'} mono />
                    <DetailRow label="대표자" value={inv.representative || '-'} />
                    <DetailRow label="공급가액" value={`${inv.supply_amount.toLocaleString()}원`} mono />
                    <DetailRow label="세액" value={`${inv.tax_amount.toLocaleString()}원`} mono />
                    <DetailRow label="합계" value={`${inv.total_amount.toLocaleString()}원`} mono />
                    <DetailRow label={mode === 'purchase' ? '지급상태' : '수금상태'} value={statusLabels[inv.payment_status] || inv.payment_status} />
                    <DetailRow label="입금예정일" value={inv.expected_payment_date || '-'} mono />
                    {inv.paid_amount != null && (
                      <DetailRow label="수금액" value={`${inv.paid_amount.toLocaleString()}원`} mono />
                    )}
                    {inv.paid_amount != null && inv.paid_amount < inv.total_amount && (
                      <DetailRow label="미수잔액" value={`${(inv.total_amount - inv.paid_amount).toLocaleString()}원`} mono />
                    )}
                    {inv.bank_ref && (
                      <DetailRow label="은행참조" value={inv.bank_ref} mono />
                    )}
                  </div>

                  {/* Items */}
                  {inv.items && inv.items.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, color: t.neutrals.subtle,
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
                            fontSize: 'calc(11px * var(--fz, 1))', padding: '3px 0',
                            borderTop: i > 0 ? `1px solid ${t.neutrals.line}` : 'none',
                          }}>
                            <span style={{ color: t.neutrals.text }}>{item.description}</span>
                            <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted }}>
                              {item.quantity != null && item.unit_price != null
                                ? `${item.quantity} x ${item.unit_price.toLocaleString()} = ${item.supply_amount.toLocaleString()}원`
                                : `${(item.supply_amount ?? (item as unknown as Record<string, number>).amount ?? 0).toLocaleString()}원`
                              }
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
                      background: t.neutrals.inner, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted,
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
                        fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.sans, fontWeight: 500,
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
              fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
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
            <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
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
      <div style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? t.font.mono : t.font.sans, color: t.neutrals.text }}>
        {value}
      </div>
    </div>
  )
}
