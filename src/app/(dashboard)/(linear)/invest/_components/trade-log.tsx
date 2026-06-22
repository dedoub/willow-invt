'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
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
  /** 청산손익(KRW 환산) 계산용 — 매도시점 과거환율 */
  fxHistory?: Record<string, number>
  usdKrwRate?: number
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

type View = 'trades' | 'closed'

export function TradeLog({ trades, fxHistory, usdKrwRate }: TradeLogProps) {
  const mobile = useIsMobile()
  const [view, setView] = useState<View>('trades')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const [search, setSearch] = useState('')

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const da = a.trade_date || ''
      const db = b.trade_date || ''
      return db.localeCompare(da)
    })
  }, [trades])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(tr => {
      const ticker = tr.ticker.replace('.KS', '').toLowerCase()
      const name = (tr.company_name || '').toLowerCase()
      const broker = (tr.broker || '').toLowerCase()
      const memo = (tr.memo || '').toLowerCase()
      return ticker.includes(q) || name.includes(q) || broker.includes(q) || memo.includes(q)
    })
  }, [sorted, search])

  // 청산손익: 매도가 발생한 종목의 실현손익 (평균원가법, 매도시점 과거환율 KRW)
  const closed = useMemo(() => {
    const fxNow = usdKrwRate ?? 1400
    const hist = fxHistory ?? {}
    const getFx = (date?: string): number => {
      if (!date) return fxNow
      const d = new Date(date)
      for (let i = 0; i < 5; i++) {
        const k = d.toISOString().slice(0, 10)
        if (hist[k]) return hist[k]
        d.setDate(d.getDate() - 1)
      }
      return fxNow
    }
    type Acc = { ticker: string; name: string; qty: number; krwCost: number; realizedKrw: number; soldCostKrw: number; hadSell: boolean }
    const map = new Map<string, Acc>()
    const srt = [...trades].sort((a, b) =>
      (a.trade_date || '').localeCompare(b.trade_date || '') || (a.id || '').localeCompare(b.id || ''))
    for (const tr of srt) {
      const key = tr.ticker.replace('.KS', '')
      const prev = map.get(key) || { ticker: key, name: tr.company_name || key, qty: 0, krwCost: 0, realizedKrw: 0, soldCostKrw: 0, hadSell: false }
      const isUS = tr.currency === 'USD' || tr.currency === 'US'
      const rate = isUS ? getFx(tr.trade_date) : 1
      const amt = tr.total_amount ?? tr.quantity * tr.price
      if (tr.trade_type === 'buy') {
        prev.qty += tr.quantity
        prev.krwCost += amt * rate
      } else {
        const krwAvg = prev.qty > 0 ? prev.krwCost / prev.qty : 0
        const soldBasis = krwAvg * tr.quantity
        prev.realizedKrw += amt * rate - soldBasis
        prev.soldCostKrw += soldBasis
        prev.hadSell = true
        prev.qty -= tr.quantity
        prev.krwCost -= soldBasis
        if (prev.qty <= 0) { prev.qty = 0; prev.krwCost = 0 }
      }
      if (tr.company_name) prev.name = tr.company_name
      map.set(key, prev)
    }
    const rows: { ticker: string; name: string; realizedKrw: number; costKrw: number; fullyClosed: boolean }[] = []
    let total = 0
    for (const a of map.values()) {
      if (!a.hadSell) continue
      rows.push({ ticker: a.ticker, name: a.name, realizedKrw: a.realizedKrw, costKrw: a.soldCostKrw, fullyClosed: a.qty <= 0 })
      total += a.realizedKrw
    }
    rows.sort((x, y) => y.realizedKrw - x.realizedKrw)
    return { rows, total }
  }, [trades, fxHistory, usdKrwRate])

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(TRADE_PAGE_KEY, String(n))
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  const fmtKrw = (v: number) => {
    const a = Math.abs(v)
    const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : `${Math.round(a / 1e4).toLocaleString()}만`
    return `${v >= 0 ? '+' : '−'}₩${s}`
  }
  const toneColor = (v: number) => v > 0 ? t.accent.pos : v < 0 ? t.accent.neg : t.neutrals.muted

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="TRADES" title="매매기록" action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <LSegmented
              options={[
                { value: 'trades', label: '거래' },
                { value: 'closed', label: '청산손익' },
              ]}
              value={view}
              onChange={(v) => setView(v as View)}
            />
            {view === 'trades' ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: t.neutrals.inner, borderRadius: t.radius.sm,
                  padding: '4px 8px', minWidth: mobile ? 120 : 180,
                }}>
                  <LIcon name="search" size={12} color={t.neutrals.subtle} />
                  <input
                    value={search}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="티커·종목명·증권사·메모"
                    style={{
                      border: 'none', background: 'transparent', outline: 'none',
                      fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.text, fontFamily: t.font.sans,
                      width: '100%',
                    }}
                  />
                  {search && (
                    <button
                      onClick={() => handleSearchChange('')}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: t.neutrals.subtle, display: 'inline-flex',
                      }}
                    >
                      <LIcon name="x" size={11} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted, fontFamily: t.font.mono }}>
                  {search && filtered.length !== sorted.length ? `${filtered.length}/${sorted.length}건` : `${sorted.length}건`}
                </span>
              </>
            ) : (
              closed.rows.length > 0 && (
                <span style={{ fontSize: 'calc(12px * var(--fz, 1))', fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums', color: toneColor(closed.total) }}>
                  {fmtKrw(closed.total)}
                </span>
              )
            )}
          </div>
        } />
      </div>

      {view === 'closed' ? (
        /* ── 청산손익 ── */
        <div>
          {closed.rows.map(r => {
            const retPct = r.costKrw > 0 ? (r.realizedKrw / r.costKrw) * 100 : 0
            return (
              <div key={r.ticker} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
                padding: '8px 14px', alignItems: 'center',
                borderTop: `1px solid ${t.neutrals.line}`,
                fontSize: 'calc(12px * var(--fz, 1))',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: t.weight.medium }}>{r.ticker}</span>
                  <span style={{ color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{
                    flexShrink: 0, display: 'inline-block', padding: '1px 5px', borderRadius: t.radius.sm,
                    fontSize: 'calc(9.5px * var(--fz, 1))', fontWeight: t.weight.medium,
                    background: t.neutrals.inner, color: t.neutrals.muted,
                  }}>{r.fullyClosed ? '전량' : '일부'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                  <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', fontWeight: t.weight.medium, color: toneColor(r.realizedKrw) }}>
                    {fmtKrw(r.realizedKrw)}
                  </span>
                  <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, width: 52, textAlign: 'right' }}>
                    {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
          {closed.rows.length === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>
              청산된 종목이 없습니다
            </div>
          )}
        </div>
      ) : (
        /* ── 매매기록 ── */
        <>
          <div style={{ overflowX: 'auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `70px 50px minmax(${mobile ? 80 : 160}px, 1fr) 70px 100px 110px`,
            gap: 8, padding: '6px 14px', fontSize: 'calc(10px * var(--fz, 1))', fontWeight: t.weight.semibold,
            color: t.neutrals.subtle, fontFamily: t.font.mono,
            textTransform: 'uppercase' as const, letterSpacing: 0.5,
            minWidth: mobile ? 480 : 560,
            whiteSpace: 'nowrap' as const,
          }}>
            <span>날짜</span>
            <span>구분</span>
            <span>종목</span>
            <span style={{ textAlign: 'right' }}>수량</span>
            <span style={{ textAlign: 'right' }}>단가</span>
            <span style={{ textAlign: 'right' }}>금액</span>
          </div>

          <div>
            {paged.map((tr, i) => {
              const isBuy = tr.trade_type === 'buy'
              const amount = tr.total_amount ?? tr.quantity * tr.price
              const isKRW = tr.currency === 'KRW'
              return (
                <div key={tr.id || i} style={{
                  display: 'grid', gridTemplateColumns: `70px 50px minmax(${mobile ? 80 : 160}px, 1fr) 70px 100px 110px`,
                  gap: 8, padding: '8px 14px', alignItems: 'center',
                  borderTop: `1px solid ${t.neutrals.line}`,
                  fontSize: 'calc(12px * var(--fz, 1))',
                  minWidth: mobile ? 480 : 560,
                  whiteSpace: 'nowrap' as const,
                }}>
                  <span style={{ fontFamily: t.font.mono, fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>
                    {(tr.trade_date || '').slice(5)}
                  </span>
                  <span style={{
                    display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
                    fontSize: 'calc(10px * var(--fz, 1))', fontWeight: t.weight.medium, textAlign: 'center',
                    background: t.neutrals.inner,
                    color: t.neutrals.muted,
                  }}>
                    {isBuy ? '매수' : '매도'}
                  </span>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ fontWeight: t.weight.medium }}>
                      {tr.ticker.replace('.KS', '')}
                    </span>
                    <span style={{ color: t.neutrals.muted, marginLeft: 4, fontSize: 'calc(11px * var(--fz, 1))' }}>
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
                    color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))',
                  }}>
                    {isKRW ? `${tr.price.toLocaleString()}` : `$${tr.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                  <span style={{
                    textAlign: 'right', fontWeight: t.weight.medium,
                    fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
                    color: t.neutrals.text,
                  }}>
                    {isBuy ? '-' : '+'}{isKRW ? `${amount.toLocaleString()}` : `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div style={{
                padding: '20px 14px', textAlign: 'center',
                fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle,
              }}>{search ? '검색 결과가 없습니다' : '매매 기록이 없습니다'}</div>
            )}
          </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px',
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
                  fontSize: 'calc(11px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                  padding: '2px 0', outline: 'none',
                }}
              />
              <span style={{ fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
            </div>

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
                  fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                }}>
                  {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
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
        </>
      )}
    </LCard>
  )
}
