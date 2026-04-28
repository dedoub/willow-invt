'use client'

import { useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { AkrosProduct } from '@/lib/supabase-etf'

interface ProductBlockProps {
  products: AkrosProduct[]
}

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_KEY = 'akros-product-page-size'

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtAum(v: number | null, currency: string): string {
  if (v == null) return '-'
  if (currency === 'KRW') return `${Math.round(v).toLocaleString('ko-KR')}억원`
  if (currency === 'AUD') {
    if (v >= 1000000) return `A$${(v / 1000000).toFixed(2)}M`
    if (v >= 1000) return `A$${(v / 1000).toFixed(1)}K`
    return `A$${v.toFixed(0)}`
  }
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function fmtFlow(v: number | null, currency: string): string {
  if (v == null) return '-'
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  if (currency === 'KRW') return `${sign}${Math.round(abs).toLocaleString()}억원`
  if (currency === 'AUD') {
    if (abs >= 1000000) return `${sign}A$${(abs / 1000000).toFixed(2)}M`
    if (abs >= 1000) return `${sign}A$${(abs / 1000).toFixed(1)}K`
    return `${sign}A$${abs.toFixed(0)}`
  }
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtArr(v: number | null, currency: string): string {
  if (v == null) return '-'
  if (currency === 'KRW') return `${v.toFixed(1)}억원`
  if (currency === 'AUD') {
    if (v >= 1000000) return `A$${(v / 1000000).toFixed(2)}M`
    if (v >= 1000) return `A$${(v / 1000).toFixed(1)}K`
    return `A$${v.toFixed(0)}`
  }
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function ProductBlock({ products }: ProductBlockProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const paged = products.slice(page * pageSize, (page + 1) * pageSize)

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(50, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

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
        <LSectionHead eyebrow="PRODUCTS" title="상품관리" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {products.length}개
          </span>
        } />
      </div>

      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 72 }} />
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 78 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr style={{ background: t.neutrals.inner, borderBottom: `1px solid ${t.neutrals.line}` }}>
              <th style={thStyle}>TICKER</th>
              <th style={thStyle}>COUNTRY</th>
              <th style={thStyle}>상품명</th>
              <th style={thStyle}>설정일</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>AUM</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>1M FLOW</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>ARR</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.symbol} style={{ borderBottom: `1px solid ${t.neutrals.line}` }}>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontWeight: 500 }}>{p.symbol}</td>
                <td style={{ ...tdStyle, fontSize: 10 }}>{p.country}</td>
                <td style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.product_name_local || p.product_name}
                </td>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.muted }}>
                  {p.listing_date || '-'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                  {fmtAum(p.market_cap, p.currency)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontFamily: t.font.mono,
                  color: (p.product_flow ?? 0) >= 0 ? '#16A34A' : '#DC2626',
                }}>
                  {fmtFlow(p.product_flow, p.currency)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono, fontWeight: 500 }}>
                  {fmtArr(p.arr, p.currency)}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle, padding: 30 }}>
                  상품 데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px',
        borderTop: `1px solid ${t.neutrals.line}`,
      }}>
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
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, products.length)} / {products.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
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
