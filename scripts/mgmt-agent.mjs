#!/usr/bin/env node
// 경영관리 에이전트 — 한 번 돌고 끝난다. launchd 가 30분마다 부른다(scripts/run-mgmt-agent.sh).
//   node scripts/mgmt-agent.mjs [--dry] [--only rules|collect|close|decide|digest|infer]
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
import { inferRules } from './lib/mgmt/infer.mjs'
import { decisionMessage, digestMessage, reuseAnswer } from './lib/mgmt/decisions.mjs'
import { addDays, planSteps, parseSourceKey, cashFact, splitMailFacts, planClose, missedDecision, missedAnswerPatch, mailEvent, cashEvent } from './lib/mgmt/runner-helpers.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] ?? '' : null
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const log = m => console.log(`${new Date().toISOString()} [mgmt] ${m}`)
const failures = []
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

let selected
try { selected = planSteps(kst().toISOString().slice(11, 16), only) } catch (e) { log(e.message); process.exit(2) }

// 락 — 살아 있는 pid 가 있으면 바로 끝낸다.
const LOCK = path.join(os.homedir(), '.willow/mgmt-agent.lock')
fs.mkdirSync(path.dirname(LOCK), { recursive: true })
try {
  const pid = Number(fs.readFileSync(LOCK, 'utf8'))
  if (pid && pid !== process.pid) { process.kill(pid, 0); log(`이미 실행 중(${pid})`); process.exit(0) }
} catch {}
fs.writeFileSync(LOCK, String(process.pid))
process.on('exit', () => { try { if (fs.readFileSync(LOCK, 'utf8') === String(process.pid)) fs.unlinkSync(LOCK) } catch {} })
setTimeout(() => { log('시간 상한 20분 초과'); process.exit(3) }, 20 * 60e3).unref()

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
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) log(`윌리 전송 실패: ${j.description ?? r.status}`)
  return j.result?.message_id ?? null
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
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const rows = must(await sb.from(table).select('id, title, schedule_date, source_key, is_completed, agent_state, evidence, category').or(NOT_PERSONAL).gte('schedule_date', addDays(from, -45)), table)
    const plan = planOccurrences(rules.filter(r => r.company === company), rows, { from, to, cal })
    const missed = planMissed(rows, from)
    tally.inserted += plan.insert.length; tally.updated += plan.update.length; tally.missed += missed.length
    log(`${company}: 추가 ${plan.insert.length} · 갱신 ${plan.update.length} · 빠짐 ${missed.length}`)
    await applyPlan(sb, table, plan, { dryRun, log })
    await applyPlan(sb, table, { insert: [], update: missed }, { dryRun, log })
  }
}

