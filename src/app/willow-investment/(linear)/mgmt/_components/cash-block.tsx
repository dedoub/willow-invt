'use client'

import { useState, useMemo, useRef } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { LStat } from '@/app/willow-investment/_components/linear-stat'

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

interface CashBlockProps {
  invoices: Invoice[]
  onAddInvoice: () => void
  onSelectInvoice: (invoice: Invoice) => void
  onFileUpload: (file: File) => void
  parsing?: boolean
}

type PeriodMode = 'month' | 'quarter' | 'year'
type TypeFilter = 'all' | 'revenue' | 'expense' | 'asset' | 'liability'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'revenue', label: '매출' },
  { value: 'expense', label: '비용' },
  { value: 'asset', label: '자산' },
  { value: 'liability', label: '부채' },
]

const TYPE_TONES: Record<string, { bg: string; fg: string }> = {
  revenue:   { bg: '#DCE8F5', fg: '#1F4E79' },
  expense:   { bg: '#F9E8D0', fg: '#8A5A1A' },
  asset:     { bg: '#DAEEDD', fg: '#1F5F3D' },
  liability: { bg: '#F3DADA', fg: '#8A2A2A' },
}

const TYPE_LABELS: Record<string, string> = {
  revenue: '매출', expense: '비용', asset: '자산', liability: '부채',
}

function getDateRange(base: Date, mode: PeriodMode): [string, string] {
  const y = base.getFullYear()
  const m = base.getMonth()
  if (mode === 'month') {
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const last = new Date(y, m + 1, 0).getDate()
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return [start, end]
  }
  if (mode === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    const start = `${y}-${String(qStart + 1).padStart(2, '0')}-01`
    const endMonth = qStart + 3
    const last = new Date(y, endMonth, 0).getDate()
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return [start, end]
  }
  return [`${y}-01-01`, `${y}-12-31`]
}

function getPeriodLabel(base: Date, mode: PeriodMode): string {
  const y = base.getFullYear()
  const m = base.getMonth()
  if (mode === 'month') return `${y}년 ${m + 1}월`
  if (mode === 'quarter') return `${y}년 ${Math.floor(m / 3) + 1}분기`
  return `${y}년`
}

