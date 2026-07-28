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
 * 무료 티어는 분당 호출 제한(RPM)이 있다. 429는 대개 일일 소진이 아니라 이 제한이므로
 * 호출 사이에 간격을 두고, 걸리면 지수 백오프로 재시도한다.
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

// 셸에서 준 값이 파일보다 우선한다. GEO_THROTTLE_MS 같은 일회성 조정을
// `.env.local` 고치지 않고 앞에 붙여 쓸 수 있어야 한다.
const env = {
  ...Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8').split('\n')
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  ),
  ...process.env,
}

const SETS = JSON.parse(fs.readFileSync('scripts/geo-questions.json', 'utf8'))

/**
 * 질문은 레지스트리(geo_questions)가 단일 진실원이다. active=true인 것만 측정한다.
 * 조회가 실패하면 파일 세트로 폴백한다 — 측정이 통째로 멈추는 것보다 낫다.
 */
async function loadQuestions(site) {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/geo_questions?site=eq.${site}&active=is.true&select=question_id,question,question_group&order=priority.asc,question_id.asc`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } },
    )
    if (!res.ok) throw new Error(`${res.status}`)
    const rows = await res.json()
    if (rows.length) return rows.map(r => ({ id: r.question_id, q: r.question, group: r.question_group }))
    console.error(`  레지스트리에 ${site} 질문이 없어 파일 세트로 진행`)
  } catch (e) {
    console.error(`  레지스트리 조회 실패(${e.message}) — 파일 세트로 진행`)
  }
  return (SETS[site]?.questions ?? []).map(x => ({ ...x, group: x.id.split('-')[1] ?? 'etc' }))
}
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

const sleep = ms => new Promise(r => setTimeout(r, ms))
/** 호출 간 최소 간격(ms). 무료 티어 RPM에 걸리지 않을 만큼만 벌린다 */
const THROTTLE_MS = Number(env.GEO_THROTTLE_MS || 7000)

/** 429·5xx는 잠깐 기다렸다 다시. 그래도 안 되면 그 회차만 포기한다 */
async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await fn() } catch (e) {
      // HTTP 엔진은 상태코드로, codex는 문구로 판단한다(종료코드가 다 1이라 코드로는 못 가른다).
      const retriable = /\b(429|500|502|503|504)\b|rate.?limit|usage limit|timed? ?out|ETIMEDOUT|SIGTERM|stream (error|disconnected)/i
        .test(e.message)
      if (!retriable || attempt === 4) throw e
      const wait = 20000 * attempt
      console.error(`  ${label} ${attempt}회차 재시도 (${Math.round(wait / 1000)}초 대기)`)
      await sleep(wait)
    }
  }
}

// ─── 엔진 어댑터. { answer, sources[] }를 돌려주면 된다 ────────────────────────

/**
 * 보이스카드 Supabase의 geo-ask 프록시. 그 프로젝트의 결제된 Gemini 키를 빌려 쓴다.
 * 대시보드 자체 키는 무료 티어라 그라운딩 일일 한도에 바로 걸린다. 정본: src/lib/geo-runner.ts
 */
async function askGeminiViaVoicecards(question) {
  const url = env.VOICECARDS_SUPABASE_URL
  const key = env.VOICECARDS_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  const res = await fetch(`${url}/functions/v1/geo-ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ question }),
  })
  const body = await res.text()
  if (!res.ok) {
    // 프록시가 Gemini 상태코드를 본문에 담아 넘긴다. withRetry가 429를 알아보게 꺼내준다.
    const upstream = body.match(/"status":\s*(\d{3})/)?.[1]
    throw new Error(`gemini ${upstream ?? res.status} ${body.slice(0, 160)}`)
  }
  const j = JSON.parse(body)
  return { answer: j.answer ?? '', sources: j.sources ?? [] }
}

