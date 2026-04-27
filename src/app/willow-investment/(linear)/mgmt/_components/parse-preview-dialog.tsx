'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

export interface ParsedTransaction {
  date: string
  counterparty: string
  description: string
  amount: number
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer'
  _selected: boolean
}

interface ParsePreviewDialogProps {
  open: boolean
  transactions: ParsedTransaction[]
  bankName: string | null
  onClose: () => void
  onConfirm: (transactions: ParsedTransaction[]) => Promise<void>
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

const TYPE_CYCLE: ParsedTransaction['type'][] = ['revenue', 'expense', 'asset', 'liability']

export function ParsePreviewDialog({ open, transactions: initial, bankName, onClose, onConfirm }: ParsePreviewDialogProps) {
  const [rows, setRows] = useState<ParsedTransaction[]>(initial)
  const [saving, setSaving] = useState(false)

  if (!open || rows.length === 0) return null

  const selectedCount = rows.filter(r => r._selected).length
  const allSelected = selectedCount === rows.length

  const toggleAll = () => {
    const next = !allSelected
    setRows(prev => prev.map(r => ({ ...r, _selected: next })))
  }

  const toggleRow = (idx: number) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _selected: !r._selected } : r))
  }

  const cycleType = (idx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const curIdx = TYPE_CYCLE.indexOf(r.type)
      return { ...r, type: TYPE_CYCLE[(curIdx + 1) % TYPE_CYCLE.length] }
    }))
  }

  const handleConfirm = async () => {
    const selected = rows.filter(r => r._selected)
    if (selected.length === 0) return
    setSaving(true)
    try {
      await onConfirm(selected)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 640, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              IMPORT PREVIEW
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              파싱 결과 확인 {bankName && <span style={{ fontWeight: 400, color: t.neutrals.muted, fontSize: 12, marginLeft: 6 }}>· {bankName}</span>}
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

        {/* Info bar */}
        <div style={{
          margin: '0 20px 8px', padding: '8px 12px', borderRadius: t.radius.sm,
          background: t.neutrals.inner, fontSize: 11.5, color: t.neutrals.muted, fontFamily: t.font.sans,
        }}>
          {rows.length}건 파싱됨 · {selectedCount}건 선택 · 유형 배지를 클릭하면 변경 가능
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '28px 72px 44px 1fr 1.2fr auto',
            gap: 6, padding: '8px 0', fontSize: 10, fontFamily: t.font.mono,
            color: t.neutrals.subtle, letterSpacing: 0.5, textTransform: 'uppercase' as const,
          }}>
            <span style={{ cursor: 'pointer' }} onClick={toggleAll}>
              <CheckBox checked={allSelected} />
            </span>
            <span>날짜</span>
            <span>유형</span>
            <span>거래처</span>
            <span>적요</span>
            <span style={{ textAlign: 'right' }}>금액</span>
          </div>

          {rows.map((row, idx) => {
            const tone = TYPE_TONES[row.type]
            const isIncome = row.type === 'revenue' || row.type === 'asset'
            return (
              <div key={idx} style={{
                display: 'grid', gridTemplateColumns: '28px 72px 44px 1fr 1.2fr auto',
                gap: 6, padding: '8px 0', alignItems: 'center',
                borderTop: `1px solid ${t.neutrals.line}`,
                fontSize: 12, opacity: row._selected ? 1 : 0.4,
              }}>
                <span style={{ cursor: 'pointer' }} onClick={() => toggleRow(idx)}>
                  <CheckBox checked={row._selected} />
                </span>
                <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 11 }}>
                  {row.date.slice(5)}
                </span>
                <span onClick={() => cycleType(idx)} style={{
                  display: 'inline-block', padding: '2px 5px', borderRadius: t.radius.sm,
                  fontSize: 9.5, fontWeight: t.weight.medium, textAlign: 'center', cursor: 'pointer',
                  background: tone.bg, color: tone.fg,
                }}>
                  {TYPE_LABELS[row.type]}
                </span>
                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.counterparty}
                </span>
                <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.description}
                </span>
                <span style={{
                  textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                  color: isIncome ? t.accent.pos : t.accent.neg, whiteSpace: 'nowrap',
                }}>
                  {isIncome ? '+' : '-'}{row.amount.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11.5, color: t.neutrals.muted, fontFamily: t.font.sans }}>
            {selectedCount}건 반영 예정
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
            <LBtn variant="brand" size="sm" onClick={handleConfirm} disabled={saving || selectedCount === 0}>
              {saving ? '저장 중...' : `${selectedCount}건 반영`}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: 4,
      background: checked ? t.brand[600] : t.neutrals.inner,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all .12s',
    }}>
      {checked && (
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </div>
  )
}
