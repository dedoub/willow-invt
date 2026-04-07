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
