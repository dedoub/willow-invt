// runner-helpers.mjs — 실행기(mgmt-agent.mjs)의 DB 없는 순수 로직. 시험은 runner-helpers.test.mjs.
import { findEvidence, closePatch } from './closers.mjs'
import { normalizeSubject } from './infer.mjs'
import { redact } from './redact.mjs'

export const addDays = (key, n) => { const t = new Date(`${key}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }

// learn(되돌림에서 배우기)이 맨 앞. 07:00~07:29 이면 infer, 월요일 그 시각이면 infer 다음에 tune, 18:30~18:59 이면 마지막에 digest.
// 월요일 07:30~07:59 이면 마지막에 weekly(주간 성적표 + 스킬 후보).
export const STEP_NAMES = ['learn', 'rules', 'collect', 'close', 'decide', 'digest', 'infer', 'tune', 'weekly']
// I5: dry 는 collect(Codex 호출)를 digest 와 같은 18:30~18:59 실행에서만 돈다. --only collect 는 그대로.
export function planSteps(hm, only = null, { monday = false, dry = false } = {}) {
  if (only !== null && only !== undefined) {
    if (!STEP_NAMES.includes(only)) throw new Error(`알 수 없는 단계 "${only}" (${STEP_NAMES.join('|')})`)
    return [only]
  }
  const inferWindow = hm >= '07:00' && hm < '07:30'
  const weeklyWindow = monday && hm >= '07:30' && hm < '08:00'
  const digestWindow = hm >= '18:30' && hm < '19:00'
  const collect = !dry || digestWindow ? ['collect'] : []
  return ['learn', ...(inferWindow ? ['infer', ...(monday ? ['tune'] : [])] : []), 'rules', ...collect, 'close', 'decide', ...(digestWindow ? ['digest'] : []), ...(weeklyWindow ? ['weekly'] : [])]
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
export function planClose(row, rule, facts, { now = new Date() } = {}) {
  if (!rule) return null
  const rejected = rejectedRefs(row)
  // I4: 바깥 시스템(커머셜 인보이스·재무 동기화)이 같은 회차 행을 뒤늦게 만들었으면 그 행이 일을 맡는다.
  const adopted = findAdoption(row, rule, facts.ledgerRows ?? [], { now })
  if (adopted && !rejected.has(String(adopted.ref))) return { ev: adopted, patch: closePatch(row, adopted) }
  const ev = findEvidence(row, rule, withoutRejected(facts, rejected))
  if (ev && !rejected.has(String(ev.ref))) return { ev, patch: closePatch(row, ev) }
  if (rule.completion) return null
  const msg = (row.evidence ?? []).filter(e => e?.kind === 'message' && !rejected.has(String(e.ref))).at(-1)
  if (!msg) return null
  return { ev: msg, patch: { is_completed: true, agent_state: 'done', evidence: row.evidence } }
}

// I4: 규칙에 adopt_prefix 가 있고, 같은 회사 원장에 그 접두사로 시작하는 행이 규칙 행과 ±5일 안(또는
// 접두사+같은 대상 월 키)이면 그 행이 의무를 넘겨받은 것 — {kind:'adopted', ref:<그 행 키>, at:<지금>}.
export const ADOPT_CLOSE_DAYS = 5
const dayGap = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)
export function findAdoption(row, rule, ledgerRows, { now = new Date() } = {}) {
  const prefix = rule?.adopt_prefix
  if (!prefix || !row?.schedule_date) return null
  const period = parseSourceKey(row.source_key)?.period
  const hit = ledgerRows.find(r => r.source_key && r.source_key !== row.source_key && r.source_key.startsWith(prefix)
    && ((period && r.source_key === `${prefix}${period}`) || (r.schedule_date && dayGap(r.schedule_date, row.schedule_date) <= ADOPT_CLOSE_DAYS)))
  return hit ? { kind: 'adopted', ref: hit.source_key, at: now.toISOString() } : null
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

// I3: 원장 행이 이미 닫혔거나(또는 사라진) 열린·보낸 missed 결정 — 보내기 전에 expired 로 돌린다.
// rowsByKey: schedule_key → 행({is_completed}) (없으면 사라진 행).
export function staleMissedDecisionIds(decisions, rowsByKey) {
  return decisions
    .filter(d => d.kind === 'missed' && ['open', 'sent'].includes(d.status) && d.schedule_key)
    .filter(d => { const r = rowsByKey.get(d.schedule_key); return !r || r.is_completed })
    .map(d => d.id)
}

// I3: 한 실행에 보내는 결정 수 상한, 오래된 것부터.
export const DECISIONS_PER_RUN = 5
export function pickDecisionsToSend(open, limit = DECISIONS_PER_RUN) {
  return [...open].sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)).slice(0, limit)
}

// M6: 보류(answer 'hold', status answered)는 아무 것도 반영하지 않고, 7일 지나면 expired.
export const HOLD_DAYS = 7
export const isHold = d => d?.answer === 'hold'
export function holdExpired(d, now = new Date()) {
  if (!isHold(d)) return false
  const t = Date.parse(d.answered_at)
  return !Number.isNaN(t) && now.getTime() - t >= HOLD_DAYS * 86_400_000
}

// I7: 텔레그램 한 통 상한(4096)보다 여유 있게 3,800자에서 줄 단위로 나눈다. 한 줄이 넘치면 그 줄만 자른다.
export const TELEGRAM_CHUNK = 3800
export function splitMessage(text, max = TELEGRAM_CHUNK) {
  const pieces = String(text ?? '').split('\n').flatMap(line => {
    if (line.length <= max) return [line]
    const parts = []
    for (let i = 0; i < line.length; i += max) parts.push(line.slice(i, i + max))
    return parts
  })
  const out = []
  let cur = null
  for (const p of pieces) {
    if (cur === null) cur = p
    else if (cur.length + 1 + p.length <= max) cur += `\n${p}`
    else { out.push(cur); cur = p }
  }
  out.push(cur ?? '')
  return out
}

// I8: 주간 성적표의 해석 실패 = 오늘까지 7일 안의 non-dry collect* 실패(하루 한 번 남기는 skipped 표시는 빼고).
export function countJudgeFailures(lines) {
  return lines.filter(l => { try { const f = JSON.parse(l); const st = String(f.step ?? ''); return (st === 'collect' || st.startsWith('collect:mail:') || st.startsWith('collect:chat:')) && !st.endsWith(':skipped') && !f.dry } catch { return false } }).length
}

// M5: 같은 collect 소스가 오늘(KST) 실제 실행에서 3번 이상 실패했으면 오늘은 건너뛴다.
// 돌려주는 값: { skip: Set<source>, alreadyMarked: Set<source> } — alreadyMarked 는 오늘 skipped 줄이 이미 있는 소스.
export const POISON_LIMIT = 3
export function poisonedSources(lines, today, limit = POISON_LIMIT) {
  const counts = new Map(), alreadyMarked = new Set()
  for (const f of failuresOn(lines, today)) {
    if (f.dry) continue
    const m = /^collect:(.+?)(:skipped)?$/.exec(String(f.step ?? ''))
    if (!m || m[1] === 'lessons' || m[1] === 'lesson-hits') continue
    if (m[2]) { alreadyMarked.add(m[1]); continue }
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  return { skip: new Set([...counts].filter(([, n]) => n >= limit).map(([k]) => k)), alreadyMarked }
}

// I6: dry 실행에서 에이전트가 했을 일(~/.willow/mgmt-agent-dry.jsonl). 한 줄에 {at, date, kind, company, title}.
export const DRY_KINDS = { schedule: '만들 일정', decision: '물을 결정', inferred: '추정 규칙', close: '닫을 일정' }
export function dryLine(kind, company, title, now = new Date()) {
  return JSON.stringify({ at: now.toISOString(), date: kstDateOf(now.toISOString()), kind, company, title: redact(String(title ?? '')).text.slice(0, 200) })
}
// 기존 줄(7일 넘은 것은 버림)에 새 줄을 더한다 — 같은 날·종류·회사·제목은 한 번만.
export function mergeDryLines(lines, fresh, now = new Date()) {
  const kept = pruneFailureLines(lines, now)
  const seen = new Set(kept.map(l => { try { const f = JSON.parse(l); return `${f.date}|${f.kind}|${f.company}|${f.title}` } catch { return '' } }))
  for (const l of fresh) {
    const f = JSON.parse(l)
    const k = `${f.date}|${f.kind}|${f.company}|${f.title}`
    if (seen.has(k)) continue
    seen.add(k); kept.push(l)
  }
  return kept
}
// 오늘 줄을 종류별로 묶어 요약 줄로. 종류당 제목 30개까지.
export function dryDigestLines(lines, today, { perKind = 30 } = {}) {
  const by = new Map()
  for (const f of failuresOn(lines, today)) {
    if (!DRY_KINDS[f.kind]) continue
    if (!by.has(f.kind)) by.set(f.kind, [])
    by.get(f.kind).push(`${f.company === 'willow' ? '윌로우' : '텐소'} ${redact(f.title).text}`)
  }
  const out = []
  for (const kind of Object.keys(DRY_KINDS)) {
    const ts = by.get(kind)
    if (!ts?.length) continue
    out.push(`${DRY_KINDS[kind]} ${ts.length}: ${ts.slice(0, perKind).join(', ')}${ts.length > perKind ? ` 외 ${ts.length - perKind}건` : ''}`)
  }
  return out
}
