'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

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

const TRADE_PAGE_KEY = 'trade-page-size'
const DEFAULT_PAGE_SIZE = 20

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(TRADE_PAGE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

export function TradeLog({ trades }: TradeLogProps) {
  const mobile = useIsMobile()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const da = a.trade_date || ''
      const db = b.trade_date || ''
      return db.localeCompare(da)
    })
  }, [trades])

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(TRADE_PAGE_KEY, String(n))
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

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
      <div style={{ overflowX: mobile ? 'auto' : undefined }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '70px 50px 1.2fr 60px 90px 100px',
        gap: 8, padding: '6px 14px', fontSize: 10, fontWeight: t.weight.semibold,
        color: t.neutrals.subtle, fontFamily: t.font.mono,
        textTransform: 'uppercase' as const, letterSpacing: 0.5,
        minWidth: mobile ? 500 : undefined,
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
              minWidth: mobile ? 500 : undefined,
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
      </div>

      {/* Pagination bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px',
        borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        {/* Page size input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={pageSizeInput}
            onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPageSize}
            onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
            style={{
              width: 32, textAlign: 'center', border: 'none',
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page === 0 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{
              fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted,
            }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                padding: 4, borderRadius: 4,
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </LCard>
  )
}
