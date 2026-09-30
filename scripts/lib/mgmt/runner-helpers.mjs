// runner-helpers.mjs — 실행기(mgmt-agent.mjs)의 DB 없는 순수 로직. 시험은 runner-helpers.test.mjs.
import { findEvidence, closePatch } from './closers.mjs'
import { normalizeSubject } from './infer.mjs'

export const addDays = (key, n) => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// learn(되돌림에서 배우기)이 맨 앞. 07:00~07:29 이면 infer, 월요일 그 시각이면 infer 다음에 tune, 18:30~18:59 이면 마지막에 digest.
// 월요일 07:30~07:59 이면 마지막에 weekly(주간 성적표 + 스킬 후보).
export const STEP_NAMES = ['learn', 'rules', 'collect', 'close', 'decide', 'digest', 'infer', 'tune', 'weekly']
export function planSteps(hm, only = null, { monday = false } = {}) {
  if (only !== null && only !== undefined) {
    if (!STEP_NAMES.includes(only)) throw new Error(`알 수 없는 단계 "${only}" (${STEP_NAMES.join('|')})`)
    return [only]
  }
  const inferWindow = hm >= '07:00' && hm < '07:30'
  const weeklyWindow = monday && hm >= '07:30' && hm < '08:00'
  return ['learn', ...(inferWindow ? ['infer', ...(monday ? ['tune'] : [])] : []), 'rules', 'collect', 'close', 'decide', ...(hm >= '18:30' && hm < '19:00' ? ['digest'] : []), ...(weeklyWindow ? ['weekly'] : [])]
}

// mgmt:<company>:<task>:<YYYY-MM>:<step>
export function parseSourceKey(key) {
  const m = /^mgmt:(tensw|willow):([^:]+):([^:]+):([^:]+)$/.exec(String(key ?? ''))
  return m ? { company: m[1], task: m[2], period: m[3], step: m[4] } : null
}

// *_mgmt_cash 는 날짜가 payment_date(없으면 issue_date), 분류가 type 이다. 부호도 섞여 있다
// (지출이 양수인 expense 행, 음수인 liability 행). 'salary' 분류는 없으므로 급여 이체는
// 적요·상대에 "급여"가 있고 나가는 돈(지출·부채 상환 또는 음수)이면 salary 로 본다.
// 부채(liability) 행은 음수일 때만 나가는 돈이다(양수 liability 는 차입 등 들어온 돈).
export function cashDirection(row) {
  if (Number(row.amount) < 0) return 'out'
  return row.type === 'expense' ? 'out' : 'in'
}
export function cashFact(row, table) {
  const counterparty = row.counterparty || row.description || ''
  const isSalary = /급여/.test(`${row.description ?? ''} ${row.counterparty ?? ''}`) && cashDirection(row) === 'out'
  return { id: row.id, table, date: row.payment_date ?? row.issue_date ?? null, category: isSalary ? 'salary' : row.type, counterparty, amount: row.amount }
}

// 한 메일함을 한 번 읽어 보낸·받은 증빙으로 나눈다.
export function splitMailFacts(mails, context) {
  const sent = [], received = []
  for (const m of mails) {
    const f = { id: m.ref, context, to: m.to, from: m.from, subject: m.subject, at: m.at }
    ;(m.direction === 'out' ? sent : received).push(f)
  }
  return { sent, received }
}

// 대표가 다시 연 행에는 {kind:'rejected', ref} 가 붙는다. 그 ref(세금은 쉼표로 이은 id 들)의 증빙으로는 다시 닫지 않는다.
export function rejectedRefs(row) {
  const out = new Set()
  for (const e of row.evidence ?? []) {
    if (e?.kind !== 'rejected' || e.ref == null) continue
    out.add(String(e.ref))
    for (const part of String(e.ref).split(',')) out.add(part)
  }
  return out
}
const withoutRejected = (facts, rejected) => {
  if (!rejected.size) return facts
  const keep = list => list === undefined ? undefined : (list ?? []).filter(x => !rejected.has(String(x.id)))
  return { ...facts, taxObligations: keep(facts.taxObligations), sentMail: keep(facts.sentMail), receivedMail: keep(facts.receivedMail), cash: keep(facts.cash) }
}

// 닫기: 규칙의 completion 으로 기록 증빙을 찾는다. completion 이 없는 규칙(서명본 회신 등)만
// 행에 이미 붙은 메시지 증빙으로 닫는다(Task 9 판정 — completion 이 있는 행은 메시지로 닫지 않는다).
// 대표가 거절한(rejected) 증빙은 둘 다에서 뺀다.
export function planClose(row, rule, facts) {
  if (!rule) return null
  const rejected = rejectedRefs(row)
  const ev = findEvidence(row, rule, withoutRejected(facts, rejected))
  if (ev && !rejected.has(String(ev.ref))) return { ev, patch: closePatch(row, ev) }
  if (rule.completion) return null
  const msg = (row.evidence ?? []).filter(e => e?.kind === 'message' && !rejected.has(String(e.ref))).at(-1)
  if (!msg) return null
  return { ev: msg, patch: { is_completed: true, agent_state: 'done', evidence: row.evidence } }
}

