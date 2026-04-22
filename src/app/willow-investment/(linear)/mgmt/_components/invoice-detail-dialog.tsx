'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

interface InvoiceDetailDialogProps {
  invoice: Invoice | null
  onClose: () => void
  onDelete: (id: string) => void
  onEdit: (invoice: Invoice) => void
}

const TYPE_TONES: Record<string, { bg: string; fg: string }> = {
  revenue:   { bg: '#DCE8F5', fg: '#1F4E79' },
  expense:   { bg: '#F9E8D0', fg: '#8A5A1A' },
  asset:     { bg: '#DAEEDD', fg: '#1F5F3D' },
  liability: { bg: '#F3DADA', fg: '#8A2A2A' },
}

const TYPE_LABELS: Record<string, string> = {
  revenue: '매출', expense: '비용', asset: '자산', liability: '부채',
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.neutrals.muted, fontFamily: t.font.sans }}>
      <LIcon name={icon} size={14} stroke={1.8} color={t.neutrals.subtle} />
      <span>{children}</span>
    </div>
  )
}

export function InvoiceDetailDialog({ invoice, onClose, onDelete, onEdit }: InvoiceDetailDialogProps) {
  if (!invoice) return null

  const typeTone = TYPE_TONES[invoice.type]
  const isIncome = invoice.type === 'revenue' || invoice.type === 'asset'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 420, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: 4 }}>
              CASHFLOW
            </div>
            <div style={{
              fontSize: 16, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
            }}>
              {invoice.counterparty}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Type + status pills */}
        <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: t.radius.pill,
            fontSize: 11, fontWeight: t.weight.medium, fontFamily: t.font.sans,
            background: typeTone.bg, color: typeTone.fg,
          }}>
            {TYPE_LABELS[invoice.type]}
          </span>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: t.radius.pill,
            fontSize: 11, fontWeight: t.weight.medium, fontFamily: t.font.sans,
            background: invoice.status === 'completed' ? '#DAEEDD' : t.neutrals.inner,
            color: invoice.status === 'completed' ? '#1F5F3D' : t.neutrals.muted,
          }}>
            {invoice.status === 'completed' ? '완료' : '발행'}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Amount */}
          <div style={{
            padding: '12px 14px', borderRadius: t.radius.md, background: t.neutrals.inner,
            display: 'flex', alignItems: 'baseline', gap: 6,
          }}>
            <span style={{
              fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              fontFamily: t.font.sans, letterSpacing: -0.5,
              color: isIncome ? t.accent.pos : t.accent.neg,
            }}>
              {isIncome ? '+' : '-'}{Math.abs(invoice.amount).toLocaleString()}
            </span>
            <span style={{ fontSize: 13, color: t.neutrals.muted }}>원</span>
          </div>

          {/* Dates */}
          {invoice.issue_date && (
            <InfoRow icon="calendar">발행일 {invoice.issue_date}</InfoRow>
          )}
          {invoice.payment_date && (
            <InfoRow icon="briefcase">{isIncome ? '입금일' : '지급일'} {invoice.payment_date}</InfoRow>
          )}

          {/* Description */}
          {invoice.description && (
            <div style={{
              marginTop: 6, padding: '10px 12px', borderRadius: t.radius.md,
              background: t.neutrals.inner, fontSize: 13, lineHeight: 1.6,
              fontFamily: t.font.sans, color: t.neutrals.text,
              whiteSpace: 'pre-wrap',
            }}>
              {invoice.description}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <LBtn variant="ghost" size="sm" style={{ color: t.accent.neg }}
            onClick={() => { onDelete(invoice.id); onClose() }}>
            삭제
          </LBtn>
          <LBtn variant="secondary" size="sm"
            onClick={() => { onEdit(invoice); onClose() }}>
            수정
          </LBtn>
        </div>
      </div>
    </div>
  )
}
