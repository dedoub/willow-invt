'use client'

/**
 * 현금관리 카드 — 새 디자인(사업관리 NEW 전용).
 * 데이터·계산·동작은 /mgmt 의 CashBlock 과 같다. 바꾼 것은 카드 안 배치뿐이다:
 *   1) 헤더는 제목과 업로드만. 눈썹(CASHFLOW)은 뺀다 — 한글 제목이 이미 무엇인지 말한다(CEO 2026-09-10).
 *      기간(화살표·라벨·월/분기/연)은 카드 전체에 걸리는 조건이라 가운데 한 줄로 세우고 아래와 점선으로 나눈다.
 *   2) 지표는 박스를 벗고 한 줄로 선다 — 핵심 4개는 크게, 나머지 5개는 작게. 칸은 선 하나로만 나눈다.
 *   3) 필터 칩·검색·추가를 한 줄로 합친다.
 * 지표 9개·표 열·행 높이는 그대로라 밀도는 변하지 않는다.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { LTableHead, LTableScroll, LTableRow, LTableBody, LTableEmpty, LTableBadge, LTableNumber, LTableDate, useTableSort, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead, LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
}

interface BankBalance {
  bank_name: string
  account_number: string | null
  balance: number
  balance_date: string | null
}

interface CashBlockProps {
  invoices: Invoice[]
  onAddInvoice: () => void
  onSelectInvoice: (invoice: Invoice) => void
  onFileUpload: (file: File) => void
  parsing?: boolean
  bankBalances?: BankBalance[]
  usdRate?: number
  balanceHistory?: Array<{ date: string; account: string; balance: number }>
}

type PeriodMode = 'month' | 'quarter' | 'year'
type TypeFilter = 'all' | 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'revenue', label: '매출' },
  { value: 'expense', label: '비용' },
  { value: 'asset', label: '자산' },
  { value: 'liability', label: '부채' },
  { value: 'transfer', label: '대체' },
]

const TYPE_TONES: Record<string, { bg: string; fg: string }> = {
  revenue:   { bg: '#DCE8F5', fg: '#1F4E79' },
  expense:   { bg: '#F9E8D0', fg: '#8A5A1A' },
  asset:     { bg: '#DAEEDD', fg: '#1F5F3D' },
  liability: { bg: '#F3DADA', fg: '#8A2A2A' },
  transfer:  { bg: '#E8E0F0', fg: '#5B3D8A' },
}

const TYPE_LABELS: Record<string, string> = {
  revenue: '매출', expense: '비용', asset: '자산', liability: '부채', transfer: '대체',
}

function getDateRange(base: Date, mode: PeriodMode): [string, string] {
  const y = base.getFullYear()
  const m = base.getMonth()
  if (mode === 'month') {
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const last = new Date(y, m + 1, 0).getDate()
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return [start, end]
  }
  if (mode === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    const start = `${y}-${String(qStart + 1).padStart(2, '0')}-01`
    const endMonth = qStart + 3
    const last = new Date(y, endMonth, 0).getDate()
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`
    return [start, end]
  }
  return [`${y}-01-01`, `${y}-12-31`]
}

function getPeriodLabel(base: Date, mode: PeriodMode): string {
  const y = base.getFullYear()
  const m = base.getMonth()
  if (mode === 'month') return `${y}년 ${m + 1}월`
  if (mode === 'quarter') return `${y}년 ${Math.floor(m / 3) + 1}분기`
  return `${y}년`
}

function navigatePeriod(base: Date, dir: -1 | 1, mode: PeriodMode): Date {
  const d = new Date(base)
  if (mode === 'month') d.setMonth(d.getMonth() + dir)
  else if (mode === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  else d.setFullYear(d.getFullYear() + dir)
  return d
}

const MODE_LABELS: Record<PeriodMode, string> = { month: '월간', quarter: '분기', year: '연간' }

// 텐소프트웍스 현금관리와 같은 열 구성·같은 순서. 구분 배지가 늘 1열이라 두 회사 표를
// 오가며 봐도 무슨 종류의 행인지가 같은 자리에서 먼저 읽힌다. 계좌 열은 텐소에만 있다 —
// 윌로우 현금 행에는 계좌번호가 실려오지 않는다.
//
// 폭은 전부 px 하한을 갖는다. minmax(0,...) 로 두면 좁은 화면에서 열이 0까지 줄어들어
// LTableScroll 이 잡을 최소 폭이 사라지고, 가로로 넘기는 대신 표가 찌그러진다.
const COLUMNS: LColumn<Invoice>[] = [
  { key: 'type', label: '구분', width: '48px', sortValue: i => TYPE_LABELS[i.type] ?? i.type },
  { key: 'date', label: '날짜', width: '52px', sortValue: i => i.payment_date || i.issue_date || '', sortFirst: 'desc' },
  { key: 'counterparty', label: '거래처', width: 'minmax(110px,1.2fr)', sortValue: i => i.counterparty ?? '' },
  { key: 'description', label: '적요', width: 'minmax(130px,1.5fr)', sortValue: i => i.description ?? '' },
  { key: 'amount', label: '금액', width: 'minmax(96px,1fr)', align: 'right', sortValue: i => i.amount, sortFirst: 'desc' },
]

const CASH_PAGE_SIZE_KEY = 'willow-cash-page-size'
const DEFAULT_CASH_PAGE_SIZE = 15

function getStoredCashPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_CASH_PAGE_SIZE
  const v = localStorage.getItem(CASH_PAGE_SIZE_KEY)
  if (!v) return DEFAULT_CASH_PAGE_SIZE
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_CASH_PAGE_SIZE
}

export function CashBlockNew({ invoices, onAddInvoice, onSelectInvoice, onFileUpload, parsing, bankBalances = [], usdRate = 0, balanceHistory = [] }: CashBlockProps) {
  const mobile = useIsMobile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<Invoice>('willow-cash', COLUMNS)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [baseDate, setBaseDate] = useState(new Date())
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredCashPageSize)

  const [rangeStart, rangeEnd] = useMemo(() => getDateRange(baseDate, periodMode), [baseDate, periodMode])
  const periodLabel = useMemo(() => getPeriodLabel(baseDate, periodMode), [baseDate, periodMode])

  const periodFiltered = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.type === 'exchange') return false
      const d = inv.payment_date || inv.issue_date
      if (!d) return false
      return d >= rangeStart && d <= rangeEnd
    })
  }, [invoices, rangeStart, rangeEnd])

  const revenue = periodFiltered.filter(i => i.type === 'revenue').reduce((s, i) => s + i.amount, 0)
  const expense = periodFiltered.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const asset = periodFiltered.filter(i => i.type === 'asset').reduce((s, i) => s + i.amount, 0)
  const liability = periodFiltered.filter(i => i.type === 'liability').reduce((s, i) => s + i.amount, 0)
  const transfer = periodFiltered.filter(i => i.type === 'transfer').reduce((s, i) => s + i.amount, 0)
  const operatingIncome = revenue - expense
  const cashFlow = revenue - expense - asset + liability + transfer

  const displayList = useMemo(() => {
    let list = typeFilter === 'all' ? periodFiltered : periodFiltered.filter(i => i.type === typeFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(i =>
        i.counterparty.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      )
    }
    // 기본은 최신순. 그 위에 표 머리 정렬을 얹는다.
    return [...list].sort((a, b) => {
      const da = a.payment_date || a.issue_date || ''
      const db = b.payment_date || b.issue_date || ''
      return db.localeCompare(da)
    })
  }, [periodFiltered, typeFilter, searchQuery])

  const sortedList = useMemo(() => sortApply(displayList), [displayList, sortApply])
  const totalPages = Math.max(1, Math.ceil(sortedList.length / pageSize))
  const paged = sortedList.slice(page * pageSize, (page + 1) * pageSize)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(CASH_PAGE_SIZE_KEY, String(n))
  }

  useEffect(() => { setPage(0) }, [typeFilter, periodMode, baseDate, searchQuery])

  const latestBalanceDate = bankBalances.reduce((latest, b) => {
    if (!b.balance_date) return latest
    return !latest || b.balance_date > latest ? b.balance_date : latest
  }, '' as string)

  // Period-end balance: for each account, the last balance_after on/before rangeEnd.
  // If today's "current" balance is more recent than the period end, fall back to bankBalances for the current period.
  const periodEndBalance = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const isCurrentPeriod = today >= rangeStart && today <= rangeEnd
    const lastByAccount: Record<string, { balance: number; date: string }> = {}
    for (const p of balanceHistory) {
      if (p.date > rangeEnd) continue
      const cur = lastByAccount[p.account]
      if (!cur || p.date >= cur.date) lastByAccount[p.account] = { balance: p.balance, date: p.date }
    }
    // For current period, prefer bankBalances snapshot if it's newer than any history point
    if (isCurrentPeriod) {
      for (const b of bankBalances) {
        const acct = b.account_number || b.bank_name
        const existing = lastByAccount[acct]
        const bDate = b.balance_date || ''
        if (!existing || (bDate && bDate >= existing.date)) {
          lastByAccount[acct] = { balance: b.balance, date: bDate || existing?.date || rangeEnd }
        }
      }
    }
    let krw = 0, fx = 0, totalKrw = 0
    let asOfDate = ''
    for (const [acct, info] of Object.entries(lastByAccount)) {
      const isFx = acct.toLowerCase().includes('usd') || acct.includes('외화')
      if (isFx) { fx += info.balance; totalKrw += Math.round(info.balance * usdRate) }
      else { krw += info.balance; totalKrw += info.balance }
      if (info.date > asOfDate) asOfDate = info.date
    }
    return { krw, fx, totalKrw, asOfDate, hasData: Object.keys(lastByAccount).length > 0 }
  }, [balanceHistory, bankBalances, rangeStart, rangeEnd, usdRate])

  // Build daily total-balance series (KRW-equivalent) with forward-fill,
  // window: 1 year ending at the selected period's end date
  const totalBalanceSpark = useMemo(() => {
    if (!balanceHistory.length) return [] as Array<{ date: string; value: number }>
    const accountSet = new Set<string>()
    const byDate = new Map<string, Record<string, number>>()
    for (const p of balanceHistory) {
      accountSet.add(p.account)
      if (!byDate.has(p.date)) byDate.set(p.date, {})
      byDate.get(p.date)![p.account] = p.balance
    }
    const accounts = Array.from(accountSet)
    const dates = Array.from(byDate.keys()).sort()
    if (dates.length === 0) return []

    // Window: 1 year ending at rangeEnd (period's last day)
    const start = new Date(rangeEnd)
    start.setFullYear(start.getFullYear() - 1)
    const sparkStart = start.toISOString().slice(0, 10)

    const fxTotal = (vals: Record<string, number>) => {
      let total = 0
      for (const acct of new Set([...accounts, ...Object.keys(vals)])) {
        const v = vals[acct]
        if (v == null) continue
        if (acct.toLowerCase().includes('usd') || acct.includes('외화')) total += v * usdRate
        else total += v
      }
      return total
    }

    const last: Record<string, number> = {}
    const lastDateByAccount: Record<string, string> = {}
    const series: Array<{ date: string; value: number }> = []
    for (const d of dates) {
      if (d > rangeEnd) break
      const day = byDate.get(d)!
      for (const acct of accounts) if (day[acct] != null) { last[acct] = day[acct]; lastDateByAccount[acct] = d }
      if (d < sparkStart) continue
      series.push({ date: d, value: Math.round(fxTotal(last)) })
    }

    // Extend with the authoritative current-balance snapshot (bankBalances) as a
    // terminal point. Manually-entered transactions often lack balance_after, so the
    // history line stalls at the last parsed statement; the snapshot carries the true
    // current balance. Mirrors the periodEndBalance fallback above.
    let snapDate = ''
    for (const b of bankBalances) {
      const acct = b.account_number || b.bank_name
      const bDate = b.balance_date || ''
      if (!bDate || bDate > rangeEnd || bDate < sparkStart) continue
      if (bDate >= (lastDateByAccount[acct] || '')) {
        last[acct] = b.balance
        lastDateByAccount[acct] = bDate
        if (bDate > snapDate) snapDate = bDate
      }
    }
    if (snapDate && (!series.length || snapDate >= series[series.length - 1].date)) {
      const point = { date: snapDate, value: Math.round(fxTotal(last)) }
      if (series.length && series[series.length - 1].date === snapDate) series[series.length - 1] = point
      else series.push(point)
    }
    return series
  }, [balanceHistory, bankBalances, usdRate, rangeEnd])

  const asOf = periodEndBalance.asOfDate ?? latestBalanceDate

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        {/* 1) 헤더 한 줄 — 기간 이동까지 여기서 끝낸다 */}
        {/* 헤더 영역 — 제목과 카드 액션만. 아래 영역과는 점선으로 나눈다 */}
        <div style={{ paddingBottom: t.density.panelPadY, borderBottom: `1px dashed ${t.neutrals.line}` }}>
          <LSectionHead
            title="현금관리"
            action={
              <LHeadBtn icon="file" title="은행 엑셀 업로드 (.xlsx .csv) — AI가 파싱해 반영" onClick={() => !parsing && fileInputRef.current?.click()} busy={parsing} />
            }
            mb={0}
          />
        </div>

        {/* 1-2) 기간 — 카드 전체에 걸리는 조건이라 가운데에 크게 두고, 아래 지표와는 점선으로 나눈다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, flexWrap: 'wrap' as const,
          padding: `${t.density.panelPadX}px 0`,
          borderBottom: `1px dashed ${t.neutrals.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button onClick={() => setBaseDate(navigatePeriod(baseDate, -1, periodMode))} style={navBtn} title="이전">
              <LIcon name="chevronLeft" size={14} stroke={2} />
            </button>
            <span style={{
              fontSize: `calc(${t.type.body}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
              fontFamily: t.font.sans, minWidth: 104, textAlign: 'center', whiteSpace: 'nowrap',
            }}>
              {periodLabel}
            </span>
            <button onClick={() => setBaseDate(navigatePeriod(baseDate, 1, periodMode))} style={navBtn} title="다음">
              <LIcon name="chevronRight" size={14} stroke={2} />
            </button>
          </div>
          <LSegmented
            value={periodMode}
            onChange={setPeriodMode}
            options={[
              { value: 'month', label: MODE_LABELS.month },
              { value: 'quarter', label: MODE_LABELS.quarter },
              { value: 'year', label: MODE_LABELS.year },
            ]}
          />
        </div>

        {/* 2) 지표 — 박스 없이 선으로만 나눈다. 위 4개가 핵심, 아래 5개가 보조 */}
        <div style={{
          display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
        }}>
          <Figure label="매출" value={`${revenue.toLocaleString()}원`} />
          <Figure label="비용" value={`${expense.toLocaleString()}원`} />
          <Figure label="현금흐름" value={`${cashFlow.toLocaleString()}원`} tone={cashFlow >= 0 ? 'pos' : 'neg'} />
          <Figure
            label="총 잔고" value={`${periodEndBalance.totalKrw.toLocaleString()}원`}
            spark={mobile ? undefined : totalBalanceSpark}
          />
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: mobile ? 'repeat(3, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))',
          borderTop: `1px solid ${t.neutrals.line}`, borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <Figure small label="영업이익" value={`${operatingIncome.toLocaleString()}원`} tone={operatingIncome >= 0 ? 'pos' : 'neg'} />
          <Figure small label="부채" value={`${liability.toLocaleString()}원`} />
          <Figure small label="대체" value={`${transfer.toLocaleString()}원`} />
          <Figure small label="원화 잔고" value={`${periodEndBalance.krw.toLocaleString()}원`} />
          <Figure small label="외화 잔고" value={`$${periodEndBalance.fx.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
        </div>

        {/* 3) 필터 · 검색 · 추가를 한 줄로 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          marginTop: t.density.gapMd, flexWrap: mobile ? 'wrap' : 'nowrap',
        }}>
          <LFilterChip options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} gap={t.density.gapXs} />
          <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 140 }}>
            <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
            </div>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="거래처 · 적요 검색"
              style={{
                width: '100%', boxSizing: 'border-box', height: t.density.controlHSm,
                padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                fontFamily: t.font.sans, color: t.neutrals.text,
                background: t.neutrals.inner, border: 'none',
                borderRadius: t.radius.sm, outline: 'none',
              }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{
                position: 'absolute', right: t.density.gapSm, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={12} stroke={2} />
              </button>
            )}
          </div>
          <button onClick={onAddInvoice} title="거래 추가" style={{
            width: t.density.controlHSm, height: t.density.controlHSm, borderRadius: t.radius.sm, border: 'none',
            background: t.neutrals.inner, color: t.neutrals.muted,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, flexShrink: 0,
          }}>
            <LIcon name="plus" size={13} stroke={2.5} />
          </button>
        </div>
      </div>

      {/* 파일 업로드 — 드롭존은 제거(2026-08-21 CEO), 헤더의 업로드 버튼이 이 hidden input을 연다 */}
      <input
        ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); e.target.value = '' }}
      />

      {/* Transactions */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>해당 기간 거래 내역이 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
        {paged.map((v) => {
          const typeTone = TYPE_TONES[v.type]
          return (
            <LTableRow key={v.id} columns={COLUMNS} mobile={mobile} onClick={() => onSelectInvoice(v)}>
              <LTableBadge tone={typeTone}>{TYPE_LABELS[v.type]}</LTableBadge>
              <LTableDate value={v.payment_date || v.issue_date} />
              <span style={{ fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.counterparty}
              </span>
              <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.description}
              </span>
              <LTableNumber value={v.amount} />
            </LTableRow>
          )
        })}
        </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${t.density.gapSm}px ${t.density.cardPad}px`, borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, minWidth: 0 }}>
          <LPageSize value={pageSize} onChange={applyPageSize} />
          {asOf && (
            <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
              잔고 {asOf} 기준
            </span>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sortedList.length)} / {sortedList.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </LCard>
  )
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
  display: 'flex', alignItems: 'center',
}

