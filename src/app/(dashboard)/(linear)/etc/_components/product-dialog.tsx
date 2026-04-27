'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  ETFDisplayData,
  FeeStructure,
  FeeTier,
  createETFProduct,
  updateETFProduct,
  deleteETFProduct,
} from '@/lib/supabase-etf'

// ============ Threshold helpers ============

function parseThreshold(s: string): number {
  const upper = s.toUpperCase().trim()
  if (upper.endsWith('B')) return parseFloat(upper) * 1e9
  if (upper.endsWith('M')) return parseFloat(upper) * 1e6
  if (upper.endsWith('K')) return parseFloat(upper) * 1e3
  return parseFloat(upper) || 0
}

function fmtThreshold(v: number): string {
  if (v === 0) return '∞'
  if (v >= 1e9) return `${v / 1e9}B`
  if (v >= 1e6) return `${v / 1e6}M`
  if (v >= 1e3) return `${v / 1e3}K`
  return String(v)
}

// ============ FeeTierEditor ============

function FeeTierEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: FeeStructure
  onChange: (v: FeeStructure) => void
}) {
  const inputStyle: React.CSSProperties = {
    padding: '4px 6px',
    borderRadius: t.radius.sm,
    border: 'none',
    background: t.neutrals.inner,
    fontSize: 11,
    fontFamily: t.font.mono,
    color: t.neutrals.text,
    outline: 'none',
    width: '100%',
  }

  const addTier = () => {
    onChange({
      ...value,
      tiers: [...value.tiers, { upTo: 0, bps: 0 }],
    })
  }

  const removeTier = (idx: number) => {
    onChange({
      ...value,
      tiers: value.tiers.filter((_, i) => i !== idx),
    })
  }

  const updateTierUpTo = (idx: number, raw: string) => {
    const parsed = parseThreshold(raw)
    const newTiers = value.tiers.map((tier, i) =>
      i === idx ? { ...tier, upTo: parsed } : tier
    )
    onChange({ ...value, tiers: newTiers })
  }

  const updateTierBps = (idx: number, raw: string) => {
    const newTiers = value.tiers.map((tier, i) =>
      i === idx ? { ...tier, bps: parseFloat(raw) || 0 } : tier
    )
    onChange({ ...value, tiers: newTiers })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: t.weight.semibold, color: t.neutrals.muted, fontFamily: t.font.sans }}>
        {label}
      </span>

      {/* Min Fee */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans, minWidth: 56 }}>
          Min Fee ($)
        </span>
        <input
          type="number"
          value={value.minFee}
          onChange={e => onChange({ ...value, minFee: parseFloat(e.target.value) || 0 })}
          style={{ ...inputStyle, width: 80 }}
          min={0}
          step={1000}
        />
      </div>

      {/* Tiers */}
      {value.tiers.map((tier, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans, minWidth: 56 }}>
            Up to
          </span>
          <input
            type="text"
            defaultValue={fmtThreshold(tier.upTo)}
            onBlur={e => updateTierUpTo(idx, e.target.value)}
            style={{ ...inputStyle, width: 64 }}
            placeholder="500M"
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>@</span>
          <input
            type="number"
            value={tier.bps}
            onChange={e => updateTierBps(idx, e.target.value)}
            style={{ ...inputStyle, width: 52 }}
            min={0}
            step={0.1}
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>bps</span>
          <button
            onClick={() => removeTier(idx)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: t.neutrals.subtle, display: 'flex', alignItems: 'center',
            }}
          >
            <LIcon name="x" size={12} />
          </button>
        </div>
      ))}

      <button
        onClick={addTier}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontFamily: t.font.sans, color: t.brand[500],
          padding: '2px 0', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <LIcon name="plus" size={11} color={t.brand[500]} />
        Add Tier
      </button>
    </div>
  )
}

// ============ Props ============

export interface ProductDialogProps {
  open: boolean
  editEtf: ETFDisplayData | null
  onClose: () => void
  onSaved: () => void
}

const EMPTY_FEE: FeeStructure = { minFee: 0, tiers: [] }

// ============ ProductDialog ============

