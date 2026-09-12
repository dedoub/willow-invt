// Shared real estate query logic — used by both MCP tools and chat agent
// Extracted from src/lib/mcp/tools/real-estate.ts to avoid duplication

import { getServiceSupabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll(query: any, pageSize = 1000): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data } = await query.range(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export function getListingPyeong(l: { area_supply_sqm?: unknown; area_type?: unknown }): number {
  const supply = Number(l.area_supply_sqm)
  if (supply > 0) return supply / 3.3058
  const typeNum = parseFloat(String(l.area_type || '0'))
  if (typeNum > 0) return typeNum / 3.3058
  return 0
}

export type AreaMapping = { exclusive: number; supply: number }[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildAreaMapping(supabase: any, complexNames: string[]): Promise<Record<string, AreaMapping>> {
  const { data } = await supabase
    .from('re_naver_listings')
    .select('complex_name, area_exclusive_sqm, area_supply_sqm')
    .in('complex_name', complexNames)
    .gt('area_exclusive_sqm', '0')
    .gt('area_supply_sqm', '0')
  if (!data) return {}
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

export function getSupplyPyeong(areaMapping: Record<string, AreaMapping>, complexName: string, exclusiveSqm: number): number {
  const mapping = areaMapping[complexName]
  if (!mapping || mapping.length === 0) {
    return (exclusiveSqm / 0.75) / 3.3058
  }
  let closest = mapping[0]
  let minDiff = Math.abs(exclusiveSqm - closest.exclusive)
  for (const entry of mapping) {
    const diff = Math.abs(exclusiveSqm - entry.exclusive)
    if (diff < minDiff) { closest = entry; minDiff = diff }
  }
  return closest.supply / 3.3058
}

export function getBand(supplyPy: number): number {
  if (supplyPy < 30) return 20
  if (supplyPy < 40) return 30
  if (supplyPy < 50) return 40
  if (supplyPy < 60) return 50
  return 60
}

// ============================================================
// High-level query functions (auth-free, for chat agent)
// ============================================================

async function getTrackedComplexNames(supabase: ReturnType<typeof getServiceSupabase>, district?: string): Promise<string[]> {
  let query = supabase.from('re_complexes').select('name').eq('is_tracked', true)
  if (district) query = query.eq('district_name', district)
  const { data } = await query
  return data?.map((c: { name: string }) => c.name) || []
}

export async function reListComplexes(params: { district?: string }) {
  const supabase = getServiceSupabase()
  let query = supabase
    .from('re_complexes')
    .select('id, name, district_name, dong_name, total_units, build_year')
    .eq('is_tracked', true)
    .order('district_name').order('name')
  if (params.district) query = query.eq('district_name', params.district)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { data }
}

export async function reGetTradeTrends(params: { complex_name?: string; months?: number }) {
  const supabase = getServiceSupabase()
  const period = params.months || 12
  const now = new Date()
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

  let complexNames: string[]
  if (params.complex_name) {
    complexNames = [params.complex_name]
  } else {
    complexNames = await getTrackedComplexNames(supabase)
  }

  const areaMap = await buildAreaMapping(supabase, complexNames)

  const trades = await fetchAll(
    supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_sqm')
      .gte('deal_date', cutoffDate).eq('cancel_yn', 'N').in('complex_name', complexNames).order('deal_date')
  )

  const monthly: Record<string, { sum: number; count: number }> = {}
  for (const t of trades) {
    const month = t.deal_date.slice(0, 7)
    const sqm = Number(t.area_sqm)
    if (sqm <= 0) continue
    const supplyPy = getSupplyPyeong(areaMap, t.complex_name, sqm)
    if (supplyPy <= 0) continue
    const ppp = Number(t.deal_amount) / supplyPy
    if (ppp <= 0) continue
    if (!monthly[month]) monthly[month] = { sum: 0, count: 0 }
    monthly[month].sum += ppp
    monthly[month].count += 1
  }

  const trend = Object.keys(monthly).sort().map(m => ({
    month: m,
    avgPpp: Math.round(monthly[m].sum / monthly[m].count),
    count: monthly[m].count,
  }))

  return { complexNames, unit: '만원/평', trend }
}

export async function reGetRentalTrends(params: { complex_name?: string; months?: number }) {
  const supabase = getServiceSupabase()
  const period = params.months || 12
  const now = new Date()
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

  let complexNames: string[]
  if (params.complex_name) {
    complexNames = [params.complex_name]
  } else {
    complexNames = await getTrackedComplexNames(supabase)
  }

  const areaMap = await buildAreaMapping(supabase, complexNames)

  const rentals = await fetchAll(
    supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_sqm')
      .gte('deal_date', cutoffDate).eq('rent_type', '전세').in('complex_name', complexNames).order('deal_date')
  )

  const monthly: Record<string, { sum: number; count: number }> = {}
  for (const r of rentals) {
    const month = r.deal_date.slice(0, 7)
    const sqm = Number(r.area_sqm)
    if (sqm <= 0) continue
    const supplyPy = getSupplyPyeong(areaMap, r.complex_name, sqm)
    if (supplyPy <= 0) continue
    const ppp = Number(r.deposit) / supplyPy
    if (ppp <= 0) continue
    if (!monthly[month]) monthly[month] = { sum: 0, count: 0 }
    monthly[month].sum += ppp
    monthly[month].count += 1
  }

  const trend = Object.keys(monthly).sort().map(m => ({
    month: m,
    avgPpp: Math.round(monthly[m].sum / monthly[m].count),
    count: monthly[m].count,
  }))

  return { complexNames, unit: '만원/평', trend }
}

export async function reGetListingGap(params: { trade_type?: string }) {
  const supabase = getServiceSupabase()
  const tradeType = params.trade_type || '매매'
  const complexNames = await getTrackedComplexNames(supabase)
  const areaMap = await buildAreaMapping(supabase, complexNames)

  // Latest snapshot per complex
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
      .select('complex_name, trade_type, price, area_supply_sqm, area_type, snapshot_date')
      .eq('trade_type', tradeType)
      .gte('snapshot_date', snapCutoff)
      .in('complex_name', complexNames)
  ) : []
  const complexLatest: Record<string, string> = {}
  for (const l of allListings) {
    if (!complexLatest[l.complex_name] || l.snapshot_date > complexLatest[l.complex_name]) {
      complexLatest[l.complex_name] = l.snapshot_date
    }
  }
  const listings = allListings.filter(l => l.snapshot_date === complexLatest[l.complex_name])

  // 1 month window
  const now = new Date()
  const oma = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const oneMonthAgo = `${oma.getFullYear()}-${String(oma.getMonth() + 1).padStart(2, '0')}-01`
  const actuals = tradeType === '매매'
    ? await fetchAll(supabase.from('re_trades').select('complex_name, deal_amount, area_sqm').gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames))
    : await fetchAll(supabase.from('re_rentals').select('complex_name, deposit, area_sqm').gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames))

  type RowKey = string
  const rowMap: Record<RowKey, {
    complexName: string; areaBand: number
    listingMinPpp: number; listingMaxPpp: number; listingCount: number
    actualAvgPpp: number; actualCount: number
  }> = {}
  const listingPpps: Record<RowKey, number[]> = {}

  for (const l of listings) {
    const py = getListingPyeong(l)
    if (py <= 0 || py < 20) continue
    const ppp = Number(l.price) / py
    if (ppp <= 0) continue
    const band = getBand(py)
    const key = `${l.complex_name}|${band}`
    if (!rowMap[key]) rowMap[key] = { complexName: l.complex_name, areaBand: band, listingMinPpp: Infinity, listingMaxPpp: 0, listingCount: 0, actualAvgPpp: 0, actualCount: 0 }
    if (!listingPpps[key]) listingPpps[key] = []
    listingPpps[key].push(ppp)
    rowMap[key].listingCount++
    rowMap[key].listingMaxPpp = Math.max(rowMap[key].listingMaxPpp, ppp)
  }

  for (const [key, ppps] of Object.entries(listingPpps)) {
    const sorted = [...ppps].sort((a, b) => a - b)
    const p10Idx = Math.floor(sorted.length * 0.1)
    rowMap[key].listingMinPpp = sorted[p10Idx]
  }

  const actualPpps: Record<RowKey, number[]> = {}
  for (const a of actuals) {
    const sqm = Number(a.area_sqm)
    if (sqm <= 0) continue
    const supplyPy = getSupplyPyeong(areaMap, a.complex_name, sqm)
    if (supplyPy < 20) continue
    const band = getBand(supplyPy)
    const key = `${a.complex_name}|${band}`
    if (!rowMap[key]) continue
    const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
    if (!actualPpps[key]) actualPpps[key] = []
    actualPpps[key].push(price / supplyPy)
  }

  for (const [key, ppps] of Object.entries(actualPpps)) {
    if (ppps.length === 0) continue
    const r = rowMap[key]
    const sorted = [...ppps].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const listingFloor = r.listingMinPpp !== Infinity ? r.listingMinPpp * 0.5 : 0
    const filtered = ppps.filter(p => Math.abs(p - median) / median <= 0.5 && p >= listingFloor)
    if (filtered.length === 0) continue
    r.actualAvgPpp = filtered.reduce((s, p) => s + p, 0) / filtered.length
    r.actualCount = filtered.length
  }

  const rows = Object.values(rowMap)
    .filter(v => v.actualCount > 0 && v.listingCount > 0)
    .map(v => ({
      complexName: v.complexName,
      areaBand: v.areaBand,
      actualAvgPpp: Math.round(v.actualAvgPpp),
      listingMinPpp: Math.round(v.listingMinPpp),
      listingMaxPpp: Math.round(v.listingMaxPpp),
      listingCount: v.listingCount,
      gap: Math.round(((v.listingMinPpp - v.actualAvgPpp) / v.actualAvgPpp) * 1000) / 10,
    }))
    .sort((a, b) => a.complexName.localeCompare(b.complexName, 'ko') || a.areaBand - b.areaBand)

  return { tradeType, unit: '만원/평', rows }
}

