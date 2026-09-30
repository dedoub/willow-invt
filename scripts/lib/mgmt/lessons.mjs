// lessons.mjs — 대표님이 되돌린 것에서 배우고, 배운 것을 다음 판단에 넣는다.
// 에이전트가 원장 행을 쓸 때마다 그 행의 네 칸(snapshot)을 mgmt_agent_writes 에 남긴다. 다음 실행의
// learn 단계가 지금 행과 비교해, 사람이 지웠거나·다시 열었거나·날짜를 옮겼거나·이름을 바꿨으면
// 그걸 교훈(mgmt_lessons)으로 적는다. 교훈은 judge 프롬프트에 "지난 교훈" 으로 들어간다.
import { redact } from './redact.mjs'

export const SCOPES = ['judge', 'rule', 'close', 'decision']
export const LESSON_COMPANIES = ['tensw', 'willow']

export const snapshotOf = r => ({ title: r.title, schedule_date: r.schedule_date, is_completed: !!r.is_completed, agent_state: r.agent_state ?? null })
const companyOfTable = t => t.startsWith('willow') ? 'willow' : 'tensw'
const isPersonal = r => r?.category === 'personal'

export function detectReverts(writes, rows) {
  const byId = new Map(rows.map(r => [r.id, r]))
  const out = []
  for (const write of writes) {
    const row = byId.get(write.row_id)
    const s = write.snapshot
    if (!row) { out.push({ kind: 'deleted', write, row: null }); continue }
    if (s.is_completed && !row.is_completed) out.push({ kind: 'reopened', write, row })
    else if (s.schedule_date !== row.schedule_date) out.push({ kind: 'moved', write, row })
    else if (s.title !== row.title) out.push({ kind: 'renamed', write, row })
  }
  return out
}

export function lessonFromRevert({ kind, write, row }) {
  const s = write.snapshot, company = companyOfTable(write.table_name), ref = write.source_key ?? write.row_id
  const clean = t => redact(t).text
  if (kind === 'deleted') {
    // 정기 규칙 행(mgmt:)을 지웠으면 그 회차 키를 막는다 — rules 단계가 다시 깔지 않는다(suppressed).
    if ((write.source_key ?? '').startsWith('mgmt:')) return { company, scope: 'rule', lesson: clean(`"${s.title}" 회차(${write.source_key})는 다시 만들지 않는다(대표가 지움)`), example: { input: write.source_key, expected: 'suppressed' }, source: 'reverted', source_ref: write.source_key }
    return { company, scope: 'judge', lesson: clean(`"${s.title}" 같은 항목은 일정으로 만들지 않는다(대표가 지움)`), example: { input: clean(s.title ?? ''), expected: 'no_schedule' }, source: 'reverted', source_ref: ref }
  }
  if (kind === 'reopened') {
    const ev = (row.evidence ?? []).at(-1)
    const evInput = ev ? { kind: ev.kind ?? null, ref: ev.ref ?? null, note: ev.note == null ? null : clean(String(ev.note)) } : null
    return { company, scope: 'close', lesson: clean(`"${s.title}" 는 ${ev ? `${ev.kind} "${ev.note ?? ev.ref ?? ''}"` : '그 근거'} 만으로 닫지 않는다(대표가 다시 엶)`), example: { input: evInput, expected: 'keep_open' }, source: 'reverted', source_ref: ref }
  }
  if (kind === 'moved') return { company, scope: (write.source_key ?? '').startsWith('mgmt:') ? 'rule' : 'judge', lesson: clean(`"${s.title}" 날짜는 ${s.schedule_date} 가 아니라 ${row.schedule_date}(대표가 옮김)`), example: { input: s.schedule_date, expected: row.schedule_date }, source: 'reverted', source_ref: ref }
  return { company, scope: 'judge', lesson: clean(`"${s.title}" 는 "${row.title}" 로 부른다`), example: { input: clean(s.title ?? ''), expected: clean(row.title ?? '') }, source: 'reverted', source_ref: ref }
}

// judge 프롬프트에 들어가는 범위. rule(회차 막기·날짜)·decision 은 프롬프트가 아니라 다른 경로가 쓴다.
export const PROMPT_SCOPES = ['judge', 'close']
// 프롬프트에 넣을 교훈 행: 활성·같은 회사 또는 공통(null)·(scopes 를 주면 그 범위만)·최근순 limit 개.
export function pickLessons(lessons, company, limit = 20, { scopes = null } = {}) {
  return lessons.filter(l => l.active && (!l.company || l.company === company) && (!scopes || scopes.includes(l.scope)))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)
}
export function lessonsForPrompt(lessons, company, limit = 20) {
  return pickLessons(lessons, company, limit).map(l => l.lesson)
}

