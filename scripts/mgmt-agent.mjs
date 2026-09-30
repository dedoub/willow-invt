#!/usr/bin/env node
// 경영관리 에이전트 — 한 번 돌고 끝난다. launchd 가 30분마다 부른다(scripts/run-mgmt-agent.sh).
//   node scripts/mgmt-agent.mjs [--dry] [--only learn|rules|collect|close|decide|digest|infer]
//   node scripts/mgmt-agent.mjs lesson --company tensw|willow [--scope judge|rule|close|decision] "문장" [--dry]
// --dry 는 DB 쓰기·윌리 전송 없이 무엇을 할지 로그만 남긴다. MGMT_DRY_DIGEST=1 이면 dry 에서도
// 저녁 요약 한 통만 "(시험 운행)" 으로 윌리에게 보낸다(결정 메시지는 dry 에서 보내지 않는다).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { makeCalendar } from './lib/mgmt/calendar.mjs'
import { SEED_RULES } from './lib/mgmt/seed-rules.mjs'
import { planOccurrences, planMissed, applyPlan, tableFor } from './lib/mgmt/ledger.mjs'
import { getCursor, saveCursor, readMail, readChat } from './lib/mgmt/sources.mjs'
import { buildPrompt, judge } from './lib/mgmt/judge.mjs'
import { planJudgement, applyJudgement } from './lib/mgmt/apply-judgement.mjs'
import { inferRules, INFER_LIMIT, MIN_CONFIDENCE } from './lib/mgmt/infer.mjs'
import { planTuning } from './lib/mgmt/tune.mjs'
import { decisionMessage, digestMessage, reuseAnswer } from './lib/mgmt/decisions.mjs'
import { scorecard, skillCandidates } from './lib/mgmt/weekly.mjs'
import { recordWrite, forgetWrites, loadWrites, loadLessons, loadSuppressedKeys, pickLessons, PROMPT_SCOPES, planLearn, parseLessonArgs, saveLesson, bumpHits } from './lib/mgmt/lessons.mjs'
import { redact } from './lib/mgmt/redact.mjs'
import { addDays, planSteps, parseSourceKey, cashFact, splitMailFacts, planClose, missedDecision, missedAnswerPatch, ruleReviewAnswerPatch, mailEvent, cashEvent, closedToday, failureLine, pruneFailureLines, failuresOn, failureLabels, reuseRefs, isReuse, reuseLabel } from './lib/mgmt/runner-helpers.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] ?? '' : null
const only = onlyArg !== null && onlyArg.startsWith('--') ? '' : onlyArg
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const log = m => console.log(`${new Date().toISOString()} [mgmt] ${m}`)
const START = Date.now()
const COLLECT_DEADLINE_MS = 18 * 60e3 // 20분 상한 전에 judge 를 더 부르지 않고 멈춘다.
const failures = []
// 실패는 이번 실행 목록과 ~/.willow/mgmt-agent-failures.jsonl 에 함께 남긴다 — 18:35 요약이 오늘 것을 모두 보고한다.
const FAIL_FILE = path.join(os.homedir(), '.willow/mgmt-agent-failures.jsonl')
function recordFailure(step, message) {
  try {
    const lines = fs.existsSync(FAIL_FILE) ? fs.readFileSync(FAIL_FILE, 'utf8').split('\n').filter(Boolean) : []
    const kept = [...pruneFailureLines(lines), failureLine(step, message, new Date(), dryRun)]
    fs.mkdirSync(path.dirname(FAIL_FILE), { recursive: true })
    fs.writeFileSync(FAIL_FILE, kept.join('\n') + '\n')
  } catch (e) { console.error(`[mgmt] 실패 기록 못 함: ${e instanceof Error ? e.message : e}`) }
}
function fail(step, e) {
  const message = e instanceof Error ? e.message : String(e ?? '')
  failures.push(step)
  log(`실패 ${step}: ${message}`)
  recordFailure(step, message)
}
const COMPANIES = ['tensw', 'willow']
const CONTEXTS = [['tensoftworks', 'tensw'], ['default', 'willow']]
const CASH_TABLES = [['tensw_mgmt_cash', 'tensw'], ['willow_mgmt_cash', 'willow']]
const NOT_PERSONAL = 'category.is.null,category.neq.personal'
const kst = () => new Date(Date.now() + 9 * 3600e3)
const todayKey = () => kst().toISOString().slice(0, 10)
const startOfToday = () => `${todayKey()}T00:00:00+09:00`
// 이번 실행이 한 일(또는 dry 에서 할 일) — 저녁 요약 끝에 붙인다.
const tally = { inserted: 0, updated: 0, missed: 0, closed: 0, entries: 0, decisions: 0 }

