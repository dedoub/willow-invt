'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { TenswLoan } from '@/types/tensw-mgmt'

export interface TenswLoanFormData {
  id?: string
  bank: string
  account_number: string
  loan_type: string
  principal: string
  interest_rate: string
  monthly_interest_avg: string
  loan_date: string
  maturity_date: string
  last_extension_date: string
  next_interest_date: string
  interest_payment_day: string
  repayment_type: string
  status: string
  memo: string
}

interface LoanDialogProps {
  open: boolean
  editLoan: TenswLoan | null
  onClose: () => void
  onSave: (data: TenswLoanFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

const REPAYMENT_TYPES = [
  { key: 'bullet', label: '만기일시상환' },
  { key: 'amortizing', label: '원리금균등' },
  { key: 'principal_equal', label: '원금균등' },
  { key: 'custom', label: '기타' },
]

const STATUS_OPTIONS = [
  { key: 'active', label: '실행중' },
  { key: 'pending', label: '대기' },
  { key: 'closed', label: '상환완료' },
]

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(): TenswLoanFormData {
  return {
    bank: '', account_number: '', loan_type: '',
    principal: '', interest_rate: '', monthly_interest_avg: '',
    loan_date: '', maturity_date: '',
    last_extension_date: '', next_interest_date: '',
    interest_payment_day: '',
    repayment_type: 'bullet', status: 'active', memo: '',
  }
}

function fromLoan(loan: TenswLoan): TenswLoanFormData {
  return {
    id: loan.id,
    bank: loan.bank,
    account_number: loan.account_number || '',
    loan_type: loan.loan_type,
    principal: loan.principal ? loan.principal.toLocaleString() : '',
    interest_rate: loan.interest_rate != null ? String(loan.interest_rate) : '',
    monthly_interest_avg: loan.monthly_interest_avg != null ? loan.monthly_interest_avg.toLocaleString() : '',
    loan_date: loan.loan_date || '',
    maturity_date: loan.maturity_date || '',
    last_extension_date: loan.last_extension_date || '',
    next_interest_date: loan.next_interest_date || '',
    interest_payment_day: loan.interest_payment_day != null ? String(loan.interest_payment_day) : '',
    repayment_type: loan.repayment_type || 'bullet',
    status: loan.status || 'active',
    memo: loan.memo || '',
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
    if (!form.bank.trim() || !form.loan_type.trim() || !form.principal.trim()) return
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
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {/* 은행 + 계좌번호 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>은행</Label>
              <input
                value={form.bank}
                onChange={e => set('bank', e.target.value)}
                placeholder="은행명"
                style={inputBase}
                autoFocus
              />
            </div>
            <div>
              <Label>계좌번호</Label>
              <input
                value={form.account_number}
                onChange={e => set('account_number', e.target.value)}
                placeholder="계좌번호"
                style={inputBase}
              />
            </div>
          </div>

          {/* 대출유형 */}
          <div>
            <Label required>대출유형</Label>
            <input
              value={form.loan_type}
              onChange={e => set('loan_type', e.target.value)}
              placeholder="예: 기업운전일반자금대출"
              style={inputBase}
            />
          </div>

          {/* 원금 + 이율 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>대출원금</Label>
              <input
                value={form.principal}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  set('principal', raw ? Number(raw).toLocaleString() : '')
                }}
                placeholder="0"
                style={inputBase}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>이자율 (%)</Label>
              <input
                value={form.interest_rate}
                onChange={e => set('interest_rate', e.target.value)}
                placeholder="0.00"
                type="number"
                step="0.01"
                style={inputBase}
              />
            </div>
          </div>

          {/* 월평균 이자 + 이자납입일 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>월평균 이자</Label>
              <input
                value={form.monthly_interest_avg}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  set('monthly_interest_avg', raw ? Number(raw).toLocaleString() : '')
                }}
                placeholder="0"
                style={inputBase}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>이자납입일</Label>
              <input
                value={form.interest_payment_day}
                onChange={e => set('interest_payment_day', e.target.value)}
                placeholder="매월 (1-31)"
                type="number"
                min={1}
                max={31}
                style={inputBase}
              />
            </div>
          </div>

          {/* 대출일 + 만기일 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>대출일</Label>
              <input type="date" value={form.loan_date} onChange={e => set('loan_date', e.target.value)} style={inputBase} />
            </div>
            <div>
              <Label>만기일</Label>
              <input type="date" value={form.maturity_date} onChange={e => set('maturity_date', e.target.value)} style={inputBase} />
            </div>
          </div>

          {/* 최근 연장일 + 다음 이자일 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>최근 연장일</Label>
              <input type="date" value={form.last_extension_date} onChange={e => set('last_extension_date', e.target.value)} style={inputBase} />
            </div>
            <div>
              <Label>다음 이자일</Label>
              <input type="date" value={form.next_interest_date} onChange={e => set('next_interest_date', e.target.value)} style={inputBase} />
            </div>
          </div>

          {/* 상환방식 + 상태 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>상환방식</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {REPAYMENT_TYPES.map(rt => (
                  <ChipBtn key={rt.key} active={form.repayment_type === rt.key} onClick={() => set('repayment_type', rt.key)}>
                    {rt.label}
                  </ChipBtn>
                ))}
              </div>
            </div>
            <div>
              <Label>상태</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {STATUS_OPTIONS.map(s => (
                  <ChipBtn key={s.key} active={form.status === s.key} onClick={() => set('status', s.key)}>
                    {s.label}
                  </ChipBtn>
                ))}
              </div>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <Label>메모</Label>
            <textarea
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
              placeholder="추가 메모 (선택)"
              rows={3}
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
              disabled={saving || !form.bank.trim() || !form.loan_type.trim() || !form.principal.trim()}
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
