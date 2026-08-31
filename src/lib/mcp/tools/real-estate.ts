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

// Extract supply-area pyeong from listing (area1 from Naver = 공급면적)
function getListingPyeong(l: { area_supply_sqm?: any; area_type?: any }): number {
  const supply = Number(l.area_supply_sqm)
  if (supply > 0) return supply / 3.3058
  const typeNum = parseFloat(l.area_type || '0')
  if (typeNum > 0) return typeNum / 3.3058
  return 0
}

// Mapping: exclusive area (전용면적 ㎡) → supply area (공급면적 ㎡) per complex
type AreaMapping = { exclusive: number; supply: number }[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function getBand(supplyPy: number): number {
  if (supplyPy < 30) return 20
  if (supplyPy < 40) return 30
  if (supplyPy < 50) return 40
  if (supplyPy < 60) return 50
  return 60
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

      // Build area mapping (exclusive → supply) for consistent PPP calculation
      const areaMap = await buildAreaMapping(supabase, complexNames)

      // 시세 창은 대시보드와 같은 '신고일 90일'. 근거 주석은 그쪽에 있다:
      // src/app/api/willow-mgmt/real-estate/route.ts, GAP_FILING_WINDOW_DAYS.
      const shiftDays = (date: string, days: number) => {
        const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days)
        return d.toISOString().slice(0, 10)
      }
      const asOf = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
      const pppWindowStart = shiftDays(asOf, 90)
      const filingDate = (row: { created_at?: string | null; deal_date: string }) => {
        const synth = shiftDays(row.deal_date, -20)
        const created = row.created_at ? String(row.created_at).slice(0, 10) : ''
        return created && created < synth ? created : synth
      }

      const recentTrades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_amount, area_sqm, deal_date, created_at')
          .gte('deal_date', shiftDays(pppWindowStart, 50)).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const recentRentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deposit, area_sqm, deal_date, created_at')
          .gte('deal_date', shiftDays(pppWindowStart, 50)).eq('rent_type', '전세').in('complex_name', complexNames)
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

      /*
       * 평균 평당가 = 시세. 대시보드 summary 와 같은 규칙이라야 봇이 화면과 같은 숫자를 말한다.
       * (단지 × 평형밴드)별 중앙값을 총 공급면적으로 가중한 고정 바스켓. 그냥 평균 내면
       * 그 달에 어떤 평형이 팔렸는지가 값을 움직인다 — 2026-08 실측 매매 11건에 +15.8%.
       * 근거 주석은 route.ts 의 '평균 평당가 = 추적 단지의 시세 수준' 블록에 있다.
       */
      const bandFloorArea: Record<string, number> = {}
      for (const row of pyeongRows || []) {
        const supplyPy = Number(row.supply_sqm) / 3.3058
        const households = Number(row.household_count)
        if (!(supplyPy > 0) || !(households > 0) || supplyPy < 20) continue
        const k = `${row.complex_name}|${getBand(supplyPy)}`
        bandFloorArea[k] = (bandFloorArea[k] ?? 0) + supplyPy * households
      }
      const basketPpp = (rows: Array<Record<string, unknown>>, amountKey: string): number => {
        const byBand: Record<string, number[]> = {}
        for (const row of rows) {
          const filed = filingDate(row as { created_at?: string | null; deal_date: string })
          if (filed <= pppWindowStart || filed > asOf) continue
          const sqm = Number(row.area_sqm)
          if (!(sqm > 0)) continue
          const supplyPy = getSupplyPyeong(areaMap, String(row.complex_name), sqm)
          if (supplyPy <= 0 || supplyPy < 20) continue
          const amount = Number(row[amountKey])
          if (!(amount > 0)) continue
          ;(byBand[`${String(row.complex_name)}|${getBand(supplyPy)}`] ??= []).push(amount / supplyPy)
        }
        let num = 0, den = 0
        for (const [k, values] of Object.entries(byBand)) {
          const w = bandFloorArea[k]
          if (!w) continue
          const sorted = [...values].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          num += (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * w
          den += w
        }
        return den > 0 ? Math.round(num / den) : 0
      }
      const avgTradePppValue = basketPpp(recentTrades as Array<Record<string, unknown>>, 'deal_amount')
      const avgJeonsePppValue = basketPpp(recentRentals as Array<Record<string, unknown>>, 'deposit')

      // Listing gaps — grouped by complex+평형대 (matching dashboard logic)
      type BandKey = string
      const listingBands: Record<BandKey, { trade: number[]; jeonse: number[] }> = {}
      for (const l of listings) {
        const py = getListingPyeong(l)
        if (py <= 0 || py < 20) continue
        const key = `${l.complex_name}|${getBand(py)}`
        if (!listingBands[key]) listingBands[key] = { trade: [], jeonse: [] }
        const ppp = Number(l.price) / py
        if (l.trade_type === '매매') listingBands[key].trade.push(ppp)
        else if (l.trade_type === '전세') listingBands[key].jeonse.push(ppp)
      }

      // Actuals grouped by complex+band (supply-area based)
      const tradeActuals: Record<BandKey, number[]> = {}
      for (const t of recentTrades) {
        const sqm = Number(t.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMap, t.complex_name, sqm)
        if (supplyPy <= 0 || supplyPy < 20) continue
        const key = `${t.complex_name}|${getBand(supplyPy)}`
        if (!tradeActuals[key]) tradeActuals[key] = []
        tradeActuals[key].push(Number(t.deal_amount) / supplyPy)
      }
      const jeonseActuals: Record<BandKey, number[]> = {}
      for (const r of recentRentals) {
        const sqm = Number(r.area_sqm)
        if (sqm <= 0) continue
        const supplyPy = getSupplyPyeong(areaMap, r.complex_name, sqm)
        if (supplyPy <= 0 || supplyPy < 20) continue
        const key = `${r.complex_name}|${getBand(supplyPy)}`
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

      const summary = {
        trackedComplexes: complexNames.length,
        districts: [...new Set(trackedData?.map(c => c.district_name))],
        avgTradePpp: avgTradePppValue,
        avgJeonsePpp: avgJeonsePppValue,
        pppBasis: '(단지×평형밴드) 평당가 중앙값을 총 공급면적으로 가중한 고정 바스켓, 신고일 최근 90일',
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

      // 1 month window (matching dashboard)
      const now = new Date()
      const oma = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const oneMonthAgo = `${oma.getFullYear()}-${String(oma.getMonth() + 1).padStart(2, '0')}-01`
      const actuals = tradeType === '매매'
        ? await fetchAll(supabase.from('re_trades').select('complex_name, deal_amount, area_sqm').gte('deal_date', oneMonthAgo).eq('cancel_yn', 'N').in('complex_name', complexNames))
        : await fetchAll(supabase.from('re_rentals').select('complex_name, deposit, area_sqm').gte('deal_date', oneMonthAgo).eq('rent_type', '전세').in('complex_name', complexNames))

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
        const band = getBand(py)
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

      // 계산 규칙은 대시보드 jeonse-ratio 라우트와 같다 — 두 곳이 다른 답을 내면
      // 봇이 화면과 어긋난 숫자로 답한다. 근거 주석은 그쪽에 있다:
      // src/app/api/willow-mgmt/real-estate/route.ts, type === 'jeonse-ratio'.
      // 요지: (단지 × 10평 밴드) 안에서 평당가끼리 비교하고, 짝의 무게는
      // min(매매건수, 전세건수). 평형을 안 맞추면 그 달에 어떤 평형이 팔렸는지가
      // 곧 전세가율이 된다.
      const trades = await fetchAll(
        supabase.from('re_trades').select('complex_name, deal_date, deal_amount, area_pyeong')
          .gte('deal_date', cutoffDate).eq('cancel_yn', 'N').in('complex_name', complexNames)
      )
      const rentals = await fetchAll(
        supabase.from('re_rentals').select('complex_name, deal_date, deposit, area_pyeong')
          .gte('deal_date', cutoffDate).eq('rent_type', '전세').in('complex_name', complexNames)
      )

      // 전용 평 기준 밴드. 대시보드는 공급 평(re_complex_pyeongs 매핑)을 쓰지만 여기서는
      // 그 매핑을 안 읽으므로 전용으로 나눈다 — 밴드 경계만 다르고, 짝을 같은 기준으로
      // 맞춘다는 성질은 같다. 밴드 라벨을 밖으로 내보내지 않는 이유이기도 하다.
      const bandOf = (py: number): number => Math.floor(py / 10) * 10
      type Buckets = Record<string, Record<string, number[]>>
      const bucket = (rows: Array<Record<string, unknown>>, amountKey: string): Buckets => {
        const out: Buckets = {}
        for (const row of rows) {
          const py = Number(row.area_pyeong)
          const amount = Number(row[amountKey])
          if (!(py > 0) || !(amount > 0)) continue
          const month = String(row.deal_date).slice(0, 7)
          const key = `${String(row.complex_name)}|${bandOf(py)}`
          if (!out[month]) out[month] = {}
          if (!out[month][key]) out[month][key] = []
          out[month][key].push(amount / py)
        }
        return out
      }

      const tradeMonthly = bucket(trades as Array<Record<string, unknown>>, 'deal_amount')
      const rentalMonthly = bucket(rentals as Array<Record<string, unknown>>, 'deposit')

      const median = (arr: number[]) => {
        const sorted = [...arr].sort((a, b) => a - b)
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      }

      // 실거래 신고 지연(추적 단지 실측 평균 17~19일) 때문에 이번 달·지난달은 아직
      // 채워지는 중이다. 봇이 "8월에 올랐다"고 단정하지 않도록 건수와 함께 표시를 준다.
      const nowKst = new Date(Date.now() + 9 * 3600_000)
      const curMonth = nowKst.toISOString().slice(0, 7)
      const prevMonth = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)

      const allMonths = [...new Set([...Object.keys(tradeMonthly), ...Object.keys(rentalMonthly)])].sort()
      const trend = allMonths.map(month => {
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
        if (weight === 0) return null
        return {
          month,
          ratio: Math.round((weighted / weight) * 10) / 10,
          trades: Object.values(tData).reduce((s, v) => s + v.length, 0),
          jeonse: Object.values(rData).reduce((s, v) => s + v.length, 0),
          pairs,
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