// supabase 응답을 풀고 오류는 던진다(조용한 빈 결과로 오판하지 않게).
function must({ data, error, count }, what) {
  if (error) throw new Error(`${what}: ${error.message}`)
  return count !== undefined && count !== null && data === null ? count : data
}

// 교훈 장부: 에이전트가 원장 행을 쓸 때마다 마지막 값을 남긴다. 기록이 실패하면 그 행의 옛 기록을
// 지운다 — 옛 snapshot 이 남으면 다음 learn 이 에이전트 자신의 변경을 대표의 되돌림으로 오인한다.
async function onWrite(table, row) {
  if (!row) return // 도중에 지워진 행(maybeSingle → null)
  try { await recordWrite(sb, table, row, { dryRun }) }
  catch (e) {
    fail(`learn:record:${row?.id}`, e)
    try { await forgetWrites(sb, table, [row.id], { dryRun }) } catch (e2) { fail(`learn:forget:${row?.id}`, e2) }
  }
}

// 명령 `lesson`: 대표 교정 한 줄을 교훈 장부에 넣고 끝난다(윌리가 "경영관리 교훈: …" 을 받으면 부른다).
if (args[0] === 'lesson') {
  let lesson
  try { lesson = parseLessonArgs(args.slice(1)) } catch (e) { log(`lesson: ${e.message}`); process.exit(2) }
  let res
  try { res = await saveLesson(sb, lesson, { dryRun }) } catch (e) { log(`lesson 저장 실패: ${e.message ?? e}`); process.exit(1) }
  if (res.duplicate) log(`이미 있는 교훈이에요: ${lesson.company}/${lesson.scope}: ${lesson.lesson}`)
  else log(`교훈 ${dryRun ? '(dry, 저장 안 함) ' : '저장 '}${lesson.company}/${lesson.scope}: ${lesson.lesson}`)
  process.exit(0)
}

let selected
const nowKst = kst()
try { selected = planSteps(nowKst.toISOString().slice(11, 16), only, { monday: nowKst.getUTCDay() === 1 }) } catch (e) { log(e.message); process.exit(2) }

// 락 — 살아 있는 pid 가 있으면 바로 끝낸다.
const LOCK = path.join(os.homedir(), '.willow/mgmt-agent.lock')
fs.mkdirSync(path.dirname(LOCK), { recursive: true })
try {
  const pid = Number(fs.readFileSync(LOCK, 'utf8'))
  // 35분 넘은 락은 죽은 실행의 흔적으로 본다(상한이 20분이라 살아 있을 수 없다).
  const stale = Date.now() - fs.statSync(LOCK).mtimeMs > 35 * 60e3
  if (stale) log(`오래된 락 무시(${pid})`)
  else if (pid && pid !== process.pid) { process.kill(pid, 0); log(`이미 실행 중(${pid})`); process.exit(0) }
} catch {}
fs.writeFileSync(LOCK, String(process.pid))
process.on('exit', () => { try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK) } catch {} })
process.on('SIGTERM', () => process.exit(143))
process.on('SIGINT', () => process.exit(130))
setTimeout(() => { log('시간 상한 20분 초과'); recordFailure('timeout', '시간 상한 20분 초과'); process.exit(3) }, 20 * 60e3).unref()

// 윌리(CEO 봇)가 쓰는 chat id — telegram-bot.ts loadCeoChatId 와 같은 출처.
let ceoChatId
async function loadCeoChatId() {
  if (ceoChatId) return ceoChatId
  const data = must(await sb.from('telegram_conversations').select('chat_id').eq('bot_type', 'ceo').order('updated_at', { ascending: false }).limit(1).maybeSingle(), 'CEO chat id')
  if (!data?.chat_id) throw new Error('CEO chat id 없음')
  return (ceoChatId = data.chat_id)
}

// kind: 'decision' | 'digest'. dry 에서는 MGMT_DRY_DIGEST=1 이고 digest 일 때만 보낸다.
async function telegram(text, { buttons, kind = 'decision' } = {}) {
  const dryDigest = dryRun && process.env.MGMT_DRY_DIGEST === '1' && kind === 'digest'
  if (dryRun && !dryDigest) { log(`(dry) 윌리: ${text.split('\n')[0]}`); return null }
  const body = { chat_id: await loadCeoChatId(), text: dryRun ? `(시험 운행) ${text}` : text, ...(buttons && !dryRun ? { reply_markup: { inline_keyboard: buttons } } : {}) }
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!j.ok) { fail(`telegram:${kind}`, `윌리 전송 실패: ${j.description ?? r.status}`); return null }
    return j.result?.message_id ?? null
  } catch (e) { fail(`telegram:${kind}`, e); return null }
}

