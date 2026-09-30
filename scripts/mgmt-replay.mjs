#!/usr/bin/env node
// mgmt-replay.mjs — 6~9월 재현 시험. 씨앗 규칙(SEED_RULES)을 2026-06-01~09-30 로 전개해서
// 실제 근거(세금·메일·현금)가 있었는지 재본다. 완전히 읽기 전용이다: DB 쓰기·커서 저장·
// 텔레그램·Gmail/Chat 발신 없음(Gmail/Chat 은 metadata 읽기만 한다).
//   node scripts/mgmt-replay.mjs [--sample-chat N]   (N 은 0~5, 기본 0 — Task 13 브리프 제약)
// 출력: scripts/logs/mgmt-replay-2026-06-09.md (git-ignored).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { makeCalendar } from './lib/mgmt/calendar.mjs'
import { expandRule } from './lib/mgmt/rules.mjs'
import { SEED_RULES } from './lib/mgmt/seed-rules.mjs'
import { findEvidence } from './lib/mgmt/closers.mjs'
import { inferRules } from './lib/mgmt/infer.mjs'
import { readMail, readChat } from './lib/mgmt/sources.mjs'
import { buildPrompt, judge } from './lib/mgmt/judge.mjs'
import { cashFact, splitMailFacts, mailEvent, cashEvent } from './lib/mgmt/runner-helpers.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const OUT = path.join(ROOT, 'scripts/logs/mgmt-replay-2026-06-09.md')

const args = process.argv.slice(2)
const sampleChatRaw = args.includes('--sample-chat') ? Number(args[args.indexOf('--sample-chat') + 1]) : 0
const sampleChat = Math.max(0, Math.min(5, Number.isFinite(sampleChatRaw) ? sampleChatRaw : 0))

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const log = m => console.log(`[replay] ${m}`)

// 시험 기간 — Task 13 브리프 그대로.
const FROM = '2026-06-01'
const TO = '2026-09-30'
// 증빙 창(closers.mjs: 메일 ±10일, 세금 ±5일, 현금 ±3일)보다 넉넉히 앞뒤 버퍼를 둔다.
const FACTS_FROM = '2026-05-10'
const FACTS_TO = '2026-10-10'

function must({ data, error }, what) { if (error) throw new Error(`${what}: ${error.message}`); return data }

const CONTEXTS = [['tensoftworks', 'tensw'], ['default', 'willow']]
const CASH_TABLES = [['tensw_mgmt_cash', 'tensw'], ['willow_mgmt_cash', 'willow']]
const tableFor = company => company === 'willow' ? 'willow_mgmt_schedules' : 'tensw_mgmt_schedules'
// ledger.mjs 의 같은 한 줄(export 안 된 비공개 함수라 그대로 옮겨 씀) — {period} 를 채운다.
const fill = (title, period) => title.replaceAll('{period}', period)

// ---------- 사실 적재(읽기 전용) — Task 12 loadFacts 와 같은 매핑, 기간만 6~9월 버퍼로 ----------
async function loadMailAndFacts() {
  const rawByContext = {}
  const sentMail = [], receivedMail = []
  for (const [context] of CONTEXTS) {
    const mails = await readMail(sb, context, { last_seen_at: `${FACTS_FROM}T00:00:00Z` }, { limit: 500, maxPages: 40, format: 'metadata' })
    rawByContext[context] = mails
    const { sent, received } = splitMailFacts(mails, context)
    sentMail.push(...sent); receivedMail.push(...received)
  }
  return { rawByContext, sentMail, receivedMail }
}

async function loadCashFacts(from, to) {
  const cash = []
  for (const [table] of CASH_TABLES) {
    const data = must(await sb.from(table)
      .select('id, type, counterparty, description, amount, payment_date, issue_date')
      .or(`and(payment_date.gte.${from},payment_date.lte.${to}),and(payment_date.is.null,issue_date.gte.${from},issue_date.lte.${to})`), table)
    for (const r of data ?? []) cash.push(cashFact(r, table))
  }
  return cash
}

async function loadFacts() {
  const taxObligations = must(await sb.from('finance_tax_obligations')
    .select('id, company, obligation_type, due_date, status, paid_at')
    .gte('due_date', FACTS_FROM).lte('due_date', FACTS_TO).is('deleted_at', null), 'finance_tax_obligations')
  const { rawByContext, sentMail, receivedMail } = await loadMailAndFacts()
  const cash = await loadCashFacts(FACTS_FROM, FACTS_TO)
  log(`증빙 로딩: 세금 ${taxObligations.length} · 보낸메일 ${sentMail.length} · 받은메일 ${receivedMail.length} · 현금 ${cash.length}`)
  return { taxObligations, sentMail, receivedMail, cash, rawByContext }
}

