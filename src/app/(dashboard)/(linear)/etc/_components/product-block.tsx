'use client'

import { useState } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import type { ETFDisplayData } from '@/lib/etf-types'
import { LPageSize, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty, LTableMono, type LColumn } from '@/app/(dashboard)/_components/linear-table'

interface ProductBlockProps {
  etfs: ETFDisplayData[]
  onAdd: () => void
  onEdit: (etf: ETFDisplayData) => void
  onDocuments: (etf: ETFDisplayData) => void
  onDelete: (etf: ETFDisplayData) => void
  onRefresh: () => void
}

const DEFAULT_PAGE_SIZE = 5
const PAGE_SIZE_KEY = 'etc-product-page-size'

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtUsd(v: number | null): string {
  if (v == null) return '-'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function fmtFlow(v: number | null): string {
  if (v == null) return '-'
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

const COLUMNS: LColumn<ETFDisplayData>[] = [
  { key: 'symbol', label: 'Symbol', width: 'minmax(72px,0.6fr)' },
  { key: 'fundName', label: 'Fund name', width: 'minmax(160px,2fr)' },
  { key: 'listing', label: 'Listing', width: 'minmax(80px,0.7fr)', hideMobile: true },
  { key: 'aum', label: 'AUM', width: 'minmax(72px,0.6fr)', align: 'right' },
  { key: 'flow', label: '1M flow', width: 'minmax(72px,0.6fr)', align: 'right', hideMobile: true },
  { key: 'fee', label: 'Fee/mo', width: 'minmax(72px,0.6fr)', align: 'right', hideMobile: true },
  { key: 'remaining', label: 'Remaining', width: 'minmax(80px,0.6fr)', align: 'right' },
  { key: 'actions', label: '', width: '72px', align: 'center' },
]

export function ProductBlock({ etfs, onAdd, onEdit, onDocuments, onDelete, onRefresh }: ProductBlockProps) {
  const mobile = useIsMobile()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const totalPages = Math.max(1, Math.ceil(etfs.length / pageSize))
  const paged = etfs.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadX }}>
        <LSectionHead eyebrow="PRODUCTS" title="상품관리" action={
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <LHeadBtn icon="refresh" title="새로고침" onClick={onRefresh} />
            <LBtn size="sm" icon={<LIcon name="plus" size={14} color={t.neutrals.text} />} onClick={onAdd}>추가</LBtn>
          </div>
        } />
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.panelPadX}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
          <LTableHead columns={COLUMNS} mobile={mobile} />
          {paged.length === 0 && <LTableEmpty>상품 데이터가 없습니다</LTableEmpty>}
          <LTableBody columns={COLUMNS} mobile={mobile}>
            {paged.map(etf => (
              <LTableRow key={etf.id} columns={COLUMNS} mobile={mobile}>
                <LTableMono tone="text" strong>
                  {etf.fundUrl ? (
                    <a href={etf.fundUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: t.brand[500], textDecoration: 'none' }}>{etf.symbol}</a>
                  ) : etf.symbol}
                </LTableMono>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.neutrals.text }}>
                  {etf.fundName}
                </span>
                {!mobile && <LTableMono>{etf.listingDate || '-'}</LTableMono>}
                <LTableMono align="right" tone="text">{fmtUsd(etf.aum)}</LTableMono>
                {!mobile && (
                  <LTableMono align="right">
                    <span style={{ color: (etf.flow ?? 0) >= 0 ? t.accent.pos : t.accent.neg }}>{fmtFlow(etf.flow)}</span>
                  </LTableMono>
                )}
                {!mobile && <LTableMono align="right" tone="text">{fmtUsd(etf.totalMonthlyFee)}</LTableMono>}
                <LTableMono align="right" tone="text" strong>{fmtUsd(etf.remainingFee)}</LTableMono>
                <div style={{ display: 'flex', gap: t.density.tableRowGap, justifyContent: 'center' }}>
                  <button onClick={() => onEdit(etf)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: t.density.gapXs, color: t.neutrals.subtle }}>
                    <LIcon name="pencil" size={12} />
                  </button>
                  <button onClick={() => onDocuments(etf)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: t.density.gapXs, color: t.neutrals.subtle }}>
                    <LIcon name="file" size={12} />
                  </button>
                  <button onClick={() => { if (confirm(`${etf.symbol} 삭제?`)) onDelete(etf) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: t.density.gapXs, color: t.neutrals.subtle }}>
                    <LIcon name="x" size={12} />
                  </button>
                </div>
              </LTableRow>
            ))}
          </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
          <span style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>{etfs.length}개</span>
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
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, etfs.length)} / {etfs.length}
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
