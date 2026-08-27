#!/usr/bin/env node
// 두 앱의 AI 요율이 실측 원가 대비 마진 80~90% 안에 있는지 주 1회 본다.
//
//   node scripts/credit-rate-audit.mjs            # 텔레그램으로 보낸다
//   node scripts/credit-rate-audit.mjs --print    # 보내지 않고 찍기만 한다
//
// <b>스크립트가 판정까지 한다.</b> claude 를 무인으로 부르는 길도 있지만, 헤드리스
// 에서는 Supabase MCP 가 안 붙을 수 있어 그날치가 통째로 빈다. 판정 규칙은
// `.claude/skills/credit-rate-audit/SKILL.md` 와 같은 것을 여기 옮겨 적었다 —
// 사람이 부를 때는 그 스킬이, 스케줄로 돌 때는 이 스크립트가 같은 답을 낸다.
//
// 기준: 크레딧당 판매가 $0.0099(세 앱 공통). 마진 85% 면 크레딧 하나가 감당할
// 원가는 1,485 마이크로달러다.

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const MICROS_PER_CREDIT = 9900          // 판매가
const TARGET_MARGIN = 0.85
const ALLOWED_MICROS = MICROS_PER_CREDIT * (1 - TARGET_MARGIN)  // 1,485
const BAND = [0.80, 0.90]
const MIN_SAMPLES = 3                   // 이보다 적으면 값을 바꾸라고 하지 않는다

/**
 * 지금 요율. 코드(`ai-quota.ts`·`quota.ts`)와 <b>같이</b> 유지해야 한다.
 * 어긋나면 이 보고가 거짓이 되므로, 요율을 바꾸는 커밋은 여기도 함께 고친다.
 */
const RATES = {
  reviewnotes: {
    pageRegions: { credits: (m) => (m.pages ?? 0) * 2, label: '지면 크롭(쪽당 2)' },
    regionGrouping: { credits: (m) => Math.max(1, Math.ceil((m.pairs ?? m.regions ?? 0) / 20)), label: '그룹핑(20개당 1)' },
    documentExtraction: { credits: (m) => Math.max(10, (m.pages ?? 1) * 2), label: '문서 추출(쪽당 2·최소 10)' },
    deepSolution: { credits: () => 8, label: '심화 풀이(8)' },
    textSolution: { credits: (m) => Math.max(1, m.problems ?? 1), label: '풀이 생성(문항당 1)' },
    similarProblem: { credits: () => 5, label: '유사 문제(5)' },
    setSelection: { credits: () => 5, label: '세트 선택(5)' },
    textTagSuggestion: { credits: () => 5, label: '태그 제안(5)' },
    imageTagSuggestion: { credits: (m) => Math.max(1, m.problems ?? 1), label: '이미지 태그(1개당 1)' },
    tagReview: { credits: (m) => Math.max(1, Math.ceil((m.problems ?? 1) / 3)), label: '태그 정리(3개당 1)' },
  },
  scripta: {
    sentence: { milli: 287, label: '문장 채점(287밀리)' },
    paragraph: { milli: 356, label: '문단 채점(356밀리)' },
    text: { milli: 1000, label: '글 채점(1,000밀리)' },
    structure: { credits: 4, label: '구조 생성(조각당 4)' },
    handwriting: { credits: 1, label: '손글씨 읽기(1)' },
  },
}

/**
 * `rows` 는 건별 배열이거나(리뷰노트) 이미 합쳐진 것이다(스크립타 — 집계 RPC 만
 * 읽을 수 있다). 둘을 같은 모양으로 눕혀 하나의 판정 규칙만 남긴다.
 */
function totals(rows) {
  if (Array.isArray(rows)) {
    return {
      n: rows.length,
      totalCost: rows.reduce((sum, r) => sum + r.cost, 0),
      totalCredits: rows.reduce((sum, r) => sum + r.credits, 0),
      worstPerCredit: Math.max(0, ...rows.map((r) => (r.credits > 0 ? r.cost / r.credits : 0))),
    }
  }
  return rows
}

function verdict(input) {
  const { n, totalCost, totalCredits, worstPerCredit } = totals(input ?? [])
  if (n === 0) return { mark: '❌', n: 0, note: '실측 0건 — 계측이 붙어 있는지 확인' }
  const credits = totalCredits
  if (credits <= 0) return { mark: '❔', n, note: '크레딧 0 — 셀 수 없음' }
  const perCredit = totalCost / credits
  const margin = 1 - perCredit / MICROS_PER_CREDIT
  const worstMargin = 1 - worstPerCredit / MICROS_PER_CREDIT
  const suggested = totalCost / ALLOWED_MICROS

  // 표본이 얇으면 판정만 하고 값을 바꾸라고 하지 않는다 — 그 하나가 최악값일 때
  // 모두가 그 값을 낸다. 실제로 심화 풀이와 지면 크롭에서 그렇게 틀렸다.
  if (n < MIN_SAMPLES) {
    return { mark: '❔', n, margin, worstMargin, note: `표본 ${n}건 — 값을 바꾸기엔 얇다` }
  }
  if (margin < BAND[0]) return { mark: '⚠️', n, margin, worstMargin, suggested, note: '띠 아래 — 올려야 한다' }
  if (margin > BAND[1]) return { mark: '⚠️', n, margin, worstMargin, suggested, note: '띠 위 — 내려야 한다' }
  return { mark: '✅', n, margin, worstMargin, note: '띠 안' }
}

const pct = (v) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

