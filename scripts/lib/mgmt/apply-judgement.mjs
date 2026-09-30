// apply-judgement.mjs — 해석 결과를 원장·기록부·결정함에 반영한다. 회사는 입력 경로로 고정.
import { redact } from './redact.mjs'
import { tableFor } from './ledger.mjs'

const clean = s => redact(s ?? '').text
const cleanOrNull = s => (s === null || s === undefined ? null : clean(s))
const keyFor = (company, item) => item.source === 'chat' ? `mgmt-chat:${item.ref}` : `mgmt-mail:${company}:${item.ref}`
// 형식뿐 아니라 실존하는 날짜인지도 본다(2월 30일, 13월 등은 Date 가 다음 날짜로 굴려버리므로
// 왕복 변환으로 잡는다). Invalid Date 에 toISOString 을 부르면 던지므로 먼저 getTime 을 본다.
const isValidDate = d => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const dt = new Date(`${d}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return false
  return dt.toISOString().slice(0, 10) === d
}
const OTHER = { tensw: 'willow', willow: 'tensw' }
// 정기 원장 키(mgmt:)와 메일 키(mgmt-mail:)에는 회사가 박혀 있다. chat 키(mgmt-chat:)는
// 텐소 스페이스뿐이라 회사가 없다 — willow 입장에서는 어떤 mgmt-chat: 행도 자기 것이 아니다.
const belongsToOther = (sourceKey, company) => {
  if (typeof sourceKey !== 'string') return false
  const other = OTHER[company]
  if (sourceKey.startsWith(`mgmt:${other}:`) || sourceKey.startsWith(`mgmt-mail:${other}:`)) return true
  if (company === 'willow' && sourceKey.startsWith('mgmt-chat:')) return true
  return false
}

export function planJudgement(company, j, { items, openSchedules }) {
  if (!['tensw', 'willow'].includes(company)) throw new Error(`planJudgement: 알 수 없는 회사 "${company}"`)

  let dropped = 0
  const ownItems = items.filter(x => x.company === company)
  dropped += items.length - ownItems.length

  const byRef = new Map(ownItems.map(x => [x.ref, x]))
  const known = x => byRef.has(x.source_ref)
  const table = tableFor(company)

  const cases = j.cases.map(c => ({
    company, name: clean(c.name), counterparty: cleanOrNull(c.counterparty), stage: cleanOrNull(c.stage), summary: clean(c.summary),
  }))

  const knownEntries = j.entries.filter(known)
  dropped += j.entries.length - knownEntries.length
  const entries = knownEntries.map(e => {
    const item = byRef.get(e.source_ref)
    // due_date 하나가 잘못됐다고 항목 전체를 버리지 않는다 — 날짜만 비우고 dropped 에 잡는다
    // (날짜 컬럼에 그대로 들어가면 apply 전체가 죽는다).
    let due_date = e.due_date
    if (due_date != null && !isValidDate(due_date)) { dropped++; due_date = null }
    return {
      company, case_name: e.case ? clean(e.case) : null, kind: e.kind, body: clean(e.body),
      actor: e.actor ? clean(e.actor) : null, assignee: e.assignee ? clean(e.assignee) : null,
      due_date, source: item.source, source_ref: item.ref, occurred_at: item.at,
    }
  })

  const scheduleInserts = []
  const scheduleUpdateMap = new Map() // row.id -> { table, id, patch }
  const keyCounts = new Map()
  // 한 메시지에서 일정이 두 개 이상 나오면 source_key 가 충돌한다 — 두 번째부터 ':2', ':3' 을 붙인다.
  const nextKey = base => { const n = (keyCounts.get(base) ?? 0) + 1; keyCounts.set(base, n); return n === 1 ? base : `${base}:${n}` }
  // 같은 행(id)에 대한 여러 조작을 하나의 update 로 합친다. 증빙은 원래 행의 evidence 뒤에
  // 순서대로 이어붙인다(먼저 처리한 op 의 증빙이 먼저).
  const mergeUpdate = (row, patchFields, ev) => {
    const prior = scheduleUpdateMap.get(row.id)
    const baseEvidence = prior ? prior.patch.evidence : (row.evidence ?? [])
    scheduleUpdateMap.set(row.id, { table, id: row.id, patch: { ...(prior?.patch ?? {}), ...patchFields, evidence: [...baseEvidence, ev] } })
  }

  const knownSchedules = j.schedules.filter(known)
  dropped += j.schedules.length - knownSchedules.length
  for (const s of knownSchedules) {
    const item = byRef.get(s.source_ref)
    if (s.op === 'create') {
      if (!isValidDate(s.date)) { dropped++; continue }
      scheduleInserts.push({
        table, title: clean(s.title), schedule_date: s.date, type: 'deadline', category: 'other',
        source_key: nextKey(keyFor(company, item)), origin: item.source === 'chat' ? 'chat' : 'email',
        recipe: null, agent_state: 'planned', is_completed: false,
        evidence: [{ kind: 'message', ref: item.ref, at: item.at, note: clean(s.reason) }],
      })
      continue
    }
    const row = openSchedules.find(r => r.source_key && r.source_key === s.match_key && !belongsToOther(r.source_key, company))
    if (!row) { dropped++; continue }
    // 정기 규칙 행(mgmt:)은 반영도 임의로 닫거나 날짜를 옮기지 않는다 — 증빙만 남긴다.
    // 대화·메일에서 난 행(mgmt-chat:/mgmt-mail:)만 실제로 닫거나 날짜를 옮긴다.
    const canMutate = row.source_key.startsWith('mgmt-chat:') || row.source_key.startsWith('mgmt-mail:')
    const ev = { kind: 'message', ref: item.ref, at: item.at, note: clean(s.reason) }
    if (s.op === 'complete') {
      mergeUpdate(row, canMutate ? { is_completed: true, agent_state: 'done' } : {}, ev)
      continue
    }
    if (s.op === 'update') {
      if (canMutate && isValidDate(s.date) && s.date !== row.schedule_date) {
        mergeUpdate(row, { schedule_date: s.date }, ev)
      } else if (!canMutate) {
        mergeUpdate(row, {}, ev)
      } else if (s.date != null && !isValidDate(s.date)) {
        dropped++
      }
    }
  }
  const scheduleUpdates = [...scheduleUpdateMap.values()]

  const knownDecisions = j.decisions.filter(known)
  dropped += j.decisions.length - knownDecisions.length
  const decisions = knownDecisions.map(d => ({
    company, kind: d.kind, subject_key: `${company}:${clean(d.subject_key)}`, question: clean(d.question),
    options: d.options.map(o => ({ id: clean(o.id), label: clean(o.label) })),
    recommended: cleanOrNull(d.recommended), refs: [d.source_ref], status: 'open',
  }))

  return { cases, entries, scheduleInserts, scheduleUpdates, decisions, dropped }
}

export async function applyJudgement(sb, plan, { dryRun = false, log = () => {} } = {}) {
  const caseIds = new Map()
  for (const c of plan.cases) {
    log(`건 ${c.company} ${c.name}`)
    if (dryRun) continue
    // status 는 절대 보내지 않는다 — 대표가 이미 닫은 건을 재해석이 다시 열어버리는 것을 막는다.
    // counterparty/stage/summary 는 비어 있으면 키 자체를 뺀다(null 로 덮어쓰지 않는다).
    const row = { company: c.company, name: c.name, updated_at: new Date().toISOString() }
    if (c.counterparty != null) row.counterparty = c.counterparty
    if (c.stage != null) row.stage = c.stage
    if (c.summary) row.summary = c.summary
    const { data, error } = await sb.from('mgmt_cases').upsert(row, { onConflict: 'company,name' }).select('id,name').single()
    if (error) throw error
    caseIds.set(c.name, data.id)
  }

  // 이번 배치의 ref 들에 대해 이미 있는 (kind, source_ref) 를 한 번에 미리 읽어 중복 삽입을 막는다.
  // 같은 실행 안에서 나온 여러 항목은(같은 ref 라도) 서로를 막지 않는다 — DB 에 이미 있던 것만 막는다.
  let existingEntrySet = new Set()
  if (!dryRun && plan.entries.length) {
    const refs = [...new Set(plan.entries.map(e => e.source_ref))]
    const { data, error } = await sb.from('mgmt_entries').select('kind,source_ref').in('source_ref', refs)
    if (error) throw error
    existingEntrySet = new Set((data ?? []).map(r => `${r.kind}:${r.source_ref}`))
  }

  for (const e of plan.entries) {
    if (existingEntrySet.has(`${e.kind}:${e.source_ref}`)) { log(`건너뜀(중복) ${e.kind} ${e.source_ref}`); continue }
    log(`기록 ${e.kind} ${e.body.slice(0, 60)}`)
    if (dryRun) continue
    const { case_name, ...row } = e
    let case_id = null
    if (case_name) {
      if (caseIds.has(case_name)) {
        case_id = caseIds.get(case_name)
      } else {
        const { data, error } = await sb.from('mgmt_cases').select('id').eq('company', e.company).eq('name', case_name).maybeSingle()
        if (error) throw error
        case_id = data?.id ?? null
      }
    }
    const { error } = await sb.from('mgmt_entries').insert({ ...row, case_id })
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