async function loadRules() {
  const data = must(await sb.from('mgmt_rules').select('*').eq('active', true), 'mgmt_rules')
  if (data?.length) return data
  const any = must(await sb.from('mgmt_rules').select('id', { count: 'exact', head: true }), 'mgmt_rules count')
  if (any) return [] // 규칙이 있는데 모두 꺼져 있으면 씨앗을 다시 넣지 않는다.
  log(`규칙 비어 있음 → 씨앗 ${SEED_RULES.length}개${dryRun ? ' (dry: 넣지 않고 메모리로만 씀)' : ''}`)
  if (dryRun) return SEED_RULES
  must(await sb.from('mgmt_rules').insert(SEED_RULES.map(r => ({ ...r, origin: 'seed' }))), 'seed insert')
  return must(await sb.from('mgmt_rules').select('*').eq('active', true), 'mgmt_rules')
}

async function stepRules() {
  const rules = await loadRules()
  const cal = makeCalendar()
  const from = todayKey(), to = addDays(from, 60)
  // 대표가 지운 정기 회차(교훈 장부 rule/suppressed)는 다시 깔지 않는다.
  const suppressedKeys = await loadSuppressedKeys(sb)
  if (suppressedKeys.size) log(`막힌 회차 ${suppressedKeys.size}`)
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const rows = must(await sb.from(table).select('id, title, schedule_date, source_key, is_completed, agent_state, evidence, category, origin').or(NOT_PERSONAL).gte('schedule_date', addDays(from, -45)), table)
    const plan = planOccurrences(rules.filter(r => r.company === company), rows, { from, to, cal, suppressedKeys })
    const missed = planMissed(rows, from)
    tally.inserted += plan.insert.length; tally.updated += plan.update.length; tally.missed += missed.length
    log(`${company}: 추가 ${plan.insert.length} · 갱신 ${plan.update.length} · 빠짐 ${missed.length}`)
    await applyPlan(sb, table, plan, { dryRun, log, onWrite })
    await applyPlan(sb, table, { insert: [], update: missed }, { dryRun, log, onWrite })
  }
}

async function stepCollect() {
  const batches = []
  for (const [context, company] of CONTEXTS) {
    const source = `mail:${company}`
    try { batches.push({ source, company, items: await readMail(sb, context, await getCursor(sb, source)) }) }
    catch (e) { fail(`collect:${source}`, e) }
  }
  try { for (const [space, items] of await readChat(sb, s => getCursor(sb, s))) batches.push({ source: `chat:${space}`, company: 'tensw', items }) }
  catch (e) { fail('collect:chat', e) }
  // 교훈: 회사별 활성·judge/close 범위·최근 20개를 judge 프롬프트에 넣는다. 못 읽어도 수집은 계속한다.
  let allLessons = []
  try { allLessons = await loadLessons(sb) } catch (e) { fail('collect:lessons', e) }
  log(`새 메시지: ${batches.map(b => `${b.source}=${b.items.length}`).join(', ') || '없음'}`)
  // 프롬프트에 들어간 교훈은 실행당 한 번만 hits 를 올린다(수집이 도중에 끝나도).
  const prompted = new Map()
  try { await collectBatches(batches, allLessons, prompted) }
  finally {
    try { await bumpHits(sb, [...prompted.values()], { dryRun }) } catch (e) { fail('collect:lesson-hits', e) }
  }
}

async function collectBatches(batches, allLessons, prompted) {
  for (const b of batches) {
    if (Date.now() - START > COLLECT_DEADLINE_MS) { log('18분 경과 — 나머지는 다음 실행에서 이어 읽음'); return }
    const table = tableFor(b.company)
    // 한 묶음이 실패하면 그 소스의 커서는 거기서 멈춘다(반영된 묶음까지만 저장).
    try {
      for (let i = 0; i < b.items.length; i += 60) {
        if (Date.now() - START > COLLECT_DEADLINE_MS) { log(`18분 경과 — ${b.source} 는 ${i}건까지 반영, 나머지는 다음 실행`); return }
        const items = b.items.slice(i, i + 60)
        const openCases = must(await sb.from('mgmt_cases').select('name').eq('company', b.company).eq('status', 'open'), 'mgmt_cases')
        const openSchedules = must(await sb.from(table).select('id, title, schedule_date, source_key, evidence').eq('is_completed', false).or(NOT_PERSONAL).gte('schedule_date', addDays(todayKey(), -60)), table)
        const used = pickLessons(allLessons, b.company, 20, { scopes: PROMPT_SCOPES })
        const j = await judge(buildPrompt({ company: b.company, items, openCases: openCases ?? [], openSchedules: openSchedules ?? [], lessons: used.map(l => l.lesson) }))
        for (const l of used) prompted.set(l.id, l)
        const plan = planJudgement(b.company, j, { items, openSchedules: openSchedules ?? [] })
        tally.entries += plan.entries.length; tally.inserted += plan.scheduleInserts.length; tally.updated += plan.scheduleUpdates.length; tally.decisions += plan.decisions.length
        log(`${b.source} [${i + 1}-${i + items.length}] 건 ${plan.cases.length} · 기록 ${plan.entries.length} · 일정 +${plan.scheduleInserts.length}/~${plan.scheduleUpdates.length} · 결정 ${plan.decisions.length} · 버림 ${plan.dropped}`)
        await applyJudgement(sb, plan, { dryRun, log, onWrite })
        await saveCursor(sb, b.source, items, { dryRun })
      }
    } catch (e) { fail(`collect:${b.source}`, e) }
  }
}

