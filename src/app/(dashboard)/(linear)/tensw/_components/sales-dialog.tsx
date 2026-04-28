'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { TenswTaxInvoice } from '@/types/tensw-mgmt'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesItemFormData {
  description: string
  amount: string
}

export interface TenswSalesFormData {
  id?: string
  issue_date: string
  counterparty: string
  business_number: string
  representative: string
  supply_amount: string
  tax_amount: string
  expected_payment_date: string
  payment_status: string
  notes: string
  items: SalesItemFormData[]
}

interface SalesDialogProps {
  open: boolean
  editInvoice: TenswTaxInvoice | null
  onClose: () => void
  onSave: (data: TenswSalesFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_STATUS_OPTIONS = [
  { key: 'scheduled', label: '예정' },
  { key: 'pending', label: '계산서발행' },
  { key: 'paid', label: '수금완료' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyItem(): SalesItemFormData {
  return { description: '', amount: '' }
}

function emptyForm(): TenswSalesFormData {
  return {
    issue_date: '',
    counterparty: '',
    business_number: '',
    representative: '',
    supply_amount: '',
    tax_amount: '',
    expected_payment_date: '',
    payment_status: 'pending',
    notes: '',
    items: [],
  }
}

function fromInvoice(inv: TenswTaxInvoice): TenswSalesFormData {
  return {
    id: inv.id,
    issue_date: inv.issue_date,
    counterparty: inv.counterparty,
    business_number: inv.business_number || '',
    representative: inv.representative || '',
    supply_amount: inv.supply_amount ? inv.supply_amount.toLocaleString() : '',
    tax_amount: inv.tax_amount ? inv.tax_amount.toLocaleString() : '',
    expected_payment_date: inv.expected_payment_date || '',
    payment_status: inv.payment_status || 'pending',
    notes: inv.notes || '',
    items: (inv.items || []).map(item => {
      const amt = item.supply_amount ?? (item as unknown as Record<string, number>).amount ?? 0
      return { description: item.description || '', amount: amt ? amt.toLocaleString() : '' }
    }),
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
    const raw = val.replace(/[^0-9]/g, '')
    const formatted = raw ? Number(raw).toLocaleString() : ''
    set('supply_amount', formatted)
    const supply = Number(raw)
    if (!isNaN(supply) && supply >= 0) {
      set('tax_amount', Math.round(supply * 0.1).toLocaleString())
    }
  }

  const handleTaxChange = (val: string) => {
    const raw = val.replace(/[^0-9]/g, '')
    set('tax_amount', raw ? Number(raw).toLocaleString() : '')
  }

  const handleSave = async () => {
    if (!form.counterparty.trim() || !form.supply_amount.trim()) return
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
        position: 'relative', width: 480, maxHeight: '85vh',
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
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* 거래처 + 발행일 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>거래처</Label>
              <input
                value={form.counterparty}
                onChange={e => set('counterparty', e.target.value)}
                placeholder="거래처명"
                style={inputBase}
                autoFocus
              />
            </div>
            <div>
              <Label required>발행일</Label>
              <input
                type="date"
                value={form.issue_date}
                onChange={e => set('issue_date', e.target.value)}
                style={inputBase}
              />
            </div>
          </div>

          {/* 사업자번호 + 대표자 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>사업자번호</Label>
              <input
                value={form.business_number}
                onChange={e => set('business_number', e.target.value)}
                placeholder="000-00-00000"
                style={inputBase}
              />
            </div>
            <div>
              <Label>대표자</Label>
              <input
                value={form.representative}
                onChange={e => set('representative', e.target.value)}
                placeholder="대표자명"
                style={inputBase}
              />
            </div>
          </div>

          {/* 공급가액 + 세액 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>공급가액</Label>
              <input
                value={form.supply_amount}
                onChange={e => handleSupplyChange(e.target.value)}
                placeholder="0"
                style={inputBase}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>세액 (자동 10%)</Label>
              <input
                value={form.tax_amount}
                onChange={e => handleTaxChange(e.target.value)}
                placeholder="0"
                style={inputBase}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* 입금예정일 + 수금상태 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>입금예정일</Label>
              <input
                type="date"
                value={form.expected_payment_date}
                onChange={e => set('expected_payment_date', e.target.value)}
                style={inputBase}
              />
            </div>
            <div>
              <Label>수금상태</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {PAYMENT_STATUS_OPTIONS.map(s => (
                  <ChipBtn
                    key={s.key}
                    active={form.payment_status === s.key}
                    onClick={() => set('payment_status', s.key)}
                  >
                    {s.label}
                  </ChipBtn>
                ))}
              </div>
            </div>
          </div>

          {/* 품목 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <Label>품목</Label>
              <button onClick={() => setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }))} style={{
                border: 'none', cursor: 'pointer', padding: '2px 8px', fontSize: 10,
                borderRadius: t.radius.pill, background: t.neutrals.inner, color: t.neutrals.muted,
                fontFamily: t.font.sans, fontWeight: t.weight.medium,
              }}>+ 추가</button>
            </div>
            {form.items.length === 0 && (
              <div style={{ fontSize: 11, color: t.neutrals.subtle, padding: '8px 0' }}>
                품목이 없습니다
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: 6, alignItems: 'center',
                  background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 8,
                }}>
                  <div style={{ flex: 1 }}>
                    <input
                      value={item.description}
                      onChange={e => {
                        const items = [...form.items]
                        items[idx] = { ...items[idx], description: e.target.value }
                        setForm(prev => ({ ...prev, items }))
                      }}
                      placeholder="품목명"
                      style={{ ...inputBase, fontSize: 12, padding: '6px 8px' }}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <input
                      value={item.amount}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        const formatted = raw ? Number(raw).toLocaleString() : ''
                        const items = [...form.items]
                        items[idx] = { ...items[idx], amount: formatted }
                        setForm(prev => ({ ...prev, items }))
                      }}
                      placeholder="금액"
                      style={{ ...inputBase, fontSize: 12, padding: '6px 8px', textAlign: 'right' }}
                      inputMode="numeric"
                    />
                  </div>
                  <button onClick={() => {
                    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
                  }} style={{
                    border: 'none', cursor: 'pointer', background: 'transparent',
                    color: t.neutrals.subtle, padding: 4, flexShrink: 0,
                  }}>
                    <LIcon name="x" size={12} stroke={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 메모 */}
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
              disabled={saving || !form.counterparty.trim() || !form.supply_amount.trim()}
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

function ChipBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none', cursor: 'pointer',
        padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
        fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
        background: active ? t.brand[100] : t.neutrals.inner,
        color: active ? t.brand[700] : t.neutrals.muted,
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  )
}