// ---------- 표 1: 정기 회차 재현 ----------
function evidenceDate(ev, facts) {
  if (!ev) return null
  if (ev.at) return String(ev.at).slice(0, 10)
  if (ev.kind === 'tax') {
    const ids = String(ev.ref ?? '').split(',')
    const dates = facts.taxObligations.filter(t => ids.includes(t.id)).map(t => t.due_date)
    return dates.sort().at(-1) ?? null
  }
  return null
}
const diffDays = (a, b) => (a && b) ? Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000) : null

function buildOccurrenceTable(cal, facts) {
  const rows = []
  for (const rule of SEED_RULES) {
    for (const { date, period } of expandRule(rule.rule, FROM, TO, cal)) {
      const title = fill(rule.title, period)
      const task = `${rule.task_key}:${rule.step}`
      if (!rule.completion) {
        // Task 9 판정: completion 없는 규칙(서명본 회신 등)은 메시지 증빙으로만 닫힌다 —
        // 이 시험은 judge 재현을 넣지 않으므로(브리프) 여기서는 판정 대상 밖이다.
        rows.push({ company: rule.company, task, title, date, period, evKind: '(메시지 전용)', evDate: '-', diff: '-', verdict: '시험범위밖' })
        continue
      }
      const ev = findEvidence({ schedule_date: date }, rule, facts)
      const evDate = evidenceDate(ev, facts)
      const diff = diffDays(evDate, date)
      rows.push({ company: rule.company, task, title, date, period, evKind: ev?.kind ?? '없음', evDate: evDate ?? '-', diff: diff ?? '-', verdict: ev ? '있음' : '빠짐' })
    }
  }
  return rows.sort((a, b) => a.company.localeCompare(b.company) || a.date.localeCompare(b.date))
}

// ---------- 표 2: 닫힘 누락 사례 ----------
// 원장은 source_key 로 찾지 않는다(이 규칙들로 만든 행이 실제로는 없다 — mgmt_rules 가 아직
// 비어 있다) — 제목에 업무 키워드가 있고 날짜가 가까운 행으로 찾는다.
const TASK_KEYWORDS = {
  'payroll:request': ['급여대장'],
  'payroll:payday': ['급여'],
  'attendance:send': ['출근부'],
  'attendance:collect': ['출근부'],
  'subsidy:submit': ['지원금'],
  'withholding:pay': ['원천세', '원천징수'],
  'social-insurance:pay': ['4대보험'],
  'vat:pay': ['부가세'],
  'etc-invoice:issue': ['인보이스', 'invoice'],
  'etc-referral:receive': ['레퍼럴', 'referral'],
  'akros-fee:issue': ['아크로스'],
  'corp-tax:file': ['법인세'],
  'corp-local-tax:file': ['지방소득세(법인'],
  'year-end-settlement:file': ['연말정산', '지급명세서'],
}
const matchesKeyword = (text, kws) => { const t = String(text ?? '').toLowerCase(); return kws.some(k => t.includes(k.toLowerCase())) }
const withinDays = (dateStr, anchor, window) => dateStr ? Math.abs(diffDays(String(dateStr).slice(0, 10), anchor) ?? 999) <= window : false
// email_todos/ws_threads 에는 company 컬럼이 없다 — label(email_todos)·tags(ws_threads) 의 첫 토큰으로
// 회사를 가늠한다. ETC·아크로스는 윌로우 쪽 사업이라 윌로우 동의어에 넣는다. 못 가르면(둘 다 아니면)
// 매칭에서 뺀다 — 잘못된 회사에 붙이는 것보다 놓치는 쪽이 안전하다.
const COMPANY_SYNONYMS = { willow: ['willow', 'etc', 'akros'], tensw: ['tensw', 'tensoftworks'] }
function companyMatches(company, { label, tags } = {}) {
  const syns = COMPANY_SYNONYMS[company] ?? []
  const labelSeg = String(label ?? '').split('/')[0].trim().toLowerCase()
  if (labelSeg && syns.includes(labelSeg)) return true
  return Array.isArray(tags) && tags.some(t => syns.includes(String(t).toLowerCase()))
}

