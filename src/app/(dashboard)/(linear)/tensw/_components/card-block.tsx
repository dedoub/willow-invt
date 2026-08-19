'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { TenswCardApproval, TenswCardBilling } from '@/types/tensw-mgmt'

const DEFAULT_PAGE_SIZE = 8
const PAGE_SIZE_KEY = 'tensw-card-page-size'

// 사용액은 두 기준이 있고 숫자가 다르다. 축도 다르다.
//   billing  = 이용명세서. 청구월(=결제월) 기준. 할부·연회비·해외이용이 반영된 실제 결제액.
//              202603 명세서 9,802,131원은 은행의 2026-03-05 "2월 이용대금" 출금과 일치한다.
//   approval = 승인내역. 사용월 기준. 할부도 승인 시점에 전액 잡히고 취소분은 뺀다.
// 두 값이 다른 건 정상이다. 무엇을 보고 싶은지에 따라 고른다.
type Basis = 'billing' | 'approval'

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

interface CardBlockProps {
  approvals: TenswCardApproval[]
  billing: TenswCardBilling[]
  year: number
  onYearChange: (year: number) => void
  style?: React.CSSProperties
}

export function CardBlock({ approvals, billing, year, onYearChange, style }: CardBlockProps) {
  const mobile = useIsMobile()
  const [basis, setBasis] = useState<Basis>('billing')
  const [month, setMonth] = useState<string | null>(null) // 'YYYY-MM' 선택 시 그 달만
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize] = useState(getStoredPageSize)

  // 취소·거절 건은 사용액에서 뺀다.
  const live = useMemo(() => approvals.filter(a => a.cancel_yn !== '1' && a.cancel_yn !== '3'), [approvals])

  const monthly = useMemo(() => {
    const map = new Map<string, number>()
    for (let m = 1; m <= 12; m++) map.set(`${year}-${String(m).padStart(2, '0')}`, 0)

    if (basis === 'billing') {
      for (const b of billing) {
        const key = `${b.billing_month.slice(0, 4)}-${b.billing_month.slice(4, 6)}`
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + b.total_amount)
      }
    } else {
      for (const a of live) {
        const key = a.used_date.slice(0, 7)
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + a.krw)
      }
    }
    return [...map.entries()].map(([key, amount]) => ({ key, amount }))
  }, [basis, billing, live, year])

  const maxMonthly = Math.max(1, ...monthly.map(m => m.amount))
  const yearTotal = monthly.reduce((s, m) => s + m.amount, 0)
  const activeMonths = monthly.filter(m => m.amount > 0).length
  const avgMonthly = activeMonths ? Math.round(yearTotal / activeMonths) : 0

  // 가맹점 집계는 승인내역으로만 낼 수 있다. 명세서에는 가맹점이 없다.
  const topStore = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of live) {
      const name = a.store_name || '미상'
      map.set(name, (map.get(name) ?? 0) + a.krw)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0]
  }, [live])

  const cancelled = approvals.filter(a => a.cancel_yn === '1' || a.cancel_yn === '2')
  const cancelTotal = cancelled.reduce((s, a) => s + (a.cancel_amount ?? a.krw), 0)

  const filtered = useMemo(() => {
    let rows = approvals
    if (month) rows = rows.filter(a => a.used_date.startsWith(month))
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(a => (a.store_name ?? '').toLowerCase().includes(q))
    return rows
  }, [approvals, month, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const setBasisAndReset = (b: Basis) => { setBasis(b); setPage(0) }
  const pickMonth = (key: string) => {
    setMonth(prev => (prev === key ? null : key))
    setPage(0)
  }

  const basisLabel = basis === 'billing' ? '이용명세서 기준 · 청구월' : '승인내역 기준 · 사용월'

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow={`CARD · ${basis === 'billing' ? '명세서' : '승인'}`}
          title="카드승인내역"
          action={
            <LSegmented
              value={basis}
              onChange={setBasisAndReset}
              options={[
                { value: 'billing', label: '명세서' },
                { value: 'approval', label: '승인' },
              ]}
            />
          }
        />

        {/* Year navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={() => { onYearChange(year - 1); setMonth(null); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{ fontSize: 'calc(12px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans, minWidth: 60, textAlign: 'center' }}>
            {year}년
          </span>
          <button onClick={() => { onYearChange(year + 1); setMonth(null); setPage(0) }} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 4, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
          <LStat label="연간 합계" value={`${yearTotal.toLocaleString()}원`} tone="neg" sub={basisLabel} />
          <LStat label="월 평균" value={`${avgMonthly.toLocaleString()}원`} sub={`${activeMonths}개월 기준`} />
          <LStat label={basis === 'billing' ? '결제 건수' : '승인 건수'} value={`${live.length.toLocaleString()}건`} sub={cancelled.length ? `취소 ${cancelled.length}건 ${cancelTotal.toLocaleString()}원` : undefined} />
          <LStat label="최다 가맹점" value={topStore ? topStore[0] : '-'} sub={topStore ? `${Math.round(topStore[1]).toLocaleString()}원` : undefined} />
        </div>

        {/* 월별 사용액 — 막대를 눌러 그 달 승인내역만 본다 */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: mobile ? 3 : 5, height: 72,
          }}>
            {monthly.map(m => {
              const selected = month === m.key
              const h = Math.max(2, Math.round((m.amount / maxMonthly) * 56))
              return (
                <button
                  key={m.key}
                  onClick={() => pickMonth(m.key)}
                  title={`${m.key} ${m.amount.toLocaleString()}원`}
                  style={{
                    flex: 1, border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%',
                  }}
                >
                  <span style={{
                    width: '100%', height: h, borderRadius: 3,
                    background: selected ? t.brand[600] : m.amount > 0 ? t.brand[200] : t.neutrals.line,
                    transition: 'background .12s',
                  }} />
                  <span style={{
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono,
                    color: selected ? t.brand[700] : t.neutrals.subtle,
                  }}>
                    {Number(m.key.slice(5))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginTop: 10 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder={month ? `${month} 가맹점 검색` : '가맹점 검색'}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px 7px 30px', fontSize: 'calc(12px * var(--fz, 1))',
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.inner, border: 'none',
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {(search || month) && (
            <button onClick={() => { setSearch(''); setMonth(null); setPage(0) }} style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 2, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
            }}>
              <LIcon name="x" size={12} stroke={2} />
            </button>
          )}
        </div>
      </div>

      {/* 승인내역 */}
      <div style={{ padding: '0 16px 16px' }}>
        {paged.length === 0 && (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>
            승인내역이 없습니다
          </div>
        )}
        {paged.map(a => {
          const isCancel = a.cancel_yn === '1' || a.cancel_yn === '2'
          const installment = a.payment_type === '2' && a.installment_month
          return (
            <div key={a.id} style={{
              display: 'grid',
              gridTemplateColumns: mobile ? '46px 1fr 1fr' : '46px 1.6fr 90px 1fr',
              gap: 8, padding: '10px 0', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 'calc(12px * var(--fz, 1))',
            }}>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))' }}>
                {a.used_date.slice(5)}
              </span>
              <span style={{
                fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: isCancel ? 'line-through' : undefined,
                color: isCancel ? t.neutrals.subtle : undefined,
              }}>
                {a.store_name || '미상'}
              </span>
              {!mobile && (
                <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle }}>
                  {a.card_no.slice(-4)}
                  {a.home_foreign_type === '2' ? ' · 해외' : ''}
                  {installment ? ` · ${a.installment_month}개월` : ''}
                </span>
              )}
              <span style={{
                textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                color: isCancel ? t.neutrals.subtle : t.accent.neg,
              }}>
                {isCancel ? '' : '-'}{Math.round(a.krw).toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px', borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.mono }}>
          {filtered.length.toLocaleString()}건
          {month ? ` · ${month}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page === 0 ? 'default' : 'pointer',
              color: page === 0 ? t.neutrals.line : t.neutrals.muted, display: 'flex',
            }}
          >
            <LIcon name="chevronLeft" size={13} stroke={2} />
          </button>
          <span style={{ fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted }}>
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            style={{
              background: 'transparent', border: 'none', padding: 4, borderRadius: 4,
              cursor: page >= totalPages - 1 ? 'default' : 'pointer',
              color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted, display: 'flex',
            }}
          >
            <LIcon name="chevronRight" size={13} stroke={2} />
          </button>
        </div>
      </div>
    </LCard>
  )
}
