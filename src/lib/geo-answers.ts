/**
 * GEO 답변 점유 집계 + 실패 원인 진단.
 *
 * 원본은 geo_answer_measurements (러너: scripts/geo-measure.mjs),
 * 질문 레지스트리는 geo_questions, 개선 이력은 geo_actions.
 *
 * 핵심 지표는 인용률이 아니라 **추천 Top3 점유율**이다. 링크만 인용되고 정작
 * 경쟁사를 추천하는 답변이 흔해서, 인용률만 보면 좋아지는 것처럼 착각한다.
 *
 * 운영 절차 정본: docs/geo-operations.md
 */

import { supabase } from './supabase'
import { getIndexedPageCount } from './gsc-index'
import type { GeoStage, GeoCause, GeoRates, GeoQuestionRow, GeoAction, GeoAnswerStats } from './geo-types'

export type { GeoStage, GeoCause, GeoRates, GeoQuestionRow, GeoAction, GeoAnswerStats }

interface Row {
  measured_on: string
  measured_week: string
  engine: string
  question_id: string
  question: string
  mentioned: boolean
  top3: boolean
  cited: boolean
  competitors: string[] | null
  measured_at: string
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

function rate(rows: Row[]): GeoRates {
  return {
    runs: rows.length,
    mentioned: pct(rows.filter(r => r.mentioned).length, rows.length),
    top3: pct(rows.filter(r => r.top3).length, rows.length),
    cited: pct(rows.filter(r => r.cited).length, rows.length),
  }
}

function stageOf(r: GeoRates): GeoStage {
  if (r.top3 > 0) return 'recommended'
  if (r.mentioned > 0) return 'mentioned'
  if (r.cited > 0) return 'cited'
  return 'absent'
}

/**
 * 원인 판정. 순서가 중요하다 — 앞 단계가 막혀 있으면 뒤 원인은 볼 필요가 없다.
 * indexedPages는 사이트 전체 신호라 질문 단위 판정에 그대로 쓰지 않고,
 * "색인이 사실상 없다"는 극단만 index 원인으로 잡는다.
 */
function causeOf(r: GeoRates, competitors: string[], indexedPages: number): GeoCause {
  if (r.top3 > 0) return null
  if (indexedPages <= 1) return 'index'
  if (r.cited === 0 && r.mentioned === 0) return 'authority'
  if (r.cited > 0) return 'content'
  return competitors.length > 0 ? 'competitor' : 'authority'
}

const empty = (site: string): GeoAnswerStats => ({
  site, days: [], latestDay: null, baselineDay: null, latestMeasuredAt: null,
  latest: { runs: 0, mentioned: 0, top3: 0, cited: 0 },
  baseline: { runs: 0, mentioned: 0, top3: 0, cited: 0 },
  byEngine: [], questions: [], causes: [], competitors: [], actions: [],
  daily: [], aiClicks: { last7d: 0, total: 0 }, indexedPages: 0,
})

export async function getGeoAnswerStats(site: string, days = 90): Promise<GeoAnswerStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const [measRes, qRes, actRes, idxRes, clickRes, clickWeekRes] = await Promise.all([
    supabase.from('geo_answer_measurements')
      .select('measured_on, measured_week, engine, question_id, question, mentioned, top3, cited, competitors, measured_at')
      .eq('site', site).gte('measured_on', since)
      .order('measured_at', { ascending: false }).limit(5000),
    supabase.from('geo_questions').select('question_id, priority').eq('site', site),
    supabase.from('geo_actions')
      .select('id, question_id, cause, action_type, title, status, shipped_on, baseline_top3, result_top3, verdict')
      .eq('site', site).order('updated_at', { ascending: false }).limit(100),
    // 색인된 대표 URL 수 — index 원인 판정 근거. 최신 스냅샷만 센다(스냅샷이 날짜별로
    // 쌓여서 전 기간을 세면 같은 경로가 중복된다). 색인 상태 카드와 같은 값이어야 한다.
    getIndexedPageCount(site),
    supabase.from('vc_crawl_log').select('id', { count: 'exact', head: true })
      .eq('site', site).in('category', ['referral', 'referral_nav']),
    supabase.from('vc_crawl_log').select('id', { count: 'exact', head: true })
      .eq('site', site).in('category', ['referral', 'referral_nav']).gte('ts', weekAgo),
  ])

  if (measRes.error) throw new Error(`GEO 측정 조회 실패: ${measRes.error.message}`)
  const rows = (measRes.data ?? []) as Row[]
  const indexedPages = idxRes
  const aiClicks = { total: clickRes.count ?? 0, last7d: clickWeekRes.count ?? 0 }

