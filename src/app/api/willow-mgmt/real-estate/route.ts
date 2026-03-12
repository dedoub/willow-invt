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

// Extract pyeong from listing: use supply area (area1 from Naver = area type number)
function getListingPyeong(l: { area_supply_sqm?: any; area_type?: any }): number {
  const supply = Number(l.area_supply_sqm)
  if (supply > 0) return supply / 3.3058
  // fallback: parse numeric part from area_type (e.g. "84A" → 84)
  const typeNum = parseFloat(l.area_type || '0')
  if (typeNum > 0) return typeNum / 3.3058
  return 0
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
  // period=6 → show last 6 months: if today is 2026-03, show from 2025-10-01
  const cutoffDate = period === 'all'
    ? '2020-01-01'
    : new Date(now.getFullYear(), now.getMonth() - parseInt(period) + 1, 1).toISOString().slice(0, 10)

  // Resolve tracked complex names: always filter by tracked complexes only
  // If user selected specific complexes → use those (subset of tracked)
  // Otherwise → use all tracked complexes (filtered by district if applicable)
  let trackedQuery = supabase.from('re_complexes').select('name, district_name').eq('is_tracked', true)
  if (districts.length > 0) trackedQuery = trackedQuery.in('district_name', districts)
  const { data: trackedData } = await trackedQuery
  const allTrackedNames = trackedData?.map(c => c.name) || []

  let complexNames: string[]
  if (complexIds.length > 0) {
    const { data } = await supabase.from('re_complexes').select('name').in('id', complexIds)
    complexNames = data?.map(c => c.name) || []
  } else {
    complexNames = allTrackedNames
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any, table: 'trades' | 'rentals') => {
    query = query.in('complex_name', complexNames)
    if (areaRange === '20') query = query.gte('area_pyeong', 20).lt('area_pyeong', 30)
    else if (areaRange === '30') query = query.gte('area_pyeong', 30).lt('area_pyeong', 40)
    else if (areaRange === '40+') query = query.gte('area_pyeong', 40)
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

      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)

      // Fetch trades & rentals for tracked complexes only
      const recentTrades = await fetchAll(applyFilters(
        supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong').gte('deal_date', threeMonthsAgo),
        'trades'
      ))

      const recentRentals = await fetchAll(applyFilters(
        supabase.from('re_rentals').select('complex_name, deposit, area_pyeong').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세'),
        'rentals'
      ))

      // Listing gaps (tracked complexes only) — use fetchAll to bypass 1000 row limit
      const listings = await fetchAll(
        supabase.from('re_naver_listings')
          .select('complex_name, trade_type, price, area_supply_sqm, area_type')
          .in('complex_name', complexNames)
      )

      const listingMap: Record<string, { trade: number[]; jeonse: number[] }> = {}
      for (const l of listings) {
        const pyeong = getListingPyeong(l)
        if (pyeong <= 0) continue
        const ppp = Number(l.price) / pyeong
        if (!listingMap[l.complex_name]) listingMap[l.complex_name] = { trade: [], jeonse: [] }
        if (l.trade_type === '매매') listingMap[l.complex_name].trade.push(ppp)
        else if (l.trade_type === '전세') listingMap[l.complex_name].jeonse.push(ppp)
      }

      const tradeGaps: number[] = []
      const jeonseGaps: number[] = []
      for (const name of Object.keys(listingMap)) {
        const li = listingMap[name]
        if (li.trade.length > 0) {
          const minListing = Math.min(...li.trade)
          const actual = (recentTrades || []).filter((t: any) => t.complex_name === name && Number(t.area_pyeong) > 0)
          if (actual.length > 0) {
            const avgPpp = actual.reduce((s: number, t: any) => s + Number(t.deal_amount) / Number(t.area_pyeong), 0) / actual.length
            if (avgPpp > 0) tradeGaps.push(((minListing - avgPpp) / avgPpp) * 100)
          }
        }
        if (li.jeonse.length > 0) {
          const minListing = Math.min(...li.jeonse)
          const actual = (recentRentals || []).filter((r: any) => r.complex_name === name && Number(r.area_pyeong) > 0)
          if (actual.length > 0) {
            const avgPpp = actual.reduce((s: number, r: any) => s + Number(r.deposit) / Number(r.area_pyeong), 0) / actual.length
            if (avgPpp > 0) jeonseGaps.push(((minListing - avgPpp) / avgPpp) * 100)
          }
        }
      }

      // Average trade/jeonse price per pyeong
      let tradePppSum = 0, tradePppCount = 0
      for (const t of recentTrades || []) {
        const py = Number(t.area_pyeong)
        if (py > 0) { tradePppSum += Number(t.deal_amount) / py; tradePppCount++ }
      }
      let jeonsePppSum = 0, jeonsePppCount = 0
      for (const r of recentRentals || []) {
        const py = Number(r.area_pyeong)
        if (py > 0) { jeonsePppSum += Number(r.deposit) / py; jeonsePppCount++ }
      }

      return NextResponse.json({
        summary: {
          trackedComplexes: complexCount,
          districtCount: districtSet.size,
          avgTradePpp: tradePppCount > 0 ? Math.round(tradePppSum / tradePppCount) : 0,
          avgJeonsePpp: jeonsePppCount > 0 ? Math.round(jeonsePppSum / jeonsePppCount) : 0,
          tradeListingGap: tradeGaps.length ? Math.round(tradeGaps.reduce((s, v) => s + v, 0) / tradeGaps.length * 10) / 10 : 0,
          jeonseListingGap: jeonseGaps.length ? Math.round(jeonseGaps.reduce((s, v) => s + v, 0) / jeonseGaps.length * 10) / 10 : 0,
        }
      })
    }

    if (type === 'trades') {
      const data = await fetchAll(applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong, price_per_pyeong').gte('deal_date', cutoffDate).order('deal_date'),
        'trades'
      ))

      // Aggregate by month. If no specific complexes selected, aggregate as "전체" average
      const useAggregate = complexIds.length === 0
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}
      // Track per-complex total count for top N selection
      const complexTotals: Record<string, number> = {}

      for (const t of data || []) {
        const month = t.deal_date.slice(0, 7)
        const ppp = Number(t.price_per_pyeong) || (Number(t.area_pyeong) > 0 ? Number(t.deal_amount) / Number(t.area_pyeong) : 0)
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

      const months = Object.keys(monthly).sort()
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
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong').gte('deal_date', cutoffDate).eq('rent_type', '전세').order('deal_date'),
        'rentals'
      ))

      const useAggregate = complexIds.length === 0
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}

      for (const r of data || []) {
        const month = r.deal_date.slice(0, 7)
        const pyeong = Number(r.area_pyeong)
        const ppp = pyeong > 0 ? Number(r.deposit) / pyeong : 0
        if (ppp <= 0) continue
        const key = useAggregate ? '전체' : r.complex_name
        if (!monthly[month]) monthly[month] = {}
        if (!monthly[month][key]) monthly[month][key] = { sum: 0, count: 0 }
        monthly[month][key].sum += ppp
        monthly[month][key].count += 1
      }

      const months = Object.keys(monthly).sort()
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

      // Fetch listings (tracked complexes only) — use fetchAll to bypass 1000 row limit
      const listings = await fetchAll(
        supabase.from('re_naver_listings')
          .select('*').eq('trade_type', tradeType)
          .in('complex_name', complexNames)
      )

      // Filter listings by area range
      const filteredListings = areaRange
        ? (listings || []).filter(l => {
            const py = getListingPyeong(l)
            if (areaRange === '20') return py >= 20 && py < 30
            if (areaRange === '30') return py >= 30 && py < 40
            if (areaRange === '40+') return py >= 40
            return true
          })
        : (listings || [])

      // Get listing complex names, then fetch actuals only for those
      const listingComplexNames = [...new Set(filteredListings.map(l => l.complex_name))]

      // Fetch actual prices for tracked complexes
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
      let actualQ = tradeType === '매매'
        ? supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong, price_per_pyeong').gte('deal_date', threeMonthsAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
        : supabase.from('re_rentals').select('complex_name, deposit, area_pyeong').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세').in('complex_name', complexNames)

      if (areaRange === '20') actualQ = actualQ.gte('area_pyeong', 20).lt('area_pyeong', 30)
      else if (areaRange === '30') actualQ = actualQ.gte('area_pyeong', 30).lt('area_pyeong', 40)
      else if (areaRange === '40+') actualQ = actualQ.gte('area_pyeong', 40)

      const actuals = await fetchAll(actualQ)

      // Build per-complex comparison
      const complexMap: Record<string, {
        complexNo: string | null; listingMinPpp: number | null; listingMaxPpp: number | null; listingCount: number
        actualAvgPpp: number | null; actualCount: number; gap: number | null
      }> = {}

      for (const l of filteredListings) {
        const pyeong = getListingPyeong(l)
        if (pyeong <= 0) continue
        const ppp = Number(l.price) / pyeong
        if (!complexMap[l.complex_name]) complexMap[l.complex_name] = { complexNo: l.complex_no || null, listingMinPpp: null, listingMaxPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
        complexMap[l.complex_name].listingCount += 1
        if (!complexMap[l.complex_name].listingMinPpp || ppp < complexMap[l.complex_name].listingMinPpp!) {
          complexMap[l.complex_name].listingMinPpp = Math.round(ppp)
        }
        if (!complexMap[l.complex_name].listingMaxPpp || ppp > complexMap[l.complex_name].listingMaxPpp!) {
          complexMap[l.complex_name].listingMaxPpp = Math.round(ppp)
        }
      }

      // Only process actuals for complexes that have listings
      for (const a of actuals || []) {
        if (!listingComplexNames.includes(a.complex_name) && !complexMap[a.complex_name]) continue
        const pyeong = Number(a.area_pyeong)
        if (pyeong <= 0) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / pyeong
        if (!complexMap[a.complex_name]) complexMap[a.complex_name] = { complexNo: null, listingMinPpp: null, listingMaxPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
        const c = complexMap[a.complex_name]
        c.actualAvgPpp = c.actualAvgPpp ? (c.actualAvgPpp * c.actualCount + ppp) / (c.actualCount + 1) : ppp
        c.actualCount += 1
      }

      for (const name of Object.keys(complexMap)) {
        const c = complexMap[name]
        if (c.listingMinPpp && c.actualAvgPpp && c.actualAvgPpp > 0) {
          c.gap = Math.round(((c.listingMinPpp - c.actualAvgPpp) / c.actualAvgPpp) * 1000) / 10
        }
        if (c.actualAvgPpp) c.actualAvgPpp = Math.round(c.actualAvgPpp)
      }

      const rows = Object.entries(complexMap)
        .filter(([, v]) => v.actualCount > 0 && v.listingCount > 0)
        .map(([name, v]) => ({ complexName: name, ...v }))
        .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))

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

      const monthlyRatios: Record<string, number[]> = {}
      for (const month of allMonths) {
        const tData = tradeMonthly[month] || {}
        const rData = rentalMonthly[month] || {}
        for (const name of Object.keys(tData)) {
          if (rData[name]?.length) {
            const medTrade = median(tData[name])
            const medRental = median(rData[name])
            if (medTrade > 0) {
              if (!monthlyRatios[month]) monthlyRatios[month] = []
              monthlyRatios[month].push((medRental / medTrade) * 100)
            }
          }
        }
      }

      const trend = allMonths
        .filter(m => monthlyRatios[m]?.length)
        .map(m => ({
          month: m,
          ratio: Math.round((monthlyRatios[m].reduce((s, v) => s + v, 0) / monthlyRatios[m].length) * 10) / 10,
        }))

      return NextResponse.json({ trend })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
