'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LDialog, LDialogFoot } from '@/app/(dashboard)/_components/linear-dialog'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
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
  width: '100%', padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
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
    <LDialog
      title={isEdit ? '차입금 수정' : '차입금 추가'}
      width={480}
      onClose={onClose}
      foot={<LDialogFoot
        left={isEdit ? (
          <span data-danger-action="">
            <LBtn variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? '삭제 중...' : '삭제'}
            </LBtn>
          </span>
        ) : undefined}
        right={<>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <span data-primary-action="">
            <LBtn variant="brand" size="sm" onClick={handleSave}
              disabled={saving || !form.bank.trim() || !form.loan_type.trim() || !form.principal.trim()}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </span>
        </>}
      />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.gapLg }}>
        {/* 은행 + 계좌번호 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
          <div>
            <Label>상환방식</Label>
            <LFilterChip
              options={REPAYMENT_TYPES.map(rt => ({ value: rt.key, label: rt.label }))}
              value={form.repayment_type}
              onChange={v => set('repayment_type', v)}
              gap={t.density.gapSm}
            />
          </div>
          <div>
            <Label>상태</Label>
            <LFilterChip
              options={STATUS_OPTIONS.map(s => ({ value: s.key, label: s.label }))}
              value={form.status}
              onChange={v => set('status', v)}
              gap={t.density.gapSm}
            />
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
    </LDialog>
  )
}

/* ── Sub-components ── */

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{
      fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: t.density.gapSm,
    }}>
      {children}{required && <span style={{ color: t.accent.neg, marginLeft: t.density.tableRowGap }}>*</span>}
    </div>
  )
}