async function askGemini(question) {
  const viaProxy = await askGeminiViaVoicecards(question)
  if (viaProxy) return viaProxy
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

/**
 * ChatGPT 계열을 codex CLI로 묻는다.
 *
 * CEO 봇이 쓰는 인증은 API 키가 아니라 ChatGPT 구독 로그인(`~/.codex/auth.json`의
 * auth_mode=chatgpt)이라 api.openai.com 경로로는 못 쓴다. codex는 같은 모델에
 * 네이티브 web_search를 붙일 수 있어서, 그 CLI를 통째로 어댑터로 쓴다.
 *
 * 두 가지를 알고 있어야 한다.
 *   - 코딩 에이전트 표면이라 소비자 chatgpt.com 답변과 더 멀다. 추세용이다.
 *   - 로컬 CLI라 Vercel 크론에서 못 돈다. 이 엔진은 launchd 주간 실행 전용이다.
 *
 * 출력 지시문은 모든 질문·모든 회차에 똑같이 붙는다. 그게 고정된 측정 조건의 일부다.
 * 이걸 빼면 codex가 URL을 안 달아서 인용 신호가 통째로 사라진다.
 */
const CODEX_SUFFIX =
  '\n\nAnswer as a user-facing recommendation: a numbered list, best first, ' +
  'one line of reasoning each, and the source URL for each item.'

async function askCodex(question) {
  const { spawn } = await import('node:child_process')
  // 프롬프트는 인자가 아니라 stdin으로 준다. 인자로 주면 codex가 stdin도 마저 읽으려고
  // 기다리는데, 셸에서는 터미널이 바로 EOF를 주지만 Node가 띄우면 파이프가 안 닫혀서
  // 빈 응답이나 타임아웃으로 끝난다.
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn('codex', [
      'exec', '--json', '-c', 'tools.web_search=true', '--skip-git-repo-check',
      '-m', env.GEO_CODEX_MODEL || 'gpt-5.5',
    ], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('codex timed out')) }, 300_000)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => { clearTimeout(timer); reject(new Error(`codex ${e.message}`)) })
    child.on('close', code => {
      clearTimeout(timer)
      // 모델명이 안 먹으면 config의 모델을 되는 걸로 바꿔야 한다(계정별로 다르다).
      if (code !== 0) return reject(new Error(`codex exit ${code}: ${err.slice(-160)}`))
      resolve(out)
    })
    child.stdin.end(question + CODEX_SUFFIX)
  })
  const answer = stdout.split('\n')
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(e => e?.type === 'item.completed' && e.item?.type === 'agent_message')
    .map(e => e.item.text)
    .join('\n')
    .trim()
  if (!answer) throw new Error('codex 빈 응답')
  // codex는 grounding 배열을 안 준다. 본문에 박힌 URL이 유일한 출처 신호다.
  const sources = [...answer.matchAll(/https?:\/\/[^\s)\]"'<>]+/g)].map(m => hostOf(m[0])).filter(Boolean)
  return { answer, sources: [...new Set(sources)] }
}

async function askOpenAI(question) {
  const key = env.OPENAI_API_KEY
  if (!key) return askCodex(question)
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

/**
 * 엔진을 못 돌리는 이유. 못 돌리면 사유를, 돌릴 수 있으면 빈 문자열을 준다.
 * 예전에는 'ping' 질문을 한 번 던져 살아있는지 봤는데, codex는 그 한 번이
 * 1분 넘게 걸리고 토큰도 쓴다. 물어보지 않고 판단할 수 있는 것만 여기서 본다.
 */
function unavailable(engine) {
  if (engine === 'gemini') {
    return env.VOICECARDS_SUPABASE_SERVICE_KEY || env.GEMINI_API_KEY ? '' : '키 없음'
  }
  if (engine === 'chatgpt') {
    if (env.OPENAI_API_KEY) return ''
    // codex 폴백. CLI와 로그인이 둘 다 있어야 한다.
    if (!fs.existsSync(`${process.env.HOME}/.codex/auth.json`)) return 'codex 로그인 없음'
    return ''
  }
  if (engine === 'perplexity') return env.PERPLEXITY_API_KEY ? '' : '키 없음'
  return ''
}

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
    const why = unavailable(engine)
    if (why) { console.log(`${site}/${engine}: ${why} — 건너뜀`); continue }

    const rows = []
    let mentioned = 0, top3 = 0, cited = 0, total = 0
    // GEO_LIMIT은 스모크 테스트용이다. 실측에는 쓰지 말 것 — 앞쪽 질문만 담긴
    // 회차가 레지스트리 전량 회차와 같은 주에 섞이면 주간 값이 왜곡된다.
    const limit = Number(env.GEO_LIMIT || 0)
    const questions = (await loadQuestions(site)).slice(0, limit || undefined)
    if (limit) console.log(`  GEO_LIMIT=${limit} — 앞 ${questions.length}문항만 (스모크)`)
    for (const { id, q, group } of questions) {
      for (let run = 1; run <= RUNS; run++) {
        let out
        try { out = await withRetry(() => ask(q), `${id} run${run}`) } catch (e) {
          console.error(`  ${id} run${run} 포기: ${e.message.slice(0, 100)}`); continue
        }
        await sleep(THROTTLE_MS)
        if (!out) { console.log(`${site}/${engine}: 키 없음 — 건너뜀`); run = RUNS; break }

        const blob = `${out.answer}\n${out.sources.join('\n')}`
        const m = brandRe.test(blob)
        const t = m && inTop3(out.answer, brandRe)
        const ourUrls = out.sources.filter(s => set.our_domains.some(d => s.toLowerCase().includes(d)))
        const c = ourUrls.length > 0
        const comps = set.competitors.filter(name => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(out.answer))

        total++; if (m) mentioned++; if (t) top3++; if (c) cited++
        rows.push({
          site, engine, question_id: id, question: q, question_group: group ?? null, run_no: run,
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