/**
 * 지표 한 칸 — 배경 박스 대신 칸 사이 선으로만 나눈다.
 * 라벨은 위 작게, 값은 아래 크게. 색은 부호가 뜻을 갖는 값(영업이익·현금흐름)에만.
 */
function Figure({ label, value, tone, small, spark }: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  small?: boolean
  spark?: Array<{ date: string; value: number }> | number[]
}) {
  const color = tone === 'pos' ? t.accent.pos : tone === 'neg' ? t.accent.neg : t.neutrals.text
  const points = (spark ?? []).map(p => (typeof p === 'number' ? p : p.value))
  const max = points.length ? Math.max(...points) : 0
  const min = points.length ? Math.min(...points) : 0
  const span = max - min || 1
  return (
    <div style={{
      padding: small ? `${t.density.gapSm}px ${t.density.panelPadX}px` : `${t.density.panelPadX}px ${t.density.panelPadX}px`,
      minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
    }}>
      <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: t.density.gapSm, minWidth: 0 }}>
        <span style={{
          fontSize: `calc(${(small ? t.type.tableBody : t.type.body)}px * var(--fz, 1))`,
          fontWeight: t.weight.semibold, fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
          color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {value}
        </span>
        {points.length > 1 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: 56, height: 18, flexShrink: 0 }}>
            <polyline
              points={points.map((v, i) => `${(i / (points.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(' ')}
              fill="none" stroke={t.chart.mono} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    </div>
  )
}