async function loadTrackers() {
  const emailTodos = must(await sb.from('email_todos').select('id, label, task, due_date, completed, completed_at, created_at').eq('completed', false), 'email_todos')
  const wsThreads = must(await sb.from('ws_threads').select('id, project, title, status, summary, tags, created_at, last_touched_at').neq('status', 'resolved'), 'ws_threads')
  const ledgerRows = {}
  for (const company of ['tensw', 'willow']) {
    ledgerRows[company] = must(await sb.from(tableFor(company)).select('id, title, schedule_date, is_completed, agent_state').eq('is_completed', false), tableFor(company))
  }
  log(`추적 시스템(열림): email_todos ${emailTodos.length} · ws_threads ${wsThreads.length} · 원장(tensw) ${ledgerRows.tensw.length} · 원장(willow) ${ledgerRows.willow.length}`)
  return { emailTodos, wsThreads, ledgerRows }
}

function findOpenGaps(occRow, trackers) {
  const kws = TASK_KEYWORDS[occRow.task] ?? []
  if (!kws.length) return []
  const gaps = []
  for (const r of trackers.ledgerRows[occRow.company] ?? []) {
    if (matchesKeyword(r.title, kws) && withinDays(r.schedule_date, occRow.date, 10)) gaps.push({ source: '원장', id: r.id, trackerTitle: r.title, at: r.schedule_date })
  }
  for (const r of trackers.emailTodos) {
    const text = `${r.label ?? ''} ${r.task ?? ''}`
    const dateOk = r.due_date ? withinDays(r.due_date, occRow.date, 20) : withinDays(r.created_at, occRow.date, 25)
    if (matchesKeyword(text, kws) && dateOk && companyMatches(occRow.company, r)) gaps.push({ source: 'email_todos', id: r.id, trackerTitle: r.task, at: r.due_date ?? String(r.created_at).slice(0, 10) })
  }
  for (const r of trackers.wsThreads) {
    const text = `${r.title ?? ''} ${r.summary ?? ''}`
    if (matchesKeyword(text, kws) && withinDays(r.created_at, occRow.date, 25) && companyMatches(occRow.company, r)) gaps.push({ source: 'ws_threads', id: r.id, trackerTitle: r.title, at: String(r.created_at).slice(0, 10) })
  }
  return gaps
}

// occRow.title(회차 제목)을 유지한 채 g(추적 항목: source/id/trackerTitle/at)를 얹는다 — 키가 겹치지 않는다.
function buildClosureGaps(occRows, trackers) {
  const out = []
  for (const occ of occRows) {
    if (occ.verdict !== '있음') continue
    for (const g of findOpenGaps(occ, trackers)) out.push({ ...occ, ...g })
  }
  return out
}

// ---------- 표 3: 추론 규칙 ----------
async function buildInferEvents(rawByContext) {
  const events = []
  for (const [context, company] of CONTEXTS) {
    for (const m of rawByContext[context] ?? []) {
      if (m.at.slice(0, 10) < FROM || m.at.slice(0, 10) > TO) continue
      const e = mailEvent(m, company)
      if (e) events.push(e)
    }
  }
  const cashRows = []
  for (const [table, company] of CASH_TABLES) {
    const data = must(await sb.from(table).select('id, type, counterparty, description, amount, payment_date, issue_date')
      .or(`and(payment_date.gte.${FROM},payment_date.lte.${TO}),and(payment_date.is.null,issue_date.gte.${FROM},issue_date.lte.${TO})`), table)
    for (const r of data ?? []) cashRows.push([r, table, company])
  }
  for (const [r, table, company] of cashRows) { const e = cashEvent(r, table, company); if (e) events.push(e) }
  return events
}

// ---------- 부록: --sample-chat N (기본 0 — 켤 때만 codex 판단을 부른다) ----------
async function sampleChatAppendix(n) {
  if (!n) return null
  const since = { last_seen_at: `${FROM}T00:00:00Z`, last_ref: null }
  const bySpace = await readChat(sb, async () => since, { now: new Date(`${TO}T23:59:59Z`) })
  const items = [...bySpace.values()].flat().sort((a, b) => a.at.localeCompare(b.at)).slice(0, n)
  if (!items.length) return { items: [], result: null }
  const prompt = buildPrompt({ company: 'tensw', items, openCases: [], openSchedules: [] })
  const result = await judge(prompt)
  return { items, result }
}