async function loadFacts() {
  const since = addDays(todayKey(), -90)
  const taxObligations = must(await sb.from('finance_tax_obligations').select('id, company, obligation_type, due_date, status, paid_at').gte('due_date', since).is('deleted_at', null), 'finance_tax_obligations')
  const sentMail = [], receivedMail = []
  const mailSince = { last_seen_at: new Date(Date.now() - 45 * 864e5).toISOString() }
  for (const [context] of CONTEXTS) {
    const { sent, received } = splitMailFacts(await readMail(sb, context, mailSince, { limit: 300, format: 'metadata' }), context)
    sentMail.push(...sent); receivedMail.push(...received)
  }
  const cash = []
  const cashSince = addDays(todayKey(), -45)
  for (const [table] of CASH_TABLES) {
    const data = must(await sb.from(table).select('id, type, counterparty, description, amount, payment_date, issue_date').or(`payment_date.gte.${cashSince},and(payment_date.is.null,issue_date.gte.${cashSince})`), table)
    for (const r of data ?? []) cash.push(cashFact(r, table))
  }
  log(`증빙: 세금 ${taxObligations.length} · 보낸메일 ${sentMail.length} · 받은메일 ${receivedMail.length} · 현금 ${cash.length}`)
  return { taxObligations, sentMail, receivedMail, cash }
}

async function stepClose() {
  const rules = await loadRules()
  const facts = await loadFacts()
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const rows = must(await sb.from(table).select('id, title, schedule_date, source_key, evidence, agent_state').eq('is_completed', false).or(NOT_PERSONAL).like('source_key', `mgmt:${company}:%`), table)
    let n = 0
    for (const row of rows ?? []) {
      const k = parseSourceKey(row.source_key)
      if (!k) continue
      const rule = rules.find(r => r.company === company && r.task_key === k.task && r.step === k.step)
      const c = planClose(row, rule, facts)
      if (!c) continue
      n++
      log(`완료 ${company} ${row.schedule_date} ${row.title} ← ${c.ev.kind} ${c.ev.note ?? ''}`)
      if (!dryRun) await onWrite(table, must(await sb.from(table).update(c.patch).eq('id', row.id).select('*').maybeSingle(), `close ${row.id}`))
    }
    tally.closed += n
    log(`${company}: 열린 정기 행 ${rows?.length ?? 0} 중 완료 ${n}`)
  }
}

