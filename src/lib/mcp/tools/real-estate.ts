import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'
import {
  GAP_BACKFILL_LAG_DAYS,
  buildAreaMapping,
  buildBandFloorArea,
  computeBasketPpp,
  computeJeonseRatio,
  computeListingGap,
  fetchAll,
  gapFilingWindow,
  getFilteredActualAverage,
  getListingPyeong,
  getSupplyPyeong,
  isFiledWithin,
  shiftDays,
  supplyBand,
} from '@/lib/real-estate-metrics'

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

      // Build area mapping (exclusive → supply) for consistent PPP calculation
      const areaMap = await buildAreaMapping(supabase, complexNames)

      // 시세·괴리율 창은 대시보드와 같은 '신고일 90일'.
      const asOf = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
      const win = gapFilingWindow(asOf)

      const recentTrades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date, created_at')
          .gte('deal_date', shiftDays(win.start, GAP_BACKFILL_LAG_DAYS + 30)).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const recentRentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date, created_at')
          .gte('deal_date', shiftDays(win.start, GAP_BACKFILL_LAG_DAYS + 30)).eq('rent_type', '전세').in('complex_name', complexNames)
      )
      // 시세 바스켓의 고정 가중치 (세대수 × 공급면적)
      const { data: pyeongRows } = await supabase
        .from('re_complex_pyeongs').select('complex_name, supply_sqm, household_count')
        .in('complex_name', complexNames).gt('household_count', 0)
      // Use per-complex latest snapshot (complexes may be scraped on different dates)
      const { data: summarySnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const summarySnapDate = summarySnap?.[0]?.snapshot_date
      const summarySnapCutoff = summarySnapDate
        ? new Date(new Date(summarySnapDate).getTime() - 2 * 86400000).toISOString().slice(0, 10)
        : null
      const allSummaryListings = summarySnapCutoff ? await fetchAll(
        supabase.from('re_naver_listings')
          .select('complex_name, trade_type, price, area_supply_sqm, area_type, snapshot_date')
          .gte('snapshot_date', summarySnapCutoff)
          .in('complex_name', complexNames)
      ) : []
      const summaryComplexLatest: Record<string, string> = {}
      for (const l of allSummaryListings) {
        if (!summaryComplexLatest[l.complex_name] || l.snapshot_date > summaryComplexLatest[l.complex_name]) {
          summaryComplexLatest[l.complex_name] = l.snapshot_date
        }
      }
      const listings = allSummaryListings.filter(l => l.snapshot_date === summaryComplexLatest[l.complex_name])

      // 시세·괴리율 — 계산은 전부 real-estate-metrics 에 있다(대시보드와 같은 함수).
      const bandFloorArea = buildBandFloorArea(pyeongRows, py => py >= 20)
      const collectPpp = (rows: Array<Record<string, unknown>>, amountKey: string): Record<string, number[]> => {
        const out: Record<string, number[]> = {}
        for (const row of rows) {
          if (!isFiledWithin(row as { created_at?: string | null; deal_date: string }, win)) continue
          const sqm = Number(row.area_sqm)
          if (!(sqm > 0)) continue
          const supplyPy = getSupplyPyeong(areaMap, String(row.complex_name), sqm)
          if (supplyPy < 20) continue
          const amount = Number(row[amountKey])
          if (!(amount > 0)) continue
          ;(out[`${String(row.complex_name)}|${supplyBand(supplyPy)}`] ??= []).push(amount / supplyPy)
        }
        return out
      }
      const tradePppByKey = collectPpp(recentTrades as Array<Record<string, unknown>>, 'deal_amount')
      const jeonsePppByKey = collectPpp(recentRentals as Array<Record<string, unknown>>, 'deposit')
      const tradeBasket = computeBasketPpp(tradePppByKey, bandFloorArea)
      const jeonseBasket = computeBasketPpp(jeonsePppByKey, bandFloorArea)

      /*
       * 괴리율 — 대시보드와 같은 소스·같은 함수를 쓴다.
       *
       * 예전엔 여기만 re_naver_listings 원본을 직접 읽고, 이상치 필터 없이 단순 평균을 내고,
       * 짝을 건수로 가중하지 않았다. 그래서 봇이 화면과 다른 숫자를 말했다. 호가는 화면과 같은
       * re_listing_daily_summary(밴드별 최저 평당호가), 실거래는 위에서 만든 신고일 90일 창을
       * 그대로 쓰고, 계산은 computeListingGap 하나로 모은다.
       */
      const gapSnapDate = async (tradeType: string): Promise<string | undefined> => {
        const { data } = await supabase.from('re_listing_daily_summary').select('snapshot_date')
          .eq('trade_type', tradeType).in('complex_name', complexNames)
          .order('snapshot_date', { ascending: false }).limit(1)
        return data?.[0]?.snapshot_date
      }
      const gapListings = async (tradeType: string): Promise<Record<string, number>> => {
        const snapDate = await gapSnapDate(tradeType)
        if (!snapDate) return {}
        const { data } = await supabase.from('re_listing_daily_summary')
          .select('complex_name, area_band, min_ppp')
          .eq('snapshot_date', snapDate).eq('trade_type', tradeType)
          .in('complex_name', complexNames).gte('area_band', 20)
        const out: Record<string, number> = {}
        for (const row of data ?? []) {
          const key = `${row.complex_name}|${row.area_band}`
          if (out[key] === undefined || row.min_ppp < out[key]) out[key] = row.min_ppp
        }
        return out
      }
      const [tradeListingByKey, jeonseListingByKey] = await Promise.all([
        gapListings('매매'), gapListings('전세'),
      ])
      const tradeGap = computeListingGap(tradeListingByKey, tradePppByKey)
      const jeonseGap = computeListingGap(jeonseListingByKey, jeonsePppByKey)

      const summary = {
        trackedComplexes: complexNames.length,
        districts: [...new Set(trackedData?.map(c => c.district_name))],
        avgTradePpp: tradeBasket.ppp,
        avgJeonsePpp: jeonseBasket.ppp,
        tradePppCoverage: tradeBasket.coverage,
        jeonsePppCoverage: jeonseBasket.coverage,
        tradeListingGap: tradeGap.gap ?? 0,
        jeonseListingGap: jeonseGap.gap ?? 0,
        tradeGapPairs: tradeGap.pairs,
        tradeGapDeals: tradeGap.deals,
        jeonseGapPairs: jeonseGap.pairs,
        jeonseGapDeals: jeonseGap.deals,
        window: { start: win.start, end: win.end, basis: 'filed' },
        basis: '시세=(단지×평형밴드) 평당가 중앙값을 총 공급면적으로 가중한 고정 바스켓. 괴리율=밴드별 최저 평당호가 vs 같은 밴드 실거래 평당가, 실거래 건수 가중. 둘 다 신고일 최근 90일. 대시보드와 같은 계산(real-estate-metrics).',
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
    description: '[부동산] 매매 실거래가 추이를 조회합니다 (월별 공급면적 기준 평당가)',
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
    description: '[부동산] 전세 실거래가 추이를 조회합니다 (월별 공급면적 기준 평당 보증금)',
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

      // Build area mapping (exclusive → supply) for consistent PPP calculation
      const areaMap = await buildAreaMapping(supabase, complexNames)

      // Use per-complex latest snapshot (complexes may be scraped on different dates)
      const { data: latestSnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .in('complex_name', complexNames)
        .order('snapshot_date', { ascending: false }).limit(1)
      const latestSnapshotDate = latestSnap?.[0]?.snapshot_date
      // Fetch latest 2 days to cover complexes scraped on different dates
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
      // Keep only each complex's latest snapshot
      const complexLatest: Record<string, string> = {}
      for (const l of allListings) {
        if (!complexLatest[l.complex_name] || l.snapshot_date > complexLatest[l.complex_name]) {
          complexLatest[l.complex_name] = l.snapshot_date
        }
      }
      const listings = allListings.filter(l => l.snapshot_date === complexLatest[l.complex_name])

      // 실거래 창은 대시보드와 같은 '신고일 90일' (real-estate-metrics.gapFilingWindow).
      const gapWin = gapFilingWindow(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10))
      const fetchFrom = shiftDays(gapWin.start, GAP_BACKFILL_LAG_DAYS + 30)
      const allActuals = tradeType === '매매'
        ? await fetchAll(supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date, created_at').gte('deal_date', fetchFrom).eq('cancel_yn', 'N').in('complex_name', complexNames))
        : await fetchAll(supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date, created_at').gte('deal_date', fetchFrom).eq('rent_type', '전세').in('complex_name', complexNames))
      const actuals = allActuals.filter(a => isFiledWithin(a, gapWin))

      // Group by complex + area band (matching dashboard)
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
        const band = supplyBand(py)
        const key = `${l.complex_name}|${band}`
        if (!rowMap[key]) rowMap[key] = { complexName: l.complex_name, areaBand: band, listingMinPpp: Infinity, listingMaxPpp: 0, listingCount: 0, actualAvgPpp: 0, actualCount: 0 }
        if (!listingPpps[key]) listingPpps[key] = []
        listingPpps[key].push(ppp)
        const r = rowMap[key]
        r.listingCount++
        r.listingMaxPpp = Math.max(r.listingMaxPpp, ppp)
      }

      // listingMinPpp = P10 (10th percentile) to avoid single-listing outlier skew
      for (const [key, ppps] of Object.entries(listingPpps)) {
        const sorted = [...ppps].sort((a, b) => a - b)
        const p10Idx = Math.floor(sorted.length * 0.1)
        rowMap[key].listingMinPpp = sorted[p10Idx]
      }

      // Collect all actual trade PPPs per key first
      const actualPpps: Record<RowKey, number[]> = {}
      for (const a of actuals) {
        const sqm = Number(a.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMap, a.complex_name, sqm)
        if (supplyPy < 20) continue
        const band = supplyBand(supplyPy)
        const key = `${a.complex_name}|${band}`
        if (!rowMap[key]) continue
        const price = tradeType === '매매' ? Number(a.deal_amount) : Number(a.deposit)
        const ppp = price / supplyPy
        if (!actualPpps[key]) actualPpps[key] = []
        actualPpps[key].push(ppp)
      }

      // 이상치 제거는 화면과 같은 함수(getFilteredActualAverage) — 중앙값에서 50% 초과
      // 이탈, 그리고 최저 호가의 절반 미만을 버린다.
      for (const [key, ppps] of Object.entries(actualPpps)) {
        const r = rowMap[key]
        const actual = getFilteredActualAverage(ppps, r.listingMinPpp !== Infinity ? r.listingMinPpp : null)
        if (!actual) continue
        r.actualAvgPpp = actual.avg
        r.actualCount = actual.count
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

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_listing_gap', inputParams: { trade_type } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        tradeType, unit: '만원/평',
        window: { start: gapWin.start, end: gapWin.end, basis: 'filed' },
        note: '단지×평형밴드 분해표. listingMinPpp 는 현재 매물 평당호가의 P10 이라, 밴드별 최저가(re_listing_daily_summary)를 쓰는 화면의 합계 괴리율과 행별 값이 정확히 같지는 않다. 합계는 re_get_summary 를 쓸 것.',
        rows,
      }, null, 2) }] }
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

      // Use only the latest snapshot
      const { data: listSnap } = await supabase
        .from('re_naver_listings').select('snapshot_date')
        .eq('complex_name', complex_name)
        .order('snapshot_date', { ascending: false }).limit(1)
      const listSnapDate = listSnap?.[0]?.snapshot_date

      let query = supabase
        .from('re_naver_listings')
        .select('article_no, complex_name, trade_type, price, monthly_rent, area_type, area_supply_sqm, area_exclusive_sqm, floor_info, direction, confirm_date, description, realtor_name')
        .eq('complex_name', complex_name)
        .eq('trade_type', tradeType)
      if (listSnapDate) query = query.eq('snapshot_date', listSnapDate)
      const { data, error: dbError } = await query
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

      // 계산은 대시보드 jeonse-ratio 라우트와 같은 함수(computeJeonseRatio)를 쓴다.
      // 밴드도 대시보드처럼 **공급 평** 기준이라야 화면과 같은 답이 나온다 — 예전엔 여기만
      // 전용 평으로 나눠서 짝이 다르게 묶였다.
      const areaMap = await buildAreaMapping(supabase, complexNames)
      const trades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_sqm')
          .gte('deal_date', cutoffDate).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const rentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_sqm')
          .gte('deal_date', cutoffDate).eq('rent_type', '전세').in('complex_name', complexNames)
      )

      // month → "단지|밴드" → 평당가 목록
      type Buckets = Record<string, Record<string, number[]>>
      const bucket = (rows: Array<Record<string, unknown>>, amountKey: string): Buckets => {
        const out: Buckets = {}
        for (const row of rows) {
          const sqm = Number(row.area_sqm)
          if (!(sqm > 0)) continue
          const name = String(row.complex_name)
          const supplyPy = getSupplyPyeong(areaMap, name, sqm)
          if (supplyPy < 20) continue
          const amount = Number(row[amountKey])
          if (!(amount > 0)) continue
          const month = String(row.deal_date).slice(0, 7)
          ;((out[month] ??= {})[`${name}|${supplyBand(supplyPy)}`] ??= []).push(amount / supplyPy)
        }
        return out
      }

      const tradeMonthly = bucket(trades as Array<Record<string, unknown>>, 'deal_amount')
      const rentalMonthly = bucket(rentals as Array<Record<string, unknown>>, 'deposit')

      // 실거래 신고 지연 때문에 이번 달·지난달은 아직 채워지는 중이다. 봇이 "8월에 올랐다"고
      // 단정하지 않도록 건수와 함께 표시를 준다.
      const nowKst = new Date(Date.now() + 9 * 3600_000)
      const curMonth = nowKst.toISOString().slice(0, 7)
      const prevMonth = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)

      const allMonths = [...new Set([...Object.keys(tradeMonthly), ...Object.keys(rentalMonthly)])].sort()
      const trend = allMonths.map(month => {
        const r = computeJeonseRatio(tradeMonthly[month] || {}, rentalMonthly[month] || {})
        if (r.ratio === null) return null
        return {
          month,
          ratio: r.ratio,
          trades: r.trades,
          jeonse: r.jeonse,
          pairs: r.pairs,
          provisional: month === curMonth || month === prevMonth,
        }
      }).filter(Boolean)

      await logMcpAction({ userId: user!.userId, action: 'tool_call', toolName: 're_get_jeonse_ratio', inputParams: { months } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        unit: '%',
        method: '(단지 × 10평 밴드) 평당가 중앙값 비교, 짝 가중치 = min(매매건수, 전세건수)',
        note: 'provisional=true 인 달은 실거래 신고 지연(평균 17~19일)으로 표본이 아직 채워지는 중이라 추세로 읽지 말 것',
        trend,
      }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })
}