export async function reGetJeonseRatio(params: { months?: number }) {
  const supabase = getServiceSupabase()
  const period = params.months || 12
  const now = new Date()
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

  const complexNames = await getTrackedComplexNames(supabase)

  const trades = await fetchAll(
    supabase.from('re_trades').select('complex_name, deal_date, deal_amount')
      .gte('deal_date', cutoffDate).eq('cancel_yn', 'N').in('complex_name', complexNames)
  )
  const rentals = await fetchAll(
    supabase.from('re_rentals').select('complex_name, deal_date, deposit')
      .gte('deal_date', cutoffDate).eq('rent_type', '전세').in('complex_name', complexNames)
  )

  const tradeMonthly: Record<string, Record<string, number[]>> = {}
  for (const t of trades) {
    const month = t.deal_date.slice(0, 7)
    if (!tradeMonthly[month]) tradeMonthly[month] = {}
    if (!tradeMonthly[month][t.complex_name]) tradeMonthly[month][t.complex_name] = []
    tradeMonthly[month][t.complex_name].push(Number(t.deal_amount))
  }

  const rentalMonthly: Record<string, Record<string, number[]>> = {}
  for (const r of rentals) {
    const month = r.deal_date.slice(0, 7)
    if (!rentalMonthly[month]) rentalMonthly[month] = {}
    if (!rentalMonthly[month][r.complex_name]) rentalMonthly[month][r.complex_name] = []
    rentalMonthly[month][r.complex_name].push(Number(r.deposit))
  }

  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  const allMonths = [...new Set([...Object.keys(tradeMonthly), ...Object.keys(rentalMonthly)])].sort()
  const trend = allMonths.map(month => {
    const tData = tradeMonthly[month] || {}
    const rData = rentalMonthly[month] || {}
    const ratios: number[] = []
    for (const name of Object.keys(tData)) {
      if (rData[name]?.length) {
        const medTrade = median(tData[name])
        const medRental = median(rData[name])
        if (medTrade > 0) ratios.push((medRental / medTrade) * 100)
      }
    }
    return ratios.length > 0
      ? { month, ratio: Math.round(ratios.reduce((s, v) => s + v, 0) / ratios.length * 10) / 10 }
      : null
  }).filter(Boolean)

  return { unit: '%', trend }
}

