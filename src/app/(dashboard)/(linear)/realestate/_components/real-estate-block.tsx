'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { Bone } from '@/app/(dashboard)/_components/linear-skeleton'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LHeadBtn } from '@/app/(dashboard)/_components/linear-section-head'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LTableScroll, LTableHead, LTableBody, LTableRow, LTableMono, LPageSize, type LColumn } from '@/app/(dashboard)/_components/linear-table'
import { getStoredPageSize, savePageSize } from '@/app/(dashboard)/_components/linear-page-size'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, AreaChart, Area,
} from 'recharts'

/* ── Types ── */

interface ReSummary {
  trackedComplexes: number
  districtCount: number
  avgTradePpp: number
  avgJeonsePpp: number
  tradeListingGap: number
  jeonseListingGap: number
  lastListingDate: string | null
  lastTradeDate: string | null
}

interface ReComplex {
  id: string
  name: string
  district_name: string
  dong_name: string
  total_units: number
  build_year: number
  is_tracked: boolean
}

interface ReTradeMonth {
  month: string
  avgPpp: number | null
  count: number
}

interface ReTradeData {
  months: string[]
  complexes: { name: string; data: ReTradeMonth[] }[]
}

interface ReListingRow {
  complexName: string
  complexNo: string | null
  areaBand: number
  listingMinPpp: number | null
  listingMaxPpp: number | null
  listingCount: number
  actualAvgPpp: number | null
  actualCount: number
  gap: number | null
}

interface ReTrendPoint {
  date: string
  gapRate: number | null
  /** 그날 괴리율을 만든 짝(단지×평형밴드) 수와 그 안의 실거래 건수. 얇은 날을 툴팁에서 알아본다. */
  pairs?: number
  deals?: number
}

interface ReTrend {
  trend: ReTrendPoint[]
  // 단지별 호가 추이 — 날짜별 최저 호가 평당가(평형 밴드 평균). row = { date, [단지명]: 만원/평 }
  complexTrend?: Array<Record<string, string | number | null>>
  complexes?: string[]
  tradeType: string
}

interface ReJeonseRatio {
  month: string
  ratio: number | null
  /** 그 달의 매매·전세 실거래 건수와 짝(단지×평형밴드) 수 — 툴팁에서 표본 두께를 같이 읽는다. */
  trades?: number
  jeonse?: number
  pairs?: number
  /** 실거래 신고 지연(평균 17~19일)으로 아직 채워지는 중인 달. 확정 구간과 나눠 그린다. */
  provisional?: boolean
}

interface ReMarketCapPoint {
  date: string
  actualValue: number // 조원
  listingValue: number // 조원
}

interface ReMarketCap {
  trend: ReMarketCapPoint[]
  complexCount: number
}

/* ── Constants ── */

const ALL_DISTRICTS = ['강남구', '서초구', '송파구'] as const
const AREA_OPTIONS = [
  { value: '', label: '전체' },
  { value: '20', label: '20평' },
  { value: '30', label: '30평' },
  { value: '40', label: '40평' },
  { value: '50', label: '50평' },
  { value: '60+', label: '60+' },
]
// 단지별 선 색 — 보이스카드가 쓰는 바로 그 램프다(분포 차트 palette·MEMBER/NEW/SOLD/USED).
// 네이비 하나에서 시작해 회색으로 내려간다. 색상환을 도는 무지개 10색은 카드 문법의
// "색은 상태·부호·강조에만" 을 정면으로 어겼다. 단지를 여럿 겹쳐 보는 일은 드물고
// (보통 1~3개), 명도차만으로 그 범위는 충분히 갈린다.
const COMPLEX_COLORS = ['#0E415A', '#5B6B74', '#8D959D', '#B4BBC1', '#C7CCD3', '#D8DCE1', '#E4E7EB', '#EDEFF2']

// 두 시리즈 짝 — 보이스카드의 SOLD/USED 와 같은 값.
const SERIES_PRIMARY = '#0E415A'
const SERIES_SECONDARY = '#A8B0B6'

const PAGE_SIZE = 5
const TRADE_PAGE_KEY = 'realestate-listings-trade'
const JEONSE_PAGE_KEY = 'realestate-listings-jeonse'
// useAgentRefresh 의 prefixes 는 의존성 배열에 들어간다 — 매 렌더 새 배열을 넘기면
// 구독이 끊겼다 붙기를 반복한다. 모듈 상수로 고정한다.
const RE_TABLE_PREFIXES = ['re_']

type SortKey = 'complexName' | 'areaBand' | 'actualAvgPpp' | 'listingMinPpp' | 'listingMaxPpp' | 'gap' | 'listingCount'
type SortDir = 'asc' | 'desc'

/* ── Shared styles (module scope to avoid re-creation) ── */

const tooltipStyle: React.CSSProperties = {
  background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
  borderRadius: t.radius.md, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans, padding: `${t.density.gapSm}px ${t.density.panelPadX}px`,
}

const innerCard: React.CSSProperties = {
  background: t.neutrals.inner, borderRadius: t.radius.md, padding: t.density.blockGap,
  minWidth: 0, overflow: 'hidden',
}

const LISTING_COLUMNS: LColumn<ReListingRow>[] = [
  { key: 'complexName', label: '단지', width: 'minmax(96px,1.4fr)', sortValue: r => r.complexName },
  { key: 'areaBand', label: '평형', width: 'minmax(48px,0.6fr)', align: 'right', sortValue: r => r.areaBand },
  { key: 'actualAvgPpp', label: '실거래', width: 'minmax(64px,1fr)', align: 'right', sortValue: r => r.actualAvgPpp },
  { key: 'listingMinPpp', label: '호가(저)', width: 'minmax(64px,1fr)', align: 'right', sortValue: r => r.listingMinPpp },
  { key: 'listingMaxPpp', label: '호가(고)', width: 'minmax(64px,1fr)', align: 'right', sortValue: r => r.listingMaxPpp },
  { key: 'gap', label: '괴리율', width: 'minmax(56px,0.8fr)', align: 'right', sortValue: r => r.gap },
  { key: 'listingCount', label: '매물', width: 'minmax(40px,0.5fr)', align: 'right', sortValue: r => r.listingCount },
]

// 전월비 배지 — 국내 시세 관례(상승=적, 하락=청)라 tonePalettes 의 pos/neg 와 방향이 반대다.
// 색은 토큰에서 읽되 방향 관례는 유지한다 — tonePalettes 의 pos/neg 와 반대다.
const MOM_UP = { bg: '#F7E7E7', fg: t.accent.neg }
const MOM_DOWN = { bg: t.brand[50], fg: t.brand[600] }

/* ── Helpers ── */

function fmtMonth(m: string) {
  const parts = m.split('-')
  return `${parts[0].slice(2)}/${parts[1]}`
}

