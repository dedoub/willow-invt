'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { TenswCashItem } from '@/types/tensw-mgmt'

interface CashDialogProps {
  open: boolean
  editItem: TenswCashItem | null
  onClose: () => void
  onSave: (data: TenswCashFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export interface TenswCashFormData {
  id?: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
  counterparty: string
  description: string
  amount: string
  issue_date: string
  payment_date: string
}

const TYPE_OPTIONS: { value: TenswCashFormData['type']; label: string }[] = [
  { value: 'revenue', label: '매출' },
  { value: 'expense', label: '비용' },
  { value: 'asset', label: '자산' },
  { value: 'liability', label: '부채' },
  { value: 'transfer', label: '대체' },
]

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(): TenswCashFormData {
  return { type: 'expense', counterparty: '', description: '', amount: '', issue_date: '', payment_date: '' }
}

function fromItem(item: TenswCashItem): TenswCashFormData {
  return {
    id: item.id,
    type: item.type,
    counterparty: item.counterparty,
    description: item.description || '',
    amount: String(item.amount),
    issue_date: item.issue_date || '',
    payment_date: item.payment_date || '',
  }
}

export function CashDialog({ open, editItem, onClose, onSave, onDelete }: CashDialogProps) {
  const isEdit = !!editItem
  const [form, setForm] = useState<TenswCashFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editItem) {
      setForm(fromItem(editItem))
    } else {
      setForm(emptyForm())
    }
  }, [open, editItem])

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

  const handleDelete = async () => {
    if (!onDelete || !form.id) return
    setDeleting(true)
    try {
      await onDelete(form.id)
      onClose()
    } finally {
      setDeleting(false)
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
          display: 'flex', justifyContent: isEdit ? 'space-between' : 'flex-end', alignItems: 'center', gap: 8,
        }}>
          {isEdit && (
            <LBtn variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
              style={{ color: t.accent.neg }}
            >
              {deleting ? '삭제 중...' : '삭제'}
            </LBtn>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
            <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.counterparty.trim() || !form.amount.trim()}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </div>
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