export async function reGetListingGapTrend(params: { trade_type?: string; area_band?: number }) {
  const supabase = getServiceSupabase()
  const tradeType = params.trade_type || '매매'
  const complexNames = await getTrackedComplexNames(supabase)
  if (complexNames.length === 0) return { error: '추적 단지가 없습니다.' }

  // 1. Daily summary from pre-computed table
  let query = supabase
    .from('re_listing_daily_summary')
    .select('snapshot_date, complex_name, area_band, min_ppp')
    .eq('trade_type', tradeType)
    .in('complex_name', complexNames)
    .order('snapshot_date', { ascending: true })

  if (params.area_band) {
    query = query.eq('area_band', params.area_band)
  } else {
    query = query.gte('area_band', 20)
  }

  const data = await fetchAll(query)
  const areaMapping = await buildAreaMapping(supabase, complexNames)

  // Collect snapshot dates + listing data
  const dateSet = new Set<string>()
  const dateListings: Record<string, Record<string, number>> = {}
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
  if (dates.length === 0) return { tradeType, trend: [] }

  // Fetch trades covering all windows
  const ed = new Date(dates[0])
  ed.setMonth(ed.getMonth() - 1)
  const tradeCutoff = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-01`

  type TradeRow = { complex_name: string; deal_amount?: number; deposit?: number; area_sqm: number; deal_date: string }
  const allActuals: TradeRow[] = []
  if (tradeType === '매매') {
    allActuals.push(...await fetchAll(
      supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date')
        .gte('deal_date', tradeCutoff).eq('cancel_yn', 'N').in('complex_name', complexNames)
    ))
  } else {
    allActuals.push(...await fetchAll(
      supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date')
        .gte('deal_date', tradeCutoff).eq('rent_type', '전세').in('complex_name', complexNames)
    ))
  }

  // Pre-compute entries
  const tradeEntries = allActuals.map(t => {
    const sqm = Number(t.area_sqm)
    if (sqm <= 0) return null
    const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
    if (supplyPy <= 0 || supplyPy < 20) return null
    const key = `${t.complex_name}|${getBand(supplyPy)}`
    const ppp = tradeType === '매매' ? Number(t.deal_amount) / supplyPy : Number(t.deposit) / supplyPy
    return { key, ppp, dealDate: t.deal_date }
  }).filter((e): e is { key: string; ppp: number; dealDate: string } => e !== null)

  // Per-date gap rate
  const trend = dates.map(d => {
    const sd = new Date(d)
    sd.setMonth(sd.getMonth() - 1)
    const windowStart = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`

    const dateBands: Record<string, { sum: number; count: number }> = {}
    for (const e of tradeEntries) {
      if (e.dealDate >= windowStart && e.dealDate <= d) {
        if (!dateBands[e.key]) dateBands[e.key] = { sum: 0, count: 0 }
        dateBands[e.key].sum += e.ppp
        dateBands[e.key].count += 1
      }
    }

    const gaps: number[] = []
    for (const [key, minPpp] of Object.entries(dateListings[d] || {})) {
      const actual = dateBands[key]
      if (actual && actual.count > 0) {
        const avgActual = actual.sum / actual.count
        if (avgActual > 0) {
          gaps.push(((minPpp - avgActual) / avgActual) * 100)
        }
      }
    }
    return {
      date: d,
      gapRate: gaps.length > 0 ? Math.round(gaps.reduce((s, v) => s + v, 0) / gaps.length * 10) / 10 : null,
    }
  }).filter(t => t.gapRate !== null)

  return { tradeType, unit: '%', trend }
}