export const MISSED_OPTIONS = [{ id: 'done', label: '이미 했음' }, { id: 'later', label: '다시 일정 잡기' }, { id: 'drop', label: '안 해도 됨' }]
export function missedDecision(company, row) {
  return {
    company, kind: 'missed', subject_key: `${company}:missed:${row.source_key}`,
    question: `${row.schedule_date} "${row.title}" 기한이 지났는데 완료 기록이 없어요. 어떻게 할까요?`,
    options: MISSED_OPTIONS, recommended: null, schedule_key: row.source_key, refs: [], status: 'open',
  }
}

// R2: 답이 달린 missed 결정을 원장 행에 반영한다. done/drop → 닫음(결정 증빙), later → 오늘+7일로 다시 계획.
// 반영할 게 없으면(보류·모르는 답·이미 닫힌 행) null.
export function missedAnswerPatch(decision, row, today) {
  if (!row || row.is_completed) return null
  if (decision.answer === 'done' || decision.answer === 'drop') {
    return closePatch(row, { kind: 'decision', ref: decision.id, at: decision.answered_at ?? null, note: decision.answer })
  }
  if (decision.answer === 'later') return { agent_state: 'planned', schedule_date: addDays(today, 7) }
  return null
}

// rule_review 답 적용(Task 17): subject_key `<company>:rule:<task_key>:<step>`. 'off' 만 규칙을 끈다,
// 'keep'·모르는 답은 아무것도 하지 않는다(호출한 쪽이 결정을 expired 로 돌려 재적용을 막는다).
export function ruleReviewAnswerPatch(decision) {
  if (decision?.answer !== 'off') return null
  const m = /^(tensw|willow):rule:([^:]+):([^:]+)$/.exec(String(decision.subject_key ?? ''))
  if (!m) return null
  return { company: m[1], task_key: m[2], step: m[3], patch: { active: false } }
}

// 추론용 이벤트
export function mailEvent(m, company) {
  const out = m.direction === 'out'
  const addr = String((out ? m.to : m.from) ?? '').match(/[\w.+-]+@[\w.-]+/)?.[0] ?? ''
  const kind = out ? 'sent_mail' : 'received_mail'
  const subject = normalizeSubject(m.subject)
  if (!subject) return null
  return { company, kind, context: m.context, ...(out ? { to: addr } : {}), subject, key: `${kind}:${addr}:${subject}`, label: subject, date: m.at.slice(0, 10), ref: m.ref }
}
export function cashEvent(row, table, company) {
  const f = cashFact(row, table)
  if (!f.counterparty || !f.date) return null
  const dir = cashDirection(row)
  return { company, kind: 'cash', table, counterparty: f.counterparty, key: `cash:${table}:${f.counterparty}:${dir}`, label: `${f.counterparty} ${dir === 'out' ? '출금' : '입금'}`, date: f.date, ref: row.id }
}

// KST 날짜 키. 'YYYY-MM-DD' 는 그대로, 시각이 있으면 KST 로 바꿔서.
export function kstDateOf(at) {
  const s = String(at ?? '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = new Date(s)
  return Number.isNaN(t.getTime()) ? null : new Date(t.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
}

// 오늘(KST) 닫힌 행: 증빙 중 하나의 at 이 오늘(KST).
export const closedToday = (rows, today) => rows.filter(r => r.agent_state === 'done' && (r.evidence ?? []).some(e => kstDateOf(e?.at) === today))

// 실패 기록(~/.willow/mgmt-agent-failures.jsonl) — 한 줄에 {at, date, step, message, dry}.
export function failureLine(step, message, now = new Date(), dry = false) {
  return JSON.stringify({ at: now.toISOString(), date: kstDateOf(now.toISOString()), step, message: String(message ?? '').slice(0, 300), dry })
}
// 7일보다 오래된 줄과 깨진 줄은 버린다.
export function pruneFailureLines(lines, now = new Date(), keepDays = 7) {
  const cutoff = now.getTime() - keepDays * 86_400_000
  return lines.filter(l => { try { return new Date(JSON.parse(l).at).getTime() >= cutoff } catch { return false } })
}
export function failuresOn(lines, today) {
  const out = []
  for (const l of lines) { try { const f = JSON.parse(l); if (f.date === today) out.push(f) } catch {} }
  return out
}
// 요약용 "HH:MM 단계" 목록.
export const failureLabels = fs => fs.map(f => `${kstTime(f.at)} ${f.step}`)
const kstTime = at => new Date(new Date(at).getTime() + 9 * 3600e3).toISOString().slice(11, 16)

// 지난 판단 재사용으로 자동 답한 결정의 표식.
export const reuseRefs = d => [...(Array.isArray(d.refs) ? d.refs : []), { kind: 'reuse', from: d.subject_key }]
export const isReuse = d => (Array.isArray(d.refs) ? d.refs : []).some(r => r?.kind === 'reuse')
export const reuseLabel = d => { const q = String(d.question ?? ''); return q.length > 30 ? `${q.slice(0, 30)}…` : q }