// ---------- 마크다운 렌더 ----------
const companyLabel = c => c === 'willow' ? '윌로우' : '텐소'
function renderTable1(rows) {
  const head = '| 회사 | 업무 | 회차 날짜 | 근거 종류 | 근거 날짜 | 차이(일) | 판정 |\n|---|---|---|---|---|---|---|'
  const body = rows.map(r => `| ${companyLabel(r.company)} | ${r.title} | ${r.date} | ${r.evKind} | ${r.evDate} | ${r.diff} | ${r.verdict} |`).join('\n')
  return `${head}\n${body}`
}
function renderTable2(rows) {
  if (!rows.length) return '(없음 — 근거가 있는 회차 중 원장·email_todos·ws_threads 에 열린 채 남은 항목을 찾지 못했다)'
  const head = '| 회사 | 업무(회차) | 회차 날짜 | 열린 곳 | 열린 항목 | 항목 날짜 |\n|---|---|---|---|---|---|'
  const body = rows.map(r => `| ${companyLabel(r.company)} | ${r.title} | ${r.date} | ${r.source} | ${r.trackerTitle} | ${r.at} |`).join('\n')
  return `${head}\n${body}`
}
function renderTable3(rows) {
  if (!rows.length) return '(없음 — 6~9월 이벤트로는 최소 3개월 반복 기준을 넘는 새 후보가 없었다)'
  const head = '| 회사 | 제목 | 매월 날짜 | 신뢰도 | 근거 수 |\n|---|---|---|---|---|'
  const body = rows.map(r => `| ${companyLabel(r.company)} | ${r.title} | ${r.rule.day}일 | ${r.confidence} | ${r.evidence.length} |`).join('\n')
  return `${head}\n${body}`
}

async function main() {
  const cal = makeCalendar()
  const facts = await loadFacts()
  const occRows = buildOccurrenceTable(cal, facts)

  const scored = occRows.filter(r => r.verdict !== '시험범위밖')
  const found = scored.filter(r => r.verdict === '있음').length
  const reproductionRate = scored.length ? found / scored.length : 0

  const trackers = await loadTrackers()
  const gapsForRender = buildClosureGaps(occRows, trackers)

  const inferEvents = await buildInferEvents(facts.rawByContext)
  const inferred = inferRules(inferEvents, { existingRules: SEED_RULES, minMonths: 3 })
  log(`추론 이벤트 ${inferEvents.length}건 → 추론 규칙 ${inferred.length}건`)

  let appendix = ''
  if (sampleChat > 0) {
    log(`--sample-chat ${sampleChat}: 스페이스 메시지 표본으로 judge 부름`)
    const sample = await sampleChatAppendix(sampleChat)
    if (sample?.items.length) {
      appendix = [
        '',
        '## 부록: --sample-chat 표본 judge 결과',
        `표본 ${sample.items.length}건 (2026-06-01~09-30 텐소 스페이스, 오래된 순).`,
        '```json',
        JSON.stringify(sample.result, null, 2),
        '```',
      ].join('\n')
    } else {
      appendix = '\n## 부록: --sample-chat 표본 judge 결과\n(표본 기간에 스페이스 메시지가 없었다)'
    }
  }

  const md = [
    '# 경영관리 에이전트 6~9월 재현 시험',
    '',
    `실행: ${new Date().toISOString()} · 기간 ${FROM} ~ ${TO} · 읽기 전용(DB 쓰기·커서 저장·텔레그램·메일/챗 발신 없음)`,
    '',
    '## 요약',
    `- 재현율(근거 잡힌 회차 / 판정 대상 회차) = ${found}/${scored.length} = ${(reproductionRate * 100).toFixed(1)}%`,
    `- 닫힘 누락(근거 있으나 원장·email_todos·ws_threads 에 열린 채 남은 항목) = ${gapsForRender.length}건`,
    `- 추론 규칙(inferRules, minMonths:3) = ${inferred.length}개`,
    '',
    '## 표 1 — 정기 회차 재현',
    renderTable1(occRows),
    '',
    '## 표 2 — 닫힘 누락 사례',
    renderTable2(gapsForRender),
    '',
    '## 표 3 — 추론 규칙',
    renderTable3(inferred),
    appendix,
  ].join('\n')

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, md)
  log(`보고서 저장: ${OUT}`)
  log(`재현율 ${found}/${scored.length} (${(reproductionRate * 100).toFixed(1)}%) · 닫힘 누락 ${gapsForRender.length} · 추론 규칙 ${inferred.length}`)

  const missed = occRows.filter(r => r.verdict === '빠짐')
  if (missed.length) {
    log(`빠짐 ${missed.length}건:`)
    for (const m of missed) log(`  - ${companyLabel(m.company)} ${m.title} (${m.date})`)
  }
}

main().catch(e => { console.error(e); process.exitCode = 1 })