export async function reGetSummary(params: { district?: string }) {
  const supabase = getServiceSupabase()
  let trackedQuery = supabase.from('re_complexes').select('name, district_name').eq('is_tracked', true)
  if (params.district) trackedQuery = trackedQuery.eq('district_name', params.district)
  const { data: trackedData } = await trackedQuery
  const complexNames = trackedData?.map((c: { name: string }) => c.name) || []
  if (complexNames.length === 0) return { error: '추적 단지가 없습니다.' }

  const areaMap = await buildAreaMapping(supabase, complexNames)
  const now = new Date()
  const oma = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const oneMonthAgo = `${oma.getFullYear()}-${String(oma.getMonth() + 1).padStart(2, '0')}-01`

  const recentTrades = await fetchAll(
    supabase.from('re_trades').select('complex_name, deal_amount, area_sqm')
      .gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
  )
  const recentRentals = await fetchAll(
    supabase.from('re_rentals').select('complex_name, deposit, area_sqm')
      .gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames)
  )

  let tradePppSum = 0, tradePppCount = 0
  for (const t of recentTrades) {
    const sqm = Number(t.area_sqm)
    if (sqm <= 0) continue
    const supplyPy = getSupplyPyeong(areaMap, t.complex_name, sqm)
    if (supplyPy <= 0) continue
    tradePppSum += Number(t.deal_amount) / supplyPy
    tradePppCount++
  }
  let jeonsePppSum = 0, jeonsePppCount = 0
  for (const r of recentRentals) {
    const sqm = Number(r.area_sqm)
    if (sqm <= 0) continue
    const supplyPy = getSupplyPyeong(areaMap, r.complex_name, sqm)
    if (supplyPy <= 0) continue
    jeonsePppSum += Number(r.deposit) / supplyPy
    jeonsePppCount++
  }

  return {
    trackedComplexes: complexNames.length,
    districts: [...new Set(trackedData?.map((c: { district_name: string }) => c.district_name))],
    avgTradePpp: tradePppCount > 0 ? Math.round(tradePppSum / tradePppCount) : 0,
    avgJeonsePpp: jeonsePppCount > 0 ? Math.round(jeonsePppSum / jeonsePppCount) : 0,
    unit: '만원/평',
  }
}

