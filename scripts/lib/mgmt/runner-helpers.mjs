// runner-helpers.mjs — 실행기(mgmt-agent.mjs)의 DB 없는 순수 로직. 시험은 runner-helpers.test.mjs.
import { findEvidence, closePatch } from './closers.mjs'
import { normalizeSubject } from './infer.mjs'

export const addDays = (key, n) => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// 07:00~07:29 이면 infer 먼저, 18:30~18:59 이면 마지막에 digest.
export const STEP_NAMES = ['rules', 'collect', 'close', 'decide', 'digest', 'infer']
export function planSteps(hm, only = null) {
  if (only) {
    if (!STEP_NAMES.includes(only)) throw new Error(`알 수 없는 단계 "${only}" (${STEP_NAMES.join('|')})`)
    return [only]
  }
  return [...(hm >= '07:00' && hm < '07:30' ? ['infer'] : []), 'rules', 'collect', 'close', 'decide', ...(hm >= '18:30' && hm < '19:00' ? ['digest'] : [])]
}

// mgmt:<company>:<task>:<YYYY-MM>:<step>
export function parseSourceKey(key) {
  const m = /^mgmt:(tensw|willow):([^:]+):([^:]+):([^:]+)$/.exec(String(key ?? ''))
  return m ? { company: m[1], task: m[2], period: m[3], step: m[4] } : null
}

// *_mgmt_cash 는 날짜가 payment_date(없으면 issue_date), 분류가 type 이다. 부호도 섞여 있다
// (지출이 양수인 expense 행, 음수인 liability 행). 'salary' 분류는 없으므로 급여 이체는
// 적요·상대에 "급여"가 있고 나가는 돈(지출·부채 상환 또는 음수)이면 salary 로 본다.
export function cashDirection(row) {
  if (Number(row.amount) < 0) return 'out'
  return ['expense', 'liability'].includes(row.type) ? 'out' : 'in'
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

// 닫기: 규칙의 completion 으로 기록 증빙을 찾는다. completion 이 없는 규칙(서명본 회신 등)만
// 행에 이미 붙은 메시지 증빙으로 닫는다(Task 9 판정 — completion 이 있는 행은 메시지로 닫지 않는다).
export function planClose(row, rule, facts) {
  if (!rule) return null
  const ev = findEvidence(row, rule, facts)
  if (ev) return { ev, patch: closePatch(row, ev) }
  if (rule.completion) return null
  const msg = (row.evidence ?? []).filter(e => e?.kind === 'message').at(-1)
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
