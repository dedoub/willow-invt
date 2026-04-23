'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { TenswTaxInvoice } from '@/types/tensw-mgmt'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenswSalesFormData {
  id?: string
  invoice_date: string
  company: string
  description: string
  supply_amount: string
  tax_amount: string
  notes: string
}

interface SalesDialogProps {
  open: boolean
  editInvoice: TenswTaxInvoice | null
  onClose: () => void
  onSave: (data: TenswSalesFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(): TenswSalesFormData {
  return {
    invoice_date: '',
    company: '',
    description: '',
    supply_amount: '',
    tax_amount: '',
    notes: '',
  }
}

function fromInvoice(inv: TenswTaxInvoice): TenswSalesFormData {
  return {
    id: inv.id,
    invoice_date: inv.invoice_date,
    company: inv.company,
    description: inv.description || '',
    supply_amount: String(inv.supply_amount),
    tax_amount: String(inv.tax_amount),
    notes: inv.notes || '',
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalesDialog({ open, editInvoice, onClose, onSave, onDelete }: SalesDialogProps) {
  const isEdit = !!editInvoice
  const [form, setForm] = useState<TenswSalesFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editInvoice) {
      setForm(fromInvoice(editInvoice))
    } else {
      setForm(emptyForm())
    }
  }, [open, editInvoice])

  if (!open) return null

  const set = (key: keyof TenswSalesFormData, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSupplyChange = (val: string) => {
    set('supply_amount', val)
    const supply = Number(val)
    if (!isNaN(supply) && supply >= 0) {
      set('tax_amount', String(Math.round(supply * 0.1)))
    }
  }

  const handleSave = async () => {
    if (!form.company.trim() || !form.supply_amount.trim()) return
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
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 440, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
              color: t.neutrals.subtle, letterSpacing: 0.6,
              textTransform: 'uppercase' as const, marginBottom: 2,
            }}>
              TAX INVOICE
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {isEdit ? '세금계산서 수정' : '세금계산서 추가'}
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
          {/* Invoice date */}
          <div>
            <Label>발행일</Label>
            <input
              type="date"
              value={form.invoice_date}
              onChange={e => set('invoice_date', e.target.value)}
              style={inputBase}
            />
          </div>

          {/* Company */}
          <div>
            <Label required>거래처</Label>
            <input
              value={form.company}
              onChange={e => set('company', e.target.value)}
              placeholder="거래처명을 입력하세요"
              style={inputBase}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <Label>내용</Label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="품목 또는 서비스 내용"
              style={inputBase}
            />
          </div>

          {/* Supply amount + Tax amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>공급가액</Label>
              <input
                type="number"
                value={form.supply_amount}
                onChange={e => handleSupplyChange(e.target.value)}
                placeholder="0"
                style={inputBase}
              />
            </div>
            <div>
              <Label>세액 (자동 계산)</Label>
              <input
                type="number"
                value={form.tax_amount}
                onChange={e => set('tax_amount', e.target.value)}
                placeholder="0"
                style={inputBase}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>비고</Label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="비고 (선택)"
              rows={2}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex',
          justifyContent: isEdit ? 'space-between' : 'flex-end',
          alignItems: 'center', gap: 8,
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
            <LBtn
              variant="brand"
              size="sm"
              onClick={handleSave}
              disabled={saving || !form.company.trim() || !form.supply_amount.trim()}
            >
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

