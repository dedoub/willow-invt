import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NHIS_AGENCY,
  NHIS_INSURANCES,
  NHIS_SOURCE,
  nhisDate,
  nhisObligationFromRow,
  nhisObligations,
  nhisObligationsPayload,
  withCarriedMonth,
} from './nhis.mjs'

const HEALTH = NHIS_INSURANCES[0]

// Copied off the live 고지/납부 현황 grid: 월 is merged, so the 요양 row that
// follows 건강 carries one fewer cell.
const ROWS = [
  ['01', '건강', '957,700', '20260210', '20260127', '957,700', '0', '957,700', '0', '0', '0'],
  ['요양', '125,760', '20260127', '125,760', '0', '125,760', '0', '0', '0'],
  ['02', '건강', '957,700', '20260310', '20260325', '957,700', '9,570', '967,270', '0', '0', '0'],
]

test('nhisDate turns the packed digits into an ISO date', () => {
  assert.equal(nhisDate('20260210'), '2026-02-10')
  assert.equal(nhisDate(''), null)
  assert.equal(nhisDate('2026'), null)
})

test('withCarriedMonth gives the merged rows the month above them', () => {
  const carried = withCarriedMonth(ROWS)
  assert.deepEqual(carried.map(row => row.month), ['01', '01', '02'])
  assert.equal(carried[0].cells[0], '건강')
  assert.equal(carried[1].cells[0], '요양')
  // 납부마감일 is merged too, so the 요양 row inherits it instead of shifting
  // its 납부일 into that column.
  assert.equal(carried[1].cells[2], '20260210')
  assert.equal(carried[1].cells[3], '20260127')
})

test('nhisObligationFromRow reads the notice, not the settled amount', () => {
  const [first] = withCarriedMonth(ROWS)
  const obligation = nhisObligationFromRow(first, { year: '2026', insurance: HEALTH })
  assert.equal(obligation.obligation_type, 'health_insurance')
  assert.equal(obligation.title, '건강보험 (건강)')
  assert.equal(obligation.agency, NHIS_AGENCY)
  assert.equal(obligation.amount, 957_700)
  assert.equal(obligation.due_date, '2026-02-10')
  assert.equal(obligation.period_label, '2026-01')
  assert.equal(obligation.status, 'paid')
  assert.equal(obligation.raw.paid_date, '2026-01-27')
})

test('nhisObligationFromRow marks a notice with an outstanding balance unpaid', () => {
  const row = { month: '08', cells: ['건강', '957,700', '20260910', '', '0', '0', '0', '957,700', '0', '957,700'] }
  const obligation = nhisObligationFromRow(row, { year: '2026', insurance: HEALTH })
  assert.equal(obligation.status, 'unpaid')
  assert.equal(obligation.raw.unpaid_total, 957_700)
})

test('nhisObligationFromRow drops a row that carries no notice amount', () => {
  const row = { month: '01', cells: ['합계', '0', '', '', '0', '0', '0', '0', '0', '0'] }
  assert.equal(nhisObligationFromRow(row, { year: '2026', insurance: HEALTH }), null)
})

test('nhisObligations keeps 건강 and 요양 as separate notices', () => {
  const obligations = nhisObligations(ROWS, { year: '2026', insurance: HEALTH })
  assert.equal(obligations.length, 3)
  assert.deepEqual(obligations.slice(0, 2).map(item => item.title), ['건강보험 (건강)', '건강보험 (요양)'])
  assert.deepEqual(obligations.slice(0, 2).map(item => item.period_label), ['2026-01', '2026-01'])
  assert.deepEqual(obligations.slice(0, 2).map(item => item.due_date), ['2026-02-10', '2026-02-10'])
})

test('every insurance maps onto a type the ledger accepts', () => {
  const allowed = new Set(['health_insurance', 'pension', 'employment_insurance', 'industrial_accident'])
  for (const insurance of NHIS_INSURANCES) {
    assert.ok(allowed.has(insurance.obligationType), insurance.label)
    assert.match(insurance.value, /^\d{2}$/)
  }
})

test('nhisObligationsPayload flattens the per-insurance groups', () => {
  const payload = nhisObligationsPayload(
    [nhisObligations(ROWS, { year: '2026', insurance: HEALTH }), []],
    '2026-08-26T00:00:00.000Z',
  )
  assert.equal(payload.source, NHIS_SOURCE)
  assert.equal(payload.obligations.length, 3)
})