// learn 단계의 순수 계획. 되돌림마다 교훈 하나. 개인 일정(category personal)이 된 행은 교훈 없이
// 기록만 지운다. 지워진 행도 기록을 지운다. 30일 넘게 지난 완료 기록은 비교 없이 지운다(가지치기).
// 되돌림이 다음 단계에서 다시 뒤집히지 않도록 행 패치도 낸다(patches — onWrite 로 적용해 snapshot 이 따라간다):
//   - 정기 행(mgmt:)의 날짜·이름을 바꿨으면 origin 'manual' (planOccurrences 가 사람 행으로 보고 손대지 않는다)
//   - 다시 열었으면 마지막 증빙 ref 를 rejected 로 붙이고 agent_state 'planned' (planClose 가 그 증빙으로 다시 닫지 않는다)
// 나머지 행은 snapshot 이 지금과 다르면 지금 값으로 갱신(refresh). 패치하는 행은 onWrite 가 갱신하므로 뺀다.
export const PRUNE_DONE_DAYS = 30
export function planLearn(writes, rows, { now = new Date() } = {}) {
  const byId = new Map(rows.map(r => [r.id, r]))
  const forget = [], refresh = [], patches = []
  const skip = new Set()
  const cutoff = now.getTime() - PRUNE_DONE_DAYS * 86_400_000
  for (const w of writes) {
    const row = byId.get(w.row_id)
    if (row && isPersonal(row)) { skip.add(w.row_id); forget.push(w.row_id); continue }
    const t = Date.parse(w.written_at ?? '')
    if (w.snapshot?.is_completed && Number.isFinite(t) && t < cutoff) { skip.add(w.row_id); forget.push(w.row_id) }
  }
  const reverts = detectReverts(writes.filter(w => !skip.has(w.row_id)), rows)
  const lessons = reverts.map(lessonFromRevert)
  const patched = new Set()
  for (const r of reverts) {
    if (r.kind === 'deleted') { forget.push(r.write.row_id); continue }
    const isRule = (r.write.source_key ?? '').startsWith('mgmt:')
    if ((r.kind === 'moved' || r.kind === 'renamed') && isRule && r.row.origin !== 'manual') {
      patches.push({ id: r.row.id, patch: { origin: 'manual' } }); patched.add(r.row.id)
    }
    if (r.kind === 'reopened') {
      const evidence = r.row.evidence ?? []
      const last = evidence.filter(e => e?.kind !== 'rejected').at(-1)
      const patch = { agent_state: 'planned' }
      if (last?.ref) patch.evidence = [...evidence, { kind: 'rejected', ref: last.ref, at: now.toISOString() }]
      patches.push({ id: r.row.id, patch }); patched.add(r.row.id)
    }
  }
  for (const w of writes) {
    const row = byId.get(w.row_id)
    if (!row || skip.has(w.row_id) || patched.has(w.row_id)) continue
    const cur = snapshotOf(row)
    if (JSON.stringify(cur) !== JSON.stringify(snapshotOf(w.snapshot ?? {}))) refresh.push(row)
  }
  return { lessons, forget, refresh, patches }
}

// `lesson` 명령 인자: --company tensw|willow [--scope judge|rule|close|decision] "문장" [--dry]
export function parseLessonArgs(argv) {
  const rest = [], opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--company' || a === '--scope') { opts[a.slice(2)] = argv[++i]; continue }
    if (a === '--dry') continue
    rest.push(a)
  }
  const company = opts.company, scope = opts.scope ?? 'judge'
  if (!LESSON_COMPANIES.includes(company)) throw new Error(`--company 는 ${LESSON_COMPANIES.join('|')} 중 하나`)
  if (!SCOPES.includes(scope)) throw new Error(`--scope 는 ${SCOPES.join('|')} 중 하나`)
  const lesson = redact(rest.join(' ').trim()).text
  if (!lesson) throw new Error('교훈 문장이 비었다')
  return { company, scope, lesson, example: null, source: 'ceo_correction', source_ref: null }
}

export async function recordWrite(sb, table, row, { dryRun = false } = {}) {
  if (dryRun || !row?.id || isPersonal(row)) return
  const { error } = await sb.from('mgmt_agent_writes').upsert({ table_name: table, row_id: row.id, source_key: row.source_key ?? null, snapshot: snapshotOf(row), written_at: new Date().toISOString() })
  if (error) throw error
}
export async function forgetWrites(sb, table, rowIds, { dryRun = false } = {}) {
  if (dryRun || !rowIds.length) return
  const { error } = await sb.from('mgmt_agent_writes').delete().eq('table_name', table).in('row_id', rowIds)
  if (error) throw error
}
export async function loadWrites(sb, table) {
  const { data, error } = await sb.from('mgmt_agent_writes').select('*').eq('table_name', table)
  if (error) throw error
  return data ?? []
}
export async function loadLessons(sb) {
  const { data, error } = await sb.from('mgmt_lessons').select('id, company, scope, lesson, hits, active, created_at').eq('active', true)
  if (error) throw error
  return data ?? []
}
// { duplicate: true } 면 같은 (scope, lesson) 이 이미 있어 넣지 않았다. dry 면 { dry: true }.
export async function saveLesson(sb, lesson, { dryRun = false } = {}) {
  if (dryRun) return { dry: true, duplicate: false }
  const { error } = await sb.from('mgmt_lessons').insert(lesson)
  if (error && error.code === '23505') return { duplicate: true }
  if (error) throw error
  return { duplicate: false }
}
// rules 단계가 다시 깔지 않을 회차 키(지운 정기 행). 활성 rule 교훈 중 expected='suppressed'.
export async function loadSuppressedKeys(sb) {
  const { data, error } = await sb.from('mgmt_lessons').select('source_ref').eq('active', true).eq('scope', 'rule').eq('example->>expected', 'suppressed')
  if (error) throw error
  return new Set((data ?? []).map(r => r.source_ref).filter(Boolean))
}
export async function bumpHits(sb, lessons, { dryRun = false } = {}) {
  if (dryRun) return
  for (const l of lessons) {
    const { error } = await sb.from('mgmt_lessons').update({ hits: (l.hits ?? 0) + 1 }).eq('id', l.id)
    if (error) throw error
    l.hits = (l.hits ?? 0) + 1 // 같은 실행의 다음 묶음이 같은 값을 다시 쓰지 않게.
  }
}