function fmtDate(d: string) {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}`
}

// 카드 하단 메타 바용. 호가 기준일(ListingFreshness)이 쓰는 MM.DD 와 같은 표기로 맞춘다.
function fmtDateDot(d: string) {
  return `${d.slice(5, 7)}.${d.slice(8, 10)}`
}

function fmtPpp(v: number | null) {
  if (v === null || v === 0) return '-'
  return Math.round(v).toLocaleString()
}

function gapColor(gap: number | null): string {
  if (gap === null) return t.neutrals.muted
  if (gap > 0) return t.accent.neg
  if (gap < 0) return t.brand[600]
  return t.neutrals.text
}

// 괴리율은 부호가 있는 변동이라 카드 문법이 색을 허용하는 자리다. 위(+)는 호가가 실거래보다
// 비싸다는 뜻이라 국내 시세 관례대로 빨강(accent.neg), 아래(−)는 파랑(brand)으로 잇는다.
function gapTone(gap: number | null): 'neg' | 'info' | undefined {
  if (gap === null) return undefined
  if (gap > 0) return 'neg'
  if (gap < 0) return 'info'
  return undefined
}

function fmtGap(gap: number | null): string {
  return gap === null ? '-' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}%`
}

/* ── Sub-components (module scope — stable identity across re-renders) ── */

function ChartHeader({ title, momPct, titleHint }: { title: string; momPct?: number | null; titleHint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: t.density.gapXs }}>
      <span
        data-panel-title=""
        title={titleHint}
        style={{
          fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.muted,
          cursor: titleHint ? 'help' : undefined,
        }}
      >{title}</span>
      {momPct !== undefined && momPct !== null && (
        <LBadge
          palette={momPct > 0 ? MOM_UP : momPct < 0 ? MOM_DOWN : { bg: t.neutrals.inner, fg: t.neutrals.muted }}
          style={{ fontFamily: t.font.mono }}
        >
          {momPct > 0 ? '+' : ''}{momPct.toFixed(1)}%
        </LBadge>
      )}
    </div>
  )
}

// 차트 범례 — 같은 markup 이 단지 라인 차트 둘과 시가총액에 반복됐다. 하나로 모은다.
// 오른쪽 note 는 그 차트를 무엇으로 만들었는지 적는 자리(예: 세대수 가중 근거).
function ChartLegend({ items, note }: { items: { label: string; color: string }[]; note?: string }) {
  if (!items.length && !note) return null
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      gap: `${t.density.tableRowGap}px ${t.density.kpiGap}px`, marginTop: t.density.gapXs,
    }}>
      {items.map(it => (
        <span key={it.label} style={{
          fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.muted,
          display: 'flex', alignItems: 'center', gap: t.density.gapXs,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.color, display: 'inline-block' }} />
          {it.label}
        </span>
      ))}
      {note && (
        <span style={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.subtle, marginLeft: 'auto' }}>
          {note}
        </span>
      )}
    </div>
  )
}