async function reviewnotesRows() {
  const url = process.env.REVIEWNOTES_SUPABASE_URL
  const key = process.env.REVIEWNOTES_SUPABASE_SERVICE_KEY
  if (!url || !key) return { error: 'REVIEWNOTES_SUPABASE_* 없음' }
  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client
    .from('EventLog')
    .select('meta, createdAt')
    .eq('name', 'ai_tokens')
    .order('createdAt', { ascending: false })
    .limit(2000)
  if (error) return { error: error.message }

  const byFeature = new Map()
  for (const row of data ?? []) {
    const meta = row.meta ?? {}
    /**
     * 2026-08-27 이전 기록은 크롭·짝확인·문서추출이 전부 `documentExtraction`
     * 한 이름이었다. `mode` 가 그 셋을 가르므로 옛 행도 제 기능으로 돌려놓는다 —
     * 안 그러면 크롭 실측이 문서 추출 것으로 세어져 요율 판단이 통째로 어긋난다.
     */
    const feature = meta.mode === 'regions' ? 'pageRegions'
      : meta.mode === 'pairCheck' ? 'regionGrouping'
      : meta.mode === 'grouping' ? 'regionGrouping'
      : meta.feature
    const rate = RATES.reviewnotes[feature]
    if (!rate) continue
    const cost = Number(meta.costUsdMicros)
    if (!Number.isFinite(cost)) continue
    // 크레딧은 <b>지금 요율</b>로 다시 센다. `meta.credits` 는 그때 받은 값이라
    // 요율을 바꾼 뒤에는 옛 행과 새 행이 다른 자를 쓴다.
    const credits = Math.max(0, rate.credits(meta))
    if (!byFeature.has(feature)) byFeature.set(feature, [])
    byFeature.get(feature).push({ cost, credits })
  }
  return { byFeature }
}

async function scriptaRows() {
  const url = process.env.SCRIPTA_SUPABASE_URL
  const key = process.env.SCRIPTA_SUPABASE_SERVICE_KEY
  if (!url || !key) return { error: 'SCRIPTA_SUPABASE_* 없음' }
  const client = createClient(url, key, { auth: { persistSession: false } })

  /**
   * 표를 직접 읽지 않는다. `scripta_attempts` 등은 `authenticated` 에게만 열려
   * 있고 `service_role` 은 표 권한이 없다 — 스크립타의 관리자 조회는 전부
   * `security definer` 집계 함수를 거친다(`sc_*`).
   */
  const { data, error } = await client.rpc('sc_ai_cost_summary')
  if (error) return { error: error.message }

  const byFeature = new Map()
  for (const row of data ?? []) {
    const rate = RATES.scripta[row.feature]
    if (!rate) continue
    const perCall = rate.milli ? rate.milli / 1000 : rate.credits
    const n = Number(row.n) || 0
    if (n === 0) continue
    // 집계만 받으므로 건별 행을 만들지 않는다. 합계는 그대로 쓰고, 최악값은
    // 한 건짜리 행으로 따로 넣어 최악 마진이 계산되게 한다.
    byFeature.set(row.feature, {
      n,
      totalCost: Number(row.cost_micros) || 0,
      totalCredits: perCall * n,
      worstPerCredit: (Number(row.worst_micros) || 0) / perCall,
    })
  }
  return { byFeature, aggregated: true }
}

function section(title, rates, result) {
  if (result.error) return `${title}\n  읽지 못함: ${result.error}`
  const lines = [title]
  let flagged = 0
  for (const [key, rate] of Object.entries(rates)) {
    const v = verdict(result.byFeature.get(key) ?? [])
    if (v.mark === '⚠️') flagged += 1
    const suggestion = v.suggested !== undefined
      ? ` → ${v.suggested < 1 ? v.suggested.toFixed(2) : Math.round(v.suggested)} 제안`
      : ''
    lines.push(`  ${v.mark} ${rate.label} · n=${v.n} · 평균 ${pct(v.margin)} / 최악 ${pct(v.worstMargin)} · ${v.note}${suggestion}`)
  }
  return { text: lines.join('\n'), flagged }
}

async function main() {
  const [rn, sc] = await Promise.all([reviewnotesRows(), scriptaRows()])
  const a = section('■ 리뷰노트', RATES.reviewnotes, rn)
  const b = section('■ 스크립타', RATES.scripta, sc)
  const flagged = (a.flagged ?? 0) + (b.flagged ?? 0)
  const head = flagged > 0
    ? `크레딧 요율 점검 — 띠 밖 ${flagged}건`
    : '크레딧 요율 점검 — 모두 띠 안(80~90%)'
  const body = [head, '', typeof a === 'string' ? a : a.text, '', typeof b === 'string' ? b : b.text].join('\n')

  if (process.argv.includes('--print')) {
    console.log(body)
    return
  }
  /**
   * 보낼 곳은 <b>DB 에서 찾는다</b>(`notify-job.mjs` 와 같은 길). chat id 를 env 에
   * 적어 두면 봇 대화가 바뀔 때 조용히 엉뚱한 곳으로 가거나 끊긴다.
   */
  const token = process.env.TELEGRAM_BOT_TOKEN
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!token || !url || !key) {
    console.log(body)
    console.error('텔레그램·Supabase 환경변수가 없어 보내지 못했다 — 위 내용만 남긴다.')
    return
  }
  const found = await fetch(
    `${url}/rest/v1/telegram_conversations?bot_type=eq.ceo&select=chat_id&order=updated_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  )
  const chatId = found.ok ? (await found.json())[0]?.chat_id : null
  if (!chatId) {
    console.log(body)
    console.error('CEO 봇 대화를 찾지 못해 보내지 못했다 — 위 내용만 남긴다.')
    return
  }
  const sent = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: body }),
  })
  if (!sent.ok) {
    console.error('텔레그램 전송 실패', sent.status, await sent.text())
    console.log(body)
  }
}

await main()
