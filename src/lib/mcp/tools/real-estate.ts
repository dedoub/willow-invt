import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

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

function getListingPyeong(l: { area_exclusive_sqm?: any; area_type?: any }): number {
  const exclusive = Number(l.area_exclusive_sqm)
  if (exclusive > 0) return exclusive / 3.3058
  const supply = parseFloat(l.area_type || '0')
  if (supply > 0) return (supply * 0.78) / 3.3058
  return 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authGuard(toolName: string, authInfo: any) {
  const user = getUserFromAuthInfo(authInfo)
  if (!user) return { user: null, error: { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true as const } }
  const perm = checkToolPermission(toolName, user, authInfo?.scopes || [])
  if (!perm.allowed) return { user: null, error: { content: [{ type: 'text' as const, text: perm.reason! }], isError: true as const } }
  return { user, error: null }
}

export function registerRealEstateTools(server: McpServer) {
  const supabase = getServiceSupabase()

  // =============================================
  // 추적 단지 목록
  // =============================================
  server.registerTool('re_list_complexes', {
    description: '[부동산] 추적 중인 아파트 단지 목록을 조회합니다 (13개 주요 단지)',
    inputSchema: z.object({
      district: z.string().optional().describe('구 필터 (강남구, 서초구, 송파구)'),
    }),
  }, async ({ district }, { authInfo }) => {
    const { user, error } = authGuard('re_list_complexes', authInfo)
    if (error) return error

    try {
      let query = supabase
        .from('re_complexes')
        .select('id, name, district_name, dong_name, total_units, build_year')
        .eq('is_tracked', true)
        .order('district_name').order('name')
      if (district) query = query.eq('district_name', district)
      const { data, error: dbError } = await query
      if (dbError) return { content: [{ type: 'text' as const, text: `Error: ${dbError.message}` }], isError: true }

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_list_complexes', inputParams: { district } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data || [], null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 부동산 시장 요약
  // =============================================
  server.registerTool('re_get_summary', {
    description: '[부동산] 추적 단지의 시장 요약을 조회합니다 (평균 매매/전세 평당가, 호가 괴리율)',
    inputSchema: z.object({
      district: z.string().optional().describe('구 필터 (강남구, 서초구, 송파구)'),
    }),
  }, async ({ district }, { authInfo }) => {
    const { user, error } = authGuard('re_get_summary', authInfo)
    if (error) return error

    try {
      let trackedQuery = supabase.from('re_complexes').select('name, district_name').eq('is_tracked', true)
      if (district) trackedQuery = trackedQuery.eq('district_name', district)
      const { data: trackedData } = await trackedQuery
      const complexNames = trackedData?.map(c => c.name) || []
      if (complexNames.length === 0) return { content: [{ type: 'text' as const, text: '추적 단지가 없습니다.' }] }

      const now = new Date()
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)

      const recentTrades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong')
          .gte('deal_date', threeMonthsAgo).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const recentRentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deposit, area_pyeong')
          .gte('deal_date', threeMonthsAgo).eq('rent_type', '전세').in('complex_name', complexNames)
      )
      const listings = await fetchAll(
        supabase.from('re_naver_listings')
          .select('complex_name, trade_type, price, area_exclusive_sqm, area_type')
          .in('complex_name', complexNames)
      )

      // Compute PPP averages
      let tradePppSum = 0, tradePppCount = 0
      for (const t of recentTrades) {
        const py = Number(t.area_pyeong)
        if (py > 0) { tradePppSum += Number(t.deal_amount) / py; tradePppCount++ }
      }
      let jeonsePppSum = 0, jeonsePppCount = 0
      for (const r of recentRentals) {
        const py = Number(r.area_pyeong)
        if (py > 0) { jeonsePppSum += Number(r.deposit) / py; jeonsePppCount++ }
      }

      // Listing gaps
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
          const actual = recentTrades.filter(t => t.complex_name === name && Number(t.area_pyeong) > 0)
          if (actual.length > 0) {
            const avgPpp = actual.reduce((s, t) => s + Number(t.deal_amount) / Number(t.area_pyeong), 0) / actual.length
            if (avgPpp > 0) tradeGaps.push(((minListing - avgPpp) / avgPpp) * 100)
          }
        }
        if (li.jeonse.length > 0) {
          const minListing = Math.min(...li.jeonse)
          const actual = recentRentals.filter(r => r.complex_name === name && Number(r.area_pyeong) > 0)
          if (actual.length > 0) {
            const avgPpp = actual.reduce((s, r) => s + Number(r.deposit) / Number(r.area_pyeong), 0) / actual.length
            if (avgPpp > 0) jeonseGaps.push(((minListing - avgPpp) / avgPpp) * 100)
          }
        }
      }

      const summary = {
        trackedComplexes: complexNames.length,
        districts: [...new Set(trackedData?.map(c => c.district_name))],
        avgTradePpp: tradePppCount > 0 ? Math.round(tradePppSum / tradePppCount) : 0,
        avgJeonsePpp: jeonsePppCount > 0 ? Math.round(jeonsePppSum / jeonsePppCount) : 0,
        tradeListingGap: tradeGaps.length ? Math.round(tradeGaps.reduce((s, v) => s + v, 0) / tradeGaps.length * 10) / 10 : 0,
        jeonseListingGap: jeonseGaps.length ? Math.round(jeonseGaps.reduce((s, v) => s + v, 0) / jeonseGaps.length * 10) / 10 : 0,
        totalTradeListings: listings.filter(l => l.trade_type === '매매').length,
        totalJeonseListings: listings.filter(l => l.trade_type === '전세').length,
        unit: '만원/평',
      }

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_summary', inputParams: { district } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 실거래가 추이
  // =============================================
  server.registerTool('re_get_trade_trends', {
    description: '[부동산] 매매 실거래가 추이를 조회합니다 (월별 평당가)',
    inputSchema: z.object({
      complex_name: z.string().optional().describe('단지명 (미지정 시 추적 전체 평균)'),
      months: z.number().optional().describe('조회 기간 (개월, 기본: 12)'),
    }),
  }, async ({ complex_name, months }, { authInfo }) => {
    const { user, error } = authGuard('re_get_trade_trends', authInfo)
    if (error) return error

    try {
      const period = months || 12
      const now = new Date()
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

      let complexNames: string[]
      if (complex_name) {
        complexNames = [complex_name]
      } else {
        const { data } = await supabase.from('re_complexes').select('name').eq('is_tracked', true)
        complexNames = data?.map(c => c.name) || []
      }

      const trades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong, price_per_pyeong')
          .gte('deal_date', cutoffDate).eq('cancel_yn', 'N').in('complex_name', complexNames).order('deal_date')
      )

      const monthly: Record<string, { sum: number; count: number }> = {}
      for (const t of trades) {
        const month = t.deal_date.slice(0, 7)
        const ppp = Number(t.price_per_pyeong) || (Number(t.area_pyeong) > 0 ? Number(t.deal_amount) / Number(t.area_pyeong) : 0)
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

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_trade_trends', inputParams: { complex_name, months } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ complexNames, unit: '만원/평', trend }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 전세 실거래가 추이
  // =============================================
  server.registerTool('re_get_rental_trends', {
    description: '[부동산] 전세 실거래가 추이를 조회합니다 (월별 평당 보증금)',
    inputSchema: z.object({
      complex_name: z.string().optional().describe('단지명 (미지정 시 추적 전체 평균)'),
      months: z.number().optional().describe('조회 기간 (개월, 기본: 12)'),
    }),
  }, async ({ complex_name, months }, { authInfo }) => {
    const { user, error } = authGuard('re_get_rental_trends', authInfo)
    if (error) return error

    try {
      const period = months || 12
      const now = new Date()
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

      let complexNames: string[]
      if (complex_name) {
        complexNames = [complex_name]
      } else {
        const { data } = await supabase.from('re_complexes').select('name').eq('is_tracked', true)
        complexNames = data?.map(c => c.name) || []
      }

      const rentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong')
          .gte('deal_date', cutoffDate).eq('rent_type', '전세').in('complex_name', complexNames).order('deal_date')
      )

      const monthly: Record<string, { sum: number; count: number }> = {}
      for (const r of rentals) {
        const month = r.deal_date.slice(0, 7)
        const pyeong = Number(r.area_pyeong)
        const ppp = pyeong > 0 ? Number(r.deposit) / pyeong : 0
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

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_rental_trends', inputParams: { complex_name, months } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ complexNames, unit: '만원/평', trend }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 호가 vs 실거래가 비교
  // =============================================
  server.registerTool('re_get_listing_gap', {
    description: '[부동산] 네이버 매물 호가와 실거래가의 괴리율을 단지별로 비교합니다',
    inputSchema: z.object({
      trade_type: z.enum(['매매', '전세']).optional().describe('거래유형 (기본: 매매)'),
    }),
  }, async ({ trade_type }, { authInfo }) => {
    const { user, error } = authGuard('re_get_listing_gap', authInfo)
    if (error) return error

    try {
      const tradeType = trade_type || '매매'
      const { data: trackedData } = await supabase.from('re_complexes').select('name').eq('is_tracked', true)
      const complexNames = trackedData?.map(c => c.name) || []

      const listings = await fetchAll(
        supabase.from('re_naver_listings')
          .select('complex_name, trade_type, price, area_exclusive_sqm, area_type')
          .eq('trade_type', tradeType).in('complex_name', complexNames)
      )

      const now = new Date()
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
      const actuals = tradeType === '매매'
        ? await fetchAll(supabase.from('re_trades').select('complex_name, deal_amount, area_pyeong').gte('deal_date', threeMonthsAgo).eq('cancel_yn', 'N').in('complex_name', complexNames))
        : await fetchAll(supabase.from('re_rentals').select('complex_name, deposit, area_pyeong').gte('deal_date', threeMonthsAgo).eq('rent_type', '전세').in('complex_name', complexNames))

      const complexMap: Record<string, { listingMinPpp: number; listingMaxPpp: number; listingCount: number; actualAvgPpp: number; actualCount: number }> = {}

      for (const l of listings) {
        const pyeong = getListingPyeong(l)
        if (pyeong <= 0) continue
        const ppp = Number(l.price) / pyeong
        if (!complexMap[l.complex_name]) complexMap[l.complex_name] = { listingMinPpp: Infinity, listingMaxPpp: 0, listingCount: 0, actualAvgPpp: 0, actualCount: 0 }
        complexMap[l.complex_name].listingCount++
        complexMap[l.complex_name].listingMinPpp = Math.min(complexMap[l.complex_name].listingMinPpp, ppp)
        complexMap[l.complex_name].listingMaxPpp = Math.max(complexMap[l.complex_name].listingMaxPpp, ppp)
      }

      for (const a of actuals) {
        const pyeong = Number(a.area_pyeong)
        if (pyeong <= 0) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / pyeong
        if (!complexMap[a.complex_name]) continue
        const c = complexMap[a.complex_name]
        c.actualAvgPpp = (c.actualAvgPpp * c.actualCount + ppp) / (c.actualCount + 1)
        c.actualCount++
      }

      const rows = Object.entries(complexMap)
        .filter(([, v]) => v.actualCount > 0 && v.listingCount > 0)
        .map(([name, v]) => ({
          complexName: name,
          actualAvgPpp: Math.round(v.actualAvgPpp),
          listingMinPpp: Math.round(v.listingMinPpp),
          listingMaxPpp: Math.round(v.listingMaxPpp),
          listingCount: v.listingCount,
          gap: Math.round(((v.listingMinPpp - v.actualAvgPpp) / v.actualAvgPpp) * 1000) / 10,
        }))
        .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_listing_gap', inputParams: { trade_type } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tradeType, unit: '만원/평', rows }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 네이버 매물 목록
  // =============================================
  server.registerTool('re_list_listings', {
    description: '[부동산] 네이버 부동산 매물 목록을 조회합니다 (호가, 면적, 층수 등)',
    inputSchema: z.object({
      complex_name: z.string().describe('단지명'),
      trade_type: z.enum(['매매', '전세']).optional().describe('거래유형 (기본: 매매)'),
      limit: z.number().optional().describe('최대 건수 (기본: 50)'),
    }),
  }, async ({ complex_name, trade_type, limit }, { authInfo }) => {
    const { user, error } = authGuard('re_list_listings', authInfo)
    if (error) return error

    try {
      const tradeType = trade_type || '매매'
      const maxItems = Math.min(limit || 50, 200)

      const { data, error: dbError } = await supabase
        .from('re_naver_listings')
        .select('article_no, complex_name, trade_type, price, monthly_rent, area_type, area_exclusive_sqm, floor_info, direction, confirm_date, description, realtor_name')
        .eq('complex_name', complex_name)
        .eq('trade_type', tradeType)
        .order('price', { ascending: true })
        .limit(maxItems)

      if (dbError) return { content: [{ type: 'text' as const, text: `Error: ${dbError.message}` }], isError: true }

      const items = (data || []).map(l => {
        const pyeong = getListingPyeong(l)
        return {
          ...l,
          pyeong: pyeong > 0 ? Math.round(pyeong * 10) / 10 : null,
          ppp: pyeong > 0 ? Math.round(Number(l.price) / pyeong) : null,
        }
      })

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_list_listings', inputParams: { complex_name, trade_type, limit } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ total: items.length, unit: '만원', listings: items }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 전세가율 추이
  // =============================================
  server.registerTool('re_get_jeonse_ratio', {
    description: '[부동산] 전세가율(전세/매매 비율) 추이를 조회합니다',
    inputSchema: z.object({
      months: z.number().optional().describe('조회 기간 (개월, 기본: 12)'),
    }),
  }, async ({ months }, { authInfo }) => {
    const { user, error } = authGuard('re_get_jeonse_ratio', authInfo)
    if (error) return error

    try {
      const period = months || 12
      const now = new Date()
      const cutoffDate = new Date(now.getFullYear(), now.getMonth() - period + 1, 1).toISOString().slice(0, 10)

      const { data: trackedData } = await supabase.from('re_complexes').select('name').eq('is_tracked', true)
      const complexNames = trackedData?.map(c => c.name) || []

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

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_jeonse_ratio', inputParams: { months } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ unit: '%', trend }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })
}
