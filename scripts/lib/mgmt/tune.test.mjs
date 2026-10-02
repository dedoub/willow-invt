import assert from 'node:assert/strict'
import test from 'node:test'
import { planTuning } from './tune.mjs'

const rule = { company: 'tensw', task_key: 'x', step: 'do', origin: 'seed', rule: { kind: 'monthly_day', day: 22, shift: 'next' } }
const occ = (date, doneAt, state = 'done') => ({ schedule_date: date, is_completed: state === 'done', agent_state: state, evidence: doneAt ? [{ kind: 'sent_mail', at: `${doneAt}T01:00:00Z` }] : [] })

test('세 번 연속 3~4일 일찍 끝나면 날짜를 당긴다', () => {
  const a = planTuning(rule, [occ('2026-07-22', '2026-07-18'), occ('2026-08-21', '2026-08-18'), occ('2026-09-22', '2026-09-18')])
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'shift_day'); assert.equal(a[0].to, 18); assert.match(a[0].lesson, /22일.*18일/)
})
test('방향이 섞이면 그대로', () => {
  assert.deepEqual(planTuning(rule, [occ('2026-07-22', '2026-07-18'), occ('2026-08-21', '2026-08-25'), occ('2026-09-22', '2026-09-18')]), [])
})
test('두 번 연속 빠지면 끌지 묻는다', () => {
  assert.equal(planTuning(rule, [occ('2026-08-21', null, 'missed'), occ('2026-09-22', null, 'missed')])[0].kind, 'ask_disable')
})
test('추정 규칙이 두 번 근거 없으면 끈다, 세 번 맞으면 확정', () => {
  const inf = { ...rule, origin: 'inferred' }
  assert.equal(planTuning(inf, [occ('2026-08-21', null, 'planned'), occ('2026-09-22', null, 'planned')])[0].kind, 'deactivate')
  const ok = planTuning(inf, [occ('2026-07-22', '2026-07-22'), occ('2026-08-21', '2026-08-21'), occ('2026-09-22', '2026-09-23')])
  assert.deepEqual(ok, [{ kind: 'confirm', confidence: 1 }])
})

test('사람이 날짜를 직접 적은(origin manual) 회차는 shift_day 에 세지 않는다', () => {
  const manualEarly = { ...occ('2026-09-22', '2026-09-18'), origin: 'manual' }
  const a = planTuning(rule, [occ('2026-07-22', '2026-07-18'), occ('2026-08-21', '2026-08-18'), manualEarly])
  assert.deepEqual(a, [])
})

test('doneDate 는 거절되지 않은 마지막 증빙만 본다', () => {
  const withRejected = date => ({ schedule_date: date, is_completed: true, agent_state: 'done', evidence: [{ kind: 'sent_mail', at: `${date}T01:00:00Z` }, { kind: 'rejected', ref: 'x', at: '2099-01-01T00:00:00Z' }] })
  const a = planTuning(rule, [withRejected('2026-07-18'), withRejected('2026-08-18'), withRejected('2026-09-18')].map((o, i) => ({ ...o, schedule_date: ['2026-07-22', '2026-08-21', '2026-09-22'][i] })))
  assert.equal(a[0].kind, 'shift_day')
  assert.equal(a[0].to, 18)
})

// --- 컨트롤러 리뷰 반영 ---

test('아직 마감 안 된(오늘 이상) 회차는 today 를 주면 빼고 본다', () => {
  const future = occ('2026-10-22', null, 'planned') // 아직 안 온 회차 — 완료도 근거도 없다
  const a = planTuning(rule, [occ('2026-07-22', '2026-07-18'), occ('2026-08-21', '2026-08-18'), occ('2026-09-22', '2026-09-18'), future], { today: '2026-10-01' })
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'shift_day'); assert.equal(a[0].to, 18)
})

test('한 번 옮긴 뒤 같은 회차를 다시 봐도 더 옮기지 않는다(멱등) — 날짜가 아니라 day 로 어긋남을 잰다', () => {
  const shifted = { ...rule, rule: { ...rule.rule, day: 18 } }
  const a = planTuning(shifted, [occ('2026-07-22', '2026-07-18'), occ('2026-08-21', '2026-08-18'), occ('2026-09-22', '2026-09-18')])
  assert.deepEqual(a, [])
})

test('규칙 유지(keep) 답변보다 앞선 빠짐만으로는 다시 묻지 않는다', () => {
  const before = occ('2026-08-21', null, 'missed')
  const after1 = occ('2026-09-22', null, 'missed')
  const after2 = occ('2026-10-22', null, 'missed')
  assert.deepEqual(planTuning(rule, [before, after1], { lastKeepAt: '2026-08-25T00:00:00Z' }), [])
  assert.equal(planTuning(rule, [after1, after2], { lastKeepAt: '2026-08-25T00:00:00Z' })[0].kind, 'ask_disable')
})

test('I2: 추정 규칙이 두 번 연속 missed 면 묻지 않고 스스로 끈다(spec) — 씨앗 규칙만 ask_disable', () => {
  const inf = { ...rule, origin: 'inferred' }
  const a = planTuning(inf, [occ('2026-08-21', null, 'missed'), occ('2026-09-22', null, 'missed')])
  assert.equal(a[0].kind, 'deactivate')
  assert.equal(planTuning(rule, [occ('2026-08-21', null, 'missed'), occ('2026-09-22', null, 'missed')])[0].kind, 'ask_disable')
})

test('I2: missed 표시가 남았어도 이미 닫힌 회차는 빠짐으로 세지 않는다', () => {
  const closedMissed = { ...occ('2026-09-22', null, 'missed'), is_completed: true }
  assert.deepEqual(planTuning(rule, [occ('2026-08-21', null, 'missed'), closedMissed]), [])
})
