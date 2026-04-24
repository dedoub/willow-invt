'use client'

import { useState } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { Invoice } from '@/lib/invoice/types'

type EffectiveStatus =
  | 'draft'
  | 'scheduled_etc'
  | 'scheduled_bank'
  | 'scheduled_both'
  | 'sent_etc'
  | 'sent_bank'
  | 'sent'
  | 'paid'
  | 'overdue'
  | 'cancelled'

function getEffectiveInvoiceStatus(inv: Invoice): EffectiveStatus {
  if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'overdue') {
    return inv.status
  }
  if (inv.scheduled_etc_email_id && inv.scheduled_bank_email_id) return 'scheduled_both'
  if (inv.scheduled_etc_email_id) return 'scheduled_etc'
  if (inv.scheduled_bank_email_id) return 'scheduled_bank'
  if (inv.sent_to_etc_at && inv.sent_to_bank_at) return 'sent'
  if (inv.sent_to_etc_at) return 'sent_etc'
  if (inv.sent_to_bank_at) return 'sent_bank'
  return 'draft'
}

const STATUS_STYLES: Record<EffectiveStatus, { label: string; bg: string; fg: string }> = {
  draft:          { label: '초안',   ...tonePalettes.neutral },
  scheduled_etc:  { label: '예약(E)', bg: '#F3E8FF', fg: '#7C3AED' },
  scheduled_bank: { label: '예약(B)', bg: '#F3E8FF', fg: '#7C3AED' },
  scheduled_both: { label: '예약',   bg: '#F3E8FF', fg: '#7C3AED' },
  sent_etc:       { label: 'ETC발송', ...tonePalettes.info },
  sent_bank:      { label: '은행발송', ...tonePalettes.warn },
  sent:           { label: '발송완료', ...tonePalettes.info },
  paid:           { label: '입금',   ...tonePalettes.done },
  overdue:        { label: '연체',   ...tonePalettes.danger },
  cancelled:      { label: '취소',   ...tonePalettes.neutral },
}

function fmtUsd(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface InvoiceBlockProps {
  invoices: Invoice[]
  onRefresh: () => void
  onAdd: () => void
  onEdit: (inv: Invoice) => void
  onSendEtc: (inv: Invoice) => void
  onSendBank: (inv: Invoice) => void
  style?: React.CSSProperties
}

const PAGE_SIZE = 8

export function InvoiceBlock({
  invoices,
  onRefresh,
  onAdd,
  onEdit,
  onSendEtc,
  onSendBank,
  style,
}: InvoiceBlockProps) {
  const [page, setPage] = useState(0)
  const [toggling, setToggling] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE))
  const paged = invoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleTogglePaid = async (inv: Invoice) => {
    if (toggling) return
    setToggling(inv.id)
    try {
      const isPaid = inv.status === 'paid'
      await fetch(`/api/invoices/${inv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isPaid
            ? { status: 'sent', paid_at: null }
            : { status: 'paid', paid_at: new Date().toISOString() }
        ),
      })
      onRefresh()
    } finally {
      setToggling(null)
    }
  }

  const actionBtnStyle = (active: boolean, activeBg: string, activeFg: string): React.CSSProperties => ({
    background: active ? activeBg : 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 5px',
    borderRadius: t.radius.sm,
    fontSize: 9,
    fontFamily: t.font.mono,
    fontWeight: 500,
    color: active ? activeFg : t.neutrals.line,
  })

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead
          eyebrow="INVOICES"
          title="인보이스"
          action={
            <LBtn
              size="sm"
              icon={<LIcon name="plus" size={14} color={t.neutrals.text} />}
              onClick={onAdd}
            >
              추가
            </LBtn>
          }
        />
      </div>

      {/* Invoice rows */}
      <div style={{ padding: '0 4px 4px' }}>
        {paged.map(inv => {
          const effective = getEffectiveInvoiceStatus(inv)
          const sty = STATUS_STYLES[effective]
          const firstDesc = inv.line_items[0]?.description ?? ''
          const isPaid = inv.status === 'paid'

          return (
            <div
              key={inv.id}
              style={{
                padding: '8px 10px',
                borderRadius: t.radius.sm,
                marginBottom: 2,
              }}
            >
              {/* Line 1: status badge | invoice_no | date — actions right */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{
                    fontSize: 9,
                    fontFamily: t.font.mono,
                    padding: '2px 6px',
                    borderRadius: t.radius.sm,
                    background: sty.bg,
                    color: sty.fg,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {sty.label}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontFamily: t.font.mono,
                    color: t.neutrals.text,
                    fontWeight: 500,
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {inv.invoice_no}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontFamily: t.font.mono,
                    color: t.neutrals.subtle,
                    flexShrink: 0,
                  }}>
                    {inv.invoice_date}
                  </span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {/* PDF */}
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 5px',
                      borderRadius: t.radius.sm,
                      fontSize: 9,
                      fontFamily: t.font.mono,
                      fontWeight: 500,
                      color: t.neutrals.muted,
                      textDecoration: 'none',
                    }}
                  >
                    PDF
                  </a>

                  {/* ETC */}
                  <button
                    onClick={() => onSendEtc(inv)}
                    style={actionBtnStyle(
                      !!inv.sent_to_etc_at,
                      tonePalettes.info.bg,
                      tonePalettes.info.fg
                    )}
                  >
                    ETC
                  </button>

                  {/* 은행 */}
                  <button
                    onClick={() => onSendBank(inv)}
                    style={actionBtnStyle(
                      !!inv.sent_to_bank_at,
                      tonePalettes.warn.bg,
                      tonePalettes.warn.fg
                    )}
                  >
                    은행
                  </button>

                  {/* 입금 */}
                  <button
                    onClick={() => handleTogglePaid(inv)}
                    disabled={toggling === inv.id}
                    style={actionBtnStyle(
                      isPaid,
                      tonePalettes.done.bg,
                      tonePalettes.done.fg
                    )}
                  >
                    입금
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => onEdit(inv)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      color: t.neutrals.subtle,
                    }}
                  >
                    <LIcon name="pencil" size={12} />
                  </button>
                </div>
              </div>

              {/* Line 2: amount left | first line item description right */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 3,
                paddingLeft: 2,
                minWidth: 0,
              }}>
                <span style={{
                  fontSize: 12,
                  fontFamily: t.font.mono,
                  fontWeight: 500,
                  color: t.neutrals.text,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {fmtUsd(inv.total_amount)}
                </span>
                {firstDesc && (
                  <span style={{
                    flex: 1,
                    fontSize: 10,
                    color: t.neutrals.subtle,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}>
                    {firstDesc}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {paged.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            인보이스가 없습니다
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '8px 14px',
          gap: 6,
          borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              borderRadius: 4,
              cursor: page === 0 ? 'default' : 'pointer',
              color: page === 0 ? t.neutrals.line : t.neutrals.muted,
            }}
          >
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              borderRadius: 4,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
            }}
          >
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      )}
    </LCard>
  )
}
