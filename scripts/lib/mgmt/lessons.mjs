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
  if (kind === 'deleted') return { company, scope: 'judge', lesson: clean(`"${s.title}" 같은 항목은 일정으로 만들지 않는다(대표가 지움)`), example: { input: clean(s.title ?? ''), expected: 'no_schedule' }, source: 'reverted', source_ref: ref }
  if (kind === 'reopened') {
    const ev = (row.evidence ?? []).at(-1)
    const evInput = ev ? { kind: ev.kind ?? null, ref: ev.ref ?? null, note: ev.note == null ? null : clean(String(ev.note)) } : null
    return { company, scope: 'close', lesson: clean(`"${s.title}" 는 ${ev ? `${ev.kind} "${ev.note ?? ev.ref ?? ''}"` : '그 근거'} 만으로 닫지 않는다(대표가 다시 엶)`), example: { input: evInput, expected: 'keep_open' }, source: 'reverted', source_ref: ref }
  }
  if (kind === 'moved') return { company, scope: (write.source_key ?? '').startsWith('mgmt:') ? 'rule' : 'judge', lesson: clean(`"${s.title}" 날짜는 ${s.schedule_date} 가 아니라 ${row.schedule_date}(대표가 옮김)`), example: { input: s.schedule_date, expected: row.schedule_date }, source: 'reverted', source_ref: ref }
  return { company, scope: 'judge', lesson: clean(`"${s.title}" 는 "${row.title}" 로 부른다`), example: { input: clean(s.title ?? ''), expected: clean(row.title ?? '') }, source: 'reverted', source_ref: ref }
}

// 프롬프트에 넣을 교훈 행: 활성·같은 회사 또는 공통(null)·최근순 limit 개.
export function pickLessons(lessons, company, limit = 20) {
  return lessons.filter(l => l.active && (!l.company || l.company === company))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit)
}
export function lessonsForPrompt(lessons, company, limit = 20) {
  return pickLessons(lessons, company, limit).map(l => l.lesson)
}

// learn 단계의 순수 계획. 되돌림마다 교훈 하나. 개인 일정(category personal)이 된 행은 교훈 없이
// 기록만 지운다. 지워진 행도 기록을 지운다. 나머지 행은 snapshot 이 지금과 다르면 지금 값으로 갱신.
export function planLearn(writes, rows) {
  const byId = new Map(rows.map(r => [r.id, r]))
  const forget = [], refresh = []
  const personalIds = new Set()
  for (const w of writes) {
    const row = byId.get(w.row_id)
    if (row && isPersonal(row)) { personalIds.add(w.row_id); forget.push(w.row_id) }
  }
  const reverts = detectReverts(writes.filter(w => !personalIds.has(w.row_id)), rows)
  const lessons = reverts.map(lessonFromRevert)
  for (const r of reverts) if (r.kind === 'deleted') forget.push(r.write.row_id)
  for (const w of writes) {
    const row = byId.get(w.row_id)
    if (!row || personalIds.has(w.row_id)) continue
    const now = snapshotOf(row)
    if (JSON.stringify(now) !== JSON.stringify(snapshotOf(w.snapshot ?? {}))) refresh.push(row)
  }
  return { lessons, forget, refresh }
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
export async function saveLesson(sb, lesson, { dryRun = false } = {}) {
  if (dryRun) return
  const { error } = await sb.from('mgmt_lessons').insert(lesson)
  if (error && error.code !== '23505') throw error
}
export async function bumpHits(sb, lessons, { dryRun = false } = {}) {
  if (dryRun) return
  for (const l of lessons) {
    const { error } = await sb.from('mgmt_lessons').update({ hits: (l.hits ?? 0) + 1 }).eq('id', l.id)
    if (error) throw error
    l.hits = (l.hits ?? 0) + 1 // 같은 실행의 다음 묶음이 같은 값을 다시 쓰지 않게.
  }
}
