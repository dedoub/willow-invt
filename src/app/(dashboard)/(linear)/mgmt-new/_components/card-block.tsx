'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LTableHead, LTableScroll, LTableRow, LTableBody, LTableEmpty, LTableBadge, LTableNumber, LPageSize, useTableSort, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { CardApproval, CardBilling } from '@/types/finance-card'
import { FigureGrid, type FigureItem } from './figure-grid'
import { CardDetailDialog } from './card-detail-dialog'

// 구분 배지가 늘 1열이다. 다른 표들과 배지 열 위치를 맞춘다.
const COLUMNS: LColumn<CardApproval>[] = [
  { key: 'category', label: '구분', width: '72px', sortValue: a => classify(a.store_name, a.store_type).label },
  { key: 'date', label: '날짜', width: '46px', sortValue: a => a.used_date, sortFirst: 'desc' },
  // 카드가 여러 장이라 같은 가맹점이라도 어느 카드로 긁었는지가 갈린다.
  // card_no 는 '5532********7149' 처럼 가운데가 가려져 오므로 끝 네 자리만 쓴다.
  { key: 'card', label: '카드', width: '44px', sortValue: a => cardTail(a.card_no) },
  { key: 'store', label: '가맹점', width: 'minmax(130px,1.6fr)', sortValue: a => a.store_name ?? '' },
  { key: 'amount', label: '금액', width: 'minmax(96px,1fr)', align: 'right', sortValue: a => a.krw, sortFirst: 'desc' },
]

/** 마스킹된 카드번호에서 끝 네 자리. 자릿수가 모자라면 있는 만큼만. */
function cardTail(cardNo: string | null | undefined): string {
  const digits = (cardNo ?? '').replace(/\D/g, '')
  return digits.slice(-4)
}

const DEFAULT_PAGE_SIZE = 8
// 두 회사가 같은 화면을 쓰므로 행수·정렬 기억은 회사별로 나눈다.
const pageSizeKeyFor = (storageKey: string) => `${storageKey}-page-size`

// 사용액은 두 기준이 있고 숫자가 다르다. 축도 다르다.
//   billing  = 이용명세서. 청구월(=결제월) 기준. 할부·연회비·해외이용이 반영된 실제 결제액.
//              202603 명세서 9,802,131원은 은행의 2026-03-05 "2월 이용대금" 출금과 일치한다.
//   approval = 승인내역. 사용월 기준. 할부도 승인 시점에 전액 잡히고 취소분은 뺀다.
// 두 값이 다른 건 정상이다. 무엇을 보고 싶은지에 따라 고른다.
type Basis = 'billing' | 'approval'
type PeriodMode = 'month' | 'quarter' | 'year'

const MODE_LABELS: Record<PeriodMode, string> = { month: '월간', quarter: '분기', year: '연간' }