async function stepDecide() {
  const today = todayKey()
  // R2: 답이 달린 missed 결정부터 원장에 반영하고, 다시 반영되지 않게 expired 로 돌린다.
  const answered = must(await sb.from('mgmt_decisions').select('*').eq('kind', 'missed').eq('status', 'answered'), 'answered missed')
  for (const d of answered ?? []) {
    try {
      const table = tableFor(d.company)
      const row = d.schedule_key ? must(await sb.from(table).select('id, title, schedule_date, is_completed, evidence').eq('source_key', d.schedule_key).or(NOT_PERSONAL).maybeSingle(), table) : null
      const patch = missedAnswerPatch(d, row, today)
      if (patch) log(`빠짐 답 반영 ${d.company} ${row.title} ← ${d.answer}`)
      if (dryRun) continue
      if (patch) await onWrite(table, must(await sb.from(table).update(patch).eq('id', row.id).select('*').maybeSingle(), `missed apply ${row.id}`))
      // 윌리는 보류를 answered 로 두지 않으므로(answer='hold', status 그대로) 여기 온 답은 모두 끝난 답이다.
      must(await sb.from('mgmt_decisions').update({ status: 'expired' }).eq('id', d.id), `expire ${d.id}`)
    } catch (e) { fail(`decide:missed-answer:${d.id}`, e) }
  }

  // Task 17: rule_review 답 반영. off → 그 규칙 끄기, keep(또는 모르는 답) → 아무것도 안 함.
  // 어느 쪽이든 다시 반영되지 않게 expired 로 돌린다(R2 와 같은 패턴).
  const answeredRuleReviews = must(await sb.from('mgmt_decisions').select('*').eq('kind', 'rule_review').eq('status', 'answered'), 'answered rule_review')
  for (const d of answeredRuleReviews ?? []) {
    try {
      const r = ruleReviewAnswerPatch(d)
      if (r) {
        log(`규칙 끄기 반영 ${d.subject_key}`)
        if (!dryRun) must(await sb.from('mgmt_rules').update(r.patch).eq('company', r.company).eq('task_key', r.task_key).eq('step', r.step).select('id').maybeSingle(), `rule off ${d.subject_key}`)
      }
      if (!dryRun) must(await sb.from('mgmt_decisions').update({ status: 'expired' }).eq('id', d.id), `expire ${d.id}`)
    } catch (e) { fail(`decide:rule-review-answer:${d.id}`, e) }
  }

  for (const company of COMPANIES) {
    const missed = must(await sb.from(tableFor(company)).select('title, schedule_date, source_key').eq('agent_state', 'missed').eq('is_completed', false).or(NOT_PERSONAL), 'missed rows')
    for (const m of missed ?? []) {
      if (!m.source_key) continue
      const d = missedDecision(company, m)
      tally.decisions++
      log(`결정 만들기 ${d.subject_key}`)
      if (!dryRun) { const { error } = await sb.from('mgmt_decisions').insert(d); if (error && error.code !== '23505') fail(`decide:missed:${m.source_key}`, error.message) }
    }
  }

  const open = must(await sb.from('mgmt_decisions').select('*').eq('status', 'open'), 'open decisions')
  const past = must(await sb.from('mgmt_decisions').select('subject_key, answer, status').eq('status', 'answered'), 'past decisions')
  log(`열린 결정 ${open?.length ?? 0}`)
  for (const d of open ?? []) {
    try {
      const auto = reuseAnswer(d, past ?? [])
      if (auto) {
        log(`지난 판단 재사용 ${d.subject_key} → ${auto}`)
        // 버튼 없이 답했다는 표식(refs 의 reuse) — 저녁 요약에 "지난 판단 재사용" 으로 나온다.
        if (!dryRun) must(await sb.from('mgmt_decisions').update({ status: 'answered', answer: auto, answered_at: new Date().toISOString(), telegram_message_id: null, refs: reuseRefs(d) }).eq('id', d.id), `reuse ${d.id}`)
        continue
      }
      const { text, buttons } = decisionMessage(d)
      const mid = await telegram(text, { buttons })
      if (!dryRun && mid) must(await sb.from('mgmt_decisions').update({ status: 'sent', telegram_message_id: mid }).eq('id', d.id), `sent ${d.id}`)
    } catch (e) { fail(`decide:${d.id}`, e) }
  }
}

function todaysFailures(today) {
  if (!fs.existsSync(FAIL_FILE)) return []
  return failuresOn(fs.readFileSync(FAIL_FILE, 'utf8').split('\n').filter(Boolean), today).filter(f => dryRun || !f.dry)
}

async function stepDigest() {
  const today = todayKey()
  const done = [], created = [], missed = []
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const base = () => sb.from(table).select('title, agent_state, evidence').like('source_key', 'mgmt%').or(NOT_PERSONAL)
    const newRows = must(await base().gte('created_at', startOfToday()).neq('agent_state', 'missed'), `${table} created`)
    const missedRows = must(await base().eq('agent_state', 'missed').eq('is_completed', false), `${table} missed`)
    const doneRows = must(await base().eq('agent_state', 'done').gte('schedule_date', addDays(today, -45)), `${table} done`)
    created.push(...(newRows ?? []).filter(r => r.agent_state !== 'done').map(r => r.title))
    missed.push(...(missedRows ?? []).map(r => r.title))
    done.push(...closedToday(doneRows ?? [], today).map(r => r.title))
  }
  const reusedRows = must(await sb.from('mgmt_decisions').select('question, refs').eq('status', 'answered').gte('answered_at', startOfToday()), 'reused decisions')
  const reused = (reusedRows ?? []).filter(isReuse).map(reuseLabel)
  let fileFailures = []
  try { fileFailures = todaysFailures(today) } catch {}
  const inferred = must(await sb.from('mgmt_rules').select('title, rule').eq('origin', 'inferred').gte('created_at', startOfToday()), 'inferred rules')
  const { count, error } = await sb.from('mgmt_decisions').select('id', { count: 'exact', head: true }).in('status', ['open', 'sent'])
  if (error) throw new Error(`open decisions: ${error.message}`)
  let text = digestMessage({ date: today, done, created, inferred: (inferred ?? []).map(r => `${r.title}(매월 ${r.rule.day}일)`), missed, openDecisions: Array(count ?? 0).fill(0), failures: failureLabels(fileFailures), reused })
  if (dryRun) text = [text ?? `경영관리 ${today}`, `이번 실행(dry): 추가 ${tally.inserted} · 갱신 ${tally.updated} · 빠짐 ${tally.missed} · 완료 ${tally.closed} · 기록 ${tally.entries} · 결정 ${tally.decisions}`].join('\n')
  if (text) await telegram(text, { kind: 'digest' })
  else log('요약할 것 없음')
}

