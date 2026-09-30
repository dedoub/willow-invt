// apply-judgement.mjs — 해석 결과를 원장·기록부·결정함에 반영한다. 회사는 입력 경로로 고정.
import { redact } from './redact.mjs'
import { tableFor } from './ledger.mjs'
import { closePatch } from './closers.mjs'

const clean = s => redact(s ?? '').text
const keyFor = (company, item) => item.source === 'chat' ? `mgmt-chat:${item.ref}` : `mgmt-mail:${company}:${item.ref}`

export function planJudgement(company, j, { items, openSchedules }) {
  const byRef = new Map(items.map(x => [x.ref, x]))
  const known = x => byRef.has(x.source_ref)
  const table = tableFor(company)
  const cases = j.cases.map(c => ({ company, name: c.name, counterparty: c.counterparty, stage: c.stage, summary: clean(c.summary), status: 'open' }))
  const entries = j.entries.filter(known).map(e => {
    const item = byRef.get(e.source_ref)
    return { company, case_name: e.case, kind: e.kind, body: clean(e.body), actor: e.actor, assignee: e.assignee, due_date: e.due_date,
      source: item.source, source_ref: item.ref, occurred_at: item.at }
  })
  const scheduleInserts = [], scheduleUpdates = []
  for (const s of j.schedules.filter(known)) {
    const item = byRef.get(s.source_ref)
    if (s.op === 'create' && s.date) {
      scheduleInserts.push({ table, title: clean(s.title), schedule_date: s.date, type: 'deadline', category: 'other', source_key: keyFor(company, item),
        origin: item.source === 'chat' ? 'chat' : 'email', recipe: null, agent_state: 'planned', is_completed: false,
        evidence: [{ kind: 'message', ref: item.ref, note: clean(s.reason) }] })
      continue
    }
    const row = openSchedules.find(r => r.source_key && r.source_key === s.match_key)
    if (!row) continue
    if (s.op === 'complete') scheduleUpdates.push({ table, id: row.id, patch: closePatch(row, { kind: 'message', ref: item.ref, at: item.at, note: clean(s.reason) }) })
    if (s.op === 'update' && s.date && s.date !== row.schedule_date) scheduleUpdates.push({ table, id: row.id, patch: { schedule_date: s.date, evidence: [...(row.evidence ?? []), { kind: 'message', ref: item.ref, note: clean(s.reason) }] } })
  }
  const decisions = j.decisions.filter(known).map(d => ({ company, kind: d.kind, subject_key: `${company}:${d.subject_key}`, question: clean(d.question),
    options: d.options, recommended: d.recommended, refs: [d.source_ref], status: 'open' }))
  return { cases, entries, scheduleInserts, scheduleUpdates, decisions }
}

export async function applyJudgement(sb, plan, { dryRun = false, log = () => {} } = {}) {
  const caseIds = new Map()
  for (const c of plan.cases) {
    log(`건 ${c.company} ${c.name}`)
    if (dryRun) continue
    const { data, error } = await sb.from('mgmt_cases').upsert({ ...c, updated_at: new Date().toISOString() }, { onConflict: 'company,name' }).select('id,name').single()
    if (error) throw error
    caseIds.set(c.name, data.id)
  }
  for (const e of plan.entries) {
    log(`기록 ${e.kind} ${e.body.slice(0, 60)}`)
    if (dryRun) continue
    const { case_name, ...row } = e
    const { error } = await sb.from('mgmt_entries').insert({ ...row, case_id: case_name ? caseIds.get(case_name) ?? null : null })
    if (error && error.code !== '23505') throw error
  }
  for (const { table, ...row } of plan.scheduleInserts) {
    log(`일정 추가 ${row.schedule_date} ${row.title}`)
    if (dryRun) continue
    const { error } = await sb.from(table).insert(row)
    if (error && error.code !== '23505') throw error
  }
  for (const { table, id, patch } of plan.scheduleUpdates) {
    log(`일정 ${patch.is_completed ? '완료' : '변경'} ${id}`)
    if (!dryRun) { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error }
  }
  for (const d of plan.decisions) {
    log(`결정함 ${d.kind} ${d.question.slice(0, 60)}`)
    if (dryRun) continue
    const { error } = await sb.from('mgmt_decisions').insert(d)
    if (error && error.code !== '23505') throw error
  }
}
