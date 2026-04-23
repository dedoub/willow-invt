'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { AkrosProduct } from '@/lib/supabase-etf'

interface ProductBlockProps {
  products: AkrosProduct[]
}

const PAGE_SIZE = 10

function fmtAum(v: number | null, currency: string): string {
  if (v == null) return '-'
  if (currency === 'KRW') return `₩${(v / 100000000).toFixed(1)}억`
  return `$${(v / 1000000).toFixed(1)}M`
}

function fmtFlow(v: number | null): string {
  if (v == null) return '-'
  const prefix = v >= 0 ? '+' : ''
  return `${prefix}$${(v / 1000000).toFixed(1)}M`
}

function fmtDate(d: string | null): string {
  if (!d) return '-'
  return d.slice(0, 10)
}

export function ProductBlock({ products }: ProductBlockProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE))
  const paged = products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const thStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: 10, fontFamily: t.font.mono,
    fontWeight: 600, color: t.neutrals.subtle, textAlign: 'left',
    letterSpacing: 0.3, whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: 11.5, fontFamily: t.font.sans,
    color: t.neutrals.text, whiteSpace: 'nowrap',
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="PRODUCTS" title="상품 관리" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {products.length}개
          </span>
        } />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: t.neutrals.inner, borderBottom: `1px solid ${t.neutrals.line}` }}>
              <th style={thStyle}>TICKER</th>
              <th style={thStyle}>상품명</th>
              <th style={thStyle}>COUNTRY</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>AUM</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>FLOW</th>
              <th style={thStyle}>설정일</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.symbol} style={{ borderBottom: `1px solid ${t.neutrals.line}` }}>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontWeight: 500 }}>{p.symbol}</td>
                <td style={{ ...tdStyle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.product_name_local || p.product_name}
                </td>
                <td style={tdStyle}>{p.country}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                  {fmtAum(p.market_cap, p.currency)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontFamily: t.font.mono,
                  color: (p.product_flow ?? 0) >= 0 ? '#16A34A' : '#DC2626',
                }}>
                  {fmtFlow(p.product_flow)}
                </td>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontSize: 10 }}>
                  {fmtDate(p.listing_date)}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle, padding: 30 }}>
                  상품 데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '8px 14px', gap: 6,
          borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page === 0 ? 'default' : 'pointer',
              color: page === 0 ? t.neutrals.line : t.neutrals.muted,
            }}>
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page + 1} / {totalPages}
          </span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
            }}>
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      )}
    </LCard>
  )
}
