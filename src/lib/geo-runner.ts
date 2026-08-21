/**
 * GEO 측정 실행 (서버판).
 *
 * scripts/geo-measure.mjs와 같은 판정 로직을 크론에서 쓰기 위한 것이다.
 * 판정 규칙이 둘로 갈라지면 수동 실행과 주간 크론의 숫자가 어긋나므로,
 * 규칙을 고칠 때는 반드시 양쪽을 같이 고칠 것. 정본 설명: docs/geo-operations.md
 *
 * 무료 티어는 분당 호출 제한이 빡빡하다. 30문항을 한 번에 돌리면 대부분 429로 떨어져서
 * (사이트 × 회차 × 파트) 단위로 쪼개고, 429는 짧게 기다렸다 다시 시도한다.
 */

import { supabase } from './supabase'
import { kstToday } from './kst'

const BRAND_RE: Record<string, RegExp> = {
  voicecards: /voice\s*cards?|voicecards\.quest/i,
  reviewnotes: /review\s*notes?|reviewnotes\.app/i,
  valuechain: /value\s*chain(\.wiki)?/i,
  portle: /\bportle\b|portle\.quest/i,
}

const OUR_DOMAIN: Record<string, string> = {
  voicecards: 'voicecards.quest',
  reviewnotes: 'reviewnotes.app',
  valuechain: 'valuechain.wiki',
  portle: 'portle.quest',
}

/** 경쟁사 목록은 질문 세트와 함께 관리한다. 여기서는 답변에 등장했는지만 본다 */
const COMPETITORS: Record<string, string[]> = {
  voicecards: ['anki', 'quizlet', 'brainscape', 'memrise', 'supermemo', 'remnote', 'mochi', 'audioflash',
    'audio-flashcards', 'mintdeck', 'flashcardify', 'studley', 'speechling', 'duolingo', 'tarteel', 'quranly', 'iqra'],
  reviewnotes: ['quizlet', 'anki', 'notion', 'knowt', 'gizmo', 'revisely', 'studyfetch', 'quizgecko', 'conker',
    'mindgrasp', 'turbolearn', 'monic', 'wisdolia', 'kahoot', 'khan academy', 'ixl'],
  valuechain: [],
  portle: ['sharesight', 'getquin', 'delta', 'snowball analytics', 'kubera', 'stock events', 'portfolio performance',
    'ghostfolio', 'wealthfolio', 'tiller', 'wisesheets', 'empower', 'personal capital', 'simply wall st',
    'yahoo finance', 'google finance'],
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

/** 429·5xx는 잠깐 기다렸다 다시. 무료 티어에서 이게 없으면 대부분 실패한다 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn() } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (attempt >= 3 || !/\b(429|500|502|503|504)\b/.test(msg)) throw e
      await sleep(12_000 * attempt)
    }
  }
}

/**
 * 보이스카드 Supabase의 geo-ask 함수를 통해 묻는다.
 *
 * 대시보드가 자체로 들고 있던 무료 티어 키는 그라운딩 일일 한도가 낮아 주간 측정 한 회차도
 * 못 채운다. 보이스카드는 카드 생성에 결제된 키를 쓰고 있어서, 키를 복사해 오는 대신
 * 그 프로젝트 안에 얇은 프록시(supabase/functions/geo-ask)를 두고 호출만 빌린다.
 * 키가 한 곳에만 있으므로 교체·회수도 거기서 한 번만 하면 된다.
 */
async function askViaVoicecards(question: string): Promise<{ answer: string; sources: string[] }> {
  const url = process.env.VOICECARDS_SUPABASE_URL
  const key = process.env.VOICECARDS_SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('VOICECARDS_SUPABASE_* 없음')
  const res = await fetch(`${url}/functions/v1/geo-ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ question }),
    cache: 'no-store',
  })
  if (!res.ok) {
    // 프록시는 Gemini 상태코드를 본문에 담아 넘긴다. withRetry가 429를 알아보게 꺼내준다.
    const body = await res.text().catch(() => '')
    const upstream = body.match(/"status":\s*(\d{3})/)?.[1]
    throw new Error(`geo-ask ${upstream ?? res.status}`)
  }
  const j = await res.json()
  return { answer: String(j.answer ?? ''), sources: (j.sources ?? []) as string[] }
}

/** 대시보드가 직접 들고 있는 키. 프록시를 못 쓸 때의 대비책 */
async function askGeminiDirect(question: string): Promise<{ answer: string; sources: string[] }> {
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

async function askGemini(question: string): Promise<{ answer: string; sources: string[] }> {
  if (process.env.VOICECARDS_SUPABASE_URL && process.env.VOICECARDS_SUPABASE_SERVICE_KEY) {
    return askViaVoicecards(question)
  }
  return askGeminiDirect(question)
}

export interface GeoRunResult {
  site: string
  engine: string
  runNo: number
  part: number
  asked: number
  failed: number
  mentioned: number
  top3: number
  cited: number
}

/**
 * @param part 1-based 분할 번호. 질문을 parts등분해 그중 part번째만 돌린다.
 *             한 호출이 함수 제한시간을 넘지 않게 하는 유일한 수단이다.
 */
export async function runGeoMeasurement(
  site: string, runNo: number, part = 1, parts = 2, throttleMs = 7000,
): Promise<GeoRunResult> {
  const brandRe = BRAND_RE[site]
  const domain = OUR_DOMAIN[site]
  if (!brandRe || !domain) throw new Error(`알 수 없는 사이트: ${site}`)

  const { data, error } = await supabase
    .from('geo_questions')
    .select('question_id, question, question_group')
    .eq('site', site).eq('active', true)
    .order('priority', { ascending: true }).order('question_id', { ascending: true })
  if (error) throw new Error(`질문 레지스트리 조회 실패: ${error.message}`)

  const all = (data ?? []) as Array<{ question_id: string; question: string; question_group: string | null }>
  const size = Math.ceil(all.length / parts)
  const questions = all.slice((part - 1) * size, part * size)
  const out: GeoRunResult = { site, engine: 'gemini', runNo, part, asked: 0, failed: 0, mentioned: 0, top3: 0, cited: 0 }
  const rows: Record<string, unknown>[] = []

  for (const q of questions) {
    let res: { answer: string; sources: string[] }
    try {
      res = await withRetry(() => askGemini(q.question))
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
      // 날짜·시각을 명시해 넣는다. 덮어쓰기(같은 주 같은 회차 재실행)에서 DO UPDATE의
      // SET 목록에 없는 컬럼은 그대로 남아, 언제 다시 잰 건지 알 수 없게 된다.
      measured_on: kstToday(), measured_at: new Date().toISOString(),
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
      // 주 단위로 유일하다. 크론이 20:30 UTC(다음날 KST)에 도는 탓에 같은 주 같은 회차가
      // 날짜만 다르게 두 번 쌓이던 걸 막는다 — 나중 실행이 앞 실행을 덮는다.
      .upsert(rows.slice(i, i + 200), { onConflict: 'measured_week,site,engine,question_id,run_no' })
    if (insErr) console.error('[geo-runner] 저장 실패:', insErr.message)
  }
  return out
}
