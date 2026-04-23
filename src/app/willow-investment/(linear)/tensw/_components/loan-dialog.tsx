'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { TenswLoan } from '@/types/tensw-mgmt'

export interface TenswLoanFormData {
  id?: string
  lender: string
  loan_type: string
  principal: string
  interest_rate: string
  start_date: string
  end_date: string
  repayment_type: string
  interest_payment_day: string
  notes: string
}

interface LoanDialogProps {
  open: boolean
  editLoan: TenswLoan | null
  onClose: () => void
  onSave: (data: TenswLoanFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

const LOAN_TYPES = ['신용대출', '담보대출', '정책자금', '기타']

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(): TenswLoanFormData {
  return {
    lender: '',
    loan_type: '신용대출',
    principal: '',
    interest_rate: '',
    start_date: '',
    end_date: '',
    repayment_type: '',
    interest_payment_day: '',
    notes: '',
  }
}

function fromLoan(loan: TenswLoan): TenswLoanFormData {
  return {
    id: loan.id,
    lender: loan.lender,
    loan_type: loan.loan_type,
    principal: String(loan.principal),
    interest_rate: String(loan.interest_rate),
    start_date: loan.start_date,
    end_date: loan.end_date || '',
    repayment_type: loan.repayment_type,
    interest_payment_day: loan.interest_payment_day != null ? String(loan.interest_payment_day) : '',
    notes: loan.notes || '',
  }
}

export function LoanDialog({ open, editLoan, onClose, onSave, onDelete }: LoanDialogProps) {
  const isEdit = !!editLoan
  const [form, setForm] = useState<TenswLoanFormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editLoan) {
      setForm(fromLoan(editLoan))
    } else {
      setForm(emptyForm())
    }
  }, [open, editLoan])

  if (!open) return null

  const set = (key: keyof TenswLoanFormData, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.lender.trim() || !form.principal.trim()) return
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
          padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
              color: t.neutrals.subtle, letterSpacing: 0.6,
              textTransform: 'uppercase' as const, marginBottom: 2,
            }}>
              LOAN
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {isEdit ? '차입금 수정' : '차입금 추가'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
            }}
          >
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '0 20px 16px', overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* 대출기관 */}
          <div>
            <Label required>대출기관</Label>
            <input
              value={form.lender}
              onChange={e => set('lender', e.target.value)}
              placeholder="대출기관명을 입력하세요"
              style={inputBase}
              autoFocus
            />
          </div>

          {/* 대출유형 chips */}
          <div>
            <Label>대출유형</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LOAN_TYPES.map(type => (
                <ChipBtn
                  key={type}
                  active={form.loan_type === type}
                  onClick={() => set('loan_type', type)}
                >
                  {type}
                </ChipBtn>
              ))}
            </div>
          </div>

          {/* 원금 */}
          <div>
            <Label required>원금</Label>
            <input
              value={form.principal}
              onChange={e => set('principal', e.target.value)}
              placeholder="0"
              type="number"
              style={inputBase}
            />
          </div>

          {/* 이율 */}
          <div>
            <Label>이율 (%)</Label>
            <input
              value={form.interest_rate}
              onChange={e => set('interest_rate', e.target.value)}
              placeholder="0.0"
              type="number"
              step="0.1"
              style={inputBase}
            />
          </div>

          {/* 시작일 + 만기일 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>시작일</Label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                style={inputBase}
              />
            </div>
            <div>
              <Label>만기일</Label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                style={inputBase}
              />
            </div>
          </div>

          {/* 상환방식 */}
          <div>
            <Label>상환방식</Label>
            <input
              value={form.repayment_type}
              onChange={e => set('repayment_type', e.target.value)}
              placeholder="예: 만기일시상환, 원리금균등"
              style={inputBase}
            />
          </div>

          {/* 이자납부일 */}
          <div>
            <Label>이자납부일</Label>
            <input
              value={form.interest_payment_day}
              onChange={e => set('interest_payment_day', e.target.value)}
              placeholder="매월 납부일 (예: 25)"
              type="number"
              min={1}
              max={31}
              style={inputBase}
            />
          </div>

          {/* 비고 */}
          <div>
            <Label>비고</Label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="추가 메모 (선택)"
              rows={2}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          background: t.neutrals.inner,
          display: 'flex',
          justifyContent: isEdit ? 'space-between' : 'flex-end',
          alignItems: 'center',
          gap: 8,
        }}>
          {isEdit && (
            <LBtn
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
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
              disabled={saving || !form.lender.trim() || !form.principal.trim()}
            >
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
    <button
      onClick={onClick}
      style={{
        border: 'none', cursor: 'pointer',
        padding: '5px 12px', fontSize: 12, borderRadius: t.radius.pill,
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
