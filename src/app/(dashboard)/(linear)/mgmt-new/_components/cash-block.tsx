'use client'

/**
 * 현금관리 카드 — 새 디자인(사업관리 NEW 전용).
 * 데이터·계산·동작은 /mgmt 의 CashBlock 과 같다. 바꾼 것은 카드 안 배치뿐이다:
 *   1) 헤더는 제목과 기간 모드 토글만 — 그 오른쪽 아이콘 버튼은 없앴다(CEO 2026-09-10). 눈썹(CASHFLOW)은 뺀다 — 한글 제목이 이미 무엇인지 말한다(CEO 2026-09-10).
 *      월/분기/연 토글은 헤더 오른쪽(원래 자리), 기간 이동 화살표와 라벨은 그 아래 본문 가운데. 구분선은 두지 않는다.
 *   2) 지표는 원래 3×3 배열 그대로, 배경 박스만 벗고 행 구분선으로 나눈다. 스파크라인은 숫자 아래.
 *   3) 필터 칩과 검색만 한 줄에 둔다. 검색에 들어가면 칩이 접히고 검색창이 그 폭을 가져간다.
 * 지표 9개·표 열·행 높이는 그대로라 밀도는 변하지 않는다.
 */

import { useState, useMemo, useEffect } from 'react'
import { LTableHead, LTableScroll, LTableRow, LTableBody, LTableEmpty, LTableBadge, LTableNumber, LTableDate, useTableSort, type LColumn, LPageSize } from '@/app/(dashboard)/_components/linear-table'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
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

