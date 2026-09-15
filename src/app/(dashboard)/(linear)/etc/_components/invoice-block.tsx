'use client'

import { useState } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { Invoice } from '@/lib/invoice/types'
import { isReferralFeeInvoice } from '@/lib/invoice/delivery-policy'
import { LPageSize } from '@/app/(dashboard)/_components/linear-table'

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

const INVOICE_PAGE_SIZE_KEY = 'etc-invoice-page-size'
const DEFAULT_INVOICE_PAGE_SIZE = 10

function getStoredInvoicePageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_INVOICE_PAGE_SIZE
  const v = localStorage.getItem(INVOICE_PAGE_SIZE_KEY)
  if (!v) return DEFAULT_INVOICE_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_INVOICE_PAGE_SIZE
}

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
  const [pageSize, setPageSize] = useState(getStoredInvoicePageSize)
  const [toggling, setToggling] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(invoices.length / pageSize))
  const paged = invoices.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    if (typeof window !== 'undefined') localStorage.setItem(INVOICE_PAGE_SIZE_KEY, String(n))
  }

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

  // 켜짐은 `data-active` 로 말한다 — theme-outline 이 단추의 배경과 글자색을 통째로
  // 덮어써서, 인라인 색으로 칠하면 보낸 것과 안 보낸 것이 똑같이 보인다(2026-09-15).
  // 꺼진 상태의 글자색도 line(#E7E9EB)에서 subtle 로 올린다 — 선 색은 글자로 읽히지 않는다.
  const actionBtnStyle = (active: boolean, activeBg: string, activeFg: string): React.CSSProperties => ({
    background: active ? activeBg : 'none',
    border: 'none',
    cursor: 'pointer',
    padding: `${t.density.tableRowGap}px ${t.density.gapSm}px`,
    borderRadius: t.radius.sm,
    fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`,
    fontFamily: t.font.mono,
    fontWeight: t.weight.medium,
    color: active ? activeFg : t.neutrals.subtle,
  })

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead
          title="인보이스"
          mb={0}
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

      {/* Invoice rows — 좌우는 카드 패딩에 맞춘다. 머리·쪽넘김과 같은 선에서 시작해야 한다. */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        {paged.map(inv => {
          const effective = getEffectiveInvoiceStatus(inv)
          const sty = STATUS_STYLES[effective]
          const firstDesc = inv.line_items[0]?.description ?? ''
          const isPaid = inv.status === 'paid'
          const bankOnly = isReferralFeeInvoice(inv)

          return (
            <div
              key={inv.id}
              style={{
                padding: `${t.density.panelPadY}px 0`,
                marginBottom: t.density.tableRowGap,
              }}
            >
              {/* Line 1: status badge | invoice_no | date — actions right */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: t.density.gapSm,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, minWidth: 0, overflow: 'hidden' }}>
                  {/* 배지는 테마가 아는 물건이다 — 손으로 칠한 알약은 같은 화면의 다른 배지와 달라진다. */}
                  <LBadge pill palette={{ bg: sty.bg, fg: sty.fg }} style={{ flexShrink: 0 }}>
                    {sty.label}
                  </LBadge>
                  <span style={{
                    fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                    fontFamily: t.font.mono,
                    color: t.neutrals.text,
                    fontWeight: t.weight.medium,
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {inv.invoice_no}
                  </span>
                  {/* 좁은 화면에선 날짜가 먼저 줄어들어 액션 버튼과 겹치지 않게 */}
                  <span style={{
                    fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
                    fontFamily: t.font.mono,
                    color: t.neutrals.subtle,
                    flexShrink: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {inv.invoice_date}
                  </span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs, flexShrink: 0 }}>
                  {/* PDF */}
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: `${t.density.tableRowGap}px ${t.density.gapSm}px`,
                      borderRadius: t.radius.sm,
                      fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`,
                      fontFamily: t.font.mono,
                      fontWeight: t.weight.medium,
                      color: t.neutrals.muted,
                      textDecoration: 'none',
                    }}
                  >
                    PDF
                  </a>

                  {/* ETC */}
                  {!bankOnly && (
                    <button
                      onClick={() => onSendEtc(inv)}
                      data-row-toggle=""
                      data-active={!!inv.sent_to_etc_at ? '' : undefined}
                      style={actionBtnStyle(
                        !!inv.sent_to_etc_at,
                        tonePalettes.info.bg,
                        tonePalettes.info.fg
                      )}
                    >
                      ETC
                    </button>
                  )}

                  {/* 은행 */}
                  <button
                    onClick={() => onSendBank(inv)}
                    data-row-toggle=""
                    data-active={!!inv.sent_to_bank_at ? '' : undefined}
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
                    data-row-toggle=""
                    data-active={isPaid ? '' : undefined}
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
                      padding: t.density.gapXs,
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
                gap: t.density.kpiGap,
                marginTop: t.density.gapXs,
                paddingLeft: t.density.tableRowGap,
                minWidth: 0,
              }}>
                <span style={{
                  fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
                  fontFamily: t.font.mono,
                  fontWeight: t.weight.medium,
                  color: t.neutrals.text,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {fmtUsd(inv.total_amount)}
                </span>
                {firstDesc && (
                  <span style={{
                    flex: 1,
                    fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
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
          <div style={{ padding: 30, textAlign: 'center', fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
            인보이스가 없습니다
          </div>
        )}
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
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, invoices.length)} / {invoices.length}
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

      {/* 쪽넘김 줄과 따로 둔다 — 그 줄은 몇 개 중 몇 개인지만 말하고, 이 줄이 어디서 온
          숫자인지를 말한다(CEO 2026-09-15). */}
      <LCardFoot
        left="ETC 인보이스 · 발송·입금 상태는 손으로 찍는다"
        right={`${invoices.length}건`}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}
