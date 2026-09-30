import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotOf, detectReverts, lessonFromRevert, lessonsForPrompt } from './lessons.mjs'
import { buildPrompt } from './judge.mjs'

const w = (id, snap, key = 'mgmt-chat:spaces/A/messages/1') => ({ table_name: 'tensw_mgmt_schedules', row_id: id, source_key: key, snapshot: snap })
const base = { title: 'NIA 월간보고', schedule_date: '2026-10-02', is_completed: false, agent_state: 'planned' }

test('지워진·다시 열린·옮겨진·이름 바뀐 행을 찾는다', () => {
  const writes = [w('a', base), w('b', { ...base, is_completed: true, agent_state: 'done' }), w('c', base), w('d', base)]
  const rows = [
    { id: 'b', ...base, is_completed: false, agent_state: 'planned', evidence: [{ kind: 'message', note: '송금했습니다' }] },
    { id: 'c', ...base, schedule_date: '2026-10-06' },
    { id: 'd', ...base, title: 'NIA 9월 월간보고회' },
  ]
  const r = detectReverts(writes, rows)
  assert.deepEqual(r.map(x => [x.kind, x.write.row_id]).sort(), [['deleted', 'a'], ['moved', 'c'], ['renamed', 'd'], ['reopened', 'b']])
})
test('바뀐 게 없으면 없다', () => {
  assert.deepEqual(detectReverts([w('a', base)], [{ id: 'a', ...base }]), [])
})
test('되돌림에서 교훈 문장', () => {
  const reopened = lessonFromRevert({ kind: 'reopened', write: w('b', { ...base, is_completed: true }), row: { id: 'b', ...base, evidence: [{ kind: 'message', note: '송금했습니다' }] } })
  assert.equal(reopened.scope, 'close'); assert.equal(reopened.source, 'reverted'); assert.equal(reopened.company, 'tensw')
  assert.match(reopened.lesson, /NIA 월간보고/); assert.match(reopened.lesson, /송금했습니다/)
  const moved = lessonFromRevert({ kind: 'moved', write: w('c', base, 'mgmt:tensw:payroll:2026-10:request'), row: { id: 'c', ...base, schedule_date: '2026-10-06' } })
  assert.equal(moved.scope, 'rule'); assert.match(moved.lesson, /2026-10-06/)
})
test('프롬프트 교훈은 회사별·활성·최근 20개', () => {
  const ls = Array.from({ length: 25 }, (_, i) => ({ company: i % 2 ? 'willow' : null, lesson: `L${i}`, active: i !== 24, created_at: `2026-10-${String(i + 1).padStart(2, '0')}` }))
  const got = lessonsForPrompt(ls, 'willow')
  assert.ok(got.length <= 20); assert.ok(!got.includes('L24')); assert.equal(got[0], 'L23')
  const p = buildPrompt({ company: 'willow', items: [], openCases: [], openSchedules: [], lessons: ['형운 메일은 제목 상호로 가른다'] })
  assert.match(p, /지난 교훈/); assert.match(p, /형운 메일은 제목 상호로 가른다/)
})
test('snapshot 은 네 칸만', () => {
  assert.deepEqual(Object.keys(snapshotOf({ id: 'x', ...base, evidence: [] })).sort(), ['agent_state', 'is_completed', 'schedule_date', 'title'])
})

// --- 이하 Task 16 추가 시험: learn 계획·lesson 명령 인자·onWrite 배선 ---
import { planLearn, parseLessonArgs, recordWrite } from './lessons.mjs'
import { applyPlan } from './ledger.mjs'
import { applyJudgement } from './apply-judgement.mjs'

test('planLearn: 개인 일정이 된 행은 교훈 없이 기록만 지우고, 지운 행도 기록을 지운다', () => {
  const writes = [w('a', base), w('p', base), w('c', base), w('s', base)]
  const rows = [
    { id: 'p', ...base, schedule_date: '2026-10-09', category: 'personal' },
    { id: 'c', ...base, schedule_date: '2026-10-06', category: 'other' },
    { id: 's', ...base, category: 'other' },
  ]
  const { lessons, forget, refresh } = planLearn(writes, rows)
  assert.deepEqual(lessons.map(l => l.scope), ['judge', 'judge'])
  assert.ok(!lessons.some(l => /2026-10-09/.test(l.lesson)))
  assert.deepEqual(forget.sort(), ['a', 'p'])
  assert.deepEqual(refresh.map(r => r.id), ['c'])
})

test('되돌림 교훈은 비밀값을 가린다', () => {
  const l = lessonFromRevert({ kind: 'renamed', write: w('d', { ...base, title: '계좌 1002-123-456789 이체' }), row: { id: 'd', ...base, title: '급여 이체' } })
  assert.doesNotMatch(l.lesson, /1002-123-456789/)
  assert.doesNotMatch(JSON.stringify(l.example), /1002-123-456789/)
})

