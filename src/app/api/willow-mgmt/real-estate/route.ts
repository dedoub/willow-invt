import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - Real estate data queries
// ?type=summary|complexes|trades|rentals|listings|jeonse-ratio
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'summary'
  const districts = searchParams.get('districts') // comma-separated district names
  const complexIds = searchParams.get('complexIds') // comma-separated complex IDs
  const areaRange = searchParams.get('areaRange') // '20' | '30' | '40+'
  const period = searchParams.get('period') || '12' // months
  const rentType = searchParams.get('rentType') // '전세' | '월세'

  const supabase = getServiceSupabase()

  // Compute date cutoff
  const now = new Date()
  const cutoffDate = period === 'all'
    ? '2020-01-01'
    : new Date(now.getFullYear(), now.getMonth() - parseInt(period), 1).toISOString().slice(0, 10)

  // Area range filter helper (pyeong)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaFilter = (query: any) => {
    if (!areaRange) return query
    if (areaRange === '20') return query.gte('area_pyeong', 20).lt('area_pyeong', 30)
    if (areaRange === '30') return query.gte('area_pyeong', 30).lt('area_pyeong', 40)
    if (areaRange === '40+') return query.gte('area_pyeong', 40)
    return query
  }

  try {
    if (type === 'complexes') {
      // Return tracked complexes with district info
      let query = supabase
        .from('re_complexes')
        .select('id, name, district_name, dong_name, total_units, build_year, is_tracked')
        .eq('is_tracked', true)
        .order('district_name')
        .order('name')

      if (districts) {
        query = query.in('district_name', districts.split(','))
      }

      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ complexes: data || [] })
    }

    if (type === 'summary') {
      // 1. Tracked complex count by district
      const { data: complexes } = await supabase
        .from('re_complexes')
        .select('id, district_name')
        .eq('is_tracked', true)

      const complexCount = complexes?.length || 0
      const districtSet = new Set(complexes?.map(c => c.district_name))

      // 2. Average jeonse ratio (latest 3 months median trade vs median jeonse per complex)
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)

      const { data: recentTrades } = await areaFilter(supabase
        .from('re_trades')
        .select('complex_name, deal_amount, area_pyeong')
        .gte('deal_date', threeMonthsAgo)
        .eq('cancel_yn', 'N')) as { data: any[] | null }

      const { data: recentRentals } = await areaFilter(supabase
        .from('re_rentals')
        .select('complex_name, deposit, area_pyeong, rent_type')
        .gte('deal_date', threeMonthsAgo)
        .eq('rent_type', '전세')) as { data: any[] | null }

      // Per-complex median prices for jeonse ratio
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
        if (rentalPrices[name] && rentalPrices[name].length > 0) {
          const medTrade = median(tradePrices[name])
          const medRental = median(rentalPrices[name])
          if (medTrade > 0) {
            jeonseRatios.push((medRental / medTrade) * 100)
          }
        }
      }
      const avgJeonseRatio = jeonseRatios.length > 0
        ? jeonseRatios.reduce((s, v) => s + v, 0) / jeonseRatios.length
        : 0

      // 3. Listing gap rates (매도/전세)
      const { data: listings } = await supabase
        .from('re_naver_listings')
        .select('complex_name, trade_type, price, area_exclusive_sqm')

      // Group listings by complex + trade_type, get min price per pyeong
      const listingMap: Record<string, { trade: number[]; jeonse: number[] }> = {}
      for (const l of listings || []) {
        const pyeong = Number(l.area_exclusive_sqm) / 3.3058
        if (pyeong <= 0) continue
        const ppp = Number(l.price) / pyeong
        if (!listingMap[l.complex_name]) listingMap[l.complex_name] = { trade: [], jeonse: [] }
        if (l.trade_type === '매매') listingMap[l.complex_name].trade.push(ppp)
        else if (l.trade_type === '전세') listingMap[l.complex_name].jeonse.push(ppp)
      }

      // Compare with recent actual trades
      const tradeGaps: number[] = []
      const jeonseGaps: number[] = []
      for (const name of Object.keys(listingMap)) {
        const li = listingMap[name]
        // Trade gap
        if (li.trade.length > 0 && tradePrices[name]?.length) {
          const minListing = Math.min(...li.trade)
          // Need per-pyeong actual trade price
          const actualTrades = (recentTrades || []).filter(t => t.complex_name === name && Number(t.area_pyeong) > 0)
          if (actualTrades.length > 0) {
            const avgActualPpp = actualTrades.reduce((s, t) => s + Number(t.deal_amount) / Number(t.area_pyeong), 0) / actualTrades.length
            if (avgActualPpp > 0) tradeGaps.push(((minListing - avgActualPpp) / avgActualPpp) * 100)
          }
        }
        // Jeonse gap
        if (li.jeonse.length > 0 && rentalPrices[name]?.length) {
          const minJeonseListing = Math.min(...li.jeonse)
          const actualRentals = (recentRentals || []).filter(r => r.complex_name === name && Number(r.area_pyeong) > 0)
          if (actualRentals.length > 0) {
            const avgActualPpp = actualRentals.reduce((s, r) => s + Number(r.deposit) / Number(r.area_pyeong), 0) / actualRentals.length
            if (avgActualPpp > 0) jeonseGaps.push(((minJeonseListing - avgActualPpp) / avgActualPpp) * 100)
          }
        }
      }

      const avgTradeGap = tradeGaps.length > 0 ? tradeGaps.reduce((s, v) => s + v, 0) / tradeGaps.length : 0
      const avgJeonseGap = jeonseGaps.length > 0 ? jeonseGaps.reduce((s, v) => s + v, 0) / jeonseGaps.length : 0

      return NextResponse.json({
        summary: {
          trackedComplexes: complexCount,
          districtCount: districtSet.size,
          avgJeonseRatio: Math.round(avgJeonseRatio * 10) / 10,
          tradeListingGap: Math.round(avgTradeGap * 10) / 10,
          jeonseListingGap: Math.round(avgJeonseGap * 10) / 10,
        }
      })
    }

    if (type === 'trades') {
      // Monthly trade price trends per complex
      let query = supabase
        .from('re_trades')
        .select('complex_name, deal_date, deal_amount, area_pyeong, price_per_pyeong')
        .gte('deal_date', cutoffDate)
        .eq('cancel_yn', 'N')
        .order('deal_date')

      if (districts) {
        const { data: dcomplexes } = await supabase
          .from('re_complexes')
          .select('name')
          .in('district_name', districts.split(','))
          .eq('is_tracked', true)
        if (dcomplexes?.length) {
          query = query.in('complex_name', dcomplexes.map(c => c.name))
        }
      }
      if (complexIds) {
        const { data: selectedComplexes } = await supabase
          .from('re_complexes')
          .select('name')
          .in('id', complexIds.split(','))
        if (selectedComplexes?.length) {
          query = query.in('complex_name', selectedComplexes.map(c => c.name))
        }
      }

      query = areaFilter(query)

      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Aggregate by month + complex
      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}
      for (const t of data || []) {
        const month = t.deal_date.slice(0, 7) // YYYY-MM
        const ppp = Number(t.price_per_pyeong) || (Number(t.area_pyeong) > 0 ? Number(t.deal_amount) / Number(t.area_pyeong) : 0)
        if (ppp <= 0) continue
        if (!monthly[month]) monthly[month] = {}
        if (!monthly[month][t.complex_name]) monthly[month][t.complex_name] = { sum: 0, count: 0 }
        monthly[month][t.complex_name].sum += ppp
        monthly[month][t.complex_name].count += 1
      }

      // Format: { months: string[], complexes: { name, data: { month, avgPpp, count }[] }[] }
      const months = Object.keys(monthly).sort()
      const complexNames = [...new Set((data || []).map(t => t.complex_name))].sort()
      const complexData = complexNames.map(name => ({
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
      let query = supabase
        .from('re_rentals')
        .select('complex_name, deal_date, deposit, monthly_rent, area_pyeong, rent_type')
        .gte('deal_date', cutoffDate)
        .order('deal_date')

      if (rentType) {
        query = query.eq('rent_type', rentType)
      } else {
        query = query.eq('rent_type', '전세')
      }

      if (districts) {
        const { data: dcomplexes } = await supabase
          .from('re_complexes')
          .select('name')
          .in('district_name', districts.split(','))
          .eq('is_tracked', true)
        if (dcomplexes?.length) {
          query = query.in('complex_name', dcomplexes.map(c => c.name))
        }
      }
      if (complexIds) {
        const { data: selectedComplexes } = await supabase
          .from('re_complexes')
          .select('name')
          .in('id', complexIds.split(','))
        if (selectedComplexes?.length) {
          query = query.in('complex_name', selectedComplexes.map(c => c.name))
        }
      }

      query = areaFilter(query)

      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const monthly: Record<string, Record<string, { sum: number; count: number }>> = {}
      for (const r of data || []) {
        const month = r.deal_date.slice(0, 7)
        const pyeong = Number(r.area_pyeong)
        const depositPpp = pyeong > 0 ? Number(r.deposit) / pyeong : 0
        if (depositPpp <= 0) continue
        if (!monthly[month]) monthly[month] = {}
        if (!monthly[month][r.complex_name]) monthly[month][r.complex_name] = { sum: 0, count: 0 }
        monthly[month][r.complex_name].sum += depositPpp
        monthly[month][r.complex_name].count += 1
      }

      const months = Object.keys(monthly).sort()
      const complexNames = [...new Set((data || []).map(r => r.complex_name))].sort()
      const complexData = complexNames.map(name => ({
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
      // Current listings vs recent actual prices per complex
      const tradeType = searchParams.get('tradeType') || '매매' // '매매' | '전세'

      let listingsQuery = supabase
        .from('re_naver_listings')
        .select('*')
        .eq('trade_type', tradeType)
      if (districts) {
        listingsQuery = listingsQuery.in('district_name', districts.split(','))
      }
      const { data: listings } = await listingsQuery

      // Get recent actual prices (last 3 months)
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)

      let actualQuery = tradeType === '매매'
        ? supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong, deal_date, price_per_pyeong').gte('deal_date', threeMonthsAgo).eq('cancel_yn', 'N')
        : supabase.from('re_rentals').select('complex_name, deposit, area_pyeong, deal_date').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세')

      if (districts) {
        const { data: dcomplexes } = await supabase
          .from('re_complexes')
          .select('name')
          .in('district_name', districts.split(','))
          .eq('is_tracked', true)
        if (dcomplexes?.length) {
          const names = dcomplexes.map(c => c.name)
          actualQuery = actualQuery.in('complex_name', names)
        }
      }

      actualQuery = areaFilter(actualQuery)
      const { data: actuals } = await actualQuery

      // Filter listings by area range (area_exclusive_sqm → pyeong)
      const filteredListings = areaRange
        ? (listings || []).filter(l => {
            const pyeong = Number(l.area_exclusive_sqm) / 3.3058
            if (areaRange === '20') return pyeong >= 20 && pyeong < 30
            if (areaRange === '30') return pyeong >= 30 && pyeong < 40
            if (areaRange === '40+') return pyeong >= 40
            return true
          })
        : (listings || [])

      // Build per-complex comparison
      const complexMap: Record<string, {
        listingMinPpp: number | null
        listingCount: number
        actualAvgPpp: number | null
        actualCount: number
        gap: number | null
      }> = {}

      // Listings grouped by complex
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

      // Actual prices grouped by complex
      for (const a of (actuals || []) as any[]) {
        const pyeong = Number(a.area_pyeong)
        if (pyeong <= 0) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / pyeong
        if (!complexMap[a.complex_name]) complexMap[a.complex_name] = { listingMinPpp: null, listingCount: 0, actualAvgPpp: null, actualCount: 0, gap: null }
        const c = complexMap[a.complex_name]
        c.actualAvgPpp = c.actualAvgPpp ? (c.actualAvgPpp * c.actualCount + ppp) / (c.actualCount + 1) : ppp
        c.actualCount += 1
      }

      // Calculate gaps
      for (const name of Object.keys(complexMap)) {
        const c = complexMap[name]
        if (c.listingMinPpp && c.actualAvgPpp && c.actualAvgPpp > 0) {
          c.gap = Math.round(((c.listingMinPpp - c.actualAvgPpp) / c.actualAvgPpp) * 1000) / 10
        }
        if (c.actualAvgPpp) c.actualAvgPpp = Math.round(c.actualAvgPpp)
      }

      const rows = Object.entries(complexMap)
        .filter(([, v]) => v.actualCount > 0 || v.listingCount > 0)
        .map(([name, v]) => ({ complexName: name, ...v }))
        .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))

      return NextResponse.json({ listings: rows, tradeType })
    }

    if (type === 'jeonse-ratio') {
      // Monthly jeonse ratio per complex
      const { data: trades } = await areaFilter(supabase
        .from('re_trades')
        .select('complex_name, deal_date, deal_amount, area_pyeong')
        .gte('deal_date', cutoffDate)
        .eq('cancel_yn', 'N')) as { data: any[] | null }

      const { data: rentals } = await areaFilter(supabase
        .from('re_rentals')
        .select('complex_name, deal_date, deposit, area_pyeong')
        .gte('deal_date', cutoffDate)
        .eq('rent_type', '전세')) as { data: any[] | null }

      // Aggregate median prices by month + complex
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

      // District-level averages
      const districtData: Record<string, { month: string; ratio: number }[]> = {}

      // Also per-complex if filtered
      for (const month of allMonths) {
        const tData = tradeMonthly[month] || {}
        const rData = rentalMonthly[month] || {}
        const complexNames = [...new Set([...Object.keys(tData), ...Object.keys(rData)])]

        for (const name of complexNames) {
          if (tData[name]?.length && rData[name]?.length) {
            const medTrade = median(tData[name])
            const medRental = median(rData[name])
            if (medTrade > 0) {
              const ratio = Math.round((medRental / medTrade) * 1000) / 10

              // Overall average
              if (!districtData['전체']) districtData['전체'] = []
              districtData['전체'].push({ month, ratio })
            }
          }
        }
      }

      // Compute monthly averages for 전체
      const monthlyAvg: Record<string, number[]> = {}
      for (const d of districtData['전체'] || []) {
        if (!monthlyAvg[d.month]) monthlyAvg[d.month] = []
        monthlyAvg[d.month].push(d.ratio)
      }

      const trend = allMonths.map(m => ({
        month: m,
        ratio: monthlyAvg[m]?.length ? Math.round((monthlyAvg[m].reduce((s, v) => s + v, 0) / monthlyAvg[m].length) * 10) / 10 : null,
      })).filter(d => d.ratio !== null)

      return NextResponse.json({ trend })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
