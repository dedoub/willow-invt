'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import {
  LPageSize, LTableBadge, LTableScroll, LTableHead, LTableBody, LTableRow, LTableEmpty,
  LTableMono, LTableNumber, type LColumn,
} from '@/app/(dashboard)/_components/linear-table'

// 표 안 구분 배지(전량/일부, 매수/매도) — 행 배경 위에서 한 단계 눌린 중립 톤.
const CELL_TONE = { bg: t.neutrals.inner, fg: t.neutrals.muted }

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

interface ClosedRow {
  ticker: string
  name: string
  realizedKrw: number
  costKrw: number
  fullyClosed: boolean
}

const TRADE_PAGE_KEY = 'trade-page-size'
const DEFAULT_PAGE_SIZE = 20

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(TRADE_PAGE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

type View = 'trades' | 'closed'

export function TradeLog({ trades, fxHistory, usdKrwRate }: TradeLogProps) {
  const mobile = useIsMobile()
  const [view, setView] = useState<View>('trades')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [search, setSearch] = useState('')

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const da = a.trade_date || ''
      const db = b.trade_date || ''
      return db.localeCompare(da)
    })
  }, [trades])

  const filteredTrades = useMemo(() => {
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
    const rows: ClosedRow[] = []
    let total = 0
    for (const a of map.values()) {
      if (!a.hadSell) continue
      rows.push({ ticker: a.ticker, name: a.name, realizedKrw: a.realizedKrw, costKrw: a.soldCostKrw, fullyClosed: a.qty <= 0 })
      total += a.realizedKrw
    }
    rows.sort((x, y) => y.realizedKrw - x.realizedKrw)
    return { rows, total }
  }, [trades, fxHistory, usdKrwRate])

  const filteredClosed = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return closed.rows
    return closed.rows.filter(r =>
      r.ticker.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q))
  }, [closed.rows, search])

  const handleSearchChange = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const handleViewChange = (v: View) => {
    setView(v)
    setPage(0)
    setSearch('')
  }

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(TRADE_PAGE_KEY, String(n))
  }

  // 활성 뷰 기준 페이지네이션
  const totalCount = view === 'trades' ? sorted.length : closed.rows.length
  const filteredCount = view === 'trades' ? filteredTrades.length : filteredClosed.length
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize))
  const pagedTrades = filteredTrades.slice(page * pageSize, (page + 1) * pageSize)
  const pagedClosed = filteredClosed.slice(page * pageSize, (page + 1) * pageSize)

  const fmtKrwSigned = (v: number) => {
    const a = Math.abs(v)
    const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : `${Math.round(a / 1e4).toLocaleString()}만`
    return `${v >= 0 ? '+' : '−'}₩${s}`
  }
  const fmtKrwPlain = (v: number) => {
    const a = Math.abs(v)
    const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : `${Math.round(a / 1e4).toLocaleString()}만`
    return `₩${s}`
  }
  const toneColor = (v: number) => v > 0 ? t.accent.pos : v < 0 ? t.accent.neg : t.neutrals.muted
  // 표 셀은 색을 직접 고르지 않고 토큰 이름으로 말한다 — 표 전체가 같은 팔레트를 쓴다.
  const cellTone = (v: number): 'pos' | 'neg' | 'muted' => v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'

  // 머리와 행이 같은 정의를 나눠 쓴다 — 칸 너비를 따로 들고 있으면 열을 하나 더할 때 어긋난다.
  const TRADE_COLUMNS: LColumn[] = [
    { key: 'date',   label: '날짜',  width: '70px' },
    { key: 'type',   label: '구분',  width: '50px' },
    { key: 'name',   label: '종목',  width: `minmax(${mobile ? 80 : 160}px, 1fr)` },
    { key: 'qty',    label: '수량',  width: '70px',  align: 'right' },
    { key: 'price',  label: '단가',  width: '100px', align: 'right' },
    { key: 'amount', label: '금액',  width: '110px', align: 'right' },
  ]
  const CLOSED_COLUMNS: LColumn[] = [
    { key: 'name',     label: '종목',     width: `minmax(${mobile ? 90 : 160}px, 1fr)` },
    { key: 'state',    label: '상태',     width: '46px' },
    { key: 'cost',     label: '청산원가', width: '100px', align: 'right' },
    { key: 'realized', label: '실현손익', width: '110px', align: 'right' },
    { key: 'ret',      label: '수익률',   width: '70px',  align: 'right' },
  ]

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead
          title="매매기록"
          tools={
            <LSegmented
              options={[
                { value: 'trades', label: '거래내역' },
                { value: 'closed', label: '청산손익' },
              ]}
              value={view}
              onChange={(v) => handleViewChange(v as View)}
            />
          }
          toolsInline
          action={view === 'closed' && closed.rows.length > 0 ? (
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums', color: toneColor(closed.total) }}>
              {fmtKrwSigned(closed.total)}
            </span>
          ) : undefined}
          mb={0}
        />
      </div>

      {/* 검색 — 윌로우 매출관리와 같은 자리·모양. 감싸개에는 배경이 없고 input 이 흰 바탕과 선을 갖는다. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap', padding: `0 ${t.density.cardPad}px ${t.density.kpiGap}px` }}>
        <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 160 }}>
          <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
          </div>
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={view === 'trades' ? '티커 · 종목명 · 증권사 · 메모 검색' : '티커 · 종목명 검색'}
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
              padding: `0 ${search ? 26 : t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              fontFamily: t.font.sans, color: t.neutrals.text,
              background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
              borderRadius: t.radius.sm, outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              title="지우기"
              style={{
                position: 'absolute', right: t.density.gapXs, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: t.density.gapXs,
                color: t.neutrals.subtle, display: 'inline-flex',
              }}
            >
              <LIcon name="x" size={11} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: `0 ${t.density.panelPadX}px ${t.density.gapSm}px` }}>
        {view === 'closed' ? (
          /* ── 청산손익 ── */
          <LTableScroll columns={CLOSED_COLUMNS} mobile={mobile}>
            <LTableHead columns={CLOSED_COLUMNS} mobile={mobile} />
            <LTableBody columns={CLOSED_COLUMNS} mobile={mobile}>
              {pagedClosed.map(r => {
                const retPct = r.costKrw > 0 ? (r.realizedKrw / r.costKrw) * 100 : 0
                return (
                  <LTableRow key={r.ticker} columns={CLOSED_COLUMNS} mobile={mobile}>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: t.weight.medium }}>{r.ticker}</span>
                      <span style={{ color: t.neutrals.muted, marginLeft: t.density.gapXs, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>{r.name}</span>
                    </div>
                    <LTableBadge tone={CELL_TONE}>{r.fullyClosed ? '전량' : '일부'}</LTableBadge>
                    <LTableMono align="right" tone="muted">{fmtKrwPlain(r.costKrw)}</LTableMono>
                    <LTableMono align="right" strong tone={cellTone(r.realizedKrw)}>{fmtKrwSigned(r.realizedKrw)}</LTableMono>
                    <LTableMono align="right" tone={cellTone(r.realizedKrw)}>{retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%</LTableMono>
                  </LTableRow>
                )
              })}
              {filteredClosed.length === 0 && (
                <LTableEmpty>{search ? '검색 결과가 없습니다' : '청산된 종목이 없습니다'}</LTableEmpty>
              )}
            </LTableBody>
          </LTableScroll>
        ) : (
          /* ── 거래내역 ── */
          <LTableScroll columns={TRADE_COLUMNS} mobile={mobile}>
            <LTableHead columns={TRADE_COLUMNS} mobile={mobile} />
            <LTableBody columns={TRADE_COLUMNS} mobile={mobile}>
              {pagedTrades.map((tr, i) => {
                const isBuy = tr.trade_type === 'buy'
                const amount = tr.total_amount ?? tr.quantity * tr.price
                const isKRW = tr.currency === 'KRW'
                const money = (v: number) => isKRW
                  ? v.toLocaleString()
                  : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                return (
                  <LTableRow key={tr.id || i} columns={TRADE_COLUMNS} mobile={mobile}>
                    <LTableMono tone="muted">{(tr.trade_date || '').slice(5)}</LTableMono>
                    <LTableBadge tone={CELL_TONE}>{isBuy ? '매수' : '매도'}</LTableBadge>
                    <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: t.weight.medium }}>{tr.ticker.replace('.KS', '')}</span>
                      <span style={{ color: t.neutrals.muted, marginLeft: t.density.gapXs, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>{tr.company_name}</span>
                    </div>
                    <LTableNumber value={tr.quantity} />
                    <LTableMono align="right" tone="muted">{money(tr.price)}</LTableMono>
                    <LTableMono align="right" strong>{isBuy ? '-' : '+'}{money(amount)}</LTableMono>
                  </LTableRow>
                )
              })}
              {filteredTrades.length === 0 && (
                <LTableEmpty>{search ? '검색 결과가 없습니다' : '매매 기록이 없습니다'}</LTableEmpty>
              )}
            </LTableBody>
          </LTableScroll>
        )}
      </div>

      {/* 발 줄 — 페이지 크기·이동. 매출관리와 같은 여백(위 0, 아래 cardPad), 선은 긋지 않는다. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
          <span style={{ color: t.neutrals.muted, fontSize: `calc(${t.type.helper}px * var(--fz, 1))` }}>
            {search && filteredCount !== totalCount ? `${filteredCount}/${totalCount}건` : `${totalCount}건`}
          </span>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted, opacity: page === 0 ? 0.4 : 1,
              }}>
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredCount)} / {filteredCount}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted, opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}>
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </LCard>
  )
}
