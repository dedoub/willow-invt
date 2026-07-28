/**
 * GEO 측정 실행 (서버판).
 *
 * scripts/geo-measure.mjs와 같은 판정 로직을 크론에서 쓰기 위한 것이다.
 * 판정 규칙이 둘로 갈라지면 수동 실행과 주간 크론의 숫자가 어긋나므로,
 * 규칙을 고칠 때는 반드시 양쪽을 같이 고칠 것. 정본 설명: docs/geo-operations.md
 *
 * 함수 제한시간(300초) 안에 끝내려고 (사이트 × 회차) 단위로 쪼개 호출한다.
 * 질문 30개 x 호출당 3~5초면 여유가 있다.
 */

import { supabase } from './supabase'

const BRAND_RE: Record<string, RegExp> = {
  voicecards: /voice\s*cards?|voicecards\.quest/i,
  reviewnotes: /review\s*notes?|reviewnotes\.app/i,
  valuechain: /value\s*chain(\.wiki)?/i,
}

const OUR_DOMAIN: Record<string, string> = {
  voicecards: 'voicecards.quest',
  reviewnotes: 'reviewnotes.app',
  valuechain: 'valuechain.wiki',
}

/** 경쟁사 목록은 질문 세트와 함께 관리한다. 여기서는 답변에 등장했는지만 본다 */
const COMPETITORS: Record<string, string[]> = {
  voicecards: ['anki', 'quizlet', 'brainscape', 'memrise', 'supermemo', 'remnote', 'mochi', 'audioflash',
    'audio-flashcards', 'mintdeck', 'flashcardify', 'studley', 'speechling', 'duolingo', 'tarteel', 'quranly', 'iqra'],
  reviewnotes: ['quizlet', 'anki', 'notion', 'knowt', 'gizmo', 'revisely', 'studyfetch', 'quizgecko', 'conker',
    'mindgrasp', 'turbolearn', 'monic', 'wisdolia', 'kahoot', 'khan academy', 'ixl'],
  valuechain: [],
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * 추천 목록 상위 3개 판정. 번호·불릿 목록의 앞 3항목을 보고, 목록이 없으면
 * 본문 앞 40%에 등장했는지로 대체한다(서술형에서 먼저 거론되면 사실상 추천 상위다).
 */
function inTop3(answer: string, brandRe: RegExp): boolean {
  const items = [...answer.matchAll(/^\s*(?:\d+[.)]|[-*•])\s+(.{3,160})$/gm)].map(m => m[1])
  if (items.length >= 3) return items.slice(0, 3).some(x => brandRe.test(x))
  const head = answer.slice(0, Math.max(200, Math.floor(answer.length * 0.4)))
  return brandRe.test(head)
}

async function askGemini(question: string): Promise<{ answer: string; sources: string[] }> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY 없음')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: question }] }], tools: [{ google_search: {} }] }),
      cache: 'no-store',
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const j = await res.json()
  const c = j.candidates?.[0]
  const answer = (c?.content?.parts ?? []).map((p: { text?: string }) => p.text).filter(Boolean).join('\n')
  // grounding의 uri는 리다이렉트 래퍼라 호스트가 안 보인다. title에 실제 도메인이 온다.
  const sources: string[] = (c?.groundingMetadata?.groundingChunks ?? [])
    .map((x: { web?: { title?: string; uri?: string } }) => x.web?.title || x.web?.uri || '')
    .filter(Boolean)
  return { answer, sources }
}

export interface GeoRunResult {
  site: string
  engine: string
  runNo: number
  asked: number
  failed: number
  mentioned: number
  top3: number
  cited: number
}

export async function runGeoMeasurement(site: string, runNo: number, throttleMs = 3500): Promise<GeoRunResult> {
  const brandRe = BRAND_RE[site]
  const domain = OUR_DOMAIN[site]
  if (!brandRe || !domain) throw new Error(`알 수 없는 사이트: ${site}`)

  const { data, error } = await supabase
    .from('geo_questions')
    .select('question_id, question, question_group')
    .eq('site', site).eq('active', true)
    .order('priority', { ascending: true }).order('question_id', { ascending: true })
  if (error) throw new Error(`질문 레지스트리 조회 실패: ${error.message}`)

  const questions = (data ?? []) as Array<{ question_id: string; question: string; question_group: string | null }>
  const out: GeoRunResult = { site, engine: 'gemini', runNo, asked: 0, failed: 0, mentioned: 0, top3: 0, cited: 0 }
  const rows: Record<string, unknown>[] = []

  for (const q of questions) {
    let res: { answer: string; sources: string[] }
    try {
      res = await askGemini(q.question)
    } catch {
      out.failed++
      await sleep(throttleMs)
      continue
    }

    const blob = `${res.answer}\n${res.sources.join('\n')}`
    const mentioned = brandRe.test(blob)
    const top3 = mentioned && inTop3(res.answer, brandRe)
    const ourUrls = res.sources.filter(s => s.toLowerCase().includes(domain))
    const cited = ourUrls.length > 0
    const comps = (COMPETITORS[site] ?? []).filter(name =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(res.answer))

    out.asked++
    if (mentioned) out.mentioned++
    if (top3) out.top3++
    if (cited) out.cited++

    rows.push({
      site, engine: 'gemini', question_id: q.question_id, question: q.question,
      question_group: q.question_group, run_no: runNo,
      mentioned, top3, cited,
      our_urls: ourUrls, competitors: comps, source_domains: res.sources.slice(0, 20),
      answer_excerpt: res.answer.slice(0, 1200),
    })
    await sleep(throttleMs)
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error: insErr } = await supabase
      .from('geo_answer_measurements')
      .upsert(rows.slice(i, i + 200), { onConflict: 'measured_on,site,engine,question_id,run_no' })
    if (insErr) console.error('[geo-runner] 저장 실패:', insErr.message)
  }
  return out
}
