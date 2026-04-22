'use client'

import { useState, useEffect } from 'react'
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

interface AddInvoiceDialogProps {
  open: boolean
  editingInvoice?: Invoice | null
  onClose: () => void
  onSave: (data: InvoiceFormData) => Promise<void>
}

export interface InvoiceFormData {
  id?: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string
  amount: string
  issue_date: string
  payment_date: string
}

const TYPE_OPTIONS: { value: InvoiceFormData['type']; label: string }[] = [
  { value: 'revenue', label: '매출' },
  { value: 'expense', label: '비용' },
  { value: 'asset', label: '자산' },
  { value: 'liability', label: '부채' },
]

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(): InvoiceFormData {
  return { type: 'expense', counterparty: '', description: '', amount: '', issue_date: '', payment_date: '' }
}

function fromInvoice(inv: Invoice): InvoiceFormData {
  return {
    id: inv.id,
    type: inv.type,
    counterparty: inv.counterparty,
    description: inv.description || '',
    amount: String(inv.amount),
    issue_date: inv.issue_date || '',
    payment_date: inv.payment_date || '',
  }
}

export function AddInvoiceDialog({ open, editingInvoice, onClose, onSave }: AddInvoiceDialogProps) {
  const isEdit = !!editingInvoice
  const [form, setForm] = useState<InvoiceFormData>(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingInvoice) {
      setForm(fromInvoice(editingInvoice))
    } else {
      setForm(emptyForm())
    }
  }, [open, editingInvoice])

  if (!open) return null

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.counterparty.trim() || !form.amount.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 440, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              CASHFLOW
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {isEdit ? '거래 수정' : '거래 추가'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '0 20px 16px', overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Type chips */}
          <div>
            <Label>유형</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TYPE_OPTIONS.map(o => (
                <ChipBtn key={o.value} active={form.type === o.value} onClick={() => set('type', o.value)}>
                  {o.label}
                </ChipBtn>
              ))}
            </div>
          </div>

          {/* Counterparty */}
          <div>
            <Label required>거래처</Label>
            <input
              value={form.counterparty} onChange={e => set('counterparty', e.target.value)}
              placeholder="거래처명을 입력하세요"
              style={inputBase} autoFocus
            />
          </div>

          {/* Amount */}
          <div>
            <Label required>금액</Label>
            <input
              value={form.amount} onChange={e => set('amount', e.target.value)}
              placeholder="0"
              type="number"
              style={inputBase}
            />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>발행일</Label>
              <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} style={inputBase} />
            </div>
            <div>
              <Label>입금/지급일</Label>
              <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} style={inputBase} />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>설명</Label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="상세 내용 (선택)"
              rows={2}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.counterparty.trim() || !form.amount.trim()}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: 5,
    }}>
      {children}{required && <span style={{ color: t.accent.neg, marginLeft: 2 }}>*</span>}
    </div>
  )
}

function ChipBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      border: 'none', cursor: 'pointer',
      padding: '5px 12px', fontSize: 12, borderRadius: t.radius.pill,
      fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
      background: active ? t.brand[100] : t.neutrals.inner,
      color: active ? t.brand[700] : t.neutrals.muted,
      transition: 'all .12s',
    }}>{children}</button>
  )
}