async function stepCollect() {
  const batches = []
  for (const [context, company] of CONTEXTS) {
    const source = `mail:${company}`
    try { batches.push({ source, company, items: await readMail(sb, context, await getCursor(sb, source)) }) }
    catch (e) { failures.push(`collect:${source}`); log(`읽기 실패 ${source}: ${e instanceof Error ? e.message : e}`) }
  }
  try { for (const [space, items] of await readChat(sb, s => getCursor(sb, s))) batches.push({ source: `chat:${space}`, company: 'tensw', items }) }
  catch (e) { failures.push('collect:chat'); log(`읽기 실패 chat: ${e instanceof Error ? e.message : e}`) }
  log(`새 메시지: ${batches.map(b => `${b.source}=${b.items.length}`).join(', ') || '없음'}`)

  for (const b of batches) {
    const table = tableFor(b.company)
    // 한 묶음이 실패하면 그 소스의 커서는 거기서 멈춘다(반영된 묶음까지만 저장).
    try {
      for (let i = 0; i < b.items.length; i += 60) {
        const items = b.items.slice(i, i + 60)
        const openCases = must(await sb.from('mgmt_cases').select('name').eq('company', b.company).eq('status', 'open'), 'mgmt_cases')
        const openSchedules = must(await sb.from(table).select('id, title, schedule_date, source_key, evidence').eq('is_completed', false).or(NOT_PERSONAL).gte('schedule_date', addDays(todayKey(), -60)), table)
        const j = await judge(buildPrompt({ company: b.company, items, openCases: openCases ?? [], openSchedules: openSchedules ?? [] }))
        const plan = planJudgement(b.company, j, { items, openSchedules: openSchedules ?? [] })
        tally.entries += plan.entries.length; tally.inserted += plan.scheduleInserts.length; tally.updated += plan.scheduleUpdates.length; tally.decisions += plan.decisions.length
        log(`${b.source} [${i + 1}-${i + items.length}] 건 ${plan.cases.length} · 기록 ${plan.entries.length} · 일정 +${plan.scheduleInserts.length}/~${plan.scheduleUpdates.length} · 결정 ${plan.decisions.length} · 버림 ${plan.dropped}`)
        await applyJudgement(sb, plan, { dryRun, log })
        await saveCursor(sb, b.source, items, { dryRun })
      }
    } catch (e) { failures.push(`collect:${b.source}`); log(`반영 실패 ${b.source}: ${e instanceof Error ? e.message : e}`) }
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
      if (!dryRun) must(await sb.from(table).update(c.patch).eq('id', row.id), `close ${row.id}`)
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
    const table = tableFor(d.company)
    const row = d.schedule_key ? must(await sb.from(table).select('id, title, schedule_date, is_completed, evidence').eq('source_key', d.schedule_key).maybeSingle(), table) : null
    const patch = missedAnswerPatch(d, row, today)
    if (patch) log(`빠짐 답 반영 ${d.company} ${row.title} ← ${d.answer}`)
    if (dryRun) continue
    if (patch) must(await sb.from(table).update(patch).eq('id', row.id), `missed apply ${row.id}`)
    // 윌리는 보류를 answered 로 두지 않으므로(answer='hold', status 그대로) 여기 온 답은 모두 끝난 답이다.
    must(await sb.from('mgmt_decisions').update({ status: 'expired' }).eq('id', d.id), `expire ${d.id}`)
  }

  for (const company of COMPANIES) {
    const missed = must(await sb.from(tableFor(company)).select('title, schedule_date, source_key').eq('agent_state', 'missed').eq('is_completed', false).or(NOT_PERSONAL), 'missed rows')
    for (const m of missed ?? []) {
      if (!m.source_key) continue
      const d = missedDecision(company, m)
      tally.decisions++
      log(`결정 만들기 ${d.subject_key}`)
      if (!dryRun) { const { error } = await sb.from('mgmt_decisions').insert(d); if (error && error.code !== '23505') throw error }
    }
  }

  const open = must(await sb.from('mgmt_decisions').select('*').eq('status', 'open'), 'open decisions')
  const past = must(await sb.from('mgmt_decisions').select('subject_key, answer, status').eq('status', 'answered'), 'past decisions')
  log(`열린 결정 ${open?.length ?? 0}`)
  for (const d of open ?? []) {
    const auto = reuseAnswer(d, past ?? [])
    if (auto) {
      log(`지난 판단 재사용 ${d.subject_key} → ${auto}`)
      if (!dryRun) must(await sb.from('mgmt_decisions').update({ status: 'answered', answer: auto, answered_at: new Date().toISOString() }).eq('id', d.id), `reuse ${d.id}`)
      continue
    }
    const { text, buttons } = decisionMessage(d)
    const mid = await telegram(text, { buttons })
    if (!dryRun && mid) must(await sb.from('mgmt_decisions').update({ status: 'sent', telegram_message_id: mid }).eq('id', d.id), `sent ${d.id}`)
  }
}

async function stepDigest() {
  const today = todayKey()
  const done = [], created = [], missed = []
  for (const company of COMPANIES) {
    const table = tableFor(company)
    const rows = must(await sb.from(table).select('title, category, created_at, agent_state, evidence, is_completed').like('source_key', 'mgmt%').or(`created_at.gte.${startOfToday()},agent_state.in.(missed,done)`), table)
    for (const r of rows ?? []) {
      if (r.category === 'personal') continue
      if (r.agent_state === 'missed' && !r.is_completed) missed.push(r.title)
      else if (r.agent_state === 'done') { if ((r.evidence ?? []).some(e => String(e?.at ?? '').startsWith(today))) done.push(r.title) }
      else if (new Date(r.created_at) >= new Date(startOfToday())) created.push(r.title)
    }
  }
  const inferred = must(await sb.from('mgmt_rules').select('title, rule').eq('origin', 'inferred').gte('created_at', startOfToday()), 'inferred rules')
  const { count, error } = await sb.from('mgmt_decisions').select('id', { count: 'exact', head: true }).in('status', ['open', 'sent'])
  if (error) throw new Error(`open decisions: ${error.message}`)
  let text = digestMessage({ date: today, done, created, inferred: (inferred ?? []).map(r => `${r.title}(매월 ${r.rule.day}일)`), missed, openDecisions: Array(count ?? 0).fill(0), failures })
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
  const found = inferRules(events, { existingRules: rules?.length ? rules : SEED_RULES, minMonths: 3 })
  log(`이벤트 ${events.length} → 추론 규칙 ${found.length}`)
  for (const r of found) {
    log(`추론 규칙 ${r.company} ${r.title} 매월 ${r.rule.day}일 (신뢰 ${r.confidence})`)
    if (!dryRun) { const { error } = await sb.from('mgmt_rules').insert(r); if (error && error.code !== '23505') throw error }
  }
}

const STEPS = { rules: stepRules, collect: stepCollect, close: stepClose, decide: stepDecide, digest: stepDigest, infer: stepInfer }
for (const name of selected) {
  try { log(`단계 ${name}${dryRun ? ' (dry)' : ''}`); await STEPS[name]() } catch (e) { failures.push(name); log(`실패 ${name}: ${e instanceof Error ? e.message : e}`) }
}
log(`끝${failures.length ? ` — 실패: ${failures.join(', ')}` : ''}`)
process.exitCode = failures.length ? 1 : 0