// onAddInvoice·onFileUpload·parsing 은 /mgmt 와 시그니처를 맞추려고 받아 두고 쓰지 않는다 —
// 새 디자인에서는 업로드·추가 버튼을 카드에서 뺐다(CEO 2026-09-10).
export function CashBlockNew({ invoices, onSelectInvoice, bankBalances = [], usdRate = 0, balanceHistory = [] }: CashBlockProps) {
  const mobile = useIsMobile()
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<Invoice>('willow-cash', COLUMNS)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [baseDate, setBaseDate] = useState(new Date())
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
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

  // 일자별 총 잔고(원화 환산) — forward-fill.
  // 창은 선택한 기간 그대로다: 9월이면 9월 한 달, 분기면 그 분기, 연간이면 그 해(CEO 2026-09-10).
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

    const sparkStart = rangeStart

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
    if (!series.length) return series

    // 잔고가 움직인 날에만 점이 있어 기간이 짧으면 선이 두 점짜리 직선이 된다.
    // 기간의 모든 날짜를 축으로 깔고 값은 직전 잔고를 이어받는다(계단식). 미래는 그리지 않는다.
    const byDay = new Map(series.map(p => [p.date, p.value]))
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    const lastDateToDraw = rangeEnd < today ? rangeEnd : today
    const filled: Array<{ date: string; value: number }> = []
    let carry = series[0].value
    for (const d = new Date(series[0].date); ; d.setDate(d.getDate() + 1)) {
      const key = d.toLocaleDateString('en-CA')
      if (key > lastDateToDraw) break
      if (byDay.has(key)) carry = byDay.get(key)!
      filled.push({ date: key, value: carry })
    }
    return filled.length > 1 ? filled : series
  }, [balanceHistory, bankBalances, usdRate, rangeStart, rangeEnd])

  const asOf = periodEndBalance.asOfDate ?? latestBalanceDate
  // 검색 중이거나 검색어가 남아 있으면 칩을 접어 둔다
  const searchOpen = searchFocused || searchQuery.length > 0

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        {/* 1) 헤더 한 줄 — 기간 이동까지 여기서 끝낸다 */}
        {/* 헤더 영역 — 제목만. 액션(업로드·추가)은 표 바로 위 컨트롤 줄로 내렸다(CEO 2026-09-10) */}
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="현금관리"
            tools={
              <LSegmented
                value={periodMode}
                onChange={setPeriodMode}
                options={[
                  { value: 'month', label: MODE_LABELS.month },
                  { value: 'quarter', label: MODE_LABELS.quarter },
                  { value: 'year', label: MODE_LABELS.year },
                ]}
              />
            }
            toolsInline
            mb={0}
          />
        </div>

        {/* 1-2) 기간 — 카드 전체에 걸리는 조건이라 가운데에 크게 두고, 아래 지표와는 점선으로 나눈다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, flexWrap: 'wrap' as const,
          padding: `${t.density.panelPadX}px 0`,
        }}>
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

        {/* 2) 지표 — 원래 3×3 배열 그대로. 배경 박스만 벗고 행 구분선으로 나눈다.
             구분선은 열 수를 보고 첫 줄만 건너뛴다 — 모바일 2열에서 3열 기준으로 그으면 지그재그가 된다. */}
        {(() => {
          const cols = mobile ? 2 : 3
          const figures = [
            { label: '매출', value: `${revenue.toLocaleString()}원` },
            { label: '비용', value: `${expense.toLocaleString()}원` },
            { label: '영업이익', value: `${operatingIncome.toLocaleString()}원`, tone: operatingIncome >= 0 ? 'pos' as const : 'neg' as const },
            { label: '부채', value: `${liability.toLocaleString()}원` },
            { label: '대체', value: `${transfer.toLocaleString()}원` },
            { label: '현금흐름', value: `${cashFlow.toLocaleString()}원`, tone: cashFlow >= 0 ? 'pos' as const : 'neg' as const },
            { label: '원화 잔고', value: `${periodEndBalance.krw.toLocaleString()}원` },
            { label: '외화 잔고', value: `$${periodEndBalance.fx.toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
            { label: '총 잔고', value: `${periodEndBalance.totalKrw.toLocaleString()}원`, sub: asOf ? `${asOf} 기준` : undefined },
          ]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
              {figures.map((f, i) => (
                <Figure
                  key={f.label} label={f.label} value={f.value} tone={f.tone} sub={f.sub}
                  divider={i >= cols}
                  // 마지막 줄이 덜 찼으면 남은 칸까지 늘린다 — 안 그러면 그 위 구분선이 반만 그어진다
                  span={i === figures.length - 1 ? cols - (figures.length % cols || cols) + 1 : 1}
                />
              ))}
            </div>
          )
        })()}

        {/* 2-2) 총 잔고 추이 — 선택한 기간의 일자별 잔고. 지표 옆이 아니라 별도 영역으로 뺐다 */}
        {totalBalanceSpark.length > 1 && (
          <div style={{ padding: `${t.density.panelPadX}px ${t.density.panelPadX}px 0` }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: t.density.gapSm, marginBottom: t.density.gapSm,
            }}>
              <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
                총 잔고 추이
              </span>
              <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                {totalBalanceSpark[0].date} ~ {totalBalanceSpark[totalBalanceSpark.length - 1].date}
              </span>
            </div>
            <BalanceTrend points={totalBalanceSpark} />
          </div>
        )}

        {/* 3) 필터 · 검색 · 추가를 한 줄로 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          marginTop: t.density.pagePadBottom, flexWrap: mobile ? 'wrap' : 'nowrap',
        }}>
          {/* 검색에 들어가면 칩은 접혀 자리를 내준다 — 폭·투명도만 바뀌므로 레이아웃이 튀지 않는다 */}
          <div style={{
            maxWidth: searchOpen ? 0 : 520,
            opacity: searchOpen ? 0 : 1,
            overflow: 'hidden', flexShrink: 0,
            transition: 'max-width .26s ease, opacity .16s ease',
          }}>
            <LFilterChip options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} gap={t.density.gapXs} />
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 140, transition: 'flex-basis .26s ease' }}>
            <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
            </div>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="거래처 · 적요 검색"
              style={{
                width: '100%', boxSizing: 'border-box', height: t.density.controlHSm,
                padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                fontFamily: t.font.sans, color: t.neutrals.text,
                background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                borderRadius: t.radius.md, outline: 'none',
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
        </div>
      </div>


      {/* Transactions */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
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

      {/* 표 바로 아래 붙는 줄 — 페이지 크기와 페이지 이동만 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <LPageSize value={pageSize} onChange={applyPageSize} />

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
 * 지표 한 칸 — 배경 박스 대신 행 구분선으로만 나눈다.
 * 라벨 · 값 · (스파크라인) 순서로 쌓아 숫자 오른쪽에 그래프가 붙지 않게 한다(CEO 2026-09-10).
 * 색은 부호가 뜻을 갖는 값(영업이익·현금흐름)에만 쓴다.
 */
function Figure({ label, value, tone, spark, divider, sub, span = 1 }: {
  label: string
  value: string
  tone?: 'pos' | 'neg'
  spark?: Array<{ date: string; value: number }> | number[]
  /** 두 번째 줄부터는 위쪽에 구분선을 둔다 */
  divider?: boolean
  /** 값 아래 한 줄 — 기준 시각처럼 그 숫자에 붙는 단서 */
  sub?: string
  /** 그리드에서 차지할 칸 수 */
  span?: number
}) {
  const color = tone === 'pos' ? t.accent.pos : tone === 'neg' ? t.accent.neg : t.neutrals.text
  const points = (spark ?? []).map(p => (typeof p === 'number' ? p : p.value))
  const max = points.length ? Math.max(...points) : 0
  const min = points.length ? Math.min(...points) : 0
  const range = max - min || 1
  return (
    <div style={{
      padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
      minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
      borderTop: divider ? `1px solid ${t.neutrals.line}` : undefined,
      gridColumn: span > 1 ? `span ${span}` : undefined,
    }}>
      <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span style={{
        fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
        fontWeight: t.weight.semibold, fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
        color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
          {sub}
        </span>
      )}
      {points.length > 1 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 22, marginTop: t.density.tableRowGap }}>
          <polyline
            points={points.map((v, i) => `${(i / (points.length - 1)) * 100},${100 - ((v - min) / range) * 100}`).join(' ')}
            fill="none" stroke={t.chart.mono} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  )
}

/**
 * 총 잔고 추이 — 선택 기간의 일자별 잔고 한 줄. 시리즈가 하나라 회색 단색이고, y축은 0원 기준이다.
 */
function BalanceTrend({ points }: { points: Array<{ date: string; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = points.map(p => p.value)
  // y축은 늘 0원에서 시작한다 — 최솟값을 바닥으로 잡으면 몇 만 원 움직임이 절벽처럼 보인다(CEO 2026-09-10).
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * 100
  const y = (v: number) => 100 - ((v - min) / span) * 100
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')

  return (
    <div
      style={{ position: 'relative', height: 92 }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        setHover(Math.round(ratio * (points.length - 1)))
      }}
    >
      <span style={{
        position: 'absolute', left: 0, top: -2, fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`,
        fontFamily: t.font.mono, color: t.neutrals.subtle, lineHeight: 1,
      }}>{max.toLocaleString()}</span>
      <span style={{
        position: 'absolute', left: 0, bottom: -2, fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`,
        fontFamily: t.font.mono, color: t.neutrals.subtle, lineHeight: 1,
      }}>0</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        {[0, 100].map(p => (
          <line key={p} x1="0" x2="100" y1={p} y2={p} stroke={t.chart.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={`0,100 ${line} 100,100`} fill={t.chart.monoFill} />
        <polyline points={line} fill="none" stroke={t.chart.mono} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke={t.neutrals.muted} strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <div style={{
          position: 'absolute', left: `${Math.min(80, Math.max(20, x(hover)))}%`, transform: 'translateX(-50%)', top: -4,
          background: '#1E293B', color: '#F8FAFC', pointerEvents: 'none', zIndex: 1,
          fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.sans,
          borderRadius: t.radius.md, padding: `${t.density.gapXs}px ${t.density.gapSm}px`, whiteSpace: 'nowrap', lineHeight: 1.4,
        }}>
          <span style={{ opacity: 0.7 }}>{points[hover].date}</span>{' '}
          <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>{points[hover].value.toLocaleString()}원</span>
        </div>
      )}
    </div>
  )
}