  const actions: GeoAction[] = ((actRes.data ?? []) as Array<Record<string, unknown>>).map(a => ({
    id: Number(a.id),
    questionId: (a.question_id as string) ?? null,
    cause: (a.cause as string) ?? null,
    actionType: a.action_type as string,
    title: a.title as string,
    status: a.status as string,
    shippedOn: (a.shipped_on as string) ?? null,
    baselineTop3: a.baseline_top3 == null ? null : Number(a.baseline_top3),
    resultTop3: a.result_top3 == null ? null : Number(a.result_top3),
    verdict: (a.verdict as string) ?? null,
  }))

  if (rows.length === 0) return { ...empty(site), actions, aiClicks, indexedPages }

  const priorityOf = new Map<string, number>()
  for (const q of (qRes.data ?? []) as Array<Record<string, unknown>>) {
    priorityOf.set(q.question_id as string, Number(q.priority ?? 3))
  }

  // 한 회차가 여러 날에 걸쳐 실행되므로(무료 티어 일일 한도) 주 단위로 묶는다
  const days_ = Array.from(new Set(rows.map(r => r.measured_week ?? r.measured_on))).sort().reverse()
  const latestDay = days_[0]
  const baselineDay = days_[days_.length - 1]
  const weekOf = (r: Row) => r.measured_week ?? r.measured_on
  const latestRows = rows.filter(r => weekOf(r) === latestDay)

  // 질문별로는 최신 회차만 본다. 기간 전체를 섞으면 개선 전후가 뭉개진다.
  const byQuestion = new Map<string, Row[]>()
  for (const r of latestRows) {
    const list = byQuestion.get(r.question_id) ?? []
    list.push(r)
    byQuestion.set(r.question_id, list)
  }

  const questions: GeoQuestionRow[] = Array.from(byQuestion.entries()).map(([qid, list]) => {
    const r = rate(list)
    const comps = new Set<string>()
    for (const row of list) for (const c of row.competitors ?? []) comps.add(c)
    const competitors = Array.from(comps)
    return {
      questionId: qid,
      question: list[0].question,
      priority: priorityOf.get(qid) ?? 3,
      runs: r.runs, mentioned: r.mentioned, top3: r.top3, cited: r.cited,
      stage: stageOf(r),
      cause: causeOf(r, competitors, indexedPages),
      competitors: competitors.slice(0, 6),
      lastMeasured: list[0].measured_at,
    }
  }).sort((a, b) => a.top3 - b.top3 || a.priority - b.priority)   // 지는 질문 · 우선순위 높은 순

  const causeCount = new Map<Exclude<GeoCause, null>, number>()
  for (const q of questions) if (q.cause) causeCount.set(q.cause, (causeCount.get(q.cause) ?? 0) + 1)

  // 우리가 Top3에 못 든 답변에서만 경쟁사를 센다. 그 자리를 누가 가져갔는지가 처방으로 이어진다.
  const compCount = new Map<string, number>()
  for (const r of latestRows.filter(r => !r.top3)) {
    for (const c of r.competitors ?? []) compCount.set(c, (compCount.get(c) ?? 0) + 1)
  }

  return {
    site,
    days: days_,
    latestDay,
    baselineDay: baselineDay === latestDay ? null : baselineDay,
    // 주 라벨(measured_week)은 같은 주에 다시 재도 안 움직인다. 언제 잰 값인지는 이쪽이 답한다.
    latestMeasuredAt: latestRows.reduce<string | null>(
      (max, r) => (r.measured_at && (!max || r.measured_at > max) ? r.measured_at : max), null),
    latest: rate(latestRows),
    baseline: rate(rows.filter(r => weekOf(r) === baselineDay)),
    byEngine: Array.from(new Set(latestRows.map(r => r.engine)))
      .map(e => ({ engine: e, ...rate(latestRows.filter(r => r.engine === e)) })),
    questions,
    causes: Array.from(causeCount.entries())
      .map(([cause, n]) => ({ cause, questions: n }))
      .sort((a, b) => b.questions - a.questions),
    competitors: Array.from(compCount.entries())
      .map(([name, answers]) => ({ name, answers }))
      .sort((a, b) => b.answers - a.answers).slice(0, 15),
    actions,
    daily: days_.slice().reverse().map(d => {
      const r = rate(rows.filter(x => weekOf(x) === d))
      return { date: d, top3: r.top3, mentioned: r.mentioned, cited: r.cited }
    }),
    aiClicks,
    indexedPages,
  }
}
