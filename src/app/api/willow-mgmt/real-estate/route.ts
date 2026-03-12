import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// District name → code mapping
const DISTRICT_CODES: Record<string, string> = {
  '강남구': '11680', '서초구': '11650', '송파구': '11710',
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
  const cutoffDate = period === 'all'
    ? '2020-01-01'
    : new Date(now.getFullYear(), now.getMonth() - parseInt(period), 1).toISOString().slice(0, 10)

  // District codes for filtering
  const districtCodes = districts.length > 0
    ? districts.map(d => DISTRICT_CODES[d]).filter(Boolean)
    : Object.values(DISTRICT_CODES)

  // Resolve complex IDs → names (only when specific complexes selected)
  let complexNames: string[] | null = null
  if (complexIds.length > 0) {
    const { data } = await supabase.from('re_complexes').select('name').in('id', complexIds)
    complexNames = data?.map(c => c.name) || []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (query: any, table: 'trades' | 'rentals') => {
    query = query.in('district_code', districtCodes)
    if (complexNames) query = query.in('complex_name', complexNames)
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
      const { data: complexes } = await supabase
        .from('re_complexes').select('id, district_name').eq('is_tracked', true)
      const complexCount = complexes?.length || 0
      const districtSet = new Set(complexes?.map(c => c.district_name))

      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)

      // Fetch trades & rentals with district_code filter (not 552 names)
      const { data: recentTrades } = await applyFilters(
        supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong').gte('deal_date', threeMonthsAgo),
        'trades'
      ).limit(5000) as { data: any[] | null }

      const { data: recentRentals } = await applyFilters(
        supabase.from('re_rentals').select('complex_name, deposit, area_pyeong').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세'),
        'rentals'
      ).limit(10000) as { data: any[] | null }

      // Jeonse ratio
      const tradePrices: Record<string, number[]> = {}
      for (const t of recentTrades || []) {
        if (!tradePrices[t.complex_name]) tradePrices[t.complex_name] = []
        tradePrices[t.complex_name].push(Number(t.deal_amount))
      }
      const rentalPrices: Record<string, number[]> = {}
      for (const r of recentRentals || []) {
        if (!rentalPrices[r.complex_name]) rentalPrices[r.complex_name] = []
        rentalPrices[r.complex_name].push(Number(r.deposit))
      }

      const median = (arr: number[]) => {
        const sorted = [...arr].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      }

      const jeonseRatios: number[] = []
      for (const name of Object.keys(tradePrices)) {
        if (rentalPrices[name]?.length) {
          const medTrade = median(tradePrices[name])
          const medRental = median(rentalPrices[name])
          if (medTrade > 0) jeonseRatios.push((medRental / medTrade) * 100)
        }
      }
      const avgJeonseRatio = jeonseRatios.length > 0
        ? jeonseRatios.reduce((s, v) => s + v, 0) / jeonseRatios.length : 0

      // Listing gaps
      let listingsQ = supabase.from('re_naver_listings').select('complex_name, trade_type, price, area_exclusive_sqm')
      if (districts.length > 0) listingsQ = listingsQ.in('district_name', districts)
      const { data: listings } = await listingsQ

      const listingMap: Record<string, { trade: number[]; jeonse: number[] }> = {}
      for (const l of listings || []) {
        const pyeong = Number(l.area_exclusive_sqm) / 3.3058
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

      return NextResponse.json({
        summary: {
          trackedComplexes: complexCount,
          districtCount: districtSet.size,
          avgJeonseRatio: Math.round(avgJeonseRatio * 10) / 10,
          tradeListingGap: tradeGaps.length ? Math.round(tradeGaps.reduce((s, v) => s + v, 0) / tradeGaps.length * 10) / 10 : 0,
          jeonseListingGap: jeonseGaps.length ? Math.round(jeonseGaps.reduce((s, v) => s + v, 0) / jeonseGaps.length * 10) / 10 : 0,
        }
      })
    }

    if (type === 'trades') {
      const { data, error } = await applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong, price_per_pyeong').gte('deal_date', cutoffDate).order('deal_date'),
        'trades'
      ).limit(10000)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Aggregate by month. If no specific complexes selected, aggregate by district average
      const useDistrict = !complexNames
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}
      // Track per-complex total count for top N selection
      const complexTotals: Record<string, number> = {}

      for (const t of data || []) {
        const month = t.deal_date.slice(0, 7)
        const ppp = Number(t.price_per_pyeong) || (Number(t.area_pyeong) > 0 ? Number(t.deal_amount) / Number(t.area_pyeong) : 0)
        if (ppp <= 0) continue

        if (useDistrict) {
          // Aggregate as "전체" average
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
      const keys: string[] = useDistrict
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
      const { data, error } = await applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong').gte('deal_date', cutoffDate).eq('rent_type', '전세').order('deal_date'),
        'rentals'
      ).limit(20000)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const useDistrict = !complexNames
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}

      for (const r of data || []) {
        const month = r.deal_date.slice(0, 7)
        const pyeong = Number(r.area_pyeong)
        const ppp = pyeong > 0 ? Number(r.deposit) / pyeong : 0
        if (ppp <= 0) continue
        const key = useDistrict ? '전체' : r.complex_name
        if (!monthly[month]) monthly[month] = {}
        if (!monthly[month][key]) monthly[month][key] = { sum: 0, count: 0 }
        monthly[month][key].sum += ppp
        monthly[month][key].count += 1
      }

      const months = Object.keys(monthly).sort()
      const keys: string[] = useDistrict ? ['전체'] : ([...new Set((data || []).map((r: any) => r.complex_name))] as string[]).sort()
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

      // Fetch listings
      let listingsQ = supabase.from('re_naver_listings').select('*').eq('trade_type', tradeType)
      if (districts.length > 0) listingsQ = listingsQ.in('district_name', districts)
      const { data: listings } = await listingsQ

      // Filter listings by area range
      const filteredListings = areaRange
        ? (listings || []).filter(l => {
            const py = Number(l.area_exclusive_sqm) / 3.3058
            if (areaRange === '20') return py >= 20 && py < 30
            if (areaRange === '30') return py >= 30 && py < 40
            if (areaRange === '40+') return py >= 40
            return true
          })
        : (listings || [])

      // Get listing complex names, then fetch actuals only for those
      const listingComplexNames = [...new Set(filteredListings.map(l => l.complex_name))]

      // Fetch actual prices using district_code (not 552 names)
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
      let actualQ = tradeType === '매매'
        ? supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong, price_per_pyeong').gte('deal_date', threeMonthsAgo).eq('cancel_yn', 'N').in('district_code', districtCodes)
        : supabase.from('re_rentals').select('complex_name, deposit, area_pyeong').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세').in('district_code', districtCodes)

      if (areaRange === '20') actualQ = actualQ.gte('area_pyeong', 20).lt('area_pyeong', 30)
      else if (areaRange === '30') actualQ = actualQ.gte('area_pyeong', 30).lt('area_pyeong', 40)
      else if (areaRange === '40+') actualQ = actualQ.gte('area_pyeong', 40)

      const { data: actuals } = await actualQ.limit(5000) as { data: any[] | null }

      // Build per-complex comparison
      const complexMap: Record<string, {
        listingMinPpp: number | null; listingCount: number
        actualAvgPpp: number | null; actualCount: number; gap: number | null
      }> = {}

      for (const l of filteredListings) {
        const pyeong = Number(l.area_exclusive_sqm) / 3.3058
        if (pyeong <= 0) continue
        const ppp = Number(l.price) / pyeong
        if (!complexMap[l.complex_name]) complexMap[l.complex_name] = { listingMinPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
        complexMap[l.complex_name].listingCount += 1
        if (!complexMap[l.complex_name].listingMinPpp || ppp < complexMap[l.complex_name].listingMinPpp!) {
          complexMap[l.complex_name].listingMinPpp = Math.round(ppp)
        }
      }

      // Only process actuals for complexes that have listings
      for (const a of actuals || []) {
        if (!listingComplexNames.includes(a.complex_name) && !complexMap[a.complex_name]) continue
        const pyeong = Number(a.area_pyeong)
        if (pyeong <= 0) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / pyeong
        if (!complexMap[a.complex_name]) complexMap[a.complex_name] = { listingMinPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
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
      const { data: trades } = await applyFilters(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong').gte('deal_date', cutoffDate),
        'trades'
      ).limit(10000) as { data: any[] | null }

      const { data: rentals } = await applyFilters(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong').gte('deal_date', cutoffDate).eq('rent_type', '전세'),
        'rentals'
      ).limit(20000) as { data: any[] | null }

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
