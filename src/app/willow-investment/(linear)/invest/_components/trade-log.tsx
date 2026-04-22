'use client'

import { useState, useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface StockTrade {
  id?: string
  trade_date?: string
  ticker: string
  company_name: string
  trade_type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount?: number
  currency: string
  broker?: string
  memo?: string
}

interface TradeLogProps {
  trades: StockTrade[]
}

const PAGE_SIZE = 20

export function TradeLog({ trades }: TradeLogProps) {
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const da = a.trade_date || ''
      const db = b.trade_date || ''
      return db.localeCompare(da)
    })
  }, [trades])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="TRADES" title="매매기록" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {sorted.length}건
          </span>
        } />
      </div>

      {/* Header row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '70px 50px 1.2fr 60px 90px 100px',
        gap: 8, padding: '6px 14px', fontSize: 10, fontWeight: t.weight.semibold,
        color: t.neutrals.subtle, fontFamily: t.font.mono,
        textTransform: 'uppercase' as const, letterSpacing: 0.5,
      }}>
        <span>날짜</span>
        <span>구분</span>
        <span>종목</span>
        <span style={{ textAlign: 'right' }}>수량</span>
        <span style={{ textAlign: 'right' }}>단가</span>
        <span style={{ textAlign: 'right' }}>금액</span>
      </div>

      {/* Rows */}
      <div>
        {paged.map((tr, i) => {
          const isBuy = tr.trade_type === 'buy'
          const amount = tr.total_amount ?? tr.quantity * tr.price
          const isKRW = tr.currency === 'KRW'
          return (
            <div key={tr.id || i} style={{
              display: 'grid', gridTemplateColumns: '70px 50px 1.2fr 60px 90px 100px',
              gap: 8, padding: '8px 14px', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 12,
            }}>
              <span style={{ fontFamily: t.font.mono, fontSize: 11, color: t.neutrals.muted }}>
                {(tr.trade_date || '').slice(5)}
              </span>
              <span style={{
                display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
                fontSize: 10, fontWeight: t.weight.medium, textAlign: 'center',
                background: isBuy ? '#F3DADA' : '#DCE8F5',
                color: isBuy ? '#8A2A2A' : '#1F4E79',
              }}>
                {isBuy ? '매수' : '매도'}
              </span>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: t.weight.medium }}>
                  {tr.ticker.replace('.KS', '')}
                </span>
                <span style={{ color: t.neutrals.muted, marginLeft: 4, fontSize: 11 }}>
                  {tr.company_name}
                </span>
              </div>
              <span style={{
                textAlign: 'right', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
              }}>
                {tr.quantity.toLocaleString()}
              </span>
              <span style={{
                textAlign: 'right', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
                color: t.neutrals.muted, fontSize: 11,
              }}>
                {isKRW ? `${tr.price.toLocaleString()}` : `$${tr.price.toFixed(2)}`}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: t.weight.medium,
                fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
                color: isBuy ? t.accent.neg : t.accent.pos,
              }}>
                {isBuy ? '-' : '+'}{isKRW ? `${amount.toLocaleString()}` : `$${amount.toLocaleString()}`}
              </span>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div style={{
            padding: '20px 14px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>매매 기록이 없습니다</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '10px 14px',
          borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{
              background: 'transparent', border: 'none', cursor: page === 0 ? 'default' : 'pointer',
              padding: 4, borderRadius: 4, color: page === 0 ? t.neutrals.line : t.neutrals.muted,
              opacity: page === 0 ? 0.4 : 1,
            }}
          >
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{
            fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
            minWidth: 60, textAlign: 'center',
          }}>
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
            style={{
              background: 'transparent', border: 'none',
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              padding: 4, borderRadius: 4,
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
              opacity: page >= totalPages - 1 ? 0.4 : 1,
            }}
          >
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>
      )}
    </LCard>
  )
}
