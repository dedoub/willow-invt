import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { kstToday } from '@/lib/kst'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// A single reported transaction can make an incomplete current month look like
// a market-wide price move. Keep the volume bar, but wait for a minimally useful
// aggregate sample before drawing the current-month price point.
const MIN_AGGREGATE_CURRENT_MONTH_COUNT = 5

function subtractCalendarMonth(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 2, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

/**
 * 괴리율이 호가와 견줄 실거래 기준선 — **최근 "신고된" 거래**.
 *
 * 이 지표의 쓸모는 지금 호가가 최근 신고 실거래보다 얼마나 위/아래인지를 보고 가격이
 * 어디로 가는지 읽는 것이다(CEO). 그래서 기준선은 "언제 계약됐나"가 아니라 "언제 신고돼
 * 우리가 알게 됐나"로 잘라야 한다. 새 실거래가 신고되는 날 바로 기준선에 들어와야
 * 선행 지표가 된다.
 *
 * 계약일로 자르면 그게 안 된다. 국토부 신고는 계약 뒤에 오므로(추적 단지 실측 평균
 * 17~19일) "그날까지의 1개월"은 뒤쪽 3주가 비어 있고, 오늘에 가까울수록 더 빈다.
 * 2026-08-31 실측(전체 평형): 호가 짝 82개는 그대로인데 실거래가 붙는 짝이 37 → 15개,
 * 창 안 매매가 92 → 18건, 남은 15짝 중 13짝이 매매 1건짜리였다. 그 구간의 괴리율
 * 하락(-2.7% → -6.4%)은 시장이 아니라 사라진 표본이다.
 *
 * 신고일 창으로 바꾸면 짝 구성이 안정된다 — 실측 47 → 55개, 실거래 189 → 266건.
 * 평형 필터를 안 걸었을 때(전체 = 공급 20평 이상)가 밴드가 많아 왜곡이 가장 크게 나오므로
 * 그 경우를 기준으로 90일을 골랐다. 30·60일도 재봤지만 신고 건수 자체가 줄어든 구간
 * (2026-05 254건 → 08 72건)에서 짝당 2~3건까지 얇아진다.
 */
const GAP_FILING_WINDOW_DAYS = 90
/**
 * created_at 이 신고 시점이 아닌 행을 되살리는 데 쓰는 표준 지연.
 * 2026-03 초기 적재분 2,095건은 created_at 이 전부 그 달이라(계약은 2025-01부터, 평균
 * 지연 276일) 그대로 쓰면 그 시기 창에 과거 거래가 통째로 쏟아진다. 계약일 + 이 값과
 * 비교해 이른 쪽을 신고일로 본다 — 정상 수집분은 created_at 이, 백필분은 합성값이 이긴다.
 */
const GAP_BACKFILL_LAG_DAYS = 20

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** 이 거래가 '신고돼 보이게 된' 날. 위 GAP_BACKFILL_LAG_DAYS 주석 참조. */
function filingDate(row: { created_at?: string | null; deal_date: string }): string {
  const synth = shiftDays(row.deal_date, -GAP_BACKFILL_LAG_DAYS)
  const created = row.created_at ? String(row.created_at).slice(0, 10) : ''
  return created && created < synth ? created : synth
}

/** asOf(스냅샷일) 기준으로 괴리율이 쓸 신고일 구간 (start, end]. */
function gapFilingWindow(asOf: string): { start: string; end: string } {
  return { start: shiftDays(asOf, GAP_FILING_WINDOW_DAYS), end: asOf }
}

/**
 * 짝(단지×평형밴드)별 괴리율을 실거래 건수로 가중 평균한다.
 *
 * 단순 평균이면 매매 1건으로 만든 짝이 40건짜리 짝과 같은 표를 갖는다. 전체 평형에서는
 * 밴드가 많아 1건짜리 짝이 늘 절반 가까이라 이게 그대로 헤드라인을 흔든다 —
 * 전세 실측으로 단순평균과 건수가중이 최대 2.7%p 벌어졌다(2026-07-23: 2.2% vs 4.9%).
 */
function weightedGap(gaps: Array<{ gap: number; count: number }>): number | null {
  if (!gaps.length) return null
  let sum = 0, weight = 0
  for (const g of gaps) { sum += g.gap * g.count; weight += g.count }
  if (weight <= 0) return null
  return Math.round((sum / weight) * 10) / 10
}

function getFilteredActualAverage(
  values: number[] | undefined,
  listingMinPpp: number | null | undefined,
): { avg: number; count: number } | null {
  if (!values?.length) return null

  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const listingFloor = listingMinPpp ? listingMinPpp * 0.5 : 0
  const filtered = values.filter(value =>
    Math.abs(value - median) / median <= 0.5 && value >= listingFloor
  )
  if (filtered.length === 0) return null

  return {
    avg: filtered.reduce((sum, value) => sum + value, 0) / filtered.length,
    count: filtered.length,
  }
}

// Paginated fetch to bypass Supabase max_rows (default 1000)
// Always appends .order('id') for deterministic pagination — without a
// fully-deterministic ORDER BY, rows at page boundaries can be skipped or
// duplicated across requests because PostgreSQL doesn't guarantee order for
// ties (same snapshot_date, same deal_date, etc.).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(query: any, pageSize = 1000): Promise<any[]> {
  const q = query.order('id')
  const all: any[] = []
  let from = 0
  while (true) {
    const { data } = await q.range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// Extract supply-area pyeong from listing (area1 from Naver = 공급면적)
function getListingPyeong(l: { area_supply_sqm?: any; area_type?: any }): number {
  const supply = Number(l.area_supply_sqm)
  if (supply > 0) return supply / 3.3058
  const typeNum = parseFloat(l.area_type || '0')
  if (typeNum > 0) return typeNum / 3.3058
  return 0
}

// Mapping: exclusive area (전용면적 ㎡) → supply area (공급면적 ㎡) per complex
// Built from Naver listings which have both area1 (supply) and area2 (exclusive)
type AreaMapping = { exclusive: number; supply: number }[]
async function buildAreaMapping(supabase: any, complexNames: string[]): Promise<Record<string, AreaMapping>> {
  // Use latest snapshot only + pagination to avoid Supabase 1000-row default limit
  // (re_naver_listings has 190K+ rows across all snapshots)
  const { data: snap } = await supabase
    .from('re_naver_listings')
    .select('snapshot_date')
    .in('complex_name', complexNames)
    .order('snapshot_date', { ascending: false })
    .limit(1)
  const snapDate = snap?.[0]?.snapshot_date
  if (!snapDate) return {}

  const data = await fetchAll(
    supabase
      .from('re_naver_listings')
      .select('complex_name, area_exclusive_sqm, area_supply_sqm')
      .in('complex_name', complexNames)
      .eq('snapshot_date', snapDate)
      .gt('area_exclusive_sqm', '0')
      .gt('area_supply_sqm', '0')
  )
  if (!data || data.length === 0) return {}
  const map: Record<string, Map<number, number>> = {}
  for (const row of data) {
    const excl = Number(row.area_exclusive_sqm)
    const supp = Number(row.area_supply_sqm)
    if (excl <= 0 || supp <= 0) continue
    if (!map[row.complex_name]) map[row.complex_name] = new Map()
    map[row.complex_name].set(excl, supp)
  }
  const result: Record<string, AreaMapping> = {}
  for (const [name, m] of Object.entries(map)) {
    result[name] = [...m.entries()].map(([exclusive, supply]) => ({ exclusive, supply })).sort((a, b) => a.exclusive - b.exclusive)
  }
  return result
}

// Convert trade/rental exclusive area (㎡) to supply pyeong using area mapping
function getSupplyPyeong(areaMapping: Record<string, AreaMapping>, complexName: string, exclusiveSqm: number): number {
  const mapping = areaMapping[complexName]
  if (!mapping || mapping.length === 0) {
    // fallback: assume ~75% exclusive/supply ratio
    return (exclusiveSqm / 0.75) / 3.3058
  }
  // Find closest exclusive area match
  let closest = mapping[0]
  let minDiff = Math.abs(exclusiveSqm - closest.exclusive)
  for (const entry of mapping) {
    const diff = Math.abs(exclusiveSqm - entry.exclusive)
    if (diff < minDiff) { closest = entry; minDiff = diff }
  }
  return closest.supply / 3.3058
}

// GET - Real estate data queries
export async function GET(request: Request) {
  // 부동산 리서치 자료는 공개 대상이 아니다. 로그인한 대시보드나 CRON_SECRET 를 든
  // 스케줄러만 읽는다 (알림 스크립트가 화면과 같은 숫자를 쓰려고 이 API를 부른다).
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'summary'
  const districts = searchParams.get('districts')?.split(',') || []
  const complexIds = searchParams.get('complexIds')?.split(',').filter(Boolean) || []
  const areaRange = searchParams.get('areaRange') || ''
  const period = searchParams.get('period') || '12'

  const supabase = getServiceSupabase()

  const now = new Date()
  const periodNum = period === 'all' ? 0 : parseInt(period)
  // period=12 → show last 12 months including current: if today is 2026-03, show 2025-04 ~ 2026-03
  const cutoffDateObj = new Date(now.getFullYear(), now.getMonth() - periodNum + 1, 1)
  const cutoffDate = period === 'all'
    ? '2020-01-01'
    : `${cutoffDateObj.getFullYear()}-${String(cutoffDateObj.getMonth() + 1).padStart(2, '0')}-01`

  // Generate explicit month list for consistent chart x-axis (local timezone safe)
  function generateMonths(): string[] {
    if (period === 'all') return [] // derive from data
    const months: string[] = []
    for (let i = periodNum - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      months.push(`${y}-${m}`)
    }
    return months
  }
  const expectedMonths = generateMonths()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const currentDate = `${currentMonth}-${String(now.getDate()).padStart(2, '0')}`

  // Resolve tracked complex names: always filter by tracked complexes only
  // If user selected specific complexes → use those (subset of tracked)
  // Otherwise → use all tracked complexes (filtered by district if applicable)
  let trackedQuery = supabase.from('re_complexes').select('name, district_name').eq('is_tracked', true)
  if (districts.length > 0) trackedQuery = trackedQuery.in('district_name', districts)
  const { data: trackedData } = await trackedQuery
  const allTrackedNames = trackedData?.map(c => c.name) || []

  let complexNames: string[]
  if (complexIds.length > 0) {
    let cQuery = supabase.from('re_complexes').select('name').in('id', complexIds)
    if (districts.length > 0) cQuery = cQuery.in('district_name', districts)
    const { data } = await cQuery
    complexNames = data?.map(c => c.name) || []
  } else {
    complexNames = allTrackedNames
  }

  // Build exclusive→supply area mapping from Naver listings (for supply-based PPP)
  // Lazy + memoized: only branches that need it trigger the (expensive) scan,
  // and it runs at most once per request even if referenced multiple times.
  let areaMappingCache: Record<string, AreaMapping> | null = null
  const getAreaMapping = async (): Promise<Record<string, AreaMapping>> => {
    if (areaMappingCache === null) {
      areaMappingCache = await buildAreaMapping(supabase, complexNames)
    }
    return areaMappingCache
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any, table: 'trades' | 'rentals') => {
    // Area filtering is done in code using supply pyeong (not DB area_pyeong which is exclusive-based)
    query = query.in('complex_name', complexNames)
    if (table === 'trades') query = query.eq('cancel_yn', 'N')
    return query
  }

  // Supply pyeong area filter — consistent across all endpoints
  function matchesSupplyArea(supplyPy: number): boolean {
    if (!areaRange) return supplyPy >= 20
    if (areaRange === '20') return supplyPy >= 20 && supplyPy < 30
    if (areaRange === '30') return supplyPy >= 30 && supplyPy < 40
    if (areaRange === '40') return supplyPy >= 40 && supplyPy < 50
    if (areaRange === '50') return supplyPy >= 50 && supplyPy < 60
    if (areaRange === '60+') return supplyPy >= 60
    return true
  }

  try {
    if (type === 'complexes') {
      let query = supabase
        .from('re_complexes')
        .select('id, name, district_name, dong_name, total_units, build_year, is_tracked')
        .eq('is_tracked', true)
        .order('district_name').order('name')
      if (districts.length > 0) query = query.in('district_name', districts)
      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ complexes: data || [] })
    }

    if (type === 'summary') {
      const complexCount = allTrackedNames.length
      const districtSet = new Set(trackedData?.map(c => c.district_name))

      const oneMonthAgo = subtractCalendarMonth(currentDate)
      // 평균 평당가는 지금까지처럼 '최근 1개월', 괴리율은 신고일 90일 창을 쓴다.
      // 한 번에 넓게 받아 두고 아래에서 각자 자기 구간만 센다.
      const gapWin = gapFilingWindow(currentDate)
      // 신고일 ≈ 계약일 + 지연이라, 창 시작보다 더 이전 계약까지 받아야 창이 안 빈다.
      const tradeFetchFrom = shiftDays(gapWin.start, GAP_BACKFILL_LAG_DAYS + 30)

      // Fetch trades & rentals (no DB area filter — filter by supply pyeong in code).
      // These are independent of each other and of the area mapping → run in parallel.
      const [areaMapping, recentTrades, recentRentals, { data: latestTrade }] = await Promise.all([
        getAreaMapping(),
        fetchAll(
          supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date, created_at')
            .gte('deal_date', tradeFetchFrom < oneMonthAgo ? tradeFetchFrom : oneMonthAgo)
            .eq('cancel_yn', 'N').in('complex_name', complexNames)
        ),
        fetchAll(
          supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date, created_at')
            .gte('deal_date', tradeFetchFrom < oneMonthAgo ? tradeFetchFrom : oneMonthAgo)
            .eq('rent_type', '전세').in('complex_name', complexNames)
        ),
        supabase
          .from('re_trades').select('deal_date').in('complex_name', complexNames).eq('cancel_yn', 'N')
          .order('deal_date', { ascending: false }).limit(1),
      ])

      // Use shared matchesSupplyArea for consistent filtering
      function getBandS(supplyPy: number): number {
        if (supplyPy < 30) return 20
        if (supplyPy < 40) return 30
        if (supplyPy < 50) return 40
        if (supplyPy < 60) return 50
        return 60
      }

      // Average PPP (supply-area based, filtered) — 지금까지와 같은 '최근 1개월' 기준.
      let tradePppSum = 0, tradePppCount = 0
      for (const t of recentTrades || []) {
        if (t.deal_date < oneMonthAgo) continue
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        tradePppSum += Number(t.deal_amount) / supplyPy
        tradePppCount++
      }
      let jeonsePppSum = 0, jeonsePppCount = 0
      for (const r of recentRentals || []) {
        if (r.deal_date < oneMonthAgo) continue
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, r.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        jeonsePppSum += Number(r.deposit) / supplyPy
        jeonsePppCount++
      }

      // Listing gaps — from daily summary table (consistent with listing-trend chart)
      // trade_type별로 최신 snapshot_date를 따로 조회해야 차트와 일치
      const bandFilter = areaRange === '20' ? 20 : areaRange === '30' ? 30 : areaRange === '40' ? 40 : areaRange === '50' ? 50 : areaRange === '60+' ? 60 : null
      const [{ data: tradeLatestSnap }, { data: jeonseLatestSnap }] = await Promise.all([
        supabase.from('re_listing_daily_summary').select('snapshot_date')
          .eq('trade_type', '매매').in('complex_name', complexNames)
          .order('snapshot_date', { ascending: false }).limit(1),
        supabase.from('re_listing_daily_summary').select('snapshot_date')
          .eq('trade_type', '전세').in('complex_name', complexNames)
          .order('snapshot_date', { ascending: false }).limit(1),
      ])
      const tradeSnapshotDate = tradeLatestSnap?.[0]?.snapshot_date
      const jeonseSnapshotDate = jeonseLatestSnap?.[0]?.snapshot_date
      const summarySnapshotDate = tradeSnapshotDate || jeonseSnapshotDate

      type BandKey = string
      const listingBands: Record<BandKey, { trade: number | null; jeonse: number | null }> = {}

      // 매매/전세 각각 자기 최신 snapshot으로 조회
      const fetchListings = async (tradeType: string, snapDate: string | undefined) => {
        if (!snapDate) return []
        let q = supabase
          .from('re_listing_daily_summary')
          .select('complex_name, trade_type, area_band, min_ppp')
          .eq('snapshot_date', snapDate)
          .eq('trade_type', tradeType)
          .in('complex_name', complexNames)
        if (bandFilter) q = q.eq('area_band', bandFilter)
        else q = q.gte('area_band', 20)
        const { data } = await q
        return data || []
      }
      const [tradeLsData, jeonseLsData] = await Promise.all([
        fetchListings('매매', tradeSnapshotDate),
        fetchListings('전세', jeonseSnapshotDate),
      ])
      for (const row of [...tradeLsData, ...jeonseLsData]) {
        const key = `${row.complex_name}|${row.area_band}`
        if (!listingBands[key]) listingBands[key] = { trade: null, jeonse: null }
        if (row.trade_type === '매매') listingBands[key].trade = row.min_ppp
        else if (row.trade_type === '전세') listingBands[key].jeonse = row.min_ppp
      }

      // Actuals grouped by complex+band — 최근 90일 안에 '신고된' 거래만 센다.
      const tradeActuals: Record<BandKey, number[]> = {}
      for (const t of recentTrades || []) {
        const filed = filingDate(t)
        if (filed <= gapWin.start || filed > gapWin.end) continue
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        const key = `${t.complex_name}|${getBandS(supplyPy)}`
        if (!tradeActuals[key]) tradeActuals[key] = []
        tradeActuals[key].push(Number(t.deal_amount) / supplyPy)
      }
      const jeonseActuals: Record<BandKey, number[]> = {}
      for (const r of recentRentals || []) {
        const filed = filingDate(r)
        if (filed <= gapWin.start || filed > gapWin.end) continue
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, r.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        const key = `${r.complex_name}|${getBandS(supplyPy)}`
        if (!jeonseActuals[key]) jeonseActuals[key] = []
        jeonseActuals[key].push(Number(r.deposit) / supplyPy)
      }

      // Gap per complex+band → 실거래 건수로 가중 평균 (weightedGap 주석 참조)
      const tradeGaps: Array<{ gap: number; count: number }> = []
      const jeonseGaps: Array<{ gap: number; count: number }> = []
      for (const [key, li] of Object.entries(listingBands)) {
        if (li.trade !== null) {
          const actual = getFilteredActualAverage(tradeActuals[key], li.trade)
          if (actual) tradeGaps.push({ gap: ((li.trade - actual.avg) / actual.avg) * 100, count: actual.count })
        }
        if (li.jeonse !== null) {
          const actual = getFilteredActualAverage(jeonseActuals[key], li.jeonse)
          if (actual) jeonseGaps.push({ gap: ((li.jeonse - actual.avg) / actual.avg) * 100, count: actual.count })
        }
      }

      // Latest data dates (listing date already fetched from daily summary above;
      // latestTrade fetched in parallel with trades/rentals above)
      return NextResponse.json({
        summary: {
          trackedComplexes: complexCount,
          districtCount: districtSet.size,
          avgTradePpp: tradePppCount > 0 ? Math.round(tradePppSum / tradePppCount) : 0,
          avgJeonsePpp: jeonsePppCount > 0 ? Math.round(jeonsePppSum / jeonsePppCount) : 0,
          tradeListingGap: weightedGap(tradeGaps) ?? 0,
          jeonseListingGap: weightedGap(jeonseGaps) ?? 0,
          // 괴리율이 실제로 무엇과 견줬는지 — 신고일 창과 짝·건수. 화면 툴팁이 이걸 적는다.
          gapWindow: { start: gapWin.start, end: gapWin.end, basis: 'filed' },
          tradeGapPairs: tradeGaps.length,
          tradeGapDeals: tradeGaps.reduce((s, g) => s + g.count, 0),
          jeonseGapPairs: jeonseGaps.length,
          jeonseGapDeals: jeonseGaps.reduce((s, g) => s + g.count, 0),
          lastListingDate: summarySnapshotDate || null,
          lastTradeDate: latestTrade?.[0]?.deal_date || null,
        }
      })
    }

    if (type === 'trades') {
      const areaMapping = await getAreaMapping()
      const data = await fetchAll(applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_sqm').gte('deal_date', cutoffDate).order('deal_date'),
        'trades'
      ))

      // Aggregate by month (supply-area based PPP)
      const useAggregate = complexIds.length === 0
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}
      const complexTotals: Record<string, number> = {}

      for (const t of data || []) {
        const month = t.deal_date.slice(0, 7)
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        const ppp = Number(t.deal_amount) / supplyPy
        if (ppp <= 0) continue

        if (useAggregate) {
          const key = '전체'
          if (!monthly[month]) monthly[month] = {}
          if (!monthly[month][key]) monthly[month][key] = { sum: 0, count: 0 }
          monthly[month][key].sum += ppp
          monthly[month][key].count += 1
        } else {
          if (!monthly[month]) monthly[month] = {}
          if (!monthly[month][t.complex_name]) monthly[month][t.complex_name] = { sum: 0, count: 0 }
          monthly[month][t.complex_name].sum += ppp
          monthly[month][t.complex_name].count += 1
        }
        complexTotals[t.complex_name] = (complexTotals[t.complex_name] || 0) + 1
      }

      const months = expectedMonths.length > 0 ? expectedMonths : Object.keys(monthly).sort()
      const keys: string[] = useAggregate
        ? ['전체']
        : ([...new Set((data || []).map((t: any) => t.complex_name))] as string[]).sort()
      const complexData = keys.map(name => ({
        name,
        data: months.map(m => {
          const bucket = monthly[m]?.[name]
          const count = bucket?.count || 0
          const isSparseCurrentAggregate = useAggregate
            && m === currentMonth
            && count > 0
            && count < MIN_AGGREGATE_CURRENT_MONTH_COUNT

          return {
            month: m,
            avgPpp: bucket && !isSparseCurrentAggregate
              ? Math.round(bucket.sum / bucket.count)
              : null,
            count,
          }
        })
      }))

      return NextResponse.json({ months, complexes: complexData })
    }

    if (type === 'rentals') {
      const areaMapping = await getAreaMapping()
      const data = await fetchAll(applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_sqm').gte('deal_date', cutoffDate).eq('rent_type', '전세').order('deal_date'),
        'rentals'
      ))

      const useAggregate = complexIds.length === 0
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}

      for (const r of data || []) {
        const month = r.deal_date.slice(0, 7)
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, r.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
        const ppp = Number(r.deposit) / supplyPy
        if (ppp <= 0) continue
        const key = useAggregate ? '전체' : r.complex_name
        if (!monthly[month]) monthly[month] = {}
        if (!monthly[month][key]) monthly[month][key] = { sum: 0, count: 0 }
        monthly[month][key].sum += ppp
        monthly[month][key].count += 1
      }

      const months = expectedMonths.length > 0 ? expectedMonths : Object.keys(monthly).sort()
      const keys: string[] = useAggregate ? ['전체'] : ([...new Set((data || []).map((r: any) => r.complex_name))] as string[]).sort()
      const complexData = keys.map(name => ({
        name,
        data: months.map(m => {
          const bucket = monthly[m]?.[name]
          const count = bucket?.count || 0
          const isSparseCurrentAggregate = useAggregate
            && m === currentMonth
            && count > 0
            && count < MIN_AGGREGATE_CURRENT_MONTH_COUNT

          return {
            month: m,
            avgPpp: bucket && !isSparseCurrentAggregate
              ? Math.round(bucket.sum / bucket.count)
              : null,
            count,
          }
        })
      }))

      return NextResponse.json({ months, complexes: complexData })
    }

    if (type === 'listings') {
      const tradeType = searchParams.get('tradeType') || '매매'
      const areaMapping = await getAreaMapping()

      // Find the latest snapshot date, then fetch latest 2 days to cover complexes scraped on different dates
      const { data: latestSnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const latestSnapshotDate = latestSnap?.[0]?.snapshot_date
      const snapCutoff = latestSnapshotDate
        ? new Date(new Date(latestSnapshotDate).getTime() - 2 * 86400000).toISOString().slice(0, 10)
        : null
      const allListings = snapCutoff ? await fetchAll(
        supabase.from('re_naver_listings')
          .select('*').eq('trade_type', tradeType)
          .gte('snapshot_date', snapCutoff)
          .in('complex_name', complexNames)
      ) : []
      // Keep only each complex's latest snapshot
      const complexLatest: Record<string, string> = {}
      for (const l of allListings) {
        if (!complexLatest[l.complex_name] || l.snapshot_date > complexLatest[l.complex_name]) {
          complexLatest[l.complex_name] = l.snapshot_date
        }
      }
      const listings = allListings.filter(l => l.snapshot_date === complexLatest[l.complex_name])

      // Group listings by complex + 평형대 (20평대, 30평대, 40평대, 50평대, 60평대+)
      function getBand(supplyPy: number): number {
        if (supplyPy < 30) return 20
        if (supplyPy < 40) return 30
        if (supplyPy < 50) return 40
        if (supplyPy < 60) return 50
        return 60
      }
      type RowKey = string
      const rowMap: Record<RowKey, {
        complexName: string; complexNo: string | null; areaBand: number
        listingMinPpp: number | null; listingMaxPpp: number | null; listingCount: number
        actualAvgPpp: number | null; actualCount: number; gap: number | null
      }> = {}
      const listingPpps: Record<RowKey, number[]> = {}

      for (const l of listings || []) {
        const supply = Number(l.area_supply_sqm)
        if (supply <= 0) continue
        const py = supply / 3.3058
        if (py < 20) continue // skip very small units
        // Apply area filter
        if (areaRange === '20' && (py < 20 || py >= 30)) continue
        if (areaRange === '30' && (py < 30 || py >= 40)) continue
        if (areaRange === '40' && (py < 40 || py >= 50)) continue
        if (areaRange === '50' && (py < 50 || py >= 60)) continue
        if (areaRange === '60+' && py < 60) continue

        const ppp = Number(l.price) / py
        if (ppp <= 0) continue
        const band = getBand(py)
        const key = `${l.complex_name}|${band}`
        if (!rowMap[key]) rowMap[key] = { complexName: l.complex_name, complexNo: l.complex_no || null, areaBand: band, listingMinPpp: null, listingMaxPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
        if (!listingPpps[key]) listingPpps[key] = []
        listingPpps[key].push(ppp)
        const r = rowMap[key]
        r.listingCount += 1
        if (!r.listingMaxPpp || ppp > r.listingMaxPpp) r.listingMaxPpp = Math.round(ppp)
      }

      // listingMinPpp = P10 (10th percentile) to avoid single-listing outlier skew
      for (const [key, ppps] of Object.entries(listingPpps)) {
        const sorted = [...ppps].sort((a, b) => a - b)
        const p10Idx = Math.floor(sorted.length * 0.1)
        rowMap[key].listingMinPpp = Math.round(sorted[p10Idx])
      }

      // Fetch actual prices (1-month window) and match to 평형대
      const oneMonthAgo = subtractCalendarMonth(currentDate)
      const allActuals = await fetchAll(
        tradeType === '매매'
          ? supabase.from('re_trades').select('complex_name, deal_amount, area_sqm').gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
          : supabase.from('re_rentals').select('complex_name, deposit, area_sqm').gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames)
      )

      // Collect all actual trade PPPs per key first
      type GapRowKey = string
      const actualPpps: Record<GapRowKey, number[]> = {}
      for (const a of allActuals || []) {
        const sqm = Number(a.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, a.complex_name, sqm)
        if (supplyPy < 20) continue
        const band = getBand(supplyPy)
        const key = `${a.complex_name}|${band}`
        if (!rowMap[key]) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / supplyPy
        if (!actualPpps[key]) actualPpps[key] = []
        actualPpps[key].push(ppp)
      }

      // Filter outliers and compute average
      // 1) Median-based: exclude >50% deviation from median
      // 2) Listing cross-check: exclude trades below 40% of listing min PPP
      for (const [key, ppps] of Object.entries(actualPpps)) {
        const r = rowMap[key]
        const actual = getFilteredActualAverage(ppps, r.listingMinPpp)
        if (!actual) continue
        r.actualAvgPpp = actual.avg
        r.actualCount = actual.count
      }

      // Calculate gaps
      for (const r of Object.values(rowMap)) {
        if (r.listingMinPpp && r.actualAvgPpp && r.actualAvgPpp > 0) {
          r.gap = Math.round(((r.listingMinPpp - r.actualAvgPpp) / r.actualAvgPpp) * 1000) / 10
        }
        if (r.actualAvgPpp) r.actualAvgPpp = Math.round(r.actualAvgPpp)
      }

      const rows = Object.values(rowMap)
        .filter(r => r.listingCount > 0)
        .sort((a, b) => a.complexName.localeCompare(b.complexName, 'ko') || a.areaBand - b.areaBand)

      // 기준일과 며칠 밀렸는지를 같이 실어 보낸다. 화면이 "언제 자료인지"를 말할 수 있어야
      // 수집이 멈춘 걸 눈으로 알아챈다 (2026-08-21~27 호가 수집 중단 때 못 알아챘다).
      const snapshotStaleDays = latestSnapshotDate
        ? Math.max(0, Math.round(
            (Date.parse(`${kstToday()}T00:00:00+09:00`) - Date.parse(`${latestSnapshotDate}T00:00:00+09:00`)) / 86400000))
        : 0
      return NextResponse.json({
        listings: rows, tradeType,
        snapshotDate: latestSnapshotDate ?? null,
        snapshotStaleDays,
      })
    }

    if (type === 'listing-trend') {
      const tradeType = searchParams.get('tradeType') || '매매'
      const bandFilter = areaRange === '20' ? 20 : areaRange === '30' ? 30 : areaRange === '40' ? 40 : areaRange === '50' ? 50 : areaRange === '60+' ? 60 : null

      // 1. Daily summary (listing min_ppp per complex+band per date)
      let query = supabase
        .from('re_listing_daily_summary')
        .select('snapshot_date, complex_name, area_band, min_ppp')
        .eq('trade_type', tradeType)
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: true })

      if (bandFilter) {
        query = query.eq('area_band', bandFilter)
      } else {
        query = query.gte('area_band', 20)
      }

      const data = await fetchAll(query)

      // 2. Actual trade/rental data — fetch wide range so each date can use its own 1-month window
      const areaMapping = await getAreaMapping()

      function getBandT(py: number): number { return py < 30 ? 20 : py < 40 ? 30 : py < 50 ? 40 : py < 60 ? 50 : 60 }
      // Use shared matchesSupplyArea

      // Collect all snapshot dates first
      const dateSet = new Set<string>()
      const dateListings: Record<string, Record<string, number>> = {} // date → "complex|band" → min_ppp
      for (const row of data || []) {
        const d = row.snapshot_date
        dateSet.add(d)
        if (!dateListings[d]) dateListings[d] = {}
        const key = `${row.complex_name}|${row.area_band}`
        const prev = dateListings[d][key]
        if (prev === undefined || row.min_ppp < prev) {
          dateListings[d][key] = row.min_ppp
        }
      }

      const dates = [...dateSet].sort()
      // Fetch trades far enough back to cover every date's gap window
      const earliestDate = dates[0] || now.toISOString().slice(0, 10)
      const tradeCutoff = shiftDays(gapFilingWindow(earliestDate).start, GAP_BACKFILL_LAG_DAYS + 30)

      // Pre-load all trades/rentals with deal_date for per-date windowing
      type TradeRow = { complex_name: string; deal_amount?: number; deposit?: number; area_sqm: number; deal_date: string; created_at?: string | null }
      const allActuals: TradeRow[] = []
      if (tradeType === '매매') {
        const actuals = await fetchAll(
          supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date, created_at')
            .gte('deal_date', tradeCutoff).eq('cancel_yn', 'N').in('complex_name', complexNames)
        )
        allActuals.push(...actuals)
      } else {
        const actuals = await fetchAll(
          supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date, created_at')
            .gte('deal_date', tradeCutoff).eq('rent_type', '전세').in('complex_name', complexNames)
        )
        allActuals.push(...actuals)
      }

      // Pre-compute band key + ppp for each trade row
      const tradeEntries = allActuals.map(t => {
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) return null
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) return null
        const key = `${t.complex_name}|${getBandT(supplyPy)}`
        const ppp = tradeType === '매매'
          ? Number(t.deal_amount) / supplyPy
          : Number(t.deposit) / supplyPy
        return { key, ppp, filed: filingDate(t) }
      }).filter((e): e is { key: string; ppp: number; filed: string } => e !== null)

      // 3. Compute daily gap rate — 날짜마다 '그날까지 최근 90일 안에 신고된' 실거래를
      //    기준선으로 쓴다. (창 정의와 근거는 GAP_FILING_WINDOW_DAYS 위 주석)
      const trend: { date: string; gapRate: number | null; pairs: number; deals: number }[] = dates.map(d => {
        const win = gapFilingWindow(d)

        // Build actualBands for this date's window
        const dateBands: Record<string, number[]> = {}
        for (const e of tradeEntries) {
          if (e.filed > win.start && e.filed <= win.end) {
            if (!dateBands[e.key]) dateBands[e.key] = []
            dateBands[e.key].push(e.ppp)
          }
        }

        const gaps: Array<{ gap: number; count: number }> = []
        for (const [key, minPpp] of Object.entries(dateListings[d] || {})) {
          const actual = getFilteredActualAverage(dateBands[key], minPpp)
          if (actual) gaps.push({ gap: ((minPpp - actual.avg) / actual.avg) * 100, count: actual.count })
        }
        return {
          date: d,
          gapRate: weightedGap(gaps),
          // 짝·건수를 같이 내려보낸다. 호가 수집이 부분 실패한 날(2026-08-02 호가 짝 38개,
          // 08-09 48개 — 평소 82개)은 값이 튀는데, 선만 보면 그날도 정상처럼 생겼다.
          pairs: gaps.length,
          deals: gaps.reduce((s, g) => s + g.count, 0),
        }
      })

      // 4. 호가 추이 — 날짜별 최저 호가 평당가(평형 밴드 평균). '호가 추이' 차트용.
      //    실거래가 추이(trades)와 같은 규칙: 단지 선택이 없으면 '전체' 한 선으로 합치고,
      //    특정 단지를 골랐을 때만 단지별 라인. dateListings(밴드별 최저가 dedup)를 접는다.
      const listingAggregate = complexIds.length === 0
      const presentComplexes = listingAggregate
        ? ['전체']
        : complexNames.filter(n => (data || []).some(r => r.complex_name === n))
      const complexTrend = dates.map(d => {
        const row: Record<string, string | number | null> = { date: d }
        if (listingAggregate) {
          const vals = Object.values(dateListings[d] || {})
          row['전체'] = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
          return row
        }
        const perComplex: Record<string, { sum: number; cnt: number }> = {}
        for (const [key, minPpp] of Object.entries(dateListings[d] || {})) {
          const name = key.split('|')[0]
          const cur = perComplex[name] ?? { sum: 0, cnt: 0 }
          cur.sum += minPpp
          cur.cnt++
          perComplex[name] = cur
        }
        for (const name of presentComplexes) {
          const v = perComplex[name]
          row[name] = v ? Math.round(v.sum / v.cnt) : null
        }
        return row
      })

      return NextResponse.json({ trend, complexTrend, complexes: presentComplexes, tradeType })
    }

    if (type === 'jeonse-ratio') {
      // 전세가율 = 전세보증금 / 매매가. 나누는 두 값이 **같은 집**을 가리켜야 뜻이 선다.
      //
      // 예전엔 단지별로 그 달의 매매 총액 중앙값과 전세 총액 중앙값을 그냥 나눴다. 평형을
      // 안 맞췄으므로 그 달에 어떤 평형이 팔렸는지가 곧 전세가율이었다. 2026-08 실측:
      // 추적 단지 매매 16건 평균 24.9평 / 7월 94건 평균 29.1평 — 작은 집만 팔린 달이라
      // 매매 중앙값이 내려가고 전세가율이 33.1% → 36.8% 로 올랐다. 같은 기간 전세·매매
      // 호가(평당·평형대별)는 둘 다 소폭 하락이라 방향이 정반대였다. 2025-11 은 이 방식이
      // 46.8%, 평당 기준으로는 36.5% 로 10%p 가 순전히 표본 구성이었다.
      //
      // 그래서 (단지 × 평형밴드) 안에서 **평당가끼리** 비교한다. 밴드는 화면 필터와 같은
      // 10평 단위다. 정확히 같은 평형만 짝지으면 8월 짝이 10개까지 줄어 달마다 표본이
      // 튀므로, 평당으로 정규화한 뒤 밴드로 묶는 선에서 멈춘다.
      //
      // 짝의 가중치는 min(매매건수, 전세건수) — 얇은 쪽이 그 짝의 신뢰도를 정한다.
      // 단순 평균이면 매매 1건짜리 짝이 40건짜리 짝과 같은 표를 갖는다.
      const areaMapping = await getAreaMapping()
      const trades = await fetchAll(applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_sqm').gte('deal_date', cutoffDate),
        'trades'
      ))

      const rentals = await fetchAll(applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_sqm').gte('deal_date', cutoffDate).eq('rent_type', '전세'),
        'rentals'
      ))

      // 화면 필터와 같은 10평 밴드. 60평 이상은 한 칸(표본이 얇아 더 쪼개면 짝이 안 생긴다).
      const bandOf = (py: number): number => (py < 30 ? 20 : py < 40 ? 30 : py < 50 ? 40 : py < 60 ? 50 : 60)
      // month → "단지|밴드" → 평당가 목록
      type Buckets = Record<string, Record<string, number[]>>
      const bucket = (rows: Array<Record<string, unknown>>, dateKey: string, amountKey: string): Buckets => {
        const out: Buckets = {}
        for (const row of rows || []) {
          const sqm = Number(row.area_sqm)
          if (!(sqm > 0)) continue
          const name = String(row.complex_name)
          const supplyPy = getSupplyPyeong(areaMapping, name, sqm)
          if (supplyPy <= 0 || !matchesSupplyArea(supplyPy)) continue
          const amount = Number(row[amountKey])
          if (!(amount > 0)) continue
          const month = String(row[dateKey]).slice(0, 7)
          const key = `${name}|${bandOf(supplyPy)}`
          if (!out[month]) out[month] = {}
          if (!out[month][key]) out[month][key] = []
          out[month][key].push(amount / supplyPy)
        }
        return out
      }

      const tradeMonthly = bucket(trades as Array<Record<string, unknown>>, 'deal_date', 'deal_amount')
      const rentalMonthly = bucket(rentals as Array<Record<string, unknown>>, 'deal_date', 'deposit')

      const median = (arr: number[]) => {
        const sorted = [...arr].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      }

      const allMonths = [...new Set([...Object.keys(tradeMonthly), ...Object.keys(rentalMonthly)])].sort()

      const monthlyRatios: Record<string, number | null> = {}
      const monthlySamples: Record<string, { trades: number; jeonse: number; pairs: number }> = {}
      for (const month of allMonths) {
        const tData = tradeMonthly[month] || {}
        const rData = rentalMonthly[month] || {}
        let weighted = 0
        let weight = 0
        let pairs = 0
        for (const key of Object.keys(tData)) {
          const tp = tData[key]
          const rp = rData[key]
          if (!rp?.length || !tp.length) continue
          const medTrade = median(tp)
          if (!(medTrade > 0)) continue
          const w = Math.min(tp.length, rp.length)
          weighted += (median(rp) / medTrade) * 100 * w
          weight += w
          pairs += 1
        }
        monthlyRatios[month] = weight > 0 ? Math.round((weighted / weight) * 10) / 10 : null
        monthlySamples[month] = {
          trades: Object.values(tData).reduce((s, v) => s + v.length, 0),
          jeonse: Object.values(rData).reduce((s, v) => s + v.length, 0),
          pairs,
        }
      }

      // 국토부 실거래는 계약 후 신고까지 걸린다 — 추적 단지 실측 평균 17~19일(2026-08 기준).
      // 그래서 이번 달과 지난달은 아직 채워지는 중이고, 다 찬 달과 나란히 놓으면 표본이
      // 6분의 1인 점이 추세처럼 읽힌다. 화면이 점선으로 구분할 수 있게 표시만 내려보낸다.
      const nowKst = new Date(Date.now() + 9 * 3600_000)
      const curMonth = nowKst.toISOString().slice(0, 7)
      const prevMonth = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)

      const trendMonths = expectedMonths.length > 0 ? expectedMonths : allMonths
      const trend = trendMonths.map(m => ({
        month: m,
        ratio: monthlyRatios[m] ?? null,
        trades: monthlySamples[m]?.trades ?? 0,
        jeonse: monthlySamples[m]?.jeonse ?? 0,
        pairs: monthlySamples[m]?.pairs ?? 0,
        provisional: m === curMonth || m === prevMonth,
      }))

      return NextResponse.json({ trend })
    }

    if (type === 'market-cap') {
      // 시가총액: 평형별 세대수 × 공급면적(평) × 평당가 (re_complex_pyeongs 기반).
      // 면적이 상수라 단지 하나의 곡선은 평당가 추이와 같다 — 이 차트의 의미는
      // 대형 단지·대형 평형에 가중치가 실린 "합산" 가치 흐름.
      // 평형 필터(areaRange)는 다른 차트처럼 밴드 단위로 그대로 적용된다.
      const bandFilter = areaRange === '20' ? 20 : areaRange === '30' ? 30 : areaRange === '40' ? 40 : areaRange === '50' ? 50 : areaRange === '60+' ? 60 : null
      function getBandM(py: number): number { return py < 30 ? 20 : py < 40 ? 30 : py < 50 ? 40 : py < 60 ? 50 : 60 }

      const { data: pyeongRows } = await supabase
        .from('re_complex_pyeongs')
        .select('complex_name, supply_sqm, household_count')
        .in('complex_name', complexNames)
        .gt('household_count', 0)

      // 밴드별 총 공급면적(평): "complex|band" → 평
      const bandPy: Record<string, number> = {}
      for (const p of pyeongRows || []) {
        const supply = Number(p.supply_sqm)
        if (!(supply > 0)) continue
        const py = supply / 3.3058
        if (py < 20) continue
        const band = getBandM(py)
        if (bandFilter && band !== bandFilter) continue
        const key = `${p.complex_name}|${band}`
        bandPy[key] = (bandPy[key] || 0) + py * Number(p.household_count)
      }
      const capKeys = Object.keys(bandPy)
      if (capKeys.length === 0) return NextResponse.json({ trend: [], complexCount: 0, unit: '조원' })

      // 일별 최저호가 평당가 (complex|band 단위)
      let summaryQuery = supabase
        .from('re_listing_daily_summary')
        .select('snapshot_date, complex_name, area_band, min_ppp')
        .eq('trade_type', '매매')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: true })
      if (bandFilter) summaryQuery = summaryQuery.eq('area_band', bandFilter)
      else summaryQuery = summaryQuery.gte('area_band', 20)
      const summaryData = await fetchAll(summaryQuery)

      const dateSet = new Set<string>()
      const bandMin: Record<string, Record<string, number>> = {} // date → "complex|band" → min_ppp
      for (const row of summaryData || []) {
        dateSet.add(row.snapshot_date)
        if (!bandMin[row.snapshot_date]) bandMin[row.snapshot_date] = {}
        const key = `${row.complex_name}|${row.area_band}`
        const prev = bandMin[row.snapshot_date][key]
        if (prev === undefined || row.min_ppp < prev) bandMin[row.snapshot_date][key] = row.min_ppp
      }
      const dates = [...dateSet].sort()
      if (dates.length === 0) return NextResponse.json({ trend: [], complexCount: 0, unit: '조원' })

      // 실거래: 각 날짜의 직전 1개월 창 평균 평당가 (complex|band 단위)
      const areaMapping = await getAreaMapping()
      const tradeCutoff = subtractCalendarMonth(dates[0])
      const actuals = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date')
          .gte('deal_date', tradeCutoff).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const tradeEntries = (actuals || []).map(t => {
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) return null
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy < 20 || !matchesSupplyArea(supplyPy)) return null
        const ppp = Number(t.deal_amount) / supplyPy
        if (ppp <= 0) return null
        return { key: `${t.complex_name}|${getBandM(supplyPy)}`, ppp, dealDate: t.deal_date }
      }).filter((e): e is { key: string; ppp: number; dealDate: string } => e !== null)

      // 두 라인이 같은 (단지×밴드) 집합을 합산해야 비교 가능하다 — 값이 없는
      // 날은 직전 값을 유지(forward-fill)하고, 날짜별 스냅샷을 기록해 둔다.
      const listingPpp: Record<string, number> = {}
      const actualPpp: Record<string, number> = {}
      const perDateListing: Record<string, number>[] = []
      const perDateActual: Record<string, number>[] = []

      for (const d of dates) {
        for (const [key, minPpp] of Object.entries(bandMin[d] || {})) listingPpp[key] = minPpp

        const windowStart = subtractCalendarMonth(d)
        const windowPpps: Record<string, number[]> = {}
        for (const e of tradeEntries) {
          if (e.dealDate >= windowStart && e.dealDate <= d) {
            if (!windowPpps[e.key]) windowPpps[e.key] = []
            windowPpps[e.key].push(e.ppp)
          }
        }
        for (const [key, ppps] of Object.entries(windowPpps)) {
          const actual = getFilteredActualAverage(ppps, listingPpp[key] ?? null)
          if (actual) actualPpp[key] = actual.avg
        }

        perDateListing.push({ ...listingPpp })
        perDateActual.push({ ...actualPpp })
      }

      // 호가 추이 차트와 같은 전체 스냅샷 기간을 그린다. 관측이 늦게 시작된
      // 키는 첫 관측값으로 앞구간을 채워(backfill) 합산 집합을 기간 내내
      // 동일하게 유지한다 — 합계가 커버리지 증가로 계단식 튀는 것을 방지.
      const lastListing = perDateListing[perDateListing.length - 1]
      const lastActual = perDateActual[perDateActual.length - 1]
      const includedKeys = capKeys.filter(k => lastListing[k] !== undefined && lastActual[k] !== undefined)
      if (includedKeys.length === 0) return NextResponse.json({ trend: [], complexCount: 0, unit: '조원' })

      const firstListing: Record<string, number> = {}
      const firstActual: Record<string, number> = {}
      for (const key of includedKeys) {
        for (const snap of perDateListing) {
          if (snap[key] !== undefined) { firstListing[key] = snap[key]; break }
        }
        for (const snap of perDateActual) {
          if (snap[key] !== undefined) { firstActual[key] = snap[key]; break }
        }
      }

      const trend = dates.map((d, i) => {
        let actualSum = 0, listingSum = 0
        for (const key of includedKeys) {
          actualSum += (perDateActual[i][key] ?? firstActual[key]) * bandPy[key]
          listingSum += (perDateListing[i][key] ?? firstListing[key]) * bandPy[key]
        }
        return {
          date: d,
          actualValue: Math.round((actualSum / 1e8) * 100) / 100, // 만원 → 조원
          listingValue: Math.round((listingSum / 1e8) * 100) / 100,
        }
      })

      const complexCount = new Set(includedKeys.map(k => k.split('|')[0])).size
      return NextResponse.json({ trend, complexCount, unit: '조원' })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