async function stepInfer() {
  const since = addDays(todayKey(), -180)
  const events = []
  for (const [context, company] of CONTEXTS) {
    const mails = await readMail(sb, context, { last_seen_at: `${since}T00:00:00Z` }, { limit: 500, format: 'metadata' })
    for (const m of mails) { const e = mailEvent(m, company); if (e) events.push(e) }
  }
  for (const [table, company] of CASH_TABLES) {
    const data = must(await sb.from(table).select('id, type, counterparty, description, amount, payment_date, issue_date').or(`payment_date.gte.${since},and(payment_date.is.null,issue_date.gte.${since})`), table)
    for (const r of data ?? []) { const e = cashEvent(r, table, company); if (e) events.push(e) }
  }
  const rules = must(await sb.from('mgmt_rules').select('*'), 'mgmt_rules')
  // C2: 3개월 이상·신뢰 0.6 이상·세금/개인/잡음 제외·실행당 신뢰 높은 순 5개까지(inferRules 기본값).
  const found = inferRules(events, { existingRules: rules?.length ? rules : SEED_RULES })
  log(`이벤트 ${events.length} → 추론 규칙 ${found.length} (상한 ${INFER_LIMIT}, 신뢰 ≥ ${MIN_CONFIDENCE})`)
  for (const r of found) {
    log(`추론 규칙 ${r.company} ${r.title} 매월 ${r.rule.day}일 (신뢰 ${r.confidence})`)
    if (!dryRun) { const { error } = await sb.from('mgmt_rules').insert(r); if (error && error.code !== '23505') throw error }
  }
}

// Task 17: 규칙 스스로 조정. 규칙마다 최근 6개월의, 오늘보다 앞선(이미 마감 지난) 회차만 날짜순으로
// 읽어 planTuning 에 넘긴다 — stepRules 가 60일 앞까지 미리 깔아 둔 아직 안 지난 planned 행이 섞이면
// last2/last3 가 늘 "아직 안 지남"으로 끝나 아무 것도 안 걸린다. shift_day → mgmt_rules.rule.day 갱신,
// ask_disable → 결정함에 rule_review 물음, deactivate → active 끔, confirm → 추정 표시를 벗긴다
// (confidence=1, origin='seed'). 모두 대표 승인 전이라도 원장은 그대로 두고 규칙 자체만 고친다
// (메일·메시지 발송 없음).
async function stepTune() {
  const rules = must(await sb.from('mgmt_rules').select('*').eq('active', true), 'mgmt_rules')
  const since = addDays(todayKey(), -180)
  const today = todayKey()
  // 규칙별로 가장 최근 '유지' 답의 시각 — 그보다 앞선 빠짐만으로는 ask_disable 을 다시 묻지 않는다.
  const keepRows = must(await sb.from('mgmt_decisions').select('subject_key, answered_at').eq('kind', 'rule_review').eq('answer', 'keep').order('answered_at', { ascending: false }), 'mgmt_decisions keep')
  const lastKeepAtBySubject = new Map()
  for (const r of keepRows ?? []) if (!lastKeepAtBySubject.has(r.subject_key)) lastKeepAtBySubject.set(r.subject_key, r.answered_at)

  const tuneLesson = (company, source_ref, lesson) => saveLesson(sb, { company, scope: 'rule', lesson: redact(lesson).text, example: null, source: 'auto', source_ref }, { dryRun })

  for (const rule of rules ?? []) {
    const table = tableFor(rule.company)
    const prefix = `mgmt:${rule.company}:${rule.task_key}:`
    const subjectKey = `${rule.company}:rule:${rule.task_key}:${rule.step}`
    const rows = must(await sb.from(table).select('id, schedule_date, source_key, is_completed, agent_state, evidence, origin').like('source_key', `${prefix}%`).gte('schedule_date', since).lt('schedule_date', today), table)
    const occurrences = (rows ?? []).filter(r => parseSourceKey(r.source_key)?.step === rule.step)
    if (!occurrences.length) continue
    const lastKeepAt = lastKeepAtBySubject.get(subjectKey) ?? null
    for (const a of planTuning(rule, occurrences, { today, lastKeepAt })) {
      try {
        if (a.kind === 'shift_day') {
          log(`규칙 조정 ${rule.company} ${rule.task_key}/${rule.step}: ${rule.rule.day}일 → ${a.to}일`)
          if (!dryRun) must(await sb.from('mgmt_rules').update({ rule: { ...rule.rule, day: a.to } }).eq('id', rule.id).select('id').maybeSingle(), `tune shift ${rule.id}`)
          await tuneLesson(rule.company, rule.id, a.lesson)
        } else if (a.kind === 'ask_disable') {
          log(`규칙 재검토 물음 ${subjectKey}`)
          tally.decisions++
          if (!dryRun) {
            const { error } = await sb.from('mgmt_decisions').insert({
              company: rule.company, kind: 'rule_review', subject_key: subjectKey,
              question: `"${rule.title}" 규칙이 두 번 연속 빠졌어요. 어떻게 할까요?`,
              options: [{ id: 'off', label: '규칙 끄기' }, { id: 'keep', label: '유지' }],
              recommended: null, schedule_key: null, refs: [], status: 'open',
            })
            if (error && error.code !== '23505') fail(`tune:ask_disable:${rule.id}`, error.message)
          }
          await tuneLesson(rule.company, rule.id, a.lesson)
        } else if (a.kind === 'deactivate') {
          log(`규칙 끔(추정, 근거 없음) ${rule.company} ${rule.task_key}/${rule.step}`)
          if (!dryRun) must(await sb.from('mgmt_rules').update({ active: false }).eq('id', rule.id).select('id').maybeSingle(), `tune deactivate ${rule.id}`)
          await tuneLesson(rule.company, rule.id, a.lesson)
        } else if (a.kind === 'confirm') {
          log(`규칙 확정 ${rule.company} ${rule.task_key}/${rule.step} (추정 표시 제거)`)
          if (!dryRun) must(await sb.from('mgmt_rules').update({ confidence: a.confidence, origin: 'seed' }).eq('id', rule.id).select('id').maybeSingle(), `tune confirm ${rule.id}`)
        }
      } catch (e) { fail(`tune:${rule.id}:${a.kind}`, e) }
    }
  }
}

