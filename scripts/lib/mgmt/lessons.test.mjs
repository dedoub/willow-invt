import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotOf, detectReverts, lessonFromRevert, lessonsForPrompt } from './lessons.mjs'
import { buildPrompt } from './judge.mjs'
import { planLearn, parseLessonArgs, recordWrite } from './lessons.mjs'
import { applyPlan } from './ledger.mjs'
import { applyJudgement } from './apply-judgement.mjs'
import { planOccurrences } from './ledger.mjs'
import { planClose } from './runner-helpers.mjs'
import { pickLessons, saveLesson } from './lessons.mjs'
import { makeCalendar } from './calendar.mjs'

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
function fakeSb({ insertError = null, goneIds = [] } = {}) {
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
        const res = { error: null, data: goneIds.includes(id) ? null : { id, title: 't', schedule_date: '2026-10-02', ...patch } }
        return { select: () => ({ maybeSingle: async () => res }), then: (ok, bad) => Promise.resolve(res).then(ok, bad) }
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

// --- 리뷰 반영(되돌림이 같은 실행에서 다시 뒤집히지 않게) ---

const NOW = new Date('2026-10-10T00:00:00Z')
const ruleKey = 'mgmt:tensw:payroll:2026-10:request'
const payrollRule = { id: 'r1', company: 'tensw', task_key: 'payroll', step: 'request', title: '{period} 급여대장 요청', rule: { kind: 'monthly_day', day: 22, shift: 'none' }, completion: null }

test('옮긴·이름 바꾼 정기 행은 origin manual 패치 → planOccurrences 가 그 행을 건드리지 않는다', () => {
  const snap = { title: '2026-10 급여대장 요청', schedule_date: '2026-10-22', is_completed: false, agent_state: 'planned' }
  const row = { id: 'c', ...snap, schedule_date: '2026-10-24', source_key: ruleKey, origin: 'seed', evidence: [] }
  const { patches, lessons } = planLearn([w('c', snap, ruleKey)], [row], { now: NOW })
  assert.deepEqual(patches, [{ id: 'c', patch: { origin: 'manual' } }])
  assert.equal(lessons[0].scope, 'rule')
  const patched = { ...row, ...patches[0].patch }
  const before = planOccurrences([payrollRule], [row], { from: '2026-10-01', to: '2026-10-31', cal: makeTestCal() })
  assert.equal(before.update.length, 1) // 패치 전이라면 날짜를 되돌렸을 것
  const after = planOccurrences([payrollRule], [patched], { from: '2026-10-01', to: '2026-10-31', cal: makeTestCal() })
  assert.deepEqual(after, { insert: [], update: [] })
  // 채팅 행은 origin 패치 없음
  assert.deepEqual(planLearn([w('d', snap)], [{ id: 'd', ...snap, title: '다른 이름' }], { now: NOW }).patches, [])
})

test('다시 연 행: rejected 증빙 + planned 패치, planClose 는 거절된 증빙으로 다시 닫지 않는다', () => {
  const msg = { kind: 'message', ref: 'spaces/A/messages/9', at: '2026-10-05T00:00:00Z', note: '송금했습니다' }
  const snap = { ...base, is_completed: true, agent_state: 'done' }
  const row = { id: 'b', ...base, is_completed: false, agent_state: 'done', source_key: ruleKey, evidence: [msg] }
  const { patches } = planLearn([w('b', snap, ruleKey)], [row], { now: NOW })
  assert.equal(patches.length, 1)
  assert.equal(patches[0].patch.agent_state, 'planned')
  assert.deepEqual(patches[0].patch.evidence.at(-1), { kind: 'rejected', ref: msg.ref, at: NOW.toISOString() })
  const reopened = { ...row, ...patches[0].patch }
  // 메시지 증빙 폴백: 거절된 메시지만 있으면 닫지 않고, 새 메시지면 닫는다
  assert.equal(planClose(reopened, { company: 'tensw', completion: null }, {}), null)
  const msg2 = { kind: 'message', ref: 'spaces/A/messages/10', at: '2026-10-11T00:00:00Z' }
  assert.equal(planClose({ ...reopened, evidence: [...reopened.evidence, msg2] }, { company: 'tensw', completion: null }, {}).ev.ref, msg2.ref)
  // 기록 증빙: 거절된 메일로는 닫지 않고, 다른 메일로는 닫는다
  const mailRule = { company: 'tensw', completion: { kind: 'sent_mail', context: 'tensoftworks', subject: '급여' } }
  const r2 = { id: 'm', schedule_date: '2026-10-02', evidence: [{ kind: 'sent_mail', ref: 'g1' }, { kind: 'rejected', ref: 'g1', at: NOW.toISOString() }] }
  const g1 = { id: 'g1', context: 'tensoftworks', to: 'x', subject: '급여 요청', at: '2026-10-01T00:00:00Z' }
  assert.equal(planClose(r2, mailRule, { sentMail: [g1] }), null)
  const g2 = { ...g1, id: 'g2', at: '2026-10-01T05:00:00Z' }
  assert.equal(planClose(r2, mailRule, { sentMail: [g1, g2] }).ev.ref, 'g2')
  // 세금: 쉼표로 이은 ref 도 거절
  const taxRule = { company: 'tensw', completion: { kind: 'tax', types: ['vat'] } }
  const t = { company: 'tensw', obligation_type: 'vat', due_date: '2026-10-02', status: 'paid', paid_at: '2026-10-01' }
  const r3 = { id: 't', schedule_date: '2026-10-02', evidence: [{ kind: 'rejected', ref: 't1,t2' }] }
  assert.equal(planClose(r3, taxRule, { taxObligations: [{ ...t, id: 't1' }, { ...t, id: 't2' }] }), null)
  assert.equal(planClose(r3, taxRule, { taxObligations: [{ ...t, id: 't3' }] }).ev.ref, 't3')
})

test('지운 정기 행은 rule·suppressed 교훈, planOccurrences 는 suppressedKeys 를 다시 깔지 않는다', () => {
  const snap = { title: '2026-10 급여대장 요청', schedule_date: '2026-10-22', is_completed: false, agent_state: 'planned' }
  const { lessons, forget } = planLearn([w('z', snap, ruleKey)], [], { now: NOW })
  assert.equal(lessons[0].scope, 'rule')
  assert.equal(lessons[0].example.expected, 'suppressed')
  assert.equal(lessons[0].source_ref, ruleKey)
  assert.deepEqual(forget, ['z'])
  const p = planOccurrences([payrollRule], [], { from: '2026-10-01', to: '2026-10-31', cal: makeTestCal(), suppressedKeys: new Set([ruleKey]) })
  assert.deepEqual(p.insert, [])
  assert.equal(planOccurrences([payrollRule], [], { from: '2026-10-01', to: '2026-10-31', cal: makeTestCal() }).insert.length, 1)
})

test('프롬프트용 교훈은 judge·close 범위만', () => {
  const ls = [{ scope: 'judge', lesson: 'J', active: true, created_at: '1' }, { scope: 'close', lesson: 'C', active: true, created_at: '2' }, { scope: 'rule', lesson: 'R', active: true, created_at: '3' }, { scope: 'decision', lesson: 'D', active: true, created_at: '4' }]
  assert.deepEqual(pickLessons(ls, 'tensw', 20, { scopes: ['judge', 'close'] }).map(l => l.lesson), ['C', 'J'])
})

test('30일 넘은 완료 기록은 비교 없이 지운다', () => {
  const done = { ...base, is_completed: true, agent_state: 'done' }
  const old = { ...w('o', done), written_at: '2026-09-01T00:00:00Z' }
  const fresh = { ...w('f', done), written_at: '2026-10-01T00:00:00Z' }
  const openOld = { ...w('q', base), written_at: '2026-08-01T00:00:00Z' }
  const { lessons, forget } = planLearn([old, fresh, openOld], [{ id: 'q', ...base }], { now: NOW })
  assert.deepEqual(forget.sort(), ['f', 'o'])  // o 는 가지치기, f 는 지워짐(교훈)
  assert.equal(lessons.length, 1)
})

test('saveLesson: 중복이면 duplicate', async () => {
  const dup = { from: () => ({ insert: async () => ({ error: { code: '23505' } }) }) }
  assert.deepEqual(await saveLesson(dup, { lesson: 'x' }), { duplicate: true })
  const ok = { from: () => ({ insert: async () => ({ error: null }) }) }
  assert.deepEqual(await saveLesson(ok, { lesson: 'x' }), { duplicate: false })
  await assert.rejects(saveLesson({ from: () => ({ insert: async () => ({ error: { code: '42P01', message: 'x' } }) }) }, { lesson: 'x' }))
})

test('update 도중 지워진 행은 onWrite 를 건너뛰고 던지지 않는다', async () => {
  const seen = []
  await applyPlan(fakeSb({ goneIds: ['u1'] }), 'tensw_mgmt_schedules', { update: [{ id: 'u1', patch: { agent_state: 'missed' } }] }, { onWrite: (t, r) => seen.push(r) })
  await applyJudgement(fakeSb({ goneIds: ['w1'] }), { cases: [], entries: [], decisions: [], scheduleInserts: [], scheduleUpdates: [{ table: 'willow_mgmt_schedules', id: 'w1', patch: { is_completed: true } }] }, { onWrite: (t, r) => seen.push(r) })
  assert.equal(seen.length, 0)
})

function makeTestCal() {
  return makeCalendar((y, m) => {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { year: y, month: m, lastDay: last, workdays: Array.from({ length: last }, (_, i) => i + 1) }
  })
}