function PriceChart({ data, complexes, height = 200 }: {
  data: Record<string, string | number | null>[]
  complexes: { name: string }[]
  height?: number
}) {
  if (!data.length) return <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
        <XAxis
          dataKey="month" tickFormatter={fmtMonth}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        {/* 가격축은 데이터 범위에 맞춘다 (호가 차트와 동일) — 0부터 그리면 변동이 안 보인다.
            건수 막대(right)는 0 기준 유지. */}
        <YAxis
          yAxisId="left"
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}`}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} width={50}
        />
        <YAxis
          yAxisId="right" orientation="right"
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} width={30}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => String(v)}
          formatter={(value, name) => {
            if (name === '건수') return [value, name]
            return [`${Math.round(Number(value)).toLocaleString()} 만/평`, name]
          }}
        />
        <Bar
          yAxisId="right" dataKey="_count" name="건수"
          fill={t.neutrals.muted} fillOpacity={0.25} barSize={12} radius={[2, 2, 0, 0]}
        />
        {complexes.map((c, i) => (
          <Line
            key={c.name} yAxisId="left" type="monotone" dataKey={c.name} name={c.name}
            stroke={COMPLEX_COLORS[i % COMPLEX_COLORS.length]}
            strokeWidth={1.5} dot={false} connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// 호가 추이 — 단지별 최저 호가 평당가 라인. PriceChart와 같은 문법이지만 일별(date) 축이고
// 스냅샷엔 건수 개념이 없어 막대(거래량)가 없다.
function ListingPriceChart({ data, complexes, height = 200 }: {
  data: Record<string, string | number | null>[]
  complexes: string[]
  height?: number
}) {
  if (!data.length) return <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
        <XAxis
          dataKey="date" tickFormatter={fmtDate}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        {/* 호가는 좁은 범위에서 움직인다 — 0부터 그리면 평평해 보여서 데이터 범위에 맞춘다 */}
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}`}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} width={50}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => String(v)}
          formatter={(value, name) => [`${Math.round(Number(value)).toLocaleString()} 만/평`, name]}
        />
        {complexes.map((name, i) => (
          <Line
            key={name} type="monotone" dataKey={name} name={name}
            stroke={complexes.length === 1 ? t.chart.mono : COMPLEX_COLORS[i % COMPLEX_COLORS.length]}
            strokeWidth={1.5} dot={false} connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// 합산 시가총액 추이 — 평형별 세대수 × 공급면적(평) × 평당가를 (단지×평형밴드)로 합산.
// 실거래(1개월 창 평균)와 최저호가 두 라인을 절대금액(조원)으로 비교한다.
function MarketCapChart({ data, height = 200 }: { data: ReMarketCapPoint[]; height?: number }) {
  if (!data.length) return <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
        <XAxis
          dataKey="date" tickFormatter={fmtDate}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        {/* 합산 가치도 좁은 범위에서 움직인다 — 데이터 범위에 맞춘다 */}
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => `${v.toFixed(1)}조`}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} width={44}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => String(v)}
          formatter={(value, name) => [`${Number(value).toFixed(2)}조원`, name]}
        />
        <Line
          type="monotone" dataKey="actualValue" name="실거래 기준"
          stroke={SERIES_PRIMARY} strokeWidth={1.5} dot={false} connectNulls
        />
        <Line
          type="monotone" dataKey="listingValue" name="최저호가 기준"
          stroke={SERIES_SECONDARY} strokeWidth={1.5} dot={false} connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function GapChart({ data, height = 200 }: { data: ReTrendPoint[]; height?: number }) {
  if (!data.length) return <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
        <XAxis
          dataKey="date" tickFormatter={fmtDate}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
          axisLine={false} tickLine={false} width={40}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(v) => String(v)}
          // 호가 수집이 부분 실패한 날은 짝이 절반으로 줄면서 값이 튄다(2026-08-02·08-09 실측).
          // 비율만 보이면 그런 날도 정상처럼 생겨서, 무엇으로 만든 값인지 같이 적는다.
          formatter={(value, _name, item) => {
            const p = (item?.payload ?? {}) as ReTrendPoint
            const meta = p.pairs ? ` (${p.pairs}짝 · 실거래 ${(p.deals ?? 0).toLocaleString()}건)` : ''
            return [`${Number(value).toFixed(1)}%${meta}`, '괴리율']
          }}
        />
        <ReferenceLine y={0} stroke={t.chart.grid} strokeDasharray="3 3" />
        <Line
          type="monotone" dataKey="gapRate" name="괴리율"
          stroke={t.chart.mono} strokeWidth={1.5} dot={false} connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function ListingTable({
  rows, sortKey, sortDir, page, pageCount, pageSize,
  onSort, onPageChange, onPageSizeChange, tradeType,
}: {
  rows: ReListingRow[]
  sortKey: SortKey
  sortDir: SortDir
  page: number
  pageCount: number
  pageSize: number
  onSort: (key: SortKey) => void
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
  tradeType: '매매' | '전세'
}) {
  if (rows.length === 0) return <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
  const msParam = tradeType === '매매' ? 'a1' : 'b1'
  return (
    <div>
      <LTableScroll columns={LISTING_COLUMNS}>
        <LTableHead
          columns={LISTING_COLUMNS}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={(k) => onSort(k as SortKey)}
        />
        <LTableBody columns={LISTING_COLUMNS}>
          {rows.map((r, i) => (
            <LTableRow key={i} columns={LISTING_COLUMNS}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.complexNo ? (
                  <a
                    href={`https://new.land.naver.com/complexes/${r.complexNo}?ms=${msParam}&a=APT&e=OPST`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: t.brand[600], textDecoration: 'none' }}
                  >
                    {r.complexName}
                  </a>
                ) : r.complexName}
              </span>
              <LTableMono align="right" tone="text">{r.areaBand}평</LTableMono>
              <LTableMono align="right" tone="text">{fmtPpp(r.actualAvgPpp)}</LTableMono>
              <LTableMono align="right" tone="text">{fmtPpp(r.listingMinPpp)}</LTableMono>
              <LTableMono align="right" tone="text">{fmtPpp(r.listingMaxPpp)}</LTableMono>
              <span style={{ textAlign: 'right', fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', color: gapColor(r.gap), fontWeight: t.weight.medium, whiteSpace: 'nowrap' }}>
                {r.gap !== null ? `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}%` : '-'}
              </span>
              <LTableMono align="right" tone="text">{r.listingCount}</LTableMono>
            </LTableRow>
          ))}
        </LTableBody>
      </LTableScroll>
      {/* 표 바로 아래 줄 — 행수(왼쪽)와 페이지 이동(오른쪽). 사업관리 표와 같은 배치다.
          가운데 정렬 화살표만 두던 때는 행수를 바꿀 길이 아예 없었다. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: t.density.gapSm, marginTop: t.density.kpiGap,
      }}>
        <LPageSize value={pageSize} onChange={onPageSizeChange} />
        {pageCount > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap }}>
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            style={{
              border: 'none', background: 'transparent', cursor: page === 0 ? 'default' : 'pointer',
              opacity: page === 0 ? 0.3 : 1, padding: t.density.tableRowGap,
            }}
          >
            <LIcon name="chevronLeft" size={14} color={t.neutrals.muted} />
          </button>
          <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {page + 1} / {pageCount}
          </span>
          <button
            onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            style={{
              border: 'none', background: 'transparent', cursor: page >= pageCount - 1 ? 'default' : 'pointer',
              opacity: page >= pageCount - 1 ? 0.3 : 1, padding: t.density.tableRowGap,
            }}
          >
            <LIcon name="chevronRight" size={14} color={t.neutrals.muted} />
          </button>
        </div>
        ) : <span />}
      </div>
    </div>
  )
}

// 로딩 골격은 실제로 들어설 모양을 그대로 흉내 낸다 — 판을 벗은 뒤에도 회색 상자를
// 그리고 있으면, 데이터가 도착하는 순간 있던 상자가 사라지며 화면이 한 번 출렁인다.

// 지표 자리 — FigureGrid 와 같은 격자·같은 패딩. 라벨/값/보조 세 줄도 같은 자리에 둔다.
function KpiSkeleton({ mobile }: { mobile: boolean }) {
  const cols = mobile ? 2 : 5
  return (
    <div style={{ margin: `0 -${t.density.panelPadX}px` }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
            display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap, minWidth: 0,
            borderTop: i >= cols ? `1px solid ${t.neutrals.line}` : undefined,
          }}>
            <Bone w={48} h={8} />
            <Bone w={76} h={14} />
            <Bone w={56} h={8} />
          </div>
        ))}
      </div>
    </div>
  )
}

// 막대 높이는 고정 배열이다. Math.random() 을 렌더 중에 부르면 리렌더마다 막대가 튀고,
// 리액트 컴파일러도 순수하지 않은 렌더로 본다.
const CHART_SKEL_BARS = [58, 92, 71, 120, 86, 104, 63, 133, 97, 78, 112, 68]

function ChartSkeleton() {
  return (
    <div>
      <Bone w={110} h={9} style={{ marginBottom: t.density.kpiGap }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: t.density.gapXs, height: 180 }}>
        {CHART_SKEL_BARS.map((h, i) => (
          <Bone key={i} h={h} style={{ flex: 1, borderRadius: 2 }} />
        ))}
      </div>
    </div>
  )
}

// 표 자리 — 제목, 머리줄, 본문 다섯 줄, 그리고 행수·페이지 이동 줄까지.
function TableSkeleton() {
  return (
    <div>
      <Bone w={130} h={9} style={{ marginBottom: t.density.kpiGap }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap }}>
        <div style={{ display: 'flex', gap: t.density.tableColGap, padding: `0 ${t.density.tableRowPadX}px ${t.density.gapSm}px` }}>
          {[70, 40, 56, 56, 56, 44, 30].map((w, i) => <Bone key={i} w={w} h={8} />)}
        </div>
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} style={{ display: 'flex', gap: t.density.tableColGap, padding: `${t.density.gapSm}px ${t.density.tableRowPadX}px` }}>
            {[70, 40, 56, 56, 56, 44, 30].map((w, i) => <Bone key={i} w={w} h={10} />)}
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: t.density.kpiGap,
      }}>
        <Bone w={64} h={t.density.controlHSm} />
        <Bone w={72} h={12} />
      </div>
    </div>
  )
}

/* ── Component ── */

// 호가 기준일. 하루만 밀려도 눈에 걸리게 색을 준다 — 수집기가 조용히 죽어도
// 화면이 그 사실을 말하게 하려는 것이다. 이틀 이상 밀리면 주황.
// 며칠 밀렸는지는 서버가 세어 보낸다(렌더 중 오늘 날짜를 읽으면 리렌더마다 흔들린다).
function ListingFreshness({ date, staleDays }: { date: string | null; staleDays: number }) {
  if (!date) return null
  const stale = staleDays >= 2
  return (
    <span
      title={stale ? `호가 수집이 ${staleDays}일째 멈춰 있어요` : '네이버 호가 스냅샷 기준일'}
      style={{
        fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
        color: stale ? t.accent.warn : t.neutrals.subtle,
        fontWeight: stale ? 600 : 400,
      }}
    >
      호가 {date.slice(5).replace('-', '.')}
      {stale ? ` · ${staleDays}일 정체` : ''}
    </span>
  )
}

export function RealEstateBlock() {
  const mobile = useIsMobile()
  const cols = useDashCols()

  /* ── Filter state ── */
  const [districts, setDistricts] = useState<string[]>([...ALL_DISTRICTS])
  const [selectedComplexIds, setSelectedComplexIds] = useState<string[]>([])
  const [areaRange, setAreaRange] = useState('')
  const [period] = useState('12')
  const [complexDropdownOpen, setComplexDropdownOpen] = useState(false)

  /* ── Data state ── */
  const [initialLoad, setInitialLoad] = useState(true) // true only for very first load
  const [reSummary, setReSummary] = useState<ReSummary | null>(null)
  const [reComplexes, setReComplexes] = useState<ReComplex[]>([])
  const [reTrades, setReTrades] = useState<ReTradeData | null>(null)
  const [reRentals, setReRentals] = useState<ReTradeData | null>(null)
  const [reListingsTrade, setReListingsTrade] = useState<ReListingRow[]>([])
  // 호가 스냅샷 기준일. 매일 도는 수집이 멈추면 이 날짜가 그대로 멈춘다.
  const [listingSnapshotDate, setListingSnapshotDate] = useState<string | null>(null)
  const [listingStaleDays, setListingStaleDays] = useState(0)
  const [reListingsJeonse, setReListingsJeonse] = useState<ReListingRow[]>([])
  const [reJeonseRatio, setReJeonseRatio] = useState<ReJeonseRatio[]>([])
  const [reListingTrend, setReListingTrend] = useState<ReTrend | null>(null)
  const [reListingTrendJeonse, setReListingTrendJeonse] = useState<ReTrend | null>(null)
  const [reMarketCap, setReMarketCap] = useState<ReMarketCap | null>(null)

  /* ── Per-section loading flags ── */
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingTrades, setLoadingTrades] = useState(true)
  const [loadingRentals, setLoadingRentals] = useState(true)
  const [loadingListingsTrade, setLoadingListingsTrade] = useState(true)
  const [loadingListingsJeonse, setLoadingListingsJeonse] = useState(true)
  const [loadingTrendTrade, setLoadingTrendTrade] = useState(true)
  const [loadingTrendJeonse, setLoadingTrendJeonse] = useState(true)
  const [loadingJeonseRatio, setLoadingJeonseRatio] = useState(true)
  const [loadingMarketCap, setLoadingMarketCap] = useState(true)

  // 새로고침 버튼은 전체 현황 카드에만 두고, 아직 돌고 있는 조회가 하나라도 있으면 돈다
  // (카드 문법: 데이터를 읽는 블록마다 첫 섹션 헤드에 하나).
  const refreshing = loadingSummary || loadingTrades || loadingRentals
    || loadingListingsTrade || loadingListingsJeonse || loadingTrendTrade
    || loadingTrendJeonse || loadingJeonseRatio || loadingMarketCap

  /* ── Table sort/page state ── */
  const [tradeSortKey, setTradeSortKey] = useState<SortKey>('listingMinPpp')
  const [tradeSortDir, setTradeSortDir] = useState<SortDir>('desc')
  const [tradePage, setTradePage] = useState(0)
  const [tradePageSize, setTradePageSize] = useState(() => getStoredPageSize(TRADE_PAGE_KEY, PAGE_SIZE))
  const [jeonsePageSize, setJeonsePageSize] = useState(() => getStoredPageSize(JEONSE_PAGE_KEY, PAGE_SIZE))
  const [jeonseSortKey, setJeonseSortKey] = useState<SortKey>('listingMinPpp')
  const [jeonseSortDir, setJeonseSortDir] = useState<SortDir>('desc')
  const [jeonsePage, setJeonsePage] = useState(0)

  /* ── Build query params ── */
  const baseParams = useMemo(() => {
    const p = new URLSearchParams()
    if (districts.length > 0) p.set('districts', districts.join(','))
    p.set('areaRange', areaRange)
    p.set('period', period)
    if (selectedComplexIds.length > 0) p.set('complexIds', selectedComplexIds.join(','))
    return p.toString()
  }, [districts, areaRange, period, selectedComplexIds])

  /* ── Progressive fetch: fire all, update state as each resolves ── */
  const loadGenRef = useRef(0)

  const loadData = useCallback(() => {
    const gen = ++loadGenRef.current
    const base = '/api/willow-mgmt/real-estate'

    // Reset all section loading flags
    setLoadingSummary(true)
    setLoadingTrades(true)
    setLoadingRentals(true)
    setLoadingListingsTrade(true)
    setLoadingListingsJeonse(true)
    setLoadingTrendTrade(true)
    setLoadingTrendJeonse(true)
    setLoadingJeonseRatio(true)
    setLoadingMarketCap(true)

    const stale = () => loadGenRef.current !== gen

    // Phase 1: summary + complexes (fast, needed for filters)
    fetch(`${base}?type=summary&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReSummary(d.summary || null)
      setLoadingSummary(false)
      setInitialLoad(false)
    }).catch(() => { if (!stale()) setLoadingSummary(false) })

    fetch(`${base}?type=complexes&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReComplexes(d.complexes || [])
    }).catch(() => {})

    // Phase 2: charts + tables (heavier queries, arrive independently)
    fetch(`${base}?type=trades&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReTrades(d.months ? d : null)
      setLoadingTrades(false)
    }).catch(() => { if (!stale()) setLoadingTrades(false) })

    fetch(`${base}?type=rentals&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReRentals(d.months ? d : null)
      setLoadingRentals(false)
    }).catch(() => { if (!stale()) setLoadingRentals(false) })

    fetch(`${base}?type=listings&tradeType=매매&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReListingsTrade(d.listings || [])
      setListingSnapshotDate(d.snapshotDate ?? null)
      setListingStaleDays(Number(d.snapshotStaleDays) || 0)
      setLoadingListingsTrade(false)
    }).catch(() => { if (!stale()) setLoadingListingsTrade(false) })

    fetch(`${base}?type=listings&tradeType=전세&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReListingsJeonse(d.listings || [])
      setLoadingListingsJeonse(false)
    }).catch(() => { if (!stale()) setLoadingListingsJeonse(false) })

    fetch(`${base}?type=listing-trend&tradeType=매매&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReListingTrend(d.trend ? d : null)
      setLoadingTrendTrade(false)
    }).catch(() => { if (!stale()) setLoadingTrendTrade(false) })

    fetch(`${base}?type=listing-trend&tradeType=전세&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReListingTrendJeonse(d.trend ? d : null)
      setLoadingTrendJeonse(false)
    }).catch(() => { if (!stale()) setLoadingTrendJeonse(false) })

    fetch(`${base}?type=jeonse-ratio&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReJeonseRatio(d.trend || [])
      setLoadingJeonseRatio(false)
    }).catch(() => { if (!stale()) setLoadingJeonseRatio(false) })

    fetch(`${base}?type=market-cap&${baseParams}`).then(r => r.json()).then(d => {
      if (stale()) return
      setReMarketCap(d.trend ? d : null)
      setLoadingMarketCap(false)
    }).catch(() => { if (!stale()) setLoadingMarketCap(false) })
  }, [baseParams])

  useEffect(() => {
    loadData()
  }, [loadData])


  // 상단바 새로고침 버튼과 에이전트 데이터 변경을 이 블록도 듣는다 — 다른 페이지와 같은 배선.
  // 없는 동안 헤더 버튼을 눌러도 부동산만 옛 숫자를 그대로 들고 있었다.
  useAgentRefresh(RE_TABLE_PREFIXES, loadData)

  // Reset pagination when filters change
  useEffect(() => { setTradePage(0) }, [baseParams])
  useEffect(() => { setJeonsePage(0) }, [baseParams])

  /* ── Toggle helpers ── */
  const toggleDistrict = (d: string) => {
    setDistricts(prev => {
      if (prev.includes(d)) {
        const next = prev.filter(x => x !== d)
        return next.length === 0 ? [d] : next
      }
      return [...prev, d]
    })
  }

  const toggleComplex = (id: string) => {
    setSelectedComplexIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const removeComplex = (id: string) => {
    setSelectedComplexIds(prev => prev.filter(x => x !== id))
  }

  /* ── Computed values ── */
  const currentTradeAvg = useMemo(() => {
    if (!reTrades?.complexes?.length) return null
    for (let mi = reTrades.months.length - 1; mi >= 0; mi--) {
      const month = reTrades.months[mi]
      let sum = 0, cnt = 0
      for (const c of reTrades.complexes) {
        const pt = c.data.find(d => d.month === month)
        if (pt?.avgPpp) { sum += pt.avgPpp; cnt++ }
      }
      if (cnt > 0) return Math.round(sum / cnt)
    }
    return null
  }, [reTrades])

  const currentRentalAvg = useMemo(() => {
    if (!reRentals?.complexes?.length) return null
    for (let mi = reRentals.months.length - 1; mi >= 0; mi--) {
      const month = reRentals.months[mi]
      let sum = 0, cnt = 0
      for (const c of reRentals.complexes) {
        const pt = c.data.find(d => d.month === month)
        if (pt?.avgPpp) { sum += pt.avgPpp; cnt++ }
      }
      if (cnt > 0) return Math.round(sum / cnt)
    }
    return null
  }, [reRentals])

  const lastTradeGap = useMemo(() => {
    if (!reListingTrend?.trend?.length) return null
    return reListingTrend.trend.at(-1)?.gapRate ?? null
  }, [reListingTrend])

  const lastJeonseGap = useMemo(() => {
    if (!reListingTrendJeonse?.trend?.length) return null
    return reListingTrendJeonse.trend.at(-1)?.gapRate ?? null
  }, [reListingTrendJeonse])

  /* ── Chart data ── */
  const tradeChartData = useMemo(() => {
    if (!reTrades) return []
    return reTrades.months.map(m => {
      const row: Record<string, string | number | null> = { month: m }
      let totalCount = 0
      for (const c of reTrades.complexes) {
        const pt = c.data.find(d => d.month === m)
        row[c.name] = pt?.avgPpp ?? null
        totalCount += pt?.count ?? 0
      }
      row._count = totalCount
      return row
    })
  }, [reTrades])

  const rentalChartData = useMemo(() => {
    if (!reRentals) return []
    return reRentals.months.map(m => {
      const row: Record<string, string | number | null> = { month: m }
      let totalCount = 0
      for (const c of reRentals.complexes) {
        const pt = c.data.find(d => d.month === m)
        row[c.name] = pt?.avgPpp ?? null
        totalCount += pt?.count ?? 0
      }
      row._count = totalCount
      return row
    })
  }, [reRentals])

  /* ── Sort tables ── */
  function sortRows(rows: ReListingRow[], key: SortKey, dir: SortDir) {
    return [...rows].sort((a, b) => {
      let av: number | string | null, bv: number | string | null
      switch (key) {
        case 'complexName': av = a.complexName; bv = b.complexName; break
        case 'areaBand': av = a.areaBand; bv = b.areaBand; break
        case 'actualAvgPpp': av = a.actualAvgPpp; bv = b.actualAvgPpp; break
        case 'listingMinPpp': av = a.listingMinPpp; bv = b.listingMinPpp; break
        case 'listingMaxPpp': av = a.listingMaxPpp; bv = b.listingMaxPpp; break
        case 'gap': av = a.gap; bv = b.gap; break
        case 'listingCount': av = a.listingCount; bv = b.listingCount; break
        default: av = null; bv = null
      }
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko')
      }
      return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }

  const sortedTradeListings = useMemo(() => sortRows(reListingsTrade, tradeSortKey, tradeSortDir), [reListingsTrade, tradeSortKey, tradeSortDir])
  const sortedJeonseListings = useMemo(() => sortRows(reListingsJeonse, jeonseSortKey, jeonseSortDir), [reListingsJeonse, jeonseSortKey, jeonseSortDir])

  const tradePageCount = Math.ceil(sortedTradeListings.length / tradePageSize)
  const jeonsePageCount = Math.ceil(sortedJeonseListings.length / jeonsePageSize)
  const tradePageRows = sortedTradeListings.slice(tradePage * tradePageSize, (tradePage + 1) * tradePageSize)
  const jeonsePageRows = sortedJeonseListings.slice(jeonsePage * jeonsePageSize, (jeonsePage + 1) * jeonsePageSize)

  // 행수를 바꾸면 보던 페이지 번호가 범위를 넘길 수 있다 — 첫 쪽으로 돌린다.
  const applyTradePageSize = (n: number) => { setTradePageSize(n); savePageSize(TRADE_PAGE_KEY, n); setTradePage(0) }
  const applyJeonsePageSize = (n: number) => { setJeonsePageSize(n); savePageSize(JEONSE_PAGE_KEY, n); setJeonsePage(0) }

  // 같은 컬럼은 asc → desc → 기본 정렬(호가(저) desc)로 순환. 기본 컬럼 자신은 toggle만 한다.
  function nextSort(key: SortKey, curKey: SortKey, curDir: SortDir): { key: SortKey; dir: SortDir } {
    if (curKey !== key) return { key, dir: 'asc' }
    if (key !== 'listingMinPpp' && curDir === 'desc') return { key: 'listingMinPpp', dir: 'desc' }
    return { key, dir: curDir === 'asc' ? 'desc' : 'asc' }
  }

  function handleTradeSort(key: SortKey) {
    const next = nextSort(key, tradeSortKey, tradeSortDir)
    setTradeSortKey(next.key)
    setTradeSortDir(next.dir)
    setTradePage(0)
  }

  function handleJeonseSort(key: SortKey) {
    const next = nextSort(key, jeonseSortKey, jeonseSortDir)
    setJeonseSortKey(next.key)
    setJeonseSortDir(next.dir)
    setJeonsePage(0)
  }

  /* ── Complex name lookup ── */
  const complexNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of reComplexes) map.set(c.id, c.name)
    return map
  }, [reComplexes])

  /* ── Initial load: full skeleton ── */
  if (initialLoad) {
    return (
      // 실제 화면과 같은 뼈대 — 전체 현황 한 장, 그 아래 매매·전세 두 장(2열에서 나란히).
      // 카드 수와 제목 자리가 다르면 데이터가 도착할 때 레이아웃이 통째로 갈아엎힌다.
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
          <LSectionHead title="전체 현황" mb={t.density.panelPadY + t.density.panelPadX} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
            <div style={{ display: 'flex', gap: t.density.kpiGap, alignItems: 'center' }}>
              <Bone w={44} h={t.density.controlHSm} r={t.radius.pill} />
              <Bone w={44} h={t.density.controlHSm} r={t.radius.pill} />
              <Bone w={44} h={t.density.controlHSm} r={t.radius.pill} />
              <Bone w={84} h={t.density.controlHSm} r={t.radius.pill} />
              <Bone w={180} h={t.density.controlHSm} r={t.radius.pill} />
            </div>
            <KpiSkeleton mobile={mobile} />
          </div>
        </div>
        <LCardFoot
          left={<Bone w={180} h={8} />}
          right={<Bone w={120} h={8} />}
          style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
        />
      </LCard>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr'), gap: t.density.blockGap, alignItems: 'start' }}>
        {(['매매 현황', '전세 현황'] as const).map(title => (
          <LCard key={title} pad={0}>
            <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
              <LSectionHead title={title} mb={t.density.panelPadY + t.density.panelPadX} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
                <ChartSkeleton />
                <ChartSkeleton />
                <TableSkeleton />
              </div>
            </div>
            <LCardFoot
              left={<Bone w={200} h={8} />}
              style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
            />
          </LCard>
        ))}
      </div>
      </div>
    )
  }

  /* ── Empty state (only after summary loaded) ── */
  if (!loadingSummary && (!reSummary || reSummary.trackedComplexes === 0)) {
    return (
      // 빈 상태도 제목은 실제 카드와 같게 — '부동산 리서치' 는 카드를 쪼개기 전 이름이었다.
      <LCard>
        <LSectionHead title="전체 현황" mb={t.density.panelPadY + t.density.panelPadX} />
        <div style={{ padding: '40px 14px', textAlign: 'center', fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle }}>
          추적 중인 단지가 없습니다
        </div>
      </LCard>
    )
  }

  /* ── MoM calc for chart headers ── */
  function calcMomPct(data: ReTradeData | null): number | null {
    if (!data?.complexes?.length || data.months.length < 2) return null
    const lastMonth = data.months[data.months.length - 1]
    const prevMonth = data.months[data.months.length - 2]
    let lastSum = 0, lastCnt = 0, prevSum = 0, prevCnt = 0
    for (const c of data.complexes) {
      const last = c.data.find(d => d.month === lastMonth)
      const prev = c.data.find(d => d.month === prevMonth)
      if (last?.avgPpp) { lastSum += last.avgPpp; lastCnt++ }
      if (prev?.avgPpp) { prevSum += prev.avgPpp; prevCnt++ }
    }
    if (lastCnt === 0 || prevCnt === 0) return null
    const lastAvg = lastSum / lastCnt
    const prevAvg = prevSum / prevCnt
    if (prevAvg === 0) return null
    return Math.round(((lastAvg - prevAvg) / prevAvg) * 1000) / 10
  }

  const tradeMom = calcMomPct(reTrades)
  const rentalMom = calcMomPct(reRentals)

  /* ── Render ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap }}>
    {/* ─────────────────────────────────────────────────────────────────────
        카드 1 · 전체 현황 — 필터와 핵심 숫자. (2026-09-13 카드 문법으로 옮김)
        한 덩어리였던 카드를 전체/매매/전세 세 판단 단위로 쪼갠 첫 조각이다.
        · eyebrow 는 뺐다 — 블록이 하나였을 때만 필요한 분류 라벨이었다.
        · 지표는 손으로 그리던 회색 타일 대신 윌로우(사업관리)의 FigureGrid.
          상자도 회색 판도 없이 줄 사이만 얇은 선으로 나눈다.
        · 칩 간격도 윌로우와 같은 gapXs 로 맞췄다.
        · 기준일(호가·실거래)은 필터 줄 오른쪽 끝에 떠 있던 것을 카드 하단
          메타 바로 내렸다.
        ───────────────────────────────────────────────────────────────────── */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
      {/* 헤더는 제목과 새로고침만. 자치구·단지·평형은 셋 다 같은 범위를 정하는 조건이라
          헤더와 아래 줄로 흩어 놓지 않고 필터 한 줄에 모은다. */}
      <LSectionHead
        title="전체 현황"
        mb={t.density.panelPadY + t.density.panelPadX}
        action={<LHeadBtn icon="refresh" title="데이터 새로고침" onClick={loadData} busy={refreshing} />}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.kpiGap }}>
        {/* Filter bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.density.kpiGap,
        }}>
          {/* 자치구 — 넓은 범위부터 좁은 범위(단지·평형) 순으로 읽는다 */}
          <LFilterChip
            multi
            options={ALL_DISTRICTS.map(d => ({ value: d, label: d.replace('구', '') }))}
            value={districts}
            onChange={toggleDistrict}
            gap={t.density.gapXs}
          />

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: t.neutrals.line }} />

          {/* Complex selector */}
          <div style={{ position: 'relative' }}>
            <LBtn
              variant="secondary"
              size="sm"
              onClick={() => setComplexDropdownOpen(v => !v)}
              icon={<LIcon name="building" size={12} color={t.neutrals.muted} />}
              style={{ borderRadius: t.radius.pill, gap: t.density.gapXs }}
            >
              단지 선택
              <LIcon name="chevronDown" size={10} color={t.neutrals.subtle} />
            </LBtn>
            {complexDropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: t.density.gapXs,
                background: t.neutrals.card, borderRadius: t.radius.md,
                border: `1px solid ${t.neutrals.line}`, zIndex: 20,
                minWidth: 180, maxHeight: 240, overflowY: 'auto', padding: t.density.gapXs,
              }}>
                {reComplexes.length === 0 ? (
                  <div style={{ padding: t.density.panelPadY, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle }}>단지 없음</div>
                ) : (
                  <>
                    {selectedComplexIds.length > 0 && (
                      <button
                        onClick={() => { setSelectedComplexIds([]); setComplexDropdownOpen(false) }}
                        style={{
                          border: 'none', background: 'transparent', width: '100%',
                          textAlign: 'left', padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
                          color: t.brand[600], cursor: 'pointer', fontFamily: t.font.sans,
                        }}
                      >
                        전체 (선택 초기화)
                      </button>
                    )}
                    {reComplexes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => toggleComplex(c.id)}
                        style={{
                          border: 'none', width: '100%', textAlign: 'left',
                          padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, cursor: 'pointer',
                          fontFamily: t.font.sans, borderRadius: t.radius.sm,
                          background: selectedComplexIds.includes(c.id) ? t.neutrals.inner : 'transparent',
                          color: selectedComplexIds.includes(c.id) ? t.neutrals.text : t.neutrals.muted,
                        }}
                      >
                        {c.name}
                        <span style={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.subtle, marginLeft: t.density.gapXs }}>{c.district_name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selected complex chips */}
          {selectedComplexIds.map(id => (
            <LBadge key={id} tone="brand" pill>
              {complexNameById.get(id) || id}
              <button
                onClick={() => removeComplex(id)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  padding: 0, display: 'flex',
                }}
              >
                <LIcon name="x" size={10} color={t.brand[600]} />
              </button>
            </LBadge>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: t.neutrals.line }} />

          {/* Area chips */}
          <LFilterChip options={AREA_OPTIONS} value={areaRange} onChange={setAreaRange} gap={t.density.gapXs} />
          {/* 기준일은 카드 하단 메타 바로 내렸다 — 필터 줄에 두면 조작 컨트롤과
              읽기 전용 사실이 같은 줄에서 섞인다. */}
        </div>

        {/* 상단 지표 — 윌로우(사업관리)와 같은 FigureGrid. 회색 판을 벗고 줄 사이만
            얇은 선으로 나눈다. 괴리율만 부호가 있는 값이라 색을 쓰고, 색은 부동산
            관례대로 방향만 말한다(오름 빨강·내림 파랑). */}
        {loadingSummary ? <KpiSkeleton mobile={mobile} /> : reSummary && (() => {
          const figures: FigureItem[] = [
            {
              label: '추적 단지',
              value: `${reSummary.trackedComplexes}개`,
              sub: `${reSummary.districtCount}개구`,
              mono: true,
            },
            {
              label: '매매가',
              value: currentTradeAvg ? `${currentTradeAvg.toLocaleString()} 만/평` : '-',
              sub: '선택 단지 평균',
              mono: true,
            },
            {
              label: '매도 괴리율',
              value: fmtGap(lastTradeGap),
              sub: '호가 대비 실거래',
              mono: true,
              tone: gapTone(lastTradeGap),
              title: '지금 호가(그날 최저 평당호가)가 최근 신고된 실거래보다 얼마나 위/아래인지. 같은 단지·같은 평형밴드끼리 평당가로 견주고, 기준선은 신고일 기준 최근 90일이다.',
            },
            {
              label: '전세가',
              value: currentRentalAvg ? `${currentRentalAvg.toLocaleString()} 만/평` : '-',
              sub: '선택 단지 평균',
              mono: true,
            },
            {
              label: '전세 괴리율',
              value: fmtGap(lastJeonseGap),
              sub: '호가 대비 실거래',
              mono: true,
              tone: gapTone(lastJeonseGap),
              title: '지금 호가(그날 최저 평당호가)가 최근 신고된 전세 실거래보다 얼마나 위/아래인지. 기준선은 신고일 기준 최근 90일이다.',
            },
          ]
          // 격자는 제 패딩을 갖고 있어 카드 패딩만큼 안으로 물러난다 — 윌로우처럼 밖으로 당겨
          // 라벨이 카드 제목과 같은 세로선에 서게 한다.
          return (
            <div style={{ margin: `0 -${t.density.panelPadX}px` }}>
              <FigureGrid items={figures} cols={mobile ? 2 : 5} />
            </div>
          )
        })()}
      </div>

      </div>

      <LCardFoot
        left="네이버 호가 스냅샷 · MOLIT 실거래"
        right={
          // 두 기준일은 같은 표기(MM.DD)로 읽고 가운뎃점으로 끊는다 — ListingFreshness 는
          // 정체되면 경고색으로 바뀌므로 그 판단만 그쪽에 맡긴다.
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs }}>
            <ListingFreshness date={listingSnapshotDate} staleDays={listingStaleDays} />
            {listingSnapshotDate && reSummary?.lastTradeDate && <span>·</span>}
            {reSummary?.lastTradeDate && <span>실거래 {fmtDateDot(reSummary.lastTradeDate)}</span>}
          </span>
        }
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>

    {/* 2열 모드에서는 매매가 왼쪽, 전세가 오른쪽. 1열 모드와 모바일에서는 위아래로 쌓인다.
        열 안에서 패널은 세로로 쌓는다 — 카드 하나가 곧 한 열이다. */}
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr'), gap: t.density.blockGap, alignItems: 'start' }}>
    {/* 카드 2 · 매매 현황 — 실거래·호가·괴리율·시가총액을 한 판단 단위로 묶는다.
        껍데기는 전체 현황과 같다: pad={0} 위에 안쪽이 제 패딩을 주고, 하단 메타 바는
        테마가 좌우를 글자 줄에 맞춘다. */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
      <LSectionHead title="매매 현황" mb={t.density.panelPadY + t.density.panelPadX} />
      {/* 패널 사이는 blockGap(12). 보이스카드의 카드 안 리듬인 kpiGap(8)은 KPI 타일처럼
          작은 요소끼리의 값이라, 판을 벗은 차트가 연달아 서면 축 눈금이 다음 제목에 붙는다. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
        {/* 매매 실거래가 추이 */}
        {loadingTrades ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="매매 실거래가 추이" momPct={tradeMom} />
          <PriceChart data={tradeChartData} complexes={reTrades?.complexes || []} />
          {reTrades && reTrades.complexes.length > 1 && (
            <ChartLegend items={reTrades.complexes.map((c, i) => ({ label: c.name, color: COMPLEX_COLORS[i % COMPLEX_COLORS.length] }))} />
          )}
        </div>
        )}

        {/* 매도 호가 추이 — 실거래가와 같은 단지 라인, 최저 호가 기준 */}
        {loadingTrendTrade ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="매도 호가 추이" />
          <ListingPriceChart data={reListingTrend?.complexTrend || []} complexes={reListingTrend?.complexes || []} />
          {(reListingTrend?.complexes?.length ?? 0) > 1 && (
            <ChartLegend items={(reListingTrend?.complexes ?? []).map((name, i) => ({ label: name, color: COMPLEX_COLORS[i % COMPLEX_COLORS.length] }))} />
          )}
        </div>
        )}

        {/* 매매 괴리율 추이 */}
        {loadingTrendTrade ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="매매 괴리율 추이" titleHint="지금 호가(그날 최저 평당호가)가 최근 신고된 실거래보다 얼마나 위/아래인지 — 같은 단지·같은 평형밴드끼리 평당가로 견주고, 짝의 무게는 실거래 건수. 기준선은 계약일이 아니라 신고일 기준 최근 90일이라 새 실거래가 신고되는 날 바로 반영된다. 계약일로 자르면 신고지연 때문에 창 뒤쪽이 비어 최근 며칠일수록 기준선이 무너진다(전체 평형 실측 짝 37→15개, 매매 92→18건)." />
          <GapChart data={reListingTrend?.trend || []} />
        </div>
        )}

        {/* 매도 호가 vs 실거래가 */}
        {loadingListingsTrade ? <TableSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="매도 호가 vs 실거래가" />
          <ListingTable
            rows={tradePageRows}
            sortKey={tradeSortKey}
            sortDir={tradeSortDir}
            page={tradePage}
            pageCount={tradePageCount}
            pageSize={tradePageSize}
            onPageSizeChange={applyTradePageSize}
            onSort={handleTradeSort}
            onPageChange={setTradePage}
            tradeType="매매"
          />
        </div>
        )}

        {/* 합산 시가총액 추이 — 실거래 vs 최저호가, 평형별 세대수 가중 */}
        {loadingMarketCap ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="합산 시가총액 추이" />
          <MarketCapChart data={reMarketCap?.trend || []} />
          {(reMarketCap?.trend?.length ?? 0) > 0 && (
            <ChartLegend
              items={[
                { label: '실거래 기준', color: SERIES_PRIMARY },
                { label: '최저호가 기준', color: SERIES_SECONDARY },
              ]}
              note="평형별 세대수 × 공급면적"
            />
          )}
        </div>
        )}
      </div>
      </div>

      <LCardFoot
        left="실거래는 MOLIT 신고일 기준 · 호가는 네이버 최저"
        right={reMarketCap?.complexCount ? `${reMarketCap.complexCount}개 단지` : undefined}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>

    {/* 카드 3 · 전세 현황 — 매매 현황과 쌍이다. 2열에서 나란히 서므로 껍데기·제목·하단 바를
        같은 문법으로 맞춘다. 오른쪽 값은 두지 않는다 — 전세에는 시가총액 같은 합산 대상이 없다. */}
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.blockGap }}>
      <LSectionHead title="전세 현황" mb={t.density.panelPadY + t.density.panelPadX} />
      {/* 패널 사이는 blockGap(12). 보이스카드의 카드 안 리듬인 kpiGap(8)은 KPI 타일처럼
          작은 요소끼리의 값이라, 판을 벗은 차트가 연달아 서면 축 눈금이 다음 제목에 붙는다. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: t.density.blockGap, minWidth: 0 }}>
        {/* 전세 실거래가 추이 */}
        {loadingRentals ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="전세 실거래가 추이" momPct={rentalMom} />
          <PriceChart data={rentalChartData} complexes={reRentals?.complexes || []} />
          {reRentals && reRentals.complexes.length > 1 && (
            <ChartLegend items={reRentals.complexes.map((c, i) => ({ label: c.name, color: COMPLEX_COLORS[i % COMPLEX_COLORS.length] }))} />
          )}
        </div>
        )}

        {/* 전세 호가 추이 — 실거래가와 같은 단지 라인, 최저 호가 기준 */}
        {loadingTrendJeonse ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="전세 호가 추이" />
          <ListingPriceChart data={reListingTrendJeonse?.complexTrend || []} complexes={reListingTrendJeonse?.complexes || []} />
          {(reListingTrendJeonse?.complexes?.length ?? 0) > 1 && (
            <ChartLegend items={(reListingTrendJeonse?.complexes ?? []).map((name, i) => ({ label: name, color: COMPLEX_COLORS[i % COMPLEX_COLORS.length] }))} />
          )}
        </div>
        )}

        {/* 전세 괴리율 추이 */}
        {loadingTrendJeonse ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="전세 괴리율 추이" titleHint="지금 호가(그날 최저 평당호가)가 최근 신고된 실거래보다 얼마나 위/아래인지 — 같은 단지·같은 평형밴드끼리 평당가로 견주고, 짝의 무게는 실거래 건수. 기준선은 계약일이 아니라 신고일 기준 최근 90일이라 새 실거래가 신고되는 날 바로 반영된다. 계약일로 자르면 신고지연 때문에 창 뒤쪽이 비어 최근 며칠일수록 기준선이 무너진다(전체 평형 실측 짝 37→15개, 매매 92→18건)." />
          <GapChart data={reListingTrendJeonse?.trend || []} />
        </div>
        )}

        {/* 전세 호가 vs 실거래가 */}
        {loadingListingsJeonse ? <TableSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader title="전세 호가 vs 실거래가" />
          <ListingTable
            rows={jeonsePageRows}
            sortKey={jeonseSortKey}
            sortDir={jeonseSortDir}
            page={jeonsePage}
            pageCount={jeonsePageCount}
            pageSize={jeonsePageSize}
            onPageSizeChange={applyJeonsePageSize}
            onSort={handleJeonseSort}
            onPageChange={setJeonsePage}
            tradeType="전세"
          />
        </div>
        )}

        {/* 전세가율 추이 */}
        {loadingJeonseRatio ? <ChartSkeleton /> : (
        <div data-panel="" style={innerCard}>
          <ChartHeader
            title="전세가율 추이"
            titleHint="같은 단지·같은 평형밴드 안에서 전세 평당보증금 ÷ 매매 평당가. 짝의 무게는 매매·전세 중 건수가 적은 쪽. 국토부 실거래는 신고까지 평균 17~19일 걸려서, 세로 점선 오른쪽은 표본이 아직 채워지는 중이다 — 확정치로 읽지 말 것."
          />
          {reJeonseRatio.length > 0 ? (() => {
            // 확정 구간과 진행중 구간의 경계. 값이 있는 달 중 첫 provisional 달에 선을 세운다.
            const firstProvisionalMonth = reJeonseRatio.find(r => r.provisional && r.ratio != null)?.month
            return (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={reJeonseRatio} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.chart.grid} />
                <XAxis
                  dataKey="month" tickFormatter={fmtMonth}
                  tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  axisLine={false} tickLine={false} interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  axisLine={false} tickLine={false} width={40}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(v) => String(v)}
                  // 비율만 보여주면 매매 4건으로 만든 점과 94건으로 만든 점이 똑같이 생겼다.
                  // 표본 두께를 같은 줄에 적어야 어느 점을 믿을지 판단이 선다.
                  formatter={(value, _name, item) => {
                    const p = (item?.payload ?? {}) as ReJeonseRatio
                    const parts = [`매매 ${(p.trades ?? 0).toLocaleString()}건`, `전세 ${(p.jeonse ?? 0).toLocaleString()}건`]
                    if (p.provisional) parts.push('신고 진행중')
                    return [`${Number(value).toFixed(1)}% (${parts.join(' · ')})`, '전세가율']
                  }}
                />
                <ReferenceLine y={40} stroke={t.chart.grid} strokeDasharray="3 3" label={{ value: '40%', position: 'right', fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }} />
                <ReferenceLine y={60} stroke={t.chart.grid} strokeDasharray="3 3" label={{ value: '60%', position: 'right', fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }} />
                {/*
                  신고가 아직 채워지는 구간의 시작점에 세로선을 세운다. 오른쪽은 확정치가
                  아니다 — 2026-08 은 추적 단지 매매가 15건뿐인데(7월 88건) 선만 보면
                  앞의 달들과 똑같이 생겨서 추세로 읽혔다.
                  점을 채움/빈원으로 가르는 방법도 있지만 Recharts 3 은 UMD 빌드가 없어
                  커스텀 dot 렌더를 이 저장소에서 실행 검증할 방법이 없었다. ReferenceLine
                  은 바로 위 40%·60% 선이 이미 쓰고 있어 확실하다.
                */}
                {firstProvisionalMonth && (
                  <ReferenceLine
                    x={firstProvisionalMonth} stroke={t.neutrals.subtle} strokeDasharray="2 3"
                    label={{ value: '신고 진행중', position: 'insideTopRight', fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  />
                )}
                <Area
                  type="monotone" dataKey="ratio" name="전세가율"
                  stroke={t.chart.mono} fill={t.chart.monoFill} fillOpacity={1}
                  strokeWidth={1.5} connectNulls dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            )
          })() : (
            <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: t.density.blockGap }}>데이터 없음</div>
          )}
        </div>
        )}
      </div>
      </div>

      <LCardFoot
        left="실거래는 MOLIT 신고일 기준 · 호가는 네이버 최저"
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
    </div>

    {/* Click outside to close dropdown */}
    {complexDropdownOpen && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 19 }}
        onClick={() => setComplexDropdownOpen(false)}
      />
    )}
    </div>
  )
}
