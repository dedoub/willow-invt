import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// Paginated fetch to bypass Supabase max_rows (default 1000)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(query: any, pageSize = 1000): Promise<any[]> {
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
  const areaMapping = await buildAreaMapping(supabase, complexNames)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any, table: 'trades' | 'rentals') => {
    query = query.in('complex_name', complexNames)
    if (areaRange === '20') query = query.gte('area_pyeong', 20).lt('area_pyeong', 30)
    else if (areaRange === '30') query = query.gte('area_pyeong', 30).lt('area_pyeong', 40)
    else if (areaRange === '40') query = query.gte('area_pyeong', 40).lt('area_pyeong', 50)
    else if (areaRange === '50') query = query.gte('area_pyeong', 50).lt('area_pyeong', 60)
    else if (areaRange === '60+') query = query.gte('area_pyeong', 60)
    if (table === 'trades') query = query.eq('cancel_yn', 'N')
    return query
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

      const oma = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const oneMonthAgo = `${oma.getFullYear()}-${String(oma.getMonth() + 1).padStart(2, '0')}-01`

      // Fetch trades & rentals (no DB area filter — filter by supply pyeong in code)
      const recentTrades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_amount, area_sqm')
          .gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const recentRentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deposit, area_sqm')
          .gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames)
      )

      // Supply-pyeong area filter (consistent with listings)
      function matchesArea(supplyPy: number): boolean {
        if (!areaRange) return supplyPy >= 20
        if (areaRange === '20') return supplyPy >= 20 && supplyPy < 30
        if (areaRange === '30') return supplyPy >= 30 && supplyPy < 40
        if (areaRange === '40') return supplyPy >= 40 && supplyPy < 50
        if (areaRange === '50') return supplyPy >= 50 && supplyPy < 60
        if (areaRange === '60+') return supplyPy >= 60
        return true
      }
      function getBandS(supplyPy: number): number {
        if (supplyPy < 30) return 20
        if (supplyPy < 40) return 30
        if (supplyPy < 50) return 40
        if (supplyPy < 60) return 50
        return 60
      }

      // Average PPP (supply-area based, filtered)
      let tradePppSum = 0, tradePppCount = 0
      for (const t of recentTrades || []) {
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesArea(supplyPy)) continue
        tradePppSum += Number(t.deal_amount) / supplyPy
        tradePppCount++
      }
      let jeonsePppSum = 0, jeonsePppCount = 0
      for (const r of recentRentals || []) {
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, r.complex_name, sqm)
        if (supplyPy <= 0 || !matchesArea(supplyPy)) continue
        jeonsePppSum += Number(r.deposit) / supplyPy
        jeonsePppCount++
      }

      // Listing gaps — grouped by complex+평형대 (latest snapshot only)
      const { data: summaryLatestSnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const summarySnapshotDate = summaryLatestSnap?.[0]?.snapshot_date

      const listings = summarySnapshotDate ? await fetchAll(
        supabase.from('re_naver_listings')
          .select('complex_name, trade_type, price, area_supply_sqm, area_type')
          .eq('snapshot_date', summarySnapshotDate)
          .in('complex_name', complexNames)
      ) : []
      type BandKey = string
      const listingBands: Record<BandKey, { trade: number[]; jeonse: number[] }> = {}
      for (const l of listings) {
        const py = getListingPyeong(l)
        if (py <= 0 || !matchesArea(py)) continue
        const key = `${l.complex_name}|${getBandS(py)}`
        if (!listingBands[key]) listingBands[key] = { trade: [], jeonse: [] }
        const ppp = Number(l.price) / py
        if (l.trade_type === '매매') listingBands[key].trade.push(ppp)
        else if (l.trade_type === '전세') listingBands[key].jeonse.push(ppp)
      }

      // Actuals grouped by complex+band
      const tradeActuals: Record<BandKey, number[]> = {}
      for (const t of recentTrades || []) {
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, t.complex_name, sqm)
        if (supplyPy <= 0 || !matchesArea(supplyPy)) continue
        const key = `${t.complex_name}|${getBandS(supplyPy)}`
        if (!tradeActuals[key]) tradeActuals[key] = []
        tradeActuals[key].push(Number(t.deal_amount) / supplyPy)
      }
      const jeonseActuals: Record<BandKey, number[]> = {}
      for (const r of recentRentals || []) {
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMapping, r.complex_name, sqm)
        if (supplyPy <= 0 || !matchesArea(supplyPy)) continue
        const key = `${r.complex_name}|${getBandS(supplyPy)}`
        if (!jeonseActuals[key]) jeonseActuals[key] = []
        jeonseActuals[key].push(Number(r.deposit) / supplyPy)
      }

      // Gap per complex+band → average
      const tradeGaps: number[] = []
      const jeonseGaps: number[] = []
      for (const [key, li] of Object.entries(listingBands)) {
        if (li.trade.length > 0 && tradeActuals[key]?.length > 0) {
          const minListing = Math.min(...li.trade)
          const avgActual = tradeActuals[key].reduce((s, v) => s + v, 0) / tradeActuals[key].length
          if (avgActual > 0) tradeGaps.push(((minListing - avgActual) / avgActual) * 100)
        }
        if (li.jeonse.length > 0 && jeonseActuals[key]?.length > 0) {
          const minListing = Math.min(...li.jeonse)
          const avgActual = jeonseActuals[key].reduce((s, v) => s + v, 0) / jeonseActuals[key].length
          if (avgActual > 0) jeonseGaps.push(((minListing - avgActual) / avgActual) * 100)
        }
      }

      // Latest data dates
      const { data: latestListing } = await supabase
        .from('re_naver_listings').select('snapshot_date').in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const { data: latestTrade } = await supabase
        .from('re_trades').select('deal_date').in('complex_name', complexNames).eq('cancel_yn', 'N')
        .order('deal_date', { ascending: false }).limit(1)

      return NextResponse.json({
        summary: {
          trackedComplexes: complexCount,
          districtCount: districtSet.size,
          avgTradePpp: tradePppCount > 0 ? Math.round(tradePppSum / tradePppCount) : 0,
          avgJeonsePpp: jeonsePppCount > 0 ? Math.round(jeonsePppSum / jeonsePppCount) : 0,
          tradeListingGap: tradeGaps.length ? Math.round(tradeGaps.reduce((s, v) => s + v, 0) / tradeGaps.length * 10) / 10 : 0,
          jeonseListingGap: jeonseGaps.length ? Math.round(jeonseGaps.reduce((s, v) => s + v, 0) / jeonseGaps.length * 10) / 10 : 0,
          lastListingDate: latestListing?.[0]?.snapshot_date || null,
          lastTradeDate: latestTrade?.[0]?.deal_date || null,
        }
      })
    }

    if (type === 'trades') {
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
        const ppp = sqm > 0 ? Number(t.deal_amount) / getSupplyPyeong(areaMapping, t.complex_name, sqm) : 0
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
        data: months.map(m => ({
          month: m,
          avgPpp: monthly[m]?.[name] ? Math.round(monthly[m][name].sum / monthly[m][name].count) : null,
          count: monthly[m]?.[name]?.count || 0,
        }))
      }))

      return NextResponse.json({ months, complexes: complexData })
    }

    if (type === 'rentals') {
      const data = await fetchAll(applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_sqm').gte('deal_date', cutoffDate).eq('rent_type', '전세').order('deal_date'),
        'rentals'
      ))

      const useAggregate = complexIds.length === 0
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}

      for (const r of data || []) {
        const month = r.deal_date.slice(0, 7)
        const sqm = Number(r.area_sqm)
        const ppp = sqm > 0 ? Number(r.deposit) / getSupplyPyeong(areaMapping, r.complex_name, sqm) : 0
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
        data: months.map(m => ({
          month: m,
          avgPpp: monthly[m]?.[name] ? Math.round(monthly[m][name].sum / monthly[m][name].count) : null,
          count: monthly[m]?.[name]?.count || 0,
        }))
      }))

      return NextResponse.json({ months, complexes: complexData })
    }

    if (type === 'listings') {
      const tradeType = searchParams.get('tradeType') || '매매'

      // Find the latest snapshot date
      const { data: latestSnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const latestSnapshotDate = latestSnap?.[0]?.snapshot_date

      // Fetch listings (tracked complexes only, latest snapshot only)
      const listings = latestSnapshotDate ? await fetchAll(
        supabase.from('re_naver_listings')
          .select('*').eq('trade_type', tradeType)
          .eq('snapshot_date', latestSnapshotDate)
          .in('complex_name', complexNames)
      ) : []

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
        const r = rowMap[key]
        r.listingCount += 1
        if (!r.listingMinPpp || ppp < r.listingMinPpp) r.listingMinPpp = Math.round(ppp)
        if (!r.listingMaxPpp || ppp > r.listingMaxPpp) r.listingMaxPpp = Math.round(ppp)
      }

      // Fetch actual prices (1-month window) and match to 평형대
      const oma = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const oneMonthAgo = `${oma.getFullYear()}-${String(oma.getMonth() + 1).padStart(2, '0')}-01`
      const allActuals = await fetchAll(
        tradeType === '매매'
          ? supabase.from('re_trades').select('complex_name, deal_amount, area_sqm').gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
          : supabase.from('re_rentals').select('complex_name, deposit, area_sqm').gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames)
      )

      for (const a of allActuals || []) {
        const sqm = Number(a.area_sqm)
        if (sqm <= 0) continue
        // Convert exclusive area → supply area → pyeong → band
        const supplyPy = getSupplyPyeong(areaMapping, a.complex_name, sqm)
        if (supplyPy < 20) continue
        const band = getBand(supplyPy)
        const key = `${a.complex_name}|${band}`
        const r = rowMap[key]
        if (!r) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / supplyPy
        r.actualAvgPpp = r.actualAvgPpp ? (r.actualAvgPpp * r.actualCount + ppp) / (r.actualCount + 1) : ppp
        r.actualCount += 1
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

      return NextResponse.json({ listings: rows, tradeType })
    }

    if (type === 'jeonse-ratio') {
      const trades = await fetchAll(applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong').gte('deal_date', cutoffDate),
        'trades'
      ))

      const rentals = await fetchAll(applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong').gte('deal_date', cutoffDate).eq('rent_type', '전세'),
        'rentals'
      ))

      const tradeMonthly: Record<string, Record<string, number[]>> = {}
      for (const t of trades || []) {
        const month = t.deal_date.slice(0, 7)
        if (!tradeMonthly[month]) tradeMonthly[month] = {}
        if (!tradeMonthly[month][t.complex_name]) tradeMonthly[month][t.complex_name] = []
        tradeMonthly[month][t.complex_name].push(Number(t.deal_amount))
      }

      const rentalMonthly: Record<string, Record<string, number[]>> = {}
      for (const r of rentals || []) {
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

      // Strategy: for each month, try per-complex matching first (same complex has both trade & jeonse).
      // If no per-complex matches exist, fall back to aggregate median trade vs aggregate median jeonse.
      const monthlyRatios: Record<string, number | null> = {}
      for (const month of allMonths) {
        const tData = tradeMonthly[month] || {}
        const rData = rentalMonthly[month] || {}

        // Per-complex matching
        const perComplexRatios: number[] = []
        for (const name of Object.keys(tData)) {
          if (rData[name]?.length) {
            const medTrade = median(tData[name])
            const medRental = median(rData[name])
            if (medTrade > 0) {
              perComplexRatios.push((medRental / medTrade) * 100)
            }
          }
        }

        if (perComplexRatios.length > 0) {
          monthlyRatios[month] = Math.round((perComplexRatios.reduce((s, v) => s + v, 0) / perComplexRatios.length) * 10) / 10
        } else {
          // Fallback: aggregate all trades and all rentals for the month
          const allTrades = Object.values(tData).flat()
          const allRentals = Object.values(rData).flat()
          if (allTrades.length > 0 && allRentals.length > 0) {
            const medTrade = median(allTrades)
            const medRental = median(allRentals)
            if (medTrade > 0) {
              monthlyRatios[month] = Math.round((medRental / medTrade) * 1000) / 10
            }
          }
        }
      }

      const trendMonths = expectedMonths.length > 0 ? expectedMonths : allMonths
      const trend = trendMonths.map(m => ({
        month: m,
        ratio: monthlyRatios[m] ?? null,
      }))

      return NextResponse.json({ trend })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
