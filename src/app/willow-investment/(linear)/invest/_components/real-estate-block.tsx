'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
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
}

interface ReTrend {
  trend: ReTrendPoint[]
  tradeType: string
}

interface ReJeonseRatio {
  month: string
  ratio: number | null
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
const COMPLEX_COLORS = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#84cc16', '#64748b']
const PAGE_SIZE = 5

type SortKey = 'complexName' | 'areaBand' | 'actualAvgPpp' | 'listingMinPpp' | 'listingMaxPpp' | 'gap' | 'listingCount'
type SortDir = 'asc' | 'desc'

/* ── Helpers ── */

function fmtMonth(m: string) {
  const parts = m.split('-')
  return `${parts[0].slice(2)}/${parts[1]}`
}

function fmtDate(d: string) {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}`
}

function fmtPpp(v: number | null) {
  if (v === null || v === 0) return '-'
  return Math.round(v).toLocaleString()
}

function gapColor(gap: number | null): string {
  if (gap === null) return t.neutrals.muted
  if (gap > 0) return '#EF4444'
  if (gap < 0) return '#3B82F6'
  return t.neutrals.text
}

/* ── Component ── */

export function RealEstateBlock() {
  const mobile = useIsMobile()

  /* ── Filter state ── */
  const [districts, setDistricts] = useState<string[]>([...ALL_DISTRICTS])
  const [selectedComplexIds, setSelectedComplexIds] = useState<string[]>([])
  const [areaRange, setAreaRange] = useState('30')
  const [period] = useState('12')
  const [complexDropdownOpen, setComplexDropdownOpen] = useState(false)

  /* ── Data state ── */
  const [loading, setLoading] = useState(true)
  const [reSummary, setReSummary] = useState<ReSummary | null>(null)
  const [reComplexes, setReComplexes] = useState<ReComplex[]>([])
  const [reTrades, setReTrades] = useState<ReTradeData | null>(null)
  const [reRentals, setReRentals] = useState<ReTradeData | null>(null)
  const [reListingsTrade, setReListingsTrade] = useState<ReListingRow[]>([])
  const [reListingsJeonse, setReListingsJeonse] = useState<ReListingRow[]>([])
  const [reJeonseRatio, setReJeonseRatio] = useState<ReJeonseRatio[]>([])
  const [reListingTrend, setReListingTrend] = useState<ReTrend | null>(null)
  const [reListingTrendJeonse, setReListingTrendJeonse] = useState<ReTrend | null>(null)

  /* ── Table sort/page state ── */
  const [tradeSortKey, setTradeSortKey] = useState<SortKey>('complexName')
  const [tradeSortDir, setTradeSortDir] = useState<SortDir>('asc')
  const [tradePage, setTradePage] = useState(0)
  const [jeonseSortKey, setJeonseSortKey] = useState<SortKey>('complexName')
  const [jeonseSortDir, setJeonseSortDir] = useState<SortDir>('asc')
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

  /* ── Fetch data ── */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const base = '/api/willow-mgmt/real-estate'
      const [
        summaryRes, complexesRes,
        tradesRes, rentalsRes,
        listingsTradeRes, listingsJeonseRes,
        jeonseRatioRes, trendTradeRes, trendJeonseRes,
      ] = await Promise.all([
        fetch(`${base}?type=summary&${baseParams}`),
        fetch(`${base}?type=complexes&${baseParams}`),
        fetch(`${base}?type=trades&${baseParams}`),
        fetch(`${base}?type=rentals&${baseParams}`),
        fetch(`${base}?type=listings&tradeType=매매&${baseParams}`),
        fetch(`${base}?type=listings&tradeType=전세&${baseParams}`),
        fetch(`${base}?type=jeonse-ratio&${baseParams}`),
        fetch(`${base}?type=listing-trend&tradeType=매매&${baseParams}`),
        fetch(`${base}?type=listing-trend&tradeType=전세&${baseParams}`),
      ])

      const [
        summaryJson, complexesJson,
        tradesJson, rentalsJson,
        listingsTradeJson, listingsJeonseJson,
        jeonseRatioJson, trendTradeJson, trendJeonseJson,
      ] = await Promise.all([
        summaryRes.json(), complexesRes.json(),
        tradesRes.json(), rentalsRes.json(),
        listingsTradeRes.json(), listingsJeonseRes.json(),
        jeonseRatioRes.json(), trendTradeRes.json(), trendJeonseRes.json(),
      ])

      setReSummary(summaryJson.summary || null)
      setReComplexes(complexesJson.complexes || [])
      setReTrades(tradesJson.months ? tradesJson : null)
      setReRentals(rentalsJson.months ? rentalsJson : null)
      setReListingsTrade(listingsTradeJson.listings || [])
      setReListingsJeonse(listingsJeonseJson.listings || [])
      setReJeonseRatio(jeonseRatioJson.trend || [])
      setReListingTrend(trendTradeJson.trend ? trendTradeJson : null)
      setReListingTrendJeonse(trendJeonseJson.trend ? trendJeonseJson : null)
    } catch (e) {
      console.error('Real estate data load error:', e)
    } finally {
      setLoading(false)
    }
  }, [baseParams])

  useEffect(() => {
    loadData()
  }, [loadData])

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
    const lastMonth = reTrades.months[reTrades.months.length - 1]
    let sum = 0, cnt = 0
    for (const c of reTrades.complexes) {
      const pt = c.data.find(d => d.month === lastMonth)
      if (pt?.avgPpp) { sum += pt.avgPpp; cnt++ }
    }
    return cnt > 0 ? Math.round(sum / cnt) : null
  }, [reTrades])

  const currentRentalAvg = useMemo(() => {
    if (!reRentals?.complexes?.length) return null
    const lastMonth = reRentals.months[reRentals.months.length - 1]
    let sum = 0, cnt = 0
    for (const c of reRentals.complexes) {
      const pt = c.data.find(d => d.month === lastMonth)
      if (pt?.avgPpp) { sum += pt.avgPpp; cnt++ }
    }
    return cnt > 0 ? Math.round(sum / cnt) : null
  }, [reRentals])

  const lastTradeGap = useMemo(() => {
    if (!reListingTrend?.trend?.length) return null
    for (let i = reListingTrend.trend.length - 1; i >= 0; i--) {
      if (reListingTrend.trend[i].gapRate !== null) return reListingTrend.trend[i].gapRate
    }
    return null
  }, [reListingTrend])

  const lastJeonseGap = useMemo(() => {
    if (!reListingTrendJeonse?.trend?.length) return null
    for (let i = reListingTrendJeonse.trend.length - 1; i >= 0; i--) {
      if (reListingTrendJeonse.trend[i].gapRate !== null) return reListingTrendJeonse.trend[i].gapRate
    }
    return null
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

  const tradePageCount = Math.ceil(sortedTradeListings.length / PAGE_SIZE)
  const jeonsePageCount = Math.ceil(sortedJeonseListings.length / PAGE_SIZE)
  const tradePageRows = sortedTradeListings.slice(tradePage * PAGE_SIZE, (tradePage + 1) * PAGE_SIZE)
  const jeonsePageRows = sortedJeonseListings.slice(jeonsePage * PAGE_SIZE, (jeonsePage + 1) * PAGE_SIZE)

  function handleTradeSort(key: SortKey) {
    if (tradeSortKey === key) setTradeSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTradeSortKey(key); setTradeSortDir('asc') }
    setTradePage(0)
  }

  function handleJeonseSort(key: SortKey) {
    if (jeonseSortKey === key) setJeonseSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setJeonseSortKey(key); setJeonseSortDir('asc') }
    setJeonsePage(0)
  }

  /* ── Shared chart tooltip ── */
  const tooltipStyle: React.CSSProperties = {
    background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`,
    borderRadius: t.radius.md, fontSize: 11, fontFamily: t.font.sans, padding: '6px 10px',
  }

  /* ── Inline styles ── */
  const chipActiveStyle: React.CSSProperties = {
    background: t.brand[100], color: t.brand[700],
    padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
    cursor: 'pointer', border: 'none', fontFamily: t.font.sans,
    fontWeight: t.weight.medium, transition: 'all .12s',
  }
  const chipInactiveStyle: React.CSSProperties = {
    background: t.neutrals.inner, color: t.neutrals.muted,
    padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
    cursor: 'pointer', border: 'none', fontFamily: t.font.sans,
    fontWeight: t.weight.regular, transition: 'all .12s',
  }
  const innerCard: React.CSSProperties = {
    background: t.neutrals.inner, borderRadius: t.radius.md, padding: 12,
  }
  const thStyle: React.CSSProperties = {
    fontSize: 11, color: t.neutrals.subtle, cursor: 'pointer',
    padding: '6px 4px', textAlign: 'right' as const, fontWeight: t.weight.medium,
    fontFamily: t.font.sans, whiteSpace: 'nowrap' as const,
    userSelect: 'none' as const,
  }
  const tdStyle: React.CSSProperties = {
    fontSize: 12, padding: '5px 4px', textAlign: 'right' as const,
    fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' as const,
  }

  /* ── Complex name lookup ── */
  const complexNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of reComplexes) map.set(c.id, c.name)
    return map
  }, [reComplexes])

  /* ── Loading state ── */
  if (loading) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="REAL ESTATE" title="부동산 리서치" />
        </div>
        <div style={{
          padding: '40px 14px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <LIcon name="loader" size={20} color={t.neutrals.subtle} className="animate-spin" />
          <span style={{ fontSize: 12, color: t.neutrals.subtle }}>데이터 로딩 중...</span>
        </div>
      </LCard>
    )
  }

  /* ── Empty state ── */
  if (!reSummary || reSummary.trackedComplexes === 0) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="REAL ESTATE" title="부동산 리서치" />
        </div>
        <div style={{ padding: '40px 14px', textAlign: 'center', fontSize: 12, color: t.neutrals.subtle }}>
          추적 중인 단지가 없습니다
        </div>
      </LCard>
    )
  }

  /* ── Sub-components ── */

  function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return null
    return <span style={{ marginLeft: 2 }}>{dir === 'asc' ? '↑' : '↓'}</span>
  }

  function ChartHeader({ title, momPct }: { title: string; momPct?: number | null }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.muted }}>{title}</span>
        {momPct !== undefined && momPct !== null && (
          <span style={{
            fontSize: 10, fontWeight: t.weight.medium, borderRadius: t.radius.sm,
            padding: '1px 5px',
            background: momPct > 0 ? '#FEE2E2' : momPct < 0 ? '#DBEAFE' : t.neutrals.inner,
            color: momPct > 0 ? '#EF4444' : momPct < 0 ? '#3B82F6' : t.neutrals.muted,
          }}>
            {momPct > 0 ? '+' : ''}{momPct.toFixed(1)}%
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
    if (!data.length) return <div style={{ fontSize: 11, color: t.neutrals.subtle, padding: 12 }}>데이터 없음</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.neutrals.line} />
          <XAxis
            dataKey="month" tickFormatter={fmtMonth}
            tick={{ fontSize: 9, fill: t.neutrals.subtle }}
            axisLine={false} tickLine={false} interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) => `${Math.round(v).toLocaleString()}`}
            tick={{ fontSize: 9, fill: t.neutrals.subtle }}
            axisLine={false} tickLine={false} width={50}
          />
          <YAxis
            yAxisId="right" orientation="right"
            tick={{ fontSize: 9, fill: t.neutrals.subtle }}
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
            fill={t.neutrals.line} barSize={12} radius={[2, 2, 0, 0]}
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

  function GapChart({ data, height = 200 }: { data: ReTrendPoint[]; height?: number }) {
    if (!data.length) return <div style={{ fontSize: 11, color: t.neutrals.subtle, padding: 12 }}>데이터 없음</div>
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.neutrals.line} />
          <XAxis
            dataKey="date" tickFormatter={fmtDate}
            tick={{ fontSize: 9, fill: t.neutrals.subtle }}
            axisLine={false} tickLine={false} interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fontSize: 9, fill: t.neutrals.subtle }}
            axisLine={false} tickLine={false} width={40}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => String(v)}
            formatter={(value) => [`${Number(value).toFixed(1)}%`, '괴리율']}
          />
          <ReferenceLine y={0} stroke={t.neutrals.subtle} strokeDasharray="3 3" />
          <Line
            type="monotone" dataKey="gapRate" name="괴리율"
            stroke="#6366f1" strokeWidth={1.5} dot={false} connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  function ListingTable({
    rows, sortKey, sortDir, page, pageCount,
    onSort, onPageChange, tradeType,
  }: {
    rows: ReListingRow[]
    sortKey: SortKey
    sortDir: SortDir
    page: number
    pageCount: number
    onSort: (key: SortKey) => void
    onPageChange: (p: number) => void
    tradeType: '매매' | '전세'
  }) {
    if (rows.length === 0) return <div style={{ fontSize: 11, color: t.neutrals.subtle, padding: 12 }}>데이터 없음</div>
    const msParam = tradeType === '매매' ? 'a1' : 'b1'
    return (
      <div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: t.font.sans }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }} onClick={() => onSort('complexName')}>
                  단지<SortIndicator active={sortKey === 'complexName'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('areaBand')}>
                  평형<SortIndicator active={sortKey === 'areaBand'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('actualAvgPpp')}>
                  실거래<SortIndicator active={sortKey === 'actualAvgPpp'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('listingMinPpp')}>
                  호가(저)<SortIndicator active={sortKey === 'listingMinPpp'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('listingMaxPpp')}>
                  호가(고)<SortIndicator active={sortKey === 'listingMaxPpp'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('gap')}>
                  괴리율<SortIndicator active={sortKey === 'gap'} dir={sortDir} />
                </th>
                <th style={thStyle} onClick={() => onSort('listingCount')}>
                  매물<SortIndicator active={sortKey === 'listingCount'} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontFamily: t.font.sans }}>
                    {r.complexNo ? (
                      <a
                        href={`https://new.land.naver.com/complexes/${r.complexNo}?ms=${msParam}&a=APT&e=OPST`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: t.brand[600], textDecoration: 'none' }}
                      >
                        {r.complexName}
                      </a>
                    ) : r.complexName}
                  </td>
                  <td style={tdStyle}>{r.areaBand}평</td>
                  <td style={tdStyle}>{fmtPpp(r.actualAvgPpp)}</td>
                  <td style={tdStyle}>{fmtPpp(r.listingMinPpp)}</td>
                  <td style={tdStyle}>{fmtPpp(r.listingMaxPpp)}</td>
                  <td style={{ ...tdStyle, color: gapColor(r.gap), fontWeight: t.weight.medium }}>
                    {r.gap !== null ? `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}%` : '-'}
                  </td>
                  <td style={tdStyle}>{r.listingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              style={{
                border: 'none', background: 'transparent', cursor: page === 0 ? 'default' : 'pointer',
                opacity: page === 0 ? 0.3 : 1, padding: 2,
              }}
            >
              <LIcon name="chevronLeft" size={14} color={t.neutrals.muted} />
            </button>
            <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
              disabled={page >= pageCount - 1}
              style={{
                border: 'none', background: 'transparent', cursor: page >= pageCount - 1 ? 'default' : 'pointer',
                opacity: page >= pageCount - 1 ? 0.3 : 1, padding: 2,
              }}
            >
              <LIcon name="chevronRight" size={14} color={t.neutrals.muted} />
            </button>
          </div>
        )}
      </div>
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
    <LCard pad={0}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="REAL ESTATE"
          title="부동산 리서치"
          action={
            <div style={{ display: 'flex', gap: 4 }}>
              {ALL_DISTRICTS.map(d => (
                <button
                  key={d}
                  onClick={() => toggleDistrict(d)}
                  style={districts.includes(d) ? chipActiveStyle : chipInactiveStyle}
                >
                  {d.replace('구', '')}
                </button>
              ))}
            </div>
          }
        />
      </div>

      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Filter bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        }}>
          {/* Complex selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setComplexDropdownOpen(v => !v)}
              style={{
                ...chipInactiveStyle,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <LIcon name="building" size={12} color={t.neutrals.muted} />
              단지 선택
              <LIcon name="chevronDown" size={10} color={t.neutrals.subtle} />
            </button>
            {complexDropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: t.neutrals.card, borderRadius: t.radius.md,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 20,
                minWidth: 180, maxHeight: 240, overflowY: 'auto', padding: 4,
              }}>
                {reComplexes.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 11, color: t.neutrals.subtle }}>단지 없음</div>
                ) : (
                  <>
                    {selectedComplexIds.length > 0 && (
                      <button
                        onClick={() => { setSelectedComplexIds([]); setComplexDropdownOpen(false) }}
                        style={{
                          border: 'none', background: 'transparent', width: '100%',
                          textAlign: 'left', padding: '6px 8px', fontSize: 11,
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
                          padding: '6px 8px', fontSize: 11, cursor: 'pointer',
                          fontFamily: t.font.sans, borderRadius: t.radius.sm,
                          background: selectedComplexIds.includes(c.id) ? t.neutrals.inner : 'transparent',
                          color: selectedComplexIds.includes(c.id) ? t.neutrals.text : t.neutrals.muted,
                        }}
                      >
                        {c.name}
                        <span style={{ fontSize: 9, color: t.neutrals.subtle, marginLeft: 4 }}>{c.district_name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Selected complex chips */}
          {selectedComplexIds.map(id => (
            <span key={id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: t.brand[100], color: t.brand[700],
              padding: '3px 8px', borderRadius: t.radius.pill, fontSize: 10,
              fontFamily: t.font.sans, fontWeight: t.weight.medium,
            }}>
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
            </span>
          ))}

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: t.neutrals.line }} />

          {/* Area chips */}
          {AREA_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setAreaRange(opt.value)}
              style={areaRange === opt.value ? chipActiveStyle : chipInactiveStyle}
            >
              {opt.label}
            </button>
          ))}

          {/* Right-aligned date info */}
          <div style={{ marginLeft: 'auto', fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.mono, whiteSpace: 'nowrap' }}>
            {reSummary.lastListingDate && <>호가 {fmtDate(reSummary.lastListingDate)}</>}
            {reSummary.lastListingDate && reSummary.lastTradeDate && ' · '}
            {reSummary.lastTradeDate && <>실거래 {fmtDate(reSummary.lastTradeDate)}</>}
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 8 }}>
          <div style={innerCard}>
            <div style={{ fontSize: 9.5, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              추적 단지
            </div>
            <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.mono }}>
              {reSummary.trackedComplexes}개
              <span style={{ fontSize: 10, color: t.neutrals.muted, fontWeight: t.weight.regular, marginLeft: 4 }}>
                ({reSummary.districtCount}개구)
              </span>
            </div>
          </div>

          <div style={innerCard}>
            <div style={{ fontSize: 9.5, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              매매가 (만/평)
            </div>
            <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.mono }}>
              {currentTradeAvg ? currentTradeAvg.toLocaleString() : '-'}
            </div>
          </div>

          <div style={innerCard}>
            <div style={{ fontSize: 9.5, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              매도 괴리율
            </div>
            <div style={{
              fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.mono,
              color: gapColor(lastTradeGap),
            }}>
              {lastTradeGap !== null ? `${lastTradeGap > 0 ? '+' : ''}${lastTradeGap.toFixed(1)}%` : '-'}
            </div>
          </div>

          <div style={innerCard}>
            <div style={{ fontSize: 9.5, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              전세가 (만/평)
            </div>
            <div style={{ fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.mono }}>
              {currentRentalAvg ? currentRentalAvg.toLocaleString() : '-'}
            </div>
          </div>

          <div style={innerCard}>
            <div style={{ fontSize: 9.5, color: t.neutrals.subtle, fontFamily: t.font.mono, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              전세 괴리율
            </div>
            <div style={{
              fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.mono,
              color: gapColor(lastJeonseGap),
            }}>
              {lastJeonseGap !== null ? `${lastJeonseGap > 0 ? '+' : ''}${lastJeonseGap.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>

        {/* 2-column grid: 매매 (left) / 전세 (right) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
          gap: 12,
        }}>
          {/* ── Left: 매매 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {/* 매매 실거래가 추이 */}
            <div style={innerCard}>
              <ChartHeader title="매매 실거래가 추이" momPct={tradeMom} />
              <PriceChart data={tradeChartData} complexes={reTrades?.complexes || []} />
              {reTrades && reTrades.complexes.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 4 }}>
                  {reTrades.complexes.map((c, i) => (
                    <span key={c.name} style={{ fontSize: 9, color: t.neutrals.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: COMPLEX_COLORS[i % COMPLEX_COLORS.length], display: 'inline-block' }} />
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 매매 괴리율 추이 */}
            <div style={innerCard}>
              <ChartHeader title="매매 괴리율 추이" />
              <GapChart data={reListingTrend?.trend || []} />
            </div>

            {/* 매도 호가 vs 실거래가 */}
            <div style={innerCard}>
              <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.muted, marginBottom: 4 }}>
                매도 호가 vs 실거래가
              </div>
              <ListingTable
                rows={tradePageRows}
                sortKey={tradeSortKey}
                sortDir={tradeSortDir}
                page={tradePage}
                pageCount={tradePageCount}
                onSort={handleTradeSort}
                onPageChange={setTradePage}
                tradeType="매매"
              />
            </div>
          </div>

          {/* ── Right: 전세 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {/* 전세 실거래가 추이 */}
            <div style={innerCard}>
              <ChartHeader title="전세 실거래가 추이" momPct={rentalMom} />
              <PriceChart data={rentalChartData} complexes={reRentals?.complexes || []} />
              {reRentals && reRentals.complexes.length > 1 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 4 }}>
                  {reRentals.complexes.map((c, i) => (
                    <span key={c.name} style={{ fontSize: 9, color: t.neutrals.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: COMPLEX_COLORS[i % COMPLEX_COLORS.length], display: 'inline-block' }} />
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 전세 괴리율 추이 */}
            <div style={innerCard}>
              <ChartHeader title="전세 괴리율 추이" />
              <GapChart data={reListingTrendJeonse?.trend || []} />
            </div>

            {/* 전세 호가 vs 실거래가 */}
            <div style={innerCard}>
              <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.muted, marginBottom: 4 }}>
                전세 호가 vs 실거래가
              </div>
              <ListingTable
                rows={jeonsePageRows}
                sortKey={jeonseSortKey}
                sortDir={jeonseSortDir}
                page={jeonsePage}
                pageCount={jeonsePageCount}
                onSort={handleJeonseSort}
                onPageChange={setJeonsePage}
                tradeType="전세"
              />
            </div>

            {/* 전세가율 추이 */}
            <div style={innerCard}>
              <ChartHeader title="전세가율 추이" />
              {reJeonseRatio.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={reJeonseRatio} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.neutrals.line} />
                    <XAxis
                      dataKey="month" tickFormatter={fmtMonth}
                      tick={{ fontSize: 9, fill: t.neutrals.subtle }}
                      axisLine={false} tickLine={false} interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 9, fill: t.neutrals.subtle }}
                      axisLine={false} tickLine={false} width={40}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(v) => String(v)}
                      formatter={(value) => [`${Number(value).toFixed(1)}%`, '전세가율']}
                    />
                    <ReferenceLine y={40} stroke={t.neutrals.subtle} strokeDasharray="3 3" label={{ value: '40%', position: 'right', fontSize: 9, fill: t.neutrals.subtle }} />
                    <ReferenceLine y={60} stroke={t.neutrals.subtle} strokeDasharray="3 3" label={{ value: '60%', position: 'right', fontSize: 9, fill: t.neutrals.subtle }} />
                    <Area
                      type="monotone" dataKey="ratio" name="전세가율"
                      stroke="#6366f1" fill="#6366f1" fillOpacity={0.1}
                      strokeWidth={1.5} connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ fontSize: 11, color: t.neutrals.subtle, padding: 12 }}>데이터 없음</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      {complexDropdownOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 19 }}
          onClick={() => setComplexDropdownOpen(false)}
        />
      )}
    </LCard>
  )
}