// title 에서 레시피가 있는 업무 이름을 뽑는다: {period}·괄호 속 글자·숫자를 지우고 첫 단어.
function deriveRecipeWord(title) {
  const cleaned = String(title ?? '').replace('{period}', '').replace(/\([^)]*\)/g, '').replace(/\d+/g, '').trim()
  return cleaned.split(/\s+/)[0] ?? ''
}
// 원래는 잘 알려진 레시피 이름(급여·출근부 등) — 원장 규칙 제목에서 자동으로 뽑히지 않는 것도 있다(출근부 발송의 첫 단어는 "강남구").
const KNOWN_RECIPE_NAMES = ['급여', '출근부', '지원금', '세금계산서']

// Task 18: 월요일 아침 주간 성적표 + 레시피 없이 반복되는 일을 개발 에이전트 요청(ws_threads)으로.
async function stepWeekly() {
  const today = todayKey()
  const from = addDays(today, -7), to = addDays(today, -1)
  const sinceISO = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const writes = must(await sb.from('mgmt_agent_writes').select('row_id', { count: 'exact', head: true }).gte('written_at', sinceISO), 'weekly:writes') ?? 0
  const reverts = must(await sb.from('mgmt_lessons').select('id', { count: 'exact', head: true }).eq('source', 'reverted').gte('created_at', sinceISO), 'weekly:reverts') ?? 0

  let closedByEvidence = 0, missed = 0
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const doneRows = must(await sb.from(table).select('evidence').eq('agent_state', 'done').or(NOT_PERSONAL).gte('schedule_date', addDays(today, -45)), `weekly:${table}:done`)
    closedByEvidence += (doneRows ?? []).filter(r => (r.evidence ?? []).some(e => e?.at && Date.parse(e.at) >= Date.parse(sinceISO))).length
    missed += must(await sb.from(table).select('id', { count: 'exact', head: true }).eq('agent_state', 'missed').eq('is_completed', false).or(NOT_PERSONAL), `weekly:${table}:missed`) ?? 0
  }

  const asked = must(await sb.from('mgmt_decisions').select('id', { count: 'exact', head: true }).not('telegram_message_id', 'is', null).gte('created_at', sinceISO), 'weekly:asked') ?? 0
  const answered = must(await sb.from('mgmt_decisions').select('refs').eq('status', 'answered').gte('answered_at', sinceISO), 'weekly:answered')
  const reused = (answered ?? []).filter(isReuse).length

  // judgeFailures: mgmt_cursors 정체 대신 실패 기록에서 곧바로 센다(더 정확 — 커서는 소스가 조용해도 안 움직일 수 있다).
  const failLines = fs.existsSync(FAIL_FILE) ? fs.readFileSync(FAIL_FILE, 'utf8').split('\n').filter(Boolean) : []
  const judgeFailures = pruneFailureLines(failLines).filter(l => { try { const f = JSON.parse(l); return f.step === 'collect' && !f.dry } catch { return false } }).length

  const s = scorecard({ from, to, writes, reverts, closedByEvidence, missed, asked, reused, judgeFailures })
  log(`성적표 ${from}~${to}: 쓴 일정 ${writes} · 되돌림 ${reverts} · 근거로 닫음 ${closedByEvidence} · 빠짐 ${missed} · 결정 ${asked} · 재사용 ${reused} · 해석실패 ${judgeFailures}`)

  const ruleTitles = must(await sb.from('mgmt_rules').select('title').not('recipe', 'is', null), 'weekly:mgmt_rules')
  const recipes = [...new Set([...(ruleTitles ?? []).map(r => deriveRecipeWord(r.title)).filter(Boolean), ...KNOWN_RECIPE_NAMES])]
  const entries = must(await sb.from('mgmt_entries').select('kind, company, body, assignee, occurred_at, source_ref').eq('kind', 'todo').gte('occurred_at', addDays(today, -28)), 'weekly:mgmt_entries')
  const candidates = skillCandidates(entries ?? [], recipes, { now: new Date() })

  let opened = 0
  for (const c of candidates) {
    const title = `[mgmt-skill] ${c.label}`
    try {
      const existing = must(await sb.from('ws_threads').select('id').eq('project', 'willow-invt').eq('status', 'open').eq('title', title).maybeSingle(), 'weekly:ws_threads existing')
      if (existing) { log(`스킬 후보 이미 열림 ${title}`); continue }
      const summary = redact(`경영관리 에이전트: 지난 4주 ${c.count}번 손으로 한 일. 스킬로 만들면 에이전트가 초안까지 한다. 근거: ${c.refs.slice(0, 5).join(', ')}`).text
      log(`스킬 후보 ${dryRun ? '(dry) ' : ''}${title} (${c.count}회)`)
      if (!dryRun) {
        const { error } = await sb.from('ws_threads').insert({ project: 'willow-invt', title, status: 'open', priority: 'normal', summary, tags: ['mgmt-skill-request'] })
        if (error) { fail(`weekly:thread:${title}`, error.message); continue }
      }
      opened++
    } catch (e) { fail(`weekly:candidate:${c.key}`, e) }
  }

  const skillLine = dryRun ? `개발 에이전트에 넘길 스킬 후보 ${opened}개(시험 운행)` : `개발 에이전트에 넘긴 스킬 후보 ${opened}개`
  await telegram([s.text, skillLine].join('\n'), { kind: 'digest' })
}

