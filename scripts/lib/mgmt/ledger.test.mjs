import assert from 'node:assert/strict'
import test from 'node:test'
import { makeCalendar } from './calendar.mjs'
import { planOccurrences, planMissed, scheduleKey } from './ledger.mjs'
import { SEED_RULES } from './seed-rules.mjs'

const allWeekdays = (y, m) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const workdays = []
  for (let d = 1; d <= last; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w && w !== 6) workdays.push(d) }
  return { year: y, month: m, lastDay: last, workdays }
}
const cal = makeCalendar(allWeekdays)
const payroll = { id: 'r1', company: 'tensw', task_key: 'payroll', step: 'request', title: '{period} 급여대장 요청', rule: { kind: 'monthly_day', day: 22, shift: 'prev' }, lead_days: 1, recipe: 'payroll-request', completion: null }

test('새 회차는 planned 로 들어간다', () => {
  const p = planOccurrences([payroll], [], { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 1)
  assert.equal(p.insert[0].source_key, 'mgmt:tensw:payroll:2026-10:request')
  assert.equal(p.insert[0].title, '2026-10 급여대장 요청')
  assert.equal(p.insert[0].agent_state, 'planned')
})
test('사람이 닫은 행은 다시 열지 않는다', () => {
  const existing = [{ id: 's1', source_key: scheduleKey('tensw', 'payroll', '2026-10', 'request'), schedule_date: '2026-10-21', title: '옛 제목', is_completed: true, agent_state: 'done' }]
  const p = planOccurrences([payroll], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 0)
  assert.equal(p.update.length, 1)
  assert.equal('is_completed' in p.update[0].patch, false)
  assert.equal('agent_state' in p.update[0].patch, false)
  assert.equal(p.update[0].patch.schedule_date, '2026-10-22')
})
test('같으면 아무것도 안 한다', () => {
  const existing = [{ id: 's1', source_key: 'mgmt:tensw:payroll:2026-10:request', schedule_date: '2026-10-22', title: '2026-10 급여대장 요청', is_completed: false }]
  const p = planOccurrences([payroll], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.deepEqual(p, { insert: [], update: [] })
})
test('재무 동기화가 만든 세금 행은 받아 쓴다 (같은 날)', () => {
  const social = { id: 'r2', company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '4대보험 납부', rule: { kind: 'monthly_day', day: 10, shift: 'next' }, lead_days: 0, recipe: null, completion: { kind: 'tax', types: ['health_insurance'] }, adopt_prefix: 'tensw-finance:tax-obligation:social:' }
  const existing = [{ id: 'f1', source_key: 'tensw-finance:tax-obligation:social:2026-10-12:due', schedule_date: '2026-10-12', title: '[재무] 4대보험 납부', is_completed: false }]
  const p = planOccurrences([social], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 0)
})
test('재무 동기화가 만든 세금 행은 날짜가 ±3일 안이면 받아 쓴다 (원발행일 vs 영업일 이동)', () => {
  // Ruling R1: 재무 동기화는 원래 마감일(2026-10-10, 토)을 그대로 쓰지만
  // 규칙은 shift:'next' 로 다음 영업일(2026-10-12, 월)을 만든다. 같은 납부 건이므로 흡수해야 한다.
  const social = { id: 'r2', company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { kind: 'monthly_day', day: 10, shift: 'next' }, lead_days: 0, recipe: null, completion: null, adopt_prefix: 'tensw-finance:tax-obligation:social:' }
  const existing = [{ id: 'f2', source_key: 'tensw-finance:tax-obligation:social:2026-10-10:due', schedule_date: '2026-10-10', title: '[재무] 4대보험 납부', is_completed: false }]
  const p = planOccurrences([social], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 0)
})
test('접두사가 같아도 5일 넘게 떨어진 행은 흡수하지 않는다', () => {
  const social = { id: 'r2', company: 'tensw', task_key: 'social-insurance', step: 'pay', title: '{period} 4대보험 납부', rule: { kind: 'monthly_day', day: 10, shift: 'next' }, lead_days: 0, recipe: null, completion: null, adopt_prefix: 'tensw-finance:tax-obligation:social:' }
  const existing = [{ id: 'f3', source_key: 'tensw-finance:tax-obligation:social:2026-10-17:due', schedule_date: '2026-10-17', title: '[재무] 4대보험 납부', is_completed: false }]
  const p = planOccurrences([social], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.equal(p.insert.length, 1)
  assert.equal(p.insert[0].schedule_date, '2026-10-12')
})
test('기한 지난 열린 행은 빠짐', () => {
  const rows = [
    { id: 'a', schedule_date: '2026-09-25', is_completed: false, agent_state: 'planned' },
    { id: 'b', schedule_date: '2026-09-25', is_completed: true, agent_state: 'done' },
    { id: 'c', schedule_date: '2026-10-05', is_completed: false, agent_state: 'planned' },
    { id: 'd', schedule_date: '2026-09-01', is_completed: false, agent_state: null },
  ]
  assert.deepEqual(planMissed(rows, '2026-09-30'), [{ id: 'a', patch: { agent_state: 'missed' } }])
})
test('씨앗 규칙은 두 회사를 모두 덮고 키가 겹치지 않는다', () => {
  const companies = new Set(SEED_RULES.map(r => r.company))
  assert.deepEqual([...companies].sort(), ['tensw', 'willow'])
  const keys = SEED_RULES.map(r => `${r.company}:${r.task_key}:${r.step}`)
  assert.equal(new Set(keys).size, keys.length)
})

test('접두사+대상 월 키가 있으면 날짜가 멀어도 받아 쓴다', () => {
  const send = { id: 'r3', company: 'tensw', task_key: 'attendance', step: 'send', title: '{period} 출근부 발송', rule: { kind: 'month_end', shift: 'prev' }, lead_days: 1, recipe: null, completion: null, adopt_prefix: 'gangnam-attendance:send:' }
  const existing = [{ id: 'g1', source_key: 'gangnam-attendance:send:2026-09', schedule_date: '2026-09-22', title: '[인사] 출근부 발송 (9월분)', is_completed: true }]
  const p = planOccurrences([send], existing, { from: '2026-09-01', to: '2026-09-30', cal })
  assert.deepEqual(p, { insert: [], update: [] })
  const other = planOccurrences([send], [{ ...existing[0], source_key: 'gangnam-attendance:send:2026-08' }], { from: '2026-09-01', to: '2026-09-30', cal })
  assert.equal(other.insert.length, 1)
})
test('사람이 적은 행(manual)은 날짜·제목을 바꾸지 않는다', () => {
  const existing = [{ id: 's1', source_key: 'mgmt:tensw:payroll:2026-10:request', schedule_date: '2026-10-20', title: '10월 급여대장 요청 이메일 발송', is_completed: false, origin: 'manual' }]
  const p = planOccurrences([payroll], existing, { from: '2026-10-01', to: '2026-10-31', cal })
  assert.deepEqual(p, { insert: [], update: [] })
})
