/**
 * 부동산 지표 계산 — 한 곳.
 *
 * 2026-08-31 하루에만 전세가율·괴리율·평균 평당가 세 지표가 전부 틀린 채로 발견됐고,
 * 셋 다 대시보드 API(`app/api/willow-mgmt/real-estate/route.ts`)와 MCP 툴(`mcp/tools/real-estate.ts`)에
 * 따로 구현돼 있었다. 한쪽을 고치면 다른 쪽이 남아 봇이 화면과 다른 숫자를 말했다.
 * 계산은 여기 한 번만 쓰고, 두 진입점은 데이터를 읽어와 여기에 넘기기만 한다.
 *
 * 여기 있는 함수는 전부 순수 함수다(데이터 조회는 buildAreaMapping 하나뿐). 인자로 받은
 * 행을 세는 것 외에 아무것도 하지 않으므로, 두 진입점이 같은 행을 주면 같은 답이 나온다.
 */

// ─── 날짜 ─────────────────────────────────────────────────────────────────────

/** 같은 일(day)을 유지한 채 한 달 전. 말일이 없는 달은 그 달 말일로 당긴다. */
export function subtractCalendarMonth(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(year, month - 2, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

/** days 일 전. 음수를 주면 뒤로 간다. */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// ─── 신고일 창 ────────────────────────────────────────────────────────────────

/**
 * 괴리율·시세가 기준선으로 삼는 실거래 창 — **최근 "신고된" 거래**.
 *
 * 이 지표들의 쓸모는 지금 호가가 최근 신고 실거래보다 얼마나 위/아래인지를 보고 가격이
 * 어디로 가는지 읽는 것이다. 그래서 기준선은 "언제 계약됐나"가 아니라 "언제 신고돼
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
export const GAP_FILING_WINDOW_DAYS = 90

/**
 * created_at 이 신고 시점이 아닌 행을 되살리는 데 쓰는 표준 지연.
 * 2026-03 초기 적재분 2,095건은 created_at 이 전부 그 달이라(계약은 2025-01부터, 평균
 * 지연 276일) 그대로 쓰면 그 시기 창에 과거 거래가 통째로 쏟아진다. 계약일 + 이 값과
 * 비교해 이른 쪽을 신고일로 본다 — 정상 수집분은 created_at 이, 백필분은 합성값이 이긴다.
 */
export const GAP_BACKFILL_LAG_DAYS = 20

export interface FilingRow {
  created_at?: string | null
  deal_date: string
}

/** 이 거래가 '신고돼 보이게 된' 날. 위 GAP_BACKFILL_LAG_DAYS 주석 참조. */
export function filingDate(row: FilingRow): string {
  const synth = shiftDays(row.deal_date, -GAP_BACKFILL_LAG_DAYS)
  const created = row.created_at ? String(row.created_at).slice(0, 10) : ''
  return created && created < synth ? created : synth
}

/** asOf(스냅샷일) 기준 신고일 구간 (start, end]. start 는 포함하지 않는다. */
export function gapFilingWindow(asOf: string): { start: string; end: string } {
  return { start: shiftDays(asOf, GAP_FILING_WINDOW_DAYS), end: asOf }
}

/** 신고일이 창 안에 드는가. 두 진입점이 같은 부등호를 쓰게 하려고 함수로 둔다. */
export function isFiledWithin(row: FilingRow, win: { start: string; end: string }): boolean {
  const filed = filingDate(row)
  return filed > win.start && filed <= win.end
}

// ─── 면적 ─────────────────────────────────────────────────────────────────────

/** (전용면적 ㎡ → 공급면적 ㎡) 대응표. 네이버 매물이 둘 다 갖고 있어 거기서 만든다. */
export type AreaMapping = { exclusive: number; supply: number }[]

/** 화면 필터와 같은 10평 밴드. 60평 이상은 한 칸(표본이 얇아 더 쪼개면 짝이 안 생긴다). */
export function supplyBand(supplyPy: number): number {
  if (supplyPy < 30) return 20
  if (supplyPy < 40) return 30
  if (supplyPy < 50) return 40
  if (supplyPy < 60) return 50
  return 60
}

/** 매물 행에서 공급 평을 뽑는다 (네이버 area1 = 공급면적). */
export function getListingPyeong(l: { area_supply_sqm?: unknown; area_type?: unknown }): number {
  const supply = Number(l.area_supply_sqm)
  if (supply > 0) return supply / 3.3058
  const typeNum = parseFloat(String(l.area_type ?? '0'))
  if (typeNum > 0) return typeNum / 3.3058
  return 0
}

/**
 * 실거래의 전용면적(㎡)을 공급 평으로 바꾼다.
 * 대응표에 없는 단지는 전용/공급 0.75 가정으로 떨어진다 — 밴드가 한 칸 어긋날 수 있으나
 * 두 진입점이 같은 규칙을 쓰므로 서로 어긋나지는 않는다.
 */
export function getSupplyPyeong(
  areaMapping: Record<string, AreaMapping>,
  complexName: string,
  exclusiveSqm: number,
): number {
  const mapping = areaMapping[complexName]
  if (!mapping || mapping.length === 0) return (exclusiveSqm / 0.75) / 3.3058
  let closest = mapping[0]
  let minDiff = Math.abs(exclusiveSqm - closest.exclusive)
  for (const entry of mapping) {
    const diff = Math.abs(exclusiveSqm - entry.exclusive)
    if (diff < minDiff) { closest = entry; minDiff = diff }
  }
  return closest.supply / 3.3058
}

// ─── 통계 ─────────────────────────────────────────────────────────────────────

/** 짝수 개면 가운데 두 값의 평균. 시세·전세가율이 쓰는 중앙값이다. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * 짝수 개면 **위쪽** 값. 이상치 필터가 원래 쓰던 중심이라 그대로 둔다.
 *
 * median() 으로 바꿔 보면 필터 경계에 걸친 값의 포함 여부가 달라져 결과가 미세하게 움직인다
 * (2026-08-31 리팩터 중 실측: 괴리율 표본 최대 4건, 전세 괴리율 최대 0.2%p, 시가총액
 * 최대 0.7조원). 어느 쪽이 더 옳다고 할 근거가 없어서, 값이 바뀌는 쪽을 택하지 않았다.
 */
function upperMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * 이상치를 뺀 실거래 평당가 평균. 중앙값에서 50% 넘게 떨어진 값과, 최저 호가의 절반에도
 * 못 미치는 값(직거래·특수관계 거래로 보이는 것)을 버린다.
 */
export function getFilteredActualAverage(
  values: number[] | undefined,
  listingMinPpp: number | null | undefined,
): { avg: number; count: number } | null {
  if (!values?.length) return null
  const med = upperMedian(values)
  const listingFloor = listingMinPpp ? listingMinPpp * 0.5 : 0
  const filtered = values.filter(value =>
    Math.abs(value - med) / med <= 0.5 && value >= listingFloor
  )
  if (filtered.length === 0) return null
  return {
    avg: filtered.reduce((sum, value) => sum + value, 0) / filtered.length,
    count: filtered.length,
  }
}

/**
 * 짝(단지×평형밴드)별 값을 실거래 건수로 가중 평균한다.
 *
 * 단순 평균이면 매매 1건으로 만든 짝이 40건짜리 짝과 같은 표를 갖는다. 전체 평형에서는
 * 밴드가 많아 1건짜리 짝이 늘 절반 가까이라 이게 그대로 헤드라인을 흔든다 —
 * 전세 실측으로 단순평균과 건수가중이 최대 2.7%p 벌어졌다(2026-07-23: 2.2% vs 4.9%).
 */
export function weightedAverage(items: Array<{ value: number; count: number }>): number | null {
  if (!items.length) return null
  let sum = 0, weight = 0
  for (const item of items) { sum += item.value * item.count; weight += item.count }
  if (weight <= 0) return null
  return Math.round((sum / weight) * 10) / 10
}

// ─── 지표: 호가 괴리율 ────────────────────────────────────────────────────────

export interface GapResult {
  /** % — 호가가 실거래보다 몇 % 높은가(음수면 낮다). 짝이 없으면 null. */
  gap: number | null
  /** 값을 만든 짝(단지×평형밴드) 수 */
  pairs: number
  /** 그 짝들에 들어간 실거래 건수 */
  deals: number
}

/**
 * 호가 괴리율. 같은 (단지×평형밴드) 안에서 최저 평당호가와 실거래 평당가를 견주고,
 * 짝의 무게는 그 짝을 받친 실거래 건수로 준다.
 *
 * @param listingByKey  "단지|밴드" → 최저 평당호가
 * @param actualByKey   "단지|밴드" → 실거래 평당가 목록 (창 필터는 호출부에서 끝낸 것)
 */
export function computeListingGap(
  listingByKey: Record<string, number>,
  actualByKey: Record<string, number[]>,
): GapResult {
  const items: Array<{ value: number; count: number }> = []
  let deals = 0
  for (const [key, minPpp] of Object.entries(listingByKey)) {
    const actual = getFilteredActualAverage(actualByKey[key], minPpp)
    if (!actual || !(actual.avg > 0)) continue
    items.push({ value: ((minPpp - actual.avg) / actual.avg) * 100, count: actual.count })
    deals += actual.count
  }
  return { gap: weightedAverage(items), pairs: items.length, deals }
}

// ─── 지표: 시세(평균 평당가) ──────────────────────────────────────────────────

export interface BasketResult {
  /** 만원/평. 바스켓이 비면 0. */
  ppp: number
  /** 값을 만든 (단지×밴드) 칸 수 */
  pairs: number
  /** 그 칸들에 들어간 실거래 건수 */
  deals: number
  /** 추적 총 공급면적 중 이 값이 실제로 대표하는 비율(%) */
  coverage: number
}

/**
 * 시세 = 추적 단지의 평당 가격 수준.
 *
 * 평당가는 평형이 달라도 아파트끼리 비교되게 만드는 정규화다. 그런데 그렇게 정규화해
 * 놓고 그 달 거래를 그냥 평균 내면, 어떤 평형이 팔렸는지가 도로 값을 움직인다 —
 * 정규화한 이유가 없어진다. 2026-08-31 실측(전체 평형): 매매 11건, 평균 24.9평이
 * 잡히면서 11,053 → 12,802 만원/평, 한 달에 +15.8%. 시세가 그만큼 오른 게 아니다.
 *
 * 그래서 (단지 × 평형밴드)별 평당가 중앙값을 내고 **고정 가중치**로 합친다.
 * 가중치는 그 칸의 총 공급면적(세대수 × 공급평) — Σ(평당가 × 면적) / Σ면적 이라
 * 곧 총액 ÷ 총면적이다. 거래가 어느 평형에 몰렸는지로는 움직이지 않고, 평당가 자체가
 * 움직여야 움직인다. 같은 창으로 실측하면 10,901 → 10,981 (+0.7%).
 *
 * @param pppByKey     "단지|밴드" → 실거래 평당가 목록 (창·평형 필터는 호출부에서 끝낸 것)
 * @param floorAreaByKey "단지|밴드" → 총 공급면적(평). buildBandFloorArea 로 만든다.
 */
export function computeBasketPpp(
  pppByKey: Record<string, number[]>,
  floorAreaByKey: Record<string, number>,
): BasketResult {
  const totalFloorArea = Object.values(floorAreaByKey).reduce((s, v) => s + v, 0)
  let num = 0, den = 0, pairs = 0, deals = 0
  for (const [key, values] of Object.entries(pppByKey)) {
    const weight = floorAreaByKey[key]
    if (!weight || !values.length) continue
    num += median(values) * weight
    den += weight
    pairs++
    deals += values.length
  }
  return {
    ppp: den > 0 ? Math.round(num / den) : 0,
    pairs,
    deals,
    coverage: totalFloorArea > 0 ? Math.round((den / totalFloorArea) * 100) : 0,
  }
}

/**
 * 시세 바스켓의 고정 가중치 — "단지|밴드" → 총 공급면적(평) = Σ 세대수 × 공급평.
 * 시가총액 차트가 쓰는 기준과 같다.
 *
 * @param accept 평형 필터. 화면에서 특정 밴드를 고르면 가중치도 같이 걸러야 한다.
 */
export function buildBandFloorArea(
  pyeongRows: Array<{ complex_name: string; supply_sqm: unknown; household_count: unknown }> | null | undefined,
  accept: (supplyPy: number) => boolean,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of pyeongRows ?? []) {
    const supplyPy = Number(row.supply_sqm) / 3.3058
    const households = Number(row.household_count)
    if (!(supplyPy > 0) || !(households > 0) || !accept(supplyPy)) continue
    const key = `${row.complex_name}|${supplyBand(supplyPy)}`
    out[key] = (out[key] ?? 0) + supplyPy * households
  }
  return out
}

// ─── 지표: 전세가율 ───────────────────────────────────────────────────────────

export interface JeonseRatioResult {
  /** % — 전세보증금 ÷ 매매가. 짝이 없으면 null. */
  ratio: number | null
  pairs: number
  trades: number
  jeonse: number
}

/**
 * 전세가율 = 전세보증금 / 매매가. 나누는 두 값이 **같은 집**을 가리켜야 뜻이 선다.
 *
 * 예전엔 단지별로 그 달의 매매 총액 중앙값과 전세 총액 중앙값을 그냥 나눴다. 평형을
 * 안 맞췄으므로 그 달에 어떤 평형이 팔렸는지가 곧 전세가율이었다. 2026-08 실측:
 * 추적 단지 매매 16건 평균 24.9평 / 7월 94건 평균 29.1평 — 작은 집만 팔린 달이라
 * 매매 중앙값이 내려가고 전세가율이 33.1% → 36.8% 로 올랐다. 같은 기간 전세·매매
 * 호가(평당·평형대별)는 둘 다 소폭 하락이라 방향이 정반대였다. 2025-11 은 이 방식이
 * 46.8%, 평당 기준으로는 36.5% 로 10%p 가 순전히 표본 구성이었다.
 *
 * 그래서 (단지 × 평형밴드) 안에서 **평당가끼리** 비교한다. 정확히 같은 평형만 짝지으면
 * 8월 짝이 10개까지 줄어 달마다 표본이 튀므로, 평당으로 정규화한 뒤 밴드로 묶는 선에서 멈춘다.
 * 짝의 무게는 min(매매건수, 전세건수) — 얇은 쪽이 그 짝의 신뢰도를 정한다.
 *
 * @param tradePppByKey  "단지|밴드" → 매매 평당가 목록
 * @param jeonsePppByKey "단지|밴드" → 전세 평당보증금 목록
 */
export function computeJeonseRatio(
  tradePppByKey: Record<string, number[]>,
  jeonsePppByKey: Record<string, number[]>,
): JeonseRatioResult {
  const items: Array<{ value: number; count: number }> = []
  for (const [key, trades] of Object.entries(tradePppByKey)) {
    const jeonse = jeonsePppByKey[key]
    if (!jeonse?.length || !trades.length) continue
    const medTrade = median(trades)
    if (!(medTrade > 0)) continue
    items.push({
      value: (median(jeonse) / medTrade) * 100,
      count: Math.min(trades.length, jeonse.length),
    })
  }
  return {
    ratio: weightedAverage(items),
    pairs: items.length,
    trades: Object.values(tradePppByKey).reduce((s, v) => s + v.length, 0),
    jeonse: Object.values(jeonsePppByKey).reduce((s, v) => s + v.length, 0),
  }
}

// ─── 조회 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * Supabase 기본 1,000행 한도를 넘겨 전부 받는다.
 *
 * 항상 .order('id') 를 붙인다 — 완전히 결정적인 ORDER BY 가 없으면 페이지 경계의 행이
 * 빠지거나 겹친다(같은 snapshot_date, 같은 deal_date 인 행들의 순서를 PostgreSQL 이
 * 보장하지 않기 때문).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll(query: any, pageSize = 1000): Promise<any[]> {
  const q = query.order('id')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * 전용→공급 대응표를 최신 스냅샷의 네이버 매물에서 만든다.
 * (re_naver_listings 는 전 스냅샷 합쳐 19만 행이 넘어 최신 하루만 + 페이지네이션으로 읽는다)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildAreaMapping(supabase: any, complexNames: string[]): Promise<Record<string, AreaMapping>> {
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
    result[name] = [...m.entries()]
      .map(([exclusive, supply]) => ({ exclusive, supply }))
      .sort((a, b) => a.exclusive - b.exclusive)
  }
  return result
}
