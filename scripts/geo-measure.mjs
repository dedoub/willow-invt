#!/usr/bin/env node
/**
 * GEO 주간 측정 러너.
 *
 * 고정된 비브랜드 질문 세트를 답변엔진에 반복 실행하고, 답변에서 세 가지를 뽑아 적재한다.
 *   mentioned  브랜드가 답변 본문에 언급됐는가
 *   top3       추천 목록 상위 3개 안에 들었는가
 *   cited      우리 URL이 출처(grounding)로 붙었는가
 *
 * 핵심 지표는 cited가 아니라 **top3**다. 링크만 인용되고 정작 경쟁사를 추천하는 답변이 흔하다.
 * 같은 답변에서 추천된 경쟁 서비스도 같이 기록해, 우리가 빠진 자리에 누가 있는지 본다.
 *
 * 사용법:
 *   node scripts/geo-measure.mjs                 # 전체(사이트 x 엔진 x 질문 x N회)
 *   node scripts/geo-measure.mjs voicecards      # 한 사이트만
 *   node scripts/geo-measure.mjs reviewnotes gemini 1
 *
 * 엔진별 전제:
 *   gemini      GEMINI_API_KEY + google_search grounding. 지금 유일하게 동작한다.
 *   chatgpt     OPENAI_API_KEY 필요(web_search 도구). 키 없으면 건너뛴다.
 *   perplexity  PERPLEXITY_API_KEY 필요. 키 없으면 건너뛴다.
 *
 * 주의: API 표면은 소비자 제품(chatgpt.com 등)과 같은 답이 아니다. 같은 조건으로 반복해
 * **추세**를 보는 용도이지, 절대값을 제품 화면과 비교하면 안 된다.
 */

import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const SETS = JSON.parse(fs.readFileSync('scripts/geo-questions.json', 'utf8'))
const [siteArg, engineArg, runsArg] = process.argv.slice(2)
const SITES = siteArg ? [siteArg] : ['voicecards', 'reviewnotes']
const RUNS = Number(runsArg || 3)

/** 브랜드 표기 흔들림(VoiceCards / Voice Cards / voicecards.quest)을 한 번에 잡는다 */
const BRAND_RE = {
  voicecards: /voice\s*cards?|voicecards\.quest/i,
  reviewnotes: /review\s*notes?|reviewnotes\.app/i,
}

/**
 * 추천 목록 상위 3개 판정.
 * 답변에서 번호/불릿 목록을 뽑아 앞 3항목 안에 브랜드가 있는지 본다.
 * 목록이 없으면 본문 앞 40%에 언급됐는지로 대체한다(서술형 답변에서 먼저 거론되면 사실상 추천 상위다).
 */
function inTop3(answer, brandRe) {
  const items = [...answer.matchAll(/^\s*(?:\d+[.)]|[-*•])\s+(.{3,160})$/gm)].map(m => m[1])
  if (items.length >= 3) return items.slice(0, 3).some(x => brandRe.test(x))
  const head = answer.slice(0, Math.max(200, Math.floor(answer.length * 0.4)))
  return brandRe.test(head)
}

const hostOf = u => { try { return new URL(u).host.replace(/^www\./, '') } catch { return '' } }

// ─── 엔진 어댑터. { answer, sources[] }를 돌려주면 된다 ────────────────────────

async function askGemini(question) {
  const key = env.GEMINI_API_KEY
  if (!key) return null
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini ${res.status} ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  const c = j.candidates?.[0]
  const answer = (c?.content?.parts ?? []).map(p => p.text).filter(Boolean).join('\n')
  const chunks = c?.groundingMetadata?.groundingChunks ?? []
  // grounding의 uri는 리다이렉트 래퍼라 호스트가 안 보인다. title에 실제 도메인이 온다.
  const sources = chunks.map(x => x.web?.title || hostOf(x.web?.uri || '')).filter(Boolean)
  return { answer, sources }
}

async function askOpenAI(question) {
  const key = env.OPENAI_API_KEY
  if (!key) return null
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5', tools: [{ type: 'web_search' }], input: question }),
  })
  if (!res.ok) throw new Error(`openai ${res.status} ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  const answer = j.output_text ?? JSON.stringify(j).slice(0, 4000)
  const sources = [...JSON.stringify(j).matchAll(/https?:\/\/[^\s"'\\]+/g)].map(m => hostOf(m[0])).filter(Boolean)
  return { answer, sources: [...new Set(sources)] }
}

async function askPerplexity(question) {
  const key = env.PERPLEXITY_API_KEY
  if (!key) return null
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: question }] }),
  })
  if (!res.ok) throw new Error(`perplexity ${res.status} ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  return {
    answer: j.choices?.[0]?.message?.content ?? '',
    sources: (j.citations ?? []).map(hostOf).filter(Boolean),
  }
}

const ENGINES = { gemini: askGemini, chatgpt: askOpenAI, perplexity: askPerplexity }

// ─── 적재 ─────────────────────────────────────────────────────────────────────

async function save(rows) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/geo_answer_measurements?on_conflict=measured_on,site,engine,question_id,run_no`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) console.error('저장 실패', res.status, (await res.text()).slice(0, 200))
}

// ─── 실행 ─────────────────────────────────────────────────────────────────────

for (const site of SITES) {
  const set = SETS[site]
  if (!set) { console.error(`알 수 없는 사이트: ${site}`); continue }
  const brandRe = BRAND_RE[site]
  const engines = engineArg ? [engineArg] : Object.keys(ENGINES)

  for (const engine of engines) {
    const ask = ENGINES[engine]
    if (!ask) { console.error(`알 수 없는 엔진: ${engine}`); continue }
    if (!(await ask('ping').catch(() => null)) && !env[`${engine === 'chatgpt' ? 'OPENAI' : engine.toUpperCase()}_API_KEY`] && engine !== 'gemini') {
      console.log(`${site}/${engine}: 키 없음 — 건너뜀`)
      continue
    }

    const rows = []
    let mentioned = 0, top3 = 0, cited = 0, total = 0
    for (const { id, q } of set.questions) {
      for (let run = 1; run <= RUNS; run++) {
        let out
        try { out = await ask(q) } catch (e) { console.error(`  ${id} run${run} 실패: ${e.message}`); continue }
        if (!out) { console.log(`${site}/${engine}: 키 없음 — 건너뜀`); run = RUNS; break }

        const blob = `${out.answer}\n${out.sources.join('\n')}`
        const m = brandRe.test(blob)
        const t = m && inTop3(out.answer, brandRe)
        const ourUrls = out.sources.filter(s => set.our_domains.some(d => s.toLowerCase().includes(d)))
        const c = ourUrls.length > 0
        const comps = set.competitors.filter(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(out.answer))

        total++; if (m) mentioned++; if (t) top3++; if (c) cited++
        rows.push({
          site, engine, question_id: id, question: q, run_no: run,
          mentioned: m, top3: t, cited: c,
          our_urls: ourUrls, competitors: comps, source_domains: out.sources.slice(0, 20),
          answer_excerpt: out.answer.slice(0, 1200),
        })
      }
    }
    if (rows.length === 0) continue
    for (let i = 0; i < rows.length; i += 200) await save(rows.slice(i, i + 200))
    const pct = n => total ? `${Math.round((n / total) * 1000) / 10}%` : '—'
    console.log(`${site}/${engine}: ${total}회 | 언급 ${pct(mentioned)} · 추천Top3 ${pct(top3)} · 인용 ${pct(cited)}`)
  }
}