test('parseLessonArgs: 회사·범위 검증, 문장은 가림', () => {
  const l = parseLessonArgs(['--company', 'tensw', '--scope', 'close', '형운 메일은', '제목 상호로 가른다', '--dry'])
  assert.deepEqual(l, { company: 'tensw', scope: 'close', lesson: '형운 메일은 제목 상호로 가른다', example: null, source: 'ceo_correction', source_ref: null })
  assert.equal(parseLessonArgs(['--company', 'willow', '문장']).scope, 'judge')
  assert.throws(() => parseLessonArgs(['--company', 'acme', '문장']))
  assert.throws(() => parseLessonArgs(['--company', 'tensw', '--scope', 'nope', '문장']))
  assert.throws(() => parseLessonArgs(['--company', 'tensw']))
  assert.doesNotMatch(parseLessonArgs(['--company', 'tensw', '비밀번호는 abc123!']).lesson, /abc123/)
})

// 가짜 sb — insert/update 뒤 .select('*').single() 로 행을 돌려준다.
function fakeSb({ insertError = null } = {}) {
  const calls = []
  const from = table => ({
    insert(row) {
      calls.push(['insert', table, row])
      const res = { error: insertError, data: insertError ? null : { id: `new-${row.title}`, ...row } }
      return { select: () => ({ single: async () => res }), then: (ok, bad) => Promise.resolve(res).then(ok, bad) }
    },
    update(patch) {
      return { eq: (_c, id) => {
        calls.push(['update', table, id, patch])
        const res = { error: null, data: { id, title: 't', schedule_date: '2026-10-02', ...patch } }
        return { select: () => ({ single: async () => res }), then: (ok, bad) => Promise.resolve(res).then(ok, bad) }
      } }
    },
    upsert(row) { calls.push(['upsert', table, row]); return Promise.resolve({ error: null }) },
  })
  return { from, calls }
}

test('applyPlan: onWrite 는 insert·update 성공 뒤 돌려받은 행으로, dry 에서는 부르지 않는다', async () => {
  const plan = { insert: [{ title: 'A', schedule_date: '2026-10-02' }], update: [{ id: 'u1', patch: { agent_state: 'missed' } }] }
  const seen = []
  const sb = fakeSb()
  await applyPlan(sb, 'tensw_mgmt_schedules', plan, { onWrite: (t, r) => seen.push([t, r.id, r.agent_state ?? null]) })
  assert.deepEqual(seen, [['tensw_mgmt_schedules', 'new-A', null], ['tensw_mgmt_schedules', 'u1', 'missed']])
  const dry = []
  const sb2 = fakeSb()
  await applyPlan(sb2, 'tensw_mgmt_schedules', plan, { dryRun: true, onWrite: (t, r) => dry.push(r) })
  assert.equal(dry.length, 0); assert.equal(sb2.calls.length, 0)
  const dup = []
  await applyPlan(fakeSb({ insertError: { code: '23505' } }), 'tensw_mgmt_schedules', { insert: plan.insert }, { onWrite: (t, r) => dup.push(r) })
  assert.equal(dup.length, 0)
})

test('applyJudgement: onWrite 는 일정 insert·update 에만, dry 에서는 부르지 않는다', async () => {
  const plan = { cases: [], entries: [], decisions: [],
    scheduleInserts: [{ table: 'willow_mgmt_schedules', title: 'B', schedule_date: '2026-10-03', source_key: 'mgmt-mail:willow:1' }],
    scheduleUpdates: [{ table: 'willow_mgmt_schedules', id: 'w1', patch: { is_completed: true, agent_state: 'done' } }] }
  const seen = []
  await applyJudgement(fakeSb(), plan, { onWrite: (t, r) => seen.push([t, r.id]) })
  assert.deepEqual(seen, [['willow_mgmt_schedules', 'new-B'], ['willow_mgmt_schedules', 'w1']])
  const dry = []
  await applyJudgement(fakeSb(), plan, { dryRun: true, onWrite: (t, r) => dry.push(r) })
  assert.equal(dry.length, 0)
})

test('recordWrite: 개인 일정·dry 는 기록하지 않고, 기록은 네 칸 snapshot', async () => {
  const sb = fakeSb()
  await recordWrite(sb, 'tensw_mgmt_schedules', { id: 'p', ...base, category: 'personal' })
  await recordWrite(sb, 'tensw_mgmt_schedules', { id: 'x', ...base }, { dryRun: true })
  assert.equal(sb.calls.length, 0)
  await recordWrite(sb, 'tensw_mgmt_schedules', { id: 'x', ...base, source_key: 'k', evidence: [] })
  assert.equal(sb.calls.length, 1)
  assert.deepEqual(sb.calls[0][2].snapshot, base)
  assert.equal(sb.calls[0][2].source_key, 'k')
})
