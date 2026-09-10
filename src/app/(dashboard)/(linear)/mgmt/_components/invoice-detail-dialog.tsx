'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
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
    <div style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap, fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.sans }}>
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
        <div style={{ padding: `${t.density.cardPad}px ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold, color: t.neutrals.subtle, letterSpacing: 0.6, marginBottom: t.density.gapXs }}>
              CASHFLOW
            </div>
            <div style={{
              fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
            }}>
              {invoice.counterparty}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: t.density.controlHSm, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Type + status pills */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', gap: t.density.gapSm, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block', padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, borderRadius: t.radius.pill,
            fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, fontFamily: t.font.sans,
            background: typeTone.bg, color: typeTone.fg,
          }}>
            {TYPE_LABELS[invoice.type]}
          </span>
          <span style={{
            display: 'inline-block', padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, borderRadius: t.radius.pill,
            fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, fontFamily: t.font.sans,
            background: invoice.status === 'completed' ? '#DAEEDD' : t.neutrals.inner,
            color: invoice.status === 'completed' ? '#1F5F3D' : t.neutrals.muted,
          }}>
            {invoice.status === 'completed' ? '완료' : '발행'}
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.cardPad}px`, display: 'flex', flexDirection: 'column', gap: t.density.gapMd }}>
          {/* Amount */}
          <div style={{
            padding: `${t.density.blockGap}px ${t.density.controlPadXMd}px`, borderRadius: t.radius.md, background: t.neutrals.inner,
            display: 'flex', alignItems: 'baseline', gap: t.density.gapSm,
          }}>
            <span style={{
              fontSize: `calc(${t.type.display}px * var(--fz, 1))`, fontWeight: t.weight.bold, fontVariantNumeric: 'tabular-nums',
              fontFamily: t.font.sans, letterSpacing: -0.5,
              color: isIncome ? t.accent.pos : t.accent.neg,
            }}>
              {isIncome ? '+' : '-'}{Math.abs(invoice.amount).toLocaleString()}
            </span>
            <span style={{ fontSize: `calc(${t.type.body}px * var(--fz, 1))`, color: t.neutrals.muted }}>원</span>
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
              marginTop: t.density.gapSm, padding: `${t.density.panelPadX}px ${t.density.blockGap}px`, borderRadius: t.radius.md,
              background: t.neutrals.inner, fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.6,
              fontFamily: t.font.sans, color: t.neutrals.text,
              whiteSpace: 'pre-wrap',
            }}>
              {invoice.description}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: `${t.density.blockGap}px ${t.density.pagePadX}px`, background: t.neutrals.inner,
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
