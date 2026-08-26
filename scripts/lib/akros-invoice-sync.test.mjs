import assert from 'node:assert/strict'
import test from 'node:test'
import {
  daysBetween, findExisting, findPayment, isAkrosInvoice, planAkrosSync,
} from './akros-invoice-sync.mjs'

// 2026-08-26 홈택스 수집분.
const INVOICE = {
  transe_type: 'sales',
  reporting_date: '2026-08-25',
  issue_date: '2026-08-25',
  contractor_company: '(주)아크로스테크놀로지스',
  contractor_reg_number: '160-88-02104',
  total_amount: 13_750_000,
  rep_items: '미국 ETF 비즈니스 자문',
}

// 화면에 이미 있는 과거 행. 작성월과 실제 발행일이 한 달 벌어진 건이 섞여 있다.
const ROWS = [
  { id: 'r7', invoice_date: '2026-07-24', amount: 13_750_000, issued_at: '2026-07-24', paid_at: '2026-08-05' },
  { id: 'r3', invoice_date: '2026-03-25', amount: 9_900_000, issued_at: '2026-04-23', paid_at: '2026-04-23' },
]

const PAYMENTS = [
  { payment_date: '2026-08-25', amount: 13_750_000 },
  { payment_date: '2026-07-24', amount: 13_750_000 },
]

test('아크로스 매출만 고른다', () => {
  assert.equal(isAkrosInvoice(INVOICE), true)
  // 사업자번호가 비어도 상호로 가린다.
  assert.equal(isAkrosInvoice({ ...INVOICE, contractor_reg_number: null }), true)
  // 매입은 대상이 아니다.
  assert.equal(isAkrosInvoice({ ...INVOICE, transe_type: 'purchase' }), false)
  assert.equal(isAkrosInvoice({ ...INVOICE, contractor_reg_number: '828-88-00992', contractor_company: '텐소프트웍스' }), false)
})

test('daysBetween은 날짜 차이를 일수로 센다', () => {
  assert.equal(daysBetween('2026-08-25', '2026-08-25'), 0)
  assert.equal(daysBetween('2026-07-24', '2026-08-05'), 12)
  assert.equal(daysBetween('2026-08-25', '2026-08-20'), -5)
})

test('같은 금액이 매달 반복되므로 날짜로 어느 달 건인지 가린다', () => {
  // 8월 계산서는 7월 행과 금액이 같지만 한 달 떨어져 있다.
  assert.equal(findExisting(ROWS, INVOICE), null)
  // 7월 계산서는 그 행을 찾아낸다.
  const july = { ...INVOICE, reporting_date: '2026-07-24' }
  assert.equal(findExisting(ROWS, july)?.id, 'r7')
})

test('발행일이 비어 있는 행은 기준일(invoice_date)로도 맞춰 본다', () => {
  const rows = [{ id: 'x', invoice_date: '2026-08-25', amount: 13_750_000, issued_at: null, paid_at: null }]
  assert.equal(findExisting(rows, INVOICE)?.id, 'x')
})

test('발행 전에 들어온 돈은 그 계산서의 수금이 아니다', () => {
  assert.equal(findPayment(PAYMENTS, INVOICE)?.payment_date, '2026-08-25')
  // 7월 입금은 8월 계산서보다 한 달 앞서므로 잡히면 안 된다.
  assert.equal(findPayment([{ payment_date: '2026-07-24', amount: 13_750_000 }], INVOICE), null)
  // 금액이 다르면 아니다.
  assert.equal(findPayment([{ payment_date: '2026-08-25', amount: 9_900_000 }], INVOICE), null)
})

test('없는 건은 넣고, 있는 건은 비어 있는 수금일만 채운다', () => {
  const plan = planAkrosSync([INVOICE], ROWS, PAYMENTS)

  assert.equal(plan.insert.length, 1)
  assert.deepEqual(plan.insert[0], {
    invoice_date: '2026-08-25',
    amount: 13_750_000,
    issued_at: '2026-08-25',
    paid_at: '2026-08-25',
    notes: '미국 ETF 비즈니스 자문',
  })
  assert.deepEqual(plan.updatePaid, [])
})

test('수금일이 비어 있던 기존 행은 채우고, 이미 있던 값은 건드리지 않는다', () => {
  const rows = [{ id: 'r8', invoice_date: '2026-08-25', amount: 13_750_000, issued_at: '2026-08-25', paid_at: null }]
  const plan = planAkrosSync([INVOICE], rows, PAYMENTS)

  assert.deepEqual(plan.insert, [])
  assert.deepEqual(plan.updatePaid, [{ id: 'r8', paid_at: '2026-08-25', amount: 13_750_000 }])

  // 이미 수금일이 적혀 있으면 그대로 둔다 — 사람이 맞춰 둔 값이다.
  const paid = [{ ...rows[0], paid_at: '2026-08-31' }]
  assert.deepEqual(planAkrosSync([INVOICE], paid, PAYMENTS).updatePaid, [])
})

test('입금이 아직 없으면 수금일 없이 발행만 기록한다', () => {
  const plan = planAkrosSync([INVOICE], [], [])
  assert.equal(plan.insert[0].paid_at, null)
  assert.equal(plan.insert[0].issued_at, '2026-08-25')
})
