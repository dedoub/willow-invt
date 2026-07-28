/**
 * GEO 답변 점유 집계.
 *
 * 원본은 geo_answer_measurements (러너: scripts/geo-measure.mjs).
 * 핵심 지표는 인용률이 아니라 **추천 Top3 점유율**이다. 링크만 인용되고 정작
 * 경쟁사를 추천하는 답변이 흔해서, 인용률만 보면 좋아지는 것처럼 착각한다.
 */

import { supabase } from './supabase'

export interface GeoRates {
  runs: number
  mentioned: number
  top3: number
  cited: number
}

export interface GeoQuestionRow {
  questionId: string
  question: string
  runs: number
  mentioned: number
  top3: number
  cited: number
  competitors: string[]
  lastMeasured: string | null
}

export interface GeoAnswerStats {
  site: string
  /** 측정일 목록 (최신순). 첫 회차가 기준선 */
  days: string[]
  latestDay: string | null
  baselineDay: string | null
  latest: GeoRates
  baseline: GeoRates
  byEngine: Array<{ engine: string } & GeoRates>
  questions: GeoQuestionRow[]
  /** 우리가 Top3에 못 든 답변에 등장한 경쟁 서비스 */
  competitors: Array<{ name: string; answers: number }>
  daily: Array<{ date: string; top3: number; mentioned: number; cited: number }>
}

interface Row {
  measured_on: string
  engine: string
  question_id: string
  question: string
  mentioned: boolean
  top3: boolean
  cited: boolean
  competitors: string[] | null
  measured_at: string
}

const empty = (site: string): GeoAnswerStats => ({
  site, days: [], latestDay: null, baselineDay: null,
  latest: { runs: 0, mentioned: 0, top3: 0, cited: 0 },
  baseline: { runs: 0, mentioned: 0, top3: 0, cited: 0 },
  byEngine: [], questions: [], competitors: [], daily: [],
})

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

function rate(rows: Row[]): GeoRates {
  return {
    runs: rows.length,
    mentioned: pct(rows.filter(r => r.mentioned).length, rows.length),
    top3: pct(rows.filter(r => r.top3).length, rows.length),
    cited: pct(rows.filter(r => r.cited).length, rows.length),
  }
}

export async function getGeoAnswerStats(site: string, days = 90): Promise<GeoAnswerStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('geo_answer_measurements')
    .select('measured_on, engine, question_id, question, mentioned, top3, cited, competitors, measured_at')
    .eq('site', site)
    .gte('measured_on', since)
    .order('measured_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(`GEO 측정 조회 실패: ${error.message}`)

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return empty(site)

  const days_ = Array.from(new Set(rows.map(r => r.measured_on))).sort().reverse()
  const latestDay = days_[0]
  const baselineDay = days_[days_.length - 1]

  const latestRows = rows.filter(r => r.measured_on === latestDay)

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
    return {
      questionId: qid,
      question: list[0].question,
      runs: r.runs, mentioned: r.mentioned, top3: r.top3, cited: r.cited,
      competitors: Array.from(comps).slice(0, 6),
      lastMeasured: list[0].measured_at,
    }
  }).sort((a, b) => a.top3 - b.top3 || b.runs - a.runs)   // 지는 질문을 위로

  // 우리가 Top3에 못 든 답변에서만 경쟁사를 센다. 그 자리를 누가 가져갔는지가 처방으로 이어진다.
  const lost = latestRows.filter(r => !r.top3)
  const compCount = new Map<string, number>()
  for (const r of lost) for (const c of r.competitors ?? []) compCount.set(c, (compCount.get(c) ?? 0) + 1)

  const engines = Array.from(new Set(latestRows.map(r => r.engine)))

  return {
    site,
    days: days_,
    latestDay,
    baselineDay: baselineDay === latestDay ? null : baselineDay,
    latest: rate(latestRows),
    baseline: rate(rows.filter(r => r.measured_on === baselineDay)),
    byEngine: engines.map(e => ({ engine: e, ...rate(latestRows.filter(r => r.engine === e)) })),
    questions,
    competitors: Array.from(compCount.entries())
      .map(([name, answers]) => ({ name, answers }))
      .sort((a, b) => b.answers - a.answers)
      .slice(0, 15),
    daily: days_.slice().reverse().map(d => {
      const r = rate(rows.filter(x => x.measured_on === d))
      return { date: d, top3: r.top3, mentioned: r.mentioned, cited: r.cited }
    }),
  }
}
