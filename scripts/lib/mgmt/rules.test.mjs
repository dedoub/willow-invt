import assert from 'node:assert/strict'
import test from 'node:test'
import { makeCalendar } from './calendar.mjs'
import { expandRule } from './rules.mjs'

// 2026-10: 3(토) 개천절, 5(월) 대체공휴일, 9(금) 한글날 / 2026-11·12 는 주말만
const fixture = {
  '2026-10': [1, 2, 6, 7, 8, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30],
  '2026-11': [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30],
  '2026-12': [1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 28, 29, 30, 31],
}
const last = { '2026-10': 31, '2026-11': 30, '2026-12': 31 }
const cal = makeCalendar((y, m) => {
  const k = `${y}-${String(m).padStart(2, '0')}`
  return { year: y, month: m, lastDay: last[k], workdays: fixture[k] }
})

test('급여일 25일, 쉬는 날이면 직전 영업일', () => {
  const r = expandRule({ kind: 'monthly_day', day: 25, shift: 'prev' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-23', '2026-11-25', '2026-12-24'])
})
test('납부 10일, 쉬는 날이면 다음 영업일', () => {
  const r = expandRule({ kind: 'monthly_day', day: 10, shift: 'next' }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-12'])
})
test('말일(마지막 영업일)', () => {
  const r = expandRule({ kind: 'month_end', shift: 'prev' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-30', '2026-11-30', '2026-12-31'])
})
test('분기 25일은 해당 달만', () => {
  const r = expandRule({ kind: 'quarterly_day', day: 25, months: [1, 4, 7, 10], shift: 'next' }, '2026-10-01', '2026-12-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-26'])
})
test('전월분 업무는 period 가 한 달 앞', () => {
  const r = expandRule({ kind: 'monthly_day', day: 15, shift: 'prev', period_offset: 1 }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r, [{ date: '2026-10-15', period: '2026-09' }])
})
test('앵커 n영업일 전', () => {
  const r = expandRule({ kind: 'business_days_before', anchor: { kind: 'monthly_day', day: 25, shift: 'prev' }, n: 3 }, '2026-10-01', '2026-10-31', cal)
  assert.deepEqual(r.map(x => x.date), ['2026-10-20'])
})
test('범위 밖 회차는 없다', () => {
  assert.deepEqual(expandRule({ kind: 'monthly_day', day: 25, shift: 'prev' }, '2026-10-24', '2026-10-31', cal), [])
})
