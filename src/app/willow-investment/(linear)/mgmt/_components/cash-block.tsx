'use client'

import { useState } from 'react'
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

export function CashBlock({ invoices, onAddInvoice }: CashBlockProps) {
  const [dragOver, setDragOver] = useState(false)

  const revenue = invoices.filter(i => i.type === 'revenue').reduce((s, i) => s + i.amount, 0)
  const expense = invoices.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const pending = invoices.filter(i => i.type === 'revenue' && i.status === 'issued').reduce((s, i) => s + i.amount, 0)

  const recentInvoices = [...invoices]
    .sort((a, b) => (b.payment_date || b.issue_date || '').localeCompare(a.payment_date || a.issue_date || ''))
    .slice(0, 8)

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="CASHFLOW · 이번 달" title="현금관리" action={
          <LBtn variant="secondary" size="sm" icon={<LIcon name="plus" size={12} stroke={2.2} />} onClick={onAddInvoice}>
            수동 추가
          </LBtn>
        } />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
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

      {/* Recent invoices */}
      <div style={{ padding: '0 16px 16px' }}>
        {recentInvoices.map((v) => {
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