// 현금관리와 같은 기간 규칙을 쓴다. 두 섹션을 나란히 보며 같은 달을 비교하게 된다.
function getDateRange(base: Date, mode: PeriodMode): [string, string] {
  const y = base.getFullYear()
  const m = base.getMonth()
  if (mode === 'month') {
    const last = new Date(y, m + 1, 0).getDate()
    return [
      `${y}-${String(m + 1).padStart(2, '0')}-01`,
      `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    ]
  }
  if (mode === 'quarter') {
    const qStart = Math.floor(m / 3) * 3
    const endMonth = qStart + 3
    const last = new Date(y, endMonth, 0).getDate()
    return [
      `${y}-${String(qStart + 1).padStart(2, '0')}-01`,
      `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    ]
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

/**
 * 가맹점을 지출 항목으로 분류한다.
 * 카드사가 주는 store_type은 해외 승인에 아예 없고("인터넷P/G" 같은 값도 결제수단일 뿐 용도가 아님),
 * 실제로 뭘 샀는지는 가맹점명에 있다. 그래서 이름을 먼저 보고 타입은 보조로 쓴다.
 * 순서가 중요하다 — 위에서부터 먼저 걸린 항목으로 확정한다.
 */
// 항목 칩은 색조 대신 회색 명도 사다리로 나눈다 — 위에서부터 진하고, 기타가 가장 옅다
// (2026-09-10 카드 문법: 단색은 유지하되 분간은 되게).
const CATEGORY_TONES: Record<string, { bg: string; fg: string }> = {
  ai:          { bg: '#C7CCD3', fg: '#171B21' },
  outsourcing: { bg: '#D3D7DD', fg: '#1F242B' },
  utility:     { bg: '#DCE0E5', fg: '#262C33' },
  meal:        { bg: '#E4E7EB', fg: '#2C323A' },
  car:         { bg: '#EAECEF', fg: '#343A42' },
  finance:     { bg: '#EDEFF2', fg: '#3A4048' },
  etc:         { bg: '#F5F6F8', fg: '#4B525A' },
}

const CATEGORIES: Array<{ key: string; label: string; test: (name: string, type: string) => boolean }> = [
  {
    key: 'ai',
    label: 'AI·클라우드',
    test: n => /ANTHROPIC|CLAUDE|OPENAI|CHATGPT|GEMINI|구글클라우드|GOOGLE|VERCEL|SUPABASE|VOYAGE|CLOUDINARY|AWS|AMAZON|GITHUB|NOTION|FIGMA|SLACK|CURSOR|REPLICATE|HUGGING|OPENROUTER|PERPLEXITY|MIDJOURNEY|ELEVENLABS|CLOUDFLARE|NETLIFY|HEROKU|DIGITALOCEAN|JETBRAINS|ATLASSIAN|닷네임|가비아|카페24/i.test(n),
  },
  {
    key: 'outsourcing',
    label: '외주·인력',
    test: n => /위시켓|UPWORK|REFERO|크몽|프리랜서|FREELANC|TOPTAL/i.test(n),
  },
  {
    key: 'utility',
    label: '통신·공과금',
    test: (n, ty) => /ＫＴ|KT통신|KT유선|한국전력|전기요금|SKT|LG유플|도시가스|수도요금/i.test(n) || /이동통신요금|통신 기기/.test(ty),
  },
  {
    key: 'meal',
    label: '식대·마트',
    test: (n, ty) => /우아한형제들|배달의민족|웰스토리|쿠팡|이마트|홈플러스|롯데쇼핑|신세계|스타벅스/i.test(n) || /일반한식|대형할인점|편 의 점|서양음식|중국음식|제과점|커피/.test(ty),
  },
  {
    key: 'car',
    label: '차량·교통',
    test: (n, ty) => /도로공사|타이어|하이패스|주차|렌터카|SK에너지|GS칼텍스|현대오일|에스오일|S-oil/i.test(n) || /주\s*유\s*소|자동차|고속도로|통행료/.test(ty),
  },
  {
    key: 'finance',
    label: '보험·수수료',
    test: (n, ty) => /보증보험|보증기금|화재해상|금융결제원|손해보험|생명보험/i.test(n) || /손해 보험|생명 보험/.test(ty),
  },
]

function classify(storeName: string | null, storeType: string | null): { key: string; label: string } {
  const n = storeName ?? ''
  const ty = storeType ?? ''
  const hit = CATEGORIES.find(c => c.test(n, ty))
  return hit ? { key: hit.key, label: hit.label } : { key: 'etc', label: '기타' }
}

/** 명세서는 청구년월(YYYYMM)이라 기간 비교용으로 'YYYY-MM' 으로 바꾼다. */
function billingMonthKey(billingMonth: string): string {
  return `${billingMonth.slice(0, 4)}-${billingMonth.slice(4, 6)}`
}

function getStoredPageSize(storageKey: string): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(pageSizeKeyFor(storageKey))
  const n = Number(v)
  return n >= 1 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

interface CardBlockProps {
  approvals: CardApproval[]
  billing: CardBilling[]
  year: number
  onYearChange: (year: number) => void
  /** 회사별로 행수·정렬 기억을 나눈다. */
  storageKey?: string
  style?: React.CSSProperties
}

export function CardBlockNew({ approvals, billing, year, onYearChange, storageKey = 'tensw-card', style }: CardBlockProps) {
  const mobile = useIsMobile()
  const [basis, setBasis] = useState<Basis>('billing')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [baseDate, setBaseDate] = useState(new Date())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => getStoredPageSize(storageKey))
  const [category, setCategory] = useState<string>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<CardApproval | null>(null)
  const { sort, toggle: toggleSort, apply: sortApply } = useTableSort<CardApproval>(storageKey, COLUMNS)

  const applyPageSize = (n: number) => {
    setPageSize(n)
    setPage(0)
    localStorage.setItem(pageSizeKeyFor(storageKey), String(n))
  }

  const [rangeStart, rangeEnd] = useMemo(() => getDateRange(baseDate, periodMode), [baseDate, periodMode])
  const periodLabel = useMemo(() => getPeriodLabel(baseDate, periodMode), [baseDate, periodMode])

  // 기간을 넘기면 부모가 그 해 데이터를 다시 가져오게 한다.
  const navigate = (dir: -1 | 1) => {
    const next = navigatePeriod(baseDate, dir, periodMode)
    setBaseDate(next)
    setPage(0)
    if (next.getFullYear() !== year) onYearChange(next.getFullYear())
  }

  const changeMode = (m: PeriodMode) => { setPeriodMode(m); setPage(0) }
  const changeBasis = (b: Basis) => { setBasis(b); setPage(0) }

  // 선택 기간 안의 승인·명세서
  const periodApprovals = useMemo(
    () => approvals.filter(a => a.used_date >= rangeStart && a.used_date <= rangeEnd),
    [approvals, rangeStart, rangeEnd]
  )
  const periodLive = useMemo(
    () => periodApprovals.filter(a => a.cancel_yn !== '1' && a.cancel_yn !== '3'),
    [periodApprovals]
  )

  // 항목별 합계. 명세서에는 가맹점이 없어 분류는 승인내역으로만 낸다.
  const byCategory = useMemo(() => {
    const map = new Map<string, { label: string; amount: number; count: number }>()
    for (const a of periodLive) {
      const c = classify(a.store_name, a.store_type)
      const cur = map.get(c.key) ?? { label: c.label, amount: 0, count: 0 }
      cur.amount += a.krw
      cur.count += 1
      map.set(c.key, cur)
    }
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.amount - a.amount)
  }, [periodLive])
  const periodBilling = useMemo(
    () => billing.filter(b => {
      const key = billingMonthKey(b.billing_month)
      return key >= rangeStart.slice(0, 7) && key <= rangeEnd.slice(0, 7)
    }),
    [billing, rangeStart, rangeEnd]
  )

  // KPI는 선택 기간 기준. 기준(명세서/승인)에 따라 소스가 다르다.
  const periodTotal = basis === 'billing'
    ? periodBilling.reduce((s, b) => s + b.total_amount, 0)
    : periodLive.reduce((s, a) => s + a.krw, 0)

  // 항목 비중은 승인 합계로 나눈다. 분류는 가맹점이 있어야 가능한데 명세서에는 가맹점이 없어서,
  // 명세서 합계로 나누면 항목들을 다 더해도 100%가 안 나온다.
  const categoryBase = periodLive.reduce((s, a) => s + a.krw, 0)


  const filtered = useMemo(() => {
    let rows = periodApprovals
    if (category !== 'all') rows = rows.filter(a => classify(a.store_name, a.store_type).key === category)
    const q = search.trim().toLowerCase()
    if (q) rows = rows.filter(a => (a.store_name ?? '').toLowerCase().includes(q))
    return rows
  }, [periodApprovals, search, category])

  const sorted = useMemo(() => sortApply(filtered), [filtered, sortApply])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <LCard pad={0} style={style}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="카드승인내역"
            tools={
              <LSegmented
                value={periodMode}
                onChange={changeMode}
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

        {/* 기간 — 카드 전체에 걸리는 조건이라 지표 위 가운데에 둔다 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: t.density.gapMd, padding: `${t.density.panelPadX}px 0`,
        }}>
          <button onClick={() => navigate(-1)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronLeft" size={14} stroke={2} />
          </button>
          <span style={{
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, minWidth: 104, textAlign: 'center', whiteSpace: 'nowrap',
          }}>
            {periodLabel}
          </span>
          <button onClick={() => navigate(1)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
          }}>
            <LIcon name="chevronRight" size={14} stroke={2} />
          </button>
        </div>

        {/* 지표 — 기간 합계 + 금액 큰 항목 3개. 배경 박스를 벗고 행 구분선만 */}
        {(() => {
          const cols = mobile ? 2 : 4
          const figures: FigureItem[] = [
            {
              label: `${MODE_LABELS[periodMode]} 합계`,
              value: `${periodTotal.toLocaleString()}원`,
              mono: true,
              sub: basis === 'billing' ? '청구월 기준 결제액' : '사용월 기준 승인액',
              // 기준을 바꾸면 이 칸의 숫자만 바뀐다. 라벨 옆에 붙여야 무엇을 바꾸는 스위치인지 보인다.
              labelExtra: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs, marginLeft: t.density.gapSm }}>
                  {([['billing', '명세서'], ['approval', '승인']] as const).map(([key, label], i) => (
                    <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs }}>
                      {i > 0 && <span style={{ color: t.neutrals.line }}>·</span>}
                      {/* 칩이 아니라 글자다 — 테마가 모든 button을 칩으로 만들어 span으로 둔다 */}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => changeBasis(key)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); changeBasis(key) } }}
                        style={{
                          cursor: 'pointer',
                          color: basis === key ? t.neutrals.text : t.neutrals.subtle,
                          fontWeight: basis === key ? t.weight.semibold : t.weight.regular,
                        }}
                      >{label}</span>
                    </span>
                  ))}
                </span>
              ),
            },
            ...[0, 1, 2].map((i): FigureItem => {
              const c = byCategory[i]
              return {
                label: c ? c.label : '-',
                value: c ? `${Math.round(c.amount).toLocaleString()}원` : '-',
                mono: true,
                sub: c ? `${c.count}건 · 승인 대비 ${categoryBase ? Math.round((c.amount / categoryBase) * 100) : 0}%` : undefined,
              }
            }),
          ]
          return <FigureGrid items={figures} cols={cols} />
        })()}

        {/* 항목 칩 · 검색 한 줄 — 검색에 들어가면 칩은 접혀 자리를 내준다 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          marginTop: t.density.blockGap, flexWrap: mobile ? 'wrap' : 'nowrap',
        }}>
          <div style={{
            maxWidth: searchOpen ? 0 : 520,
            opacity: searchOpen ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-width .26s ease, opacity .16s ease',
          }}>
            <LFilterChip
              options={[{ value: 'all', label: '전체' }, ...byCategory.map(c => ({ value: c.key, label: c.label }))]}
              value={category}
              onChange={v => { setCategory(v); setPage(0) }}
              gap={t.density.gapXs}
            />
          </div>

          <div style={{ position: 'relative', flex: 1, minWidth: mobile ? '100%' : 160 }}>
            <div style={{ position: 'absolute', left: t.density.panelPadX, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
              <LIcon name="search" size={13} stroke={2} color={t.neutrals.subtle} />
            </div>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!search) setSearchOpen(false) }}
              placeholder="가맹점 검색"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: t.density.controlHSm,
                padding: `0 ${t.density.panelPadX}px 0 30px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                fontFamily: t.font.sans, color: t.neutrals.text,
                background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
                borderRadius: t.radius.sm, outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(0); setSearchOpen(false) }} style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.tableRowGap, color: t.neutrals.muted, display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={12} stroke={2} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 승인내역 */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px` }}>
        <LTableScroll columns={COLUMNS} mobile={mobile}>
        <LTableHead columns={COLUMNS} mobile={mobile} sort={sort} onSort={toggleSort} />
        {paged.length === 0 && <LTableEmpty>해당 기간 승인내역이 없습니다</LTableEmpty>}
        <LTableBody columns={COLUMNS} mobile={mobile}>
        {paged.map(a => {
          const isCancel = a.cancel_yn === '1' || a.cancel_yn === '2'
          const installment = a.payment_type === '2' && a.installment_month
          const cat = classify(a.store_name, a.store_type)
          return (
            <LTableRow key={a.id} columns={COLUMNS} mobile={mobile} onClick={() => setSelected(a)}>
              <LTableBadge tone={CATEGORY_TONES[cat.key]}>{cat.label}</LTableBadge>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>
                {a.used_date.slice(5)}
              </span>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.subtle, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}>
                {cardTail(a.card_no) || '—'}
              </span>
              <span style={{
                fontWeight: t.weight.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: isCancel ? 'line-through' : undefined,
                color: isCancel ? t.neutrals.subtle : undefined,
              }}>
                {a.store_name || '미상'}
                {(a.home_foreign_type === '2' || installment) && (
                  <span style={{ marginLeft: t.density.gapSm, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, fontWeight: t.weight.regular }}>
                    {a.home_foreign_type === '2' ? '해외' : ''}
                    {a.home_foreign_type === '2' && installment ? ' · ' : ''}
                    {installment ? `${a.installment_month}개월` : ''}
                  </span>
                )}
              </span>
              <LTableNumber value={Math.abs(a.krw)} muted={isCancel} strike={isCancel} />
            </LTableRow>
          )
        })}
        </LTableBody>
        </LTableScroll>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`,
      }}>
        <LPageSize value={pageSize} onChange={applyPageSize} />

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1, display: 'flex',
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              style={{
                background: 'transparent', border: 'none', padding: t.density.gapXs, borderRadius: t.radius.sm,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1, display: 'flex',
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>

      <CardDetailDialog
        approval={selected}
        category={selected ? classify(selected.store_name, selected.store_type).label : ''}
        onClose={() => setSelected(null)}
      />
    </LCard>
  )
}