export function ProductDialog({ open, editEtf, onClose, onSaved }: ProductDialogProps) {
  const [symbol, setSymbol] = useState('')
  const [fundName, setFundName] = useState('')
  const [fundUrl, setFundUrl] = useState('')
  const [listingDate, setListingDate] = useState('')
  const [bank, setBank] = useState('ETC')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [platformFees, setPlatformFees] = useState<FeeStructure>(EMPTY_FEE)
  const [pmFees, setPmFees] = useState<FeeStructure>(EMPTY_FEE)
  const [saving, setSaving] = useState(false)

  // Populate form on open
  useEffect(() => {
    if (!open) return
    if (editEtf) {
      setSymbol(editEtf.symbol)
      setFundName(editEtf.fundName)
      setFundUrl(editEtf.fundUrl ?? '')
      setListingDate(editEtf.listingDate ?? '')
      setBank(editEtf.bank)
      setCurrency(editEtf.currency)
      setNotes(editEtf.notes ?? '')
      setPlatformFees(editEtf.platformFeeTiers ?? EMPTY_FEE)
      setPmFees(editEtf.pmFeeTiers ?? EMPTY_FEE)
    } else {
      setSymbol('')
      setFundName('')
      setFundUrl('')
      setListingDate('')
      setBank('ETC')
      setCurrency('USD')
      setNotes('')
      setPlatformFees(EMPTY_FEE)
      setPmFees(EMPTY_FEE)
    }
  }, [open, editEtf])

  if (!open) return null

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: t.radius.sm,
    border: 'none',
    background: t.neutrals.inner,
    fontSize: 12,
    fontFamily: t.font.sans,
    color: t.neutrals.text,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: t.neutrals.subtle,
    fontFamily: t.font.sans,
    marginBottom: 4,
  }

  const handleSave = async () => {
    if (!symbol.trim() || !fundName.trim()) return
    setSaving(true)
    try {
      const input = {
        symbol: symbol.trim().toUpperCase(),
        fund_name: fundName.trim(),
        fund_url: fundUrl.trim() || undefined,
        listing_date: listingDate || undefined,
        bank: bank.trim() || 'ETC',
        platform_fee_tiers: platformFees,
        pm_fee_tiers: pmFees,
        currency: currency.trim() || 'USD',
        notes: notes.trim() || undefined,
      }
      if (editEtf) {
        await updateETFProduct(editEtf.id, input)
      } else {
        await createETFProduct(input)
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editEtf || !confirm(`${editEtf.symbol} 상품을 삭제하시겠습니까?`)) return
    setSaving(true)
    try {
      await deleteETFProduct(editEtf.id)
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: t.neutrals.card,
          borderRadius: t.radius.lg,
          width: '100%',
          maxWidth: 480,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: 14, marginBottom: 0,
          borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{
            fontSize: 14, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, color: t.neutrals.text,
          }}>
            {editEtf ? '상품 수정' : '상품 추가'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, color: t.neutrals.subtle, display: 'flex', alignItems: 'center',
              borderRadius: t.radius.sm,
            }}
          >
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: 'auto', maxHeight: '70vh',
          paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Symbol */}
          <div>
            <label style={labelStyle}>Symbol *</label>
            <input
              style={inputStyle}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="KDEF"
            />
          </div>

          {/* Fund Name */}
          <div>
            <label style={labelStyle}>Fund Name *</label>
            <input
              style={inputStyle}
              value={fundName}
              onChange={e => setFundName(e.target.value)}
              placeholder="펀드명을 입력하세요"
            />
          </div>

          {/* Fund URL */}
          <div>
            <label style={labelStyle}>Fund URL</label>
            <input
              style={inputStyle}
              value={fundUrl}
              onChange={e => setFundUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Listing Date */}
          <div>
            <label style={labelStyle}>Listing Date</label>
            <input
              type="date"
              style={inputStyle}
              value={listingDate}
              onChange={e => setListingDate(e.target.value)}
            />
          </div>

          {/* Bank & Currency (row) */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Bank</label>
              <input
                style={inputStyle}
                value={bank}
                onChange={e => setBank(e.target.value)}
                placeholder="ETC"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Currency</label>
              <input
                style={inputStyle}
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                placeholder="USD"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="메모..."
            />
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${t.neutrals.line}`, margin: '4px 0' }} />

          {/* Platform Fee Tiers */}
          <FeeTierEditor
            label="Platform Fee Tiers"
            value={platformFees}
            onChange={setPlatformFees}
          />

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${t.neutrals.line}`, margin: '4px 0' }} />

          {/* PM Fee Tiers */}
          <FeeTierEditor
            label="PM Fee Tiers"
            value={pmFees}
            onChange={setPmFees}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14, borderTop: `1px solid ${t.neutrals.line}`,
          marginTop: 14,
        }}>
          {editEtf ? (
            <LBtn variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
              삭제
            </LBtn>
          ) : (
            <div />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <LBtn variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              취소
            </LBtn>
            <LBtn size="sm" onClick={handleSave} disabled={saving || !symbol.trim() || !fundName.trim()}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}
