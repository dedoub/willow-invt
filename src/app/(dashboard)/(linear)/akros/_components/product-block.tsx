'use client'

import { useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import type { AkrosProduct } from '@/lib/etf-types'
import {
  LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableMono, LTableDate, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'

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
  return n >= 1 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtAum(v: number | null, currency: string): string {
  if (v == null) return '-'
  if (currency === 'KRW') return `${Math.round(v).toLocaleString('ko-KR')}억원`
  if (currency === 'AUD') {
    if (v >= 1000000) return `A$${(v / 1000000).toFixed(2)}M`
    if (v >= 1000) return `A$${(v / 1000).toFixed(1)}K`
    return `A$${v.toFixed(0)}`
  }
  if (currency === 'JPY') {
    if (v >= 1000000) return `¥${(v / 1000000).toFixed(2)}M`
    if (v >= 1000) return `¥${(v / 1000).toFixed(1)}K`
    return `¥${v.toFixed(0)}`
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
  if (currency === 'JPY') {
    if (abs >= 1000000) return `${sign}¥${(abs / 1000000).toFixed(2)}M`
    if (abs >= 1000) return `${sign}¥${(abs / 1000).toFixed(1)}K`
    return `${sign}¥${abs.toFixed(0)}`
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
  if (currency === 'JPY') {
    if (v >= 1000000) return `¥${(v / 1000000).toFixed(2)}M`
    if (v >= 1000) return `¥${(v / 1000).toFixed(1)}K`
    return `¥${v.toFixed(0)}`
  }
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

const COLUMNS: LColumn[] = [
  { key: 'ticker', label: 'TICKER', width: '72px' },
  { key: 'country', label: 'COUNTRY', width: '62px' },
  { key: 'name', label: '상품명', width: 'minmax(180px,1fr)' },
  { key: 'listing', label: '설정일', width: '92px' },
  { key: 'aum', label: 'AUM', width: '100px', align: 'right' },
  { key: 'flow', label: '1M FLOW', width: '104px', align: 'right' },
  { key: 'arr', label: 'ARR', width: '80px', align: 'right' },
]

export function ProductBlock({ products }: ProductBlockProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const paged = products.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadX }}>
        <LSectionHead eyebrow="PRODUCTS" title="상품관리" action={
          <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {products.length}개
          </span>
        } />
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.panelPadX}px` }}>
        <LTableScroll columns={COLUMNS}>
          <LTableHead columns={COLUMNS} />
          {paged.length === 0 && <LTableEmpty>상품 데이터가 없습니다</LTableEmpty>}
          <LTableBody columns={COLUMNS}>
            {paged.map(p => (
              <LTableRow key={p.symbol} columns={COLUMNS}>
                <LTableMono tone="text" strong>{p.symbol}</LTableMono>
                <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, whiteSpace: 'nowrap' }}>{p.country}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.product_name_local || p.product_name}
                </span>
                <LTableDate value={p.listing_date} format="full" />
                <LTableMono align="right" tone="text">{fmtAum(p.market_cap, p.currency)}</LTableMono>
                <LTableMono align="right" tone={(p.product_flow ?? 0) >= 0 ? 'text' : 'neg'}>
                  <span style={{ color: (p.product_flow ?? 0) >= 0 ? t.accent.pos : undefined }}>
                    {fmtFlow(p.product_flow, p.currency)}
                  </span>
                </LTableMono>
                <LTableMono align="right" tone="text" strong>{fmtArr(p.arr, p.currency)}</LTableMono>
              </LTableRow>
            ))}
          </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`,
        borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, products.length)} / {products.length}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
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
