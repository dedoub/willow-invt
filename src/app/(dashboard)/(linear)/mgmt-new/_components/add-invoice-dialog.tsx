'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import type { InvoiceFormData } from '@/app/(dashboard)/(linear)/mgmt/_components/add-invoice-dialog'

interface Invoice {
  id: string
  type: InvoiceFormData['type']
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

interface Props {
  open: boolean
  editingInvoice?: Invoice | null
  onClose: () => void
  onSave: (data: InvoiceFormData) => Promise<void>
}

const TYPE_OPTIONS: { value: InvoiceFormData['type']; label: string }[] = [
  { value: 'revenue', label: '매출' },
  { value: 'expense', label: '비용' },
  { value: 'asset', label: '자산' },
  { value: 'liability', label: '부채' },
  { value: 'transfer', label: '대체' },
]

// 입력칸은 카드의 검색창과 같은 규격 — 흰 바탕에 선 한 겹, 컨트롤 글자
const inputBase: React.CSSProperties = {
  width: '100%', minHeight: t.density.controlHSm,
  padding: `0 ${t.density.panelPadX}px`,
  fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.card, color: t.neutrals.text,
  border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.sm, outline: 'none',
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

/**
 * 거래 추가·수정 — 상세 모달과 같은 카드 문법이고, 항목 순서도 상세와 같게 읽힌다.
 * (2026-09-10 사업관리 NEW 카드 문법)
 */
export function AddInvoiceDialogNew({ open, editingInvoice, onClose, onSave }: Props) {
  const isEdit = !!editingInvoice
  const [form, setForm] = useState<InvoiceFormData>(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(editingInvoice ? fromInvoice(editingInvoice) : emptyForm())
  }, [open, editingInvoice])

  if (!open) return null

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))
  const ready = !!form.counterparty.trim() && !!form.amount.trim()

  const handleSave = async () => {
    if (!ready) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{
        position: 'relative', width: 440, maxWidth: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={isEdit ? '거래 수정' : '거래 추가'}
            action={
              <button onClick={onClose} title="닫기" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
                display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={14} stroke={2} />
              </button>
            }
            mb={0}
          />
        </div>

        {/* 순서는 상세 모달과 같다 — 구분·날짜, 거래처·금액, 적요 */}
        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`, overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
        }}>
          <Field label="구분">
            <LFilterChip options={TYPE_OPTIONS} value={form.type} onChange={v => set('type', v)} gap={t.density.gapXs} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
            <Field label="발행일">
              <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} style={inputBase} />
            </Field>
            <Field label="입금 · 지급일">
              <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)} style={inputBase} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
            <Field label="거래처" required>
              <input
                value={form.counterparty} onChange={e => set('counterparty', e.target.value)}
                placeholder="거래처명"
                style={inputBase} autoFocus
              />
            </Field>
            <Field label="금액" required>
              <input
                value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0" type="number" inputMode="numeric"
                style={{ ...inputBase, fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}
              />
            </Field>
          </div>

          <Field label="적요">
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="상세 내용 (선택)"
              rows={2}
              style={{
                ...inputBase, resize: 'vertical' as const, lineHeight: 1.6,
                padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
              }}
            />
          </Field>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.gapSm,
          margin: `0 ${t.density.cardPad}px`, paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <span data-primary-action="">
            <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !ready}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </span>
        </div>
      </LCard>
    </div>
  )
}

/** 라벨 위, 입력 아래 — 카드 지표와 같은 순서로 읽는다 */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle,
        fontFamily: t.font.sans, marginBottom: t.density.gapXs,
      }}>
        {label}{required && <span style={{ color: t.neutrals.subtle, marginLeft: t.density.tableRowGap }}>*</span>}
      </div>
      {children}
    </div>
  )
}