/**
 * 권역 비교 지수 — 강남3구 vs 서울 외곽(노도강·금관구).
 *
 * 다른 re_* 질의와 대상이 다르다. 저쪽은 추적 22개 단지의 호가·실거래를 보고,
 * 이건 아홉 개 구의 실거래 전량으로 만든 지수라 is_tracked 를 타지 않는다.
 * 평당가도 전용면적 기준이라 화면의 '만/평'(공급면적 기준)과 같은 축이 아니다.
 *
 * 계산은 re_zone_index 매트뷰가 이미 끝냈다.
 * 근거: supabase/migrations/20260913010000_re_zone_index.sql
 */
export async function reGetZoneIndex(params: { months?: number }) {
  const supabase = getServiceSupabase()


  let query = supabase
    .from('re_zone_index')
    .select('month_start, zone, cells, trades, idx')
    .order('month_start', { ascending: true })

  if (params.months) {
    const now = new Date()
    const cutoff = new Date(now.getFullYear(), now.getMonth() - params.months + 1, 1)
      .toISOString().slice(0, 10)
    query = query.gte('month_start', cutoff)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data || []) as Array<{ month_start: string; zone: string; cells: number; trades: number; idx: number }>

  // 최근 두 달은 신고가 아직 들어오는 중이다.
  const now = new Date()
  const provisionalFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString().slice(0, 10)

  const byMonth = new Map<string, { month: string; provisional: boolean; zones: Record<string, { idx: number; cells: number; trades: number }> }>()
  for (const r of rows) {
    const month = String(r.month_start).slice(0, 7)
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, provisional: String(r.month_start) >= provisionalFrom, zones: {} })
    }
    byMonth.get(month)!.zones[r.zone] = { idx: Number(r.idx), cells: r.cells, trades: r.trades }
  }
  const series = Array.from(byMonth.values())

  const spreadOf = (row?: { zones: Record<string, { idx: number }> }) => {
    const core = row?.zones?.['강남3구']?.idx
    const outer = ['노도강', '금관구']
      .map(z => row?.zones?.[z]?.idx)
      .filter((v): v is number => typeof v === 'number')
    if (typeof core !== 'number' || outer.length === 0) return null
    return Math.round((core - outer.reduce((a, b) => a + b, 0) / outer.length) * 10) / 10
  }

  const finals = series.filter(r => !r.provisional)
  const latest = finals[finals.length - 1]

  return {
    base: '2025년 상반기 = 100',
    zones: { 강남3구: '강남·서초·송파', 노도강: '노원·도봉·강북', 금관구: '금천·관악·구로' },
    method: '(자치구 × 단지 × 전용면적㎡) 셀의 기준기간 대비 배수를 권역별 중앙값으로 묶은 값. 셀마다 자기 자신과 비교하므로 그달에 무엇이 팔렸는지가 지수를 흔들지 않는다',
    basis: '전용면적 기준 평당가. 화면의 만/평(공급면적 기준)과 다른 축이라 같이 놓지 말 것',
    note: 'provisional=true 인 달은 실거래 신고 지연으로 표본이 채워지는 중이라 추세로 읽지 말 것. 추적 단지와 무관하게 구 전체 실거래로 만든다',
    latestSettled: latest
      ? { month: latest.month, spread: spreadOf(latest), spreadUnit: 'p (강남3구 − 외곽평균)' }
      : null,
    series,
  }
}
