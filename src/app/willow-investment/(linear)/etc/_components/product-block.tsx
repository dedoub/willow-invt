'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { ETFDisplayData } from '@/lib/supabase-etf'

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
  return n >= 5 && n <= 50 ? n : DEFAULT_PAGE_SIZE
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

export function ProductBlock({ etfs, onAdd, onEdit, onDocuments, onDelete, onRefresh }: ProductBlockProps) {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const totalPages = Math.max(1, Math.ceil(etfs.length / pageSize))
  const paged = etfs.slice(page * pageSize, (page + 1) * pageSize)

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
        <LSectionHead eyebrow="PRODUCTS" title="상품 관리" action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
              {etfs.length}개
            </span>
            <button onClick={onRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}>
              <LIcon name="refresh" size={13} />
            </button>
            <LBtn size="sm" icon={<LIcon name="plus" size={14} color="#fff" />} onClick={onAdd}>추가</LBtn>
          </div>
        } />
      </div>

      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 72 }} />
            <col />
            <col style={{ width: 78 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr style={{ background: t.neutrals.inner, borderBottom: `1px solid ${t.neutrals.line}` }}>
              <th style={thStyle}>SYMBOL</th>
              <th style={thStyle}>FUND NAME</th>
              <th style={thStyle}>LISTING</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>AUM</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>FLOW</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>FEE/MO</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>REMAINING</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {paged.map(etf => (
              <tr key={etf.id} style={{ borderBottom: `1px solid ${t.neutrals.line}` }}>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontWeight: 500 }}>
                  {etf.fundUrl ? (
                    <a href={etf.fundUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: t.brand[500], textDecoration: 'none' }}>{etf.symbol}</a>
                  ) : etf.symbol}
                </td>
                <td style={{ ...tdStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {etf.fundName}
                </td>
                <td style={{ ...tdStyle, fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.muted }}>
                  {etf.listingDate || '-'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                  {fmtUsd(etf.aum)}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontFamily: t.font.mono,
                  color: (etf.flow ?? 0) >= 0 ? '#16A34A' : '#DC2626',
                }}>
                  {fmtFlow(etf.flow)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                  {fmtUsd(etf.totalMonthlyFee)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono, fontWeight: 500 }}>
                  {fmtUsd(etf.remainingFee)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <button onClick={() => onEdit(etf)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}>
                      <LIcon name="pencil" size={12} />
                    </button>
                    <button onClick={() => onDocuments(etf)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}>
                      <LIcon name="file" size={12} />
                    </button>
                    <button onClick={() => { if (confirm(`${etf.symbol} 삭제?`)) onDelete(etf) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.neutrals.subtle }}>
                      <LIcon name="x" size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle, padding: 30 }}>
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
        padding: '6px 16px', borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input value={pageSizeInput}
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
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, etfs.length)} / {etfs.length}
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
