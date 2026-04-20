'use client'

import { useState, useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBadge } from '@/app/willow-investment/_components/linear-badge'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
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
}

type PeriodMode = 'month' | 'quarter' | 'year'

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
  if (mode === 'quarter') {
    const q = Math.floor(m / 3) + 1
    return `${y}년 ${q}분기`
  }
  return `${y}년`
}

function navigatePeriod(base: Date, dir: -1 | 1, mode: PeriodMode): Date {
  const d = new Date(base)
  if (mode === 'month') d.setMonth(d.getMonth() + dir)
  else if (mode === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  else d.setFullYear(d.getFullYear() + dir)
  return d
}

const MODE_LABELS: Record<PeriodMode, string> = { month: '월', quarter: '분기', year: '연' }

export function CashBlock({ invoices, onAddInvoice }: CashBlockProps) {
  const [dragOver, setDragOver] = useState(false)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [baseDate, setBaseDate] = useState(new Date())

  const [rangeStart, rangeEnd] = useMemo(() => getDateRange(baseDate, periodMode), [baseDate, periodMode])
  const periodLabel = useMemo(() => getPeriodLabel(baseDate, periodMode), [baseDate, periodMode])

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      const d = inv.payment_date || inv.issue_date
      if (!d) return false
      return d >= rangeStart && d <= rangeEnd
    })
  }, [invoices, rangeStart, rangeEnd])

  const revenue = filtered.filter(i => i.type === 'revenue').reduce((s, i) => s + i.amount, 0)
  const expense = filtered.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const pending = filtered.filter(i => i.type === 'revenue' && i.status === 'issued').reduce((s, i) => s + i.amount, 0)

  const sortedInvoices = useMemo(() => {
    return [...filtered]
      .sort((a, b) => (b.payment_date || b.issue_date || '').localeCompare(a.payment_date || a.issue_date || ''))
  }, [filtered])

  const eyebrowLabel = periodMode === 'month' ? 'CASHFLOW · 월간'
    : periodMode === 'quarter' ? 'CASHFLOW · 분기' : 'CASHFLOW · 연간'

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow={eyebrowLabel} title="현금관리" action={
          <LBtn variant="secondary" size="sm" icon={<LIcon name="plus" size={12} stroke={2.2} />} onClick={onAddInvoice}>
            수동 추가
          </LBtn>
        } />

        {/* Period controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          {/* Mode toggle */}
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

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setBaseDate(navigatePeriod(baseDate, -1, periodMode))} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 4, color: t.neutrals.muted,
            }}>
              <LIcon name="chevronDown" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans, minWidth: 90, textAlign: 'center' }}>
              {periodLabel}
            </span>
            <button onClick={() => setBaseDate(navigatePeriod(baseDate, 1, periodMode))} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 4, color: t.neutrals.muted,
            }}>
              <LIcon name="chevronDown" size={13} stroke={2} />
            </button>
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <LStat label="수입" value={`${revenue.toLocaleString()}원`} tone="pos" />
          <LStat label="지출" value={`-${Math.abs(expense).toLocaleString()}원`} tone="neg" />
          <LStat label="미수" value={`${pending.toLocaleString()}원`} tone="warn" />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false) }}
        style={{
          margin: '0 16px 12px', padding: '12px 16px',
          border: `1.5px dashed ${dragOver ? t.brand[600] : t.neutrals.line}`,
          background: dragOver ? t.brand[50] : 'transparent',
          borderRadius: t.radius.md, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          transition: 'all .15s',
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
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>은행 엑셀 파일을 드래그하거나 클릭</div>
          <div style={{ fontSize: 11, color: t.neutrals.muted, marginTop: 2 }}>
            에이전트가 파싱해서 테이블에 반영합니다 · .xlsx .csv
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div style={{ padding: '0 16px 16px' }}>
        {sortedInvoices.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
            해당 기간 거래 내역이 없습니다
          </div>
        )}
        {sortedInvoices.map((v) => {
          const isIncome = v.type === 'revenue'
          const isDone = v.status === 'completed' || v.status === 'paid'
          const statusTone = isDone ? 'done' as const : 'pending' as const
          const statusLabel = isDone ? '완료' : '미수'
          return (
            <div key={v.id} style={{
              display: 'grid', gridTemplateColumns: '55px 1.2fr 1.8fr 1fr 60px',
              gap: 8, padding: '10px 0', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 12,
            }}>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 11 }}>
                {(v.payment_date || v.issue_date || '').slice(5)}
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
                {isIncome ? '+' : ''}{v.amount.toLocaleString()}
              </span>
              <span><LBadge tone={statusTone}>{statusLabel}</LBadge></span>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