// 되돌림에서 배우기: 에이전트가 마지막으로 쓴 값과 지금 행을 비교한다. 대표가 지웠거나 다시 열었거나
// 날짜·이름을 바꿨으면 교훈으로 적고, 되돌림을 고정하고, 기록을 지금 값으로 맞춘다
// (지워진 행·개인 일정이 된 행·30일 넘은 완료 기록은 기록 삭제).
async function stepLearn() {
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const writes = await loadWrites(sb, table)
    const ids = writes.map(w => w.row_id)
    const rows = []
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      rows.push(...(must(await sb.from(table).select('id, title, schedule_date, is_completed, agent_state, evidence, source_key, origin').in('id', chunk).or(NOT_PERSONAL), table) ?? []))
      // 개인 일정은 내용을 읽지 않고 id 만 — 기록을 지우는 데만 쓴다.
      rows.push(...(must(await sb.from(table).select('id').in('id', chunk).eq('category', 'personal'), `${table} personal`) ?? []).map(r => ({ id: r.id, category: 'personal' })))
    }
    const { lessons, forget, refresh, patches } = planLearn(writes, rows, { now: new Date() })
    log(`${company}: 기록 ${writes.length} · 교훈 ${lessons.length} · 되돌림 고정 ${patches.length} · 기록 삭제 ${forget.length} · 기록 갱신 ${refresh.length}`)
    for (const l of lessons) {
      log(`교훈 ${l.scope} ${l.lesson}`)
      await saveLesson(sb, l, { dryRun })
    }
    // 되돌림을 고정한다(정기 행은 manual, 다시 연 행은 거절 증빙) — 같은 실행의 rules·close 가 다시 뒤집지 않게.
    await applyPlan(sb, table, { insert: [], update: patches }, { dryRun, log, onWrite })
    await forgetWrites(sb, table, forget, { dryRun })
    for (const row of refresh) await recordWrite(sb, table, row, { dryRun })
  }
}

const STEPS = { learn: stepLearn, rules: stepRules, collect: stepCollect, close: stepClose, decide: stepDecide, digest: stepDigest, infer: stepInfer, tune: stepTune, weekly: stepWeekly }
for (const name of selected) {
  try { log(`단계 ${name}${dryRun ? ' (dry)' : ''}`); await STEPS[name]() } catch (e) { fail(name, e) }
}
log(`끝${failures.length ? ` — 실패: ${failures.join(', ')}` : ''}`)
process.exitCode = failures.length ? 1 : 0