function navigatePeriod(base: Date, dir: -1 | 1, mode: PeriodMode): Date {
  const d = new Date(base)
  if (mode === 'month') d.setMonth(d.getMonth() + dir)
  else if (mode === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  else d.setFullYear(d.getFullYear() + dir)
  return d
}

const MODE_LABELS: Record<PeriodMode, string> = { month: '월간', quarter: '분기', year: '연간' }

export function CashBlock({ invoices, onAddInvoice, onSelectInvoice, onFileUpload, parsing }: CashBlockProps) {
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [baseDate, setBaseDate] = useState(new Date())
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [rangeStart, rangeEnd] = useMemo(() => getDateRange(baseDate, periodMode), [baseDate, periodMode])
  const periodLabel = useMemo(() => getPeriodLabel(baseDate, periodMode), [baseDate, periodMode])

  const periodFiltered = useMemo(() => {
    return invoices.filter(inv => {
      const d = inv.payment_date || inv.issue_date
      if (!d) return false
      return d >= rangeStart && d <= rangeEnd
    })
  }, [invoices, rangeStart, rangeEnd])

  const revenue = periodFiltered.filter(i => i.type === 'revenue').reduce((s, i) => s + i.amount, 0)
  const expense = periodFiltered.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const asset = periodFiltered.filter(i => i.type === 'asset').reduce((s, i) => s + i.amount, 0)
  const liability = periodFiltered.filter(i => i.type === 'liability').reduce((s, i) => s + i.amount, 0)
  const operatingIncome = revenue - expense
  const cashFlow = revenue - expense - asset + liability

  const displayList = useMemo(() => {
    const list = typeFilter === 'all' ? periodFiltered : periodFiltered.filter(i => i.type === typeFilter)
    return [...list].sort((a, b) => (b.payment_date || b.issue_date || '').localeCompare(a.payment_date || a.issue_date || ''))
  }, [periodFiltered, typeFilter])

  const eyebrowLabel = periodMode === 'month' ? 'CASHFLOW · 월간'
    : periodMode === 'quarter' ? 'CASHFLOW · 분기' : 'CASHFLOW · 연간'

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        {/* Header: eyebrow+title left, period mode toggle right */}
        <LSectionHead eyebrow={eyebrowLabel} title="현금 관리" action={
          <div style={{
            display: 'inline-flex', background: t.neutrals.inner,
            borderRadius: t.radius.sm, padding: 2,
          }}>
            {(['month', 'quarter', 'year'] as const).map((m) => (
              <button key={m} onClick={() => setPeriodMode(m)} style={{
                border: 'none',
                background: periodMode === m ? t.neutrals.card : 'transparent',
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4, cursor: 'pointer',
                fontWeight: periodMode === m ? 500 : 400, color: t.neutrals.text,
                fontFamily: t.font.sans,
              }}>{MODE_LABELS[m]}</button>
            ))}
          </div>
        } />

        {/* Navigation — centered */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
        }}>
          <button onClick={() => setBaseDate(navigatePeriod(baseDate, -1, periodMode))} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans, minWidth: 100, textAlign: 'center' }}>
            {periodLabel}
          </span>
          <button onClick={() => setBaseDate(navigatePeriod(baseDate, 1, periodMode))} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <LStat label="매출" value={`${revenue.toLocaleString()}원`} tone="pos" />
          <LStat label="비용" value={`${expense.toLocaleString()}원`} tone="neg" />
          <LStat label="영업이익" value={`${operatingIncome.toLocaleString()}원`} tone={operatingIncome >= 0 ? 'pos' : 'neg'} />
          <LStat label="자산" value={`${asset.toLocaleString()}원`} tone="info" />
          <LStat label="부채" value={`${liability.toLocaleString()}원`} tone="warn" />
          <LStat label="현금흐름" value={`${cashFlow.toLocaleString()}원`} tone={cashFlow >= 0 ? 'pos' : 'neg'} />
        </div>

        {/* Type filter chips + add button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {TYPE_FILTERS.map(f => {
              const active = typeFilter === f.value
              return (
                <button key={f.value} onClick={() => setTypeFilter(f.value)} style={{
                  border: 'none', cursor: 'pointer',
                  padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
                  fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
                  background: active ? t.brand[100] : t.neutrals.inner,
                  color: active ? t.brand[700] : t.neutrals.muted,
                  transition: 'all .12s',
                }}>{f.label}</button>
              )
            })}
          </div>
          <button onClick={onAddInvoice} style={{
            width: 24, height: 24, borderRadius: t.radius.sm, border: 'none',
            background: t.neutrals.inner, color: t.neutrals.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, flexShrink: 0,
          }}>
            <LIcon name="plus" size={12} stroke={2.5} />
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <input
        ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); e.target.value = '' }}
      />
      <div
        onClick={() => !parsing && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f && !parsing) onFileUpload(f)
        }}
        style={{
          margin: '0 16px 12px', padding: '12px 16px',
          border: `1.5px dashed ${dragOver ? t.brand[600] : t.neutrals.line}`,
          background: dragOver ? t.brand[50] : 'transparent',
          borderRadius: t.radius.md, cursor: parsing ? 'wait' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          transition: 'all .15s', opacity: parsing ? 0.6 : 1,
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: t.brand[50], color: t.brand[700],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <LIcon name="file" size={16} stroke={1.8} />
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>
            {parsing ? 'Gemini가 파싱 중...' : '은행 엑셀 파일을 드래그하거나 클릭'}
          </div>
          <div style={{ fontSize: 11, color: t.neutrals.muted, marginTop: 2 }}>
            {parsing ? '잠시만 기다려주세요' : 'AI가 파싱해서 테이블에 반영합니다 · .xlsx .csv'}
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div style={{ padding: '0 16px 16px' }}>
        {displayList.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            해당 기간 거래 내역이 없습니다
          </div>
        )}
        {displayList.map((v) => {
          const typeTone = TYPE_TONES[v.type]
          const isIncome = v.type === 'revenue' || v.type === 'asset'
          return (
            <div key={v.id} onClick={() => onSelectInvoice(v)} style={{
              display: 'grid', gridTemplateColumns: '52px 48px 1.2fr 1.5fr 1fr',
              gap: 8, padding: '10px 0', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 12, cursor: 'pointer',
            }}>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 11 }}>
                {(v.payment_date || v.issue_date || '').slice(5)}
              </span>
              <span style={{
                display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
                fontSize: 10, fontWeight: t.weight.medium, textAlign: 'center',
                background: typeTone.bg, color: typeTone.fg,
              }}>
                {TYPE_LABELS[v.type]}
              </span>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.counterparty}
              </span>
              <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.description}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                color: isIncome ? t.accent.pos : t.accent.neg,
              }}>
                {isIncome ? '+' : '-'}{Math.abs(v.amount).toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
