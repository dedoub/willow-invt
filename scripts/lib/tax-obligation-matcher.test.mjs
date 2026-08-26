import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findPaymentMatch,
  normalizeObligation,
  obligationStatus,
} from './tax-obligation-matcher.mjs'

const obligation = {
  company: 'tensw',
  source: 'hometax',
  obligation_type: 'vat',
  notice_number: 'VAT-2026-08',
  title: '2026년 2기 예정 부가가치세',
  agency: '국세청',
  amount: 1_100_000,
  issued_date: '2026-08-01',
  due_date: '2026-08-25',
}

test('normalizeObligation creates a stable source fingerprint', () => {
  const first = normalizeObligation(obligation)
  const second = normalizeObligation({ ...obligation })

  assert.equal(first.fingerprint, second.fingerprint)
  assert.equal(first.status, 'unpaid')
  assert.equal(first.amount, 1_100_000)
})

test('findPaymentMatch accepts one exact amount and agency/date match', () => {
  const result = findPaymentMatch(obligation, [
    { id: 'cash-1', amount: 1_100_000, type: 'expense', payment_date: '2026-08-25', counterparty: '국세청', description: '부가세 납부' },
    { id: 'cash-2', amount: 500_000, type: 'expense', payment_date: '2026-08-25', counterparty: '국민건강보험', description: '보험료' },
  ])

  assert.equal(result?.id, 'cash-1')
})

test('findPaymentMatch does not guess when exact candidates are ambiguous', () => {
  const result = findPaymentMatch(obligation, [
    { id: 'cash-1', amount: 1_100_000, type: 'expense', payment_date: '2026-08-24', counterparty: '국세', description: '세금' },
    { id: 'cash-2', amount: 1_100_000, type: 'expense', payment_date: '2026-08-25', counterparty: '국세청', description: '부가세' },
  ])

  assert.equal(result, null)
})

test('findPaymentMatch ignores revenue, transfers and dates outside the window', () => {
  const result = findPaymentMatch(obligation, [
    { id: 'cash-1', amount: 1_100_000, type: 'revenue', payment_date: '2026-08-25', counterparty: '국세청' },
    { id: 'cash-2', amount: 1_100_000, type: 'transfer', payment_date: '2026-08-25', counterparty: '국세청' },
    { id: 'cash-3', amount: 1_100_000, type: 'expense', payment_date: '2026-09-20', counterparty: '국세청' },
  ])

  assert.equal(result, null)
})

test('obligationStatus marks an unpaid past-due notice overdue', () => {
  assert.equal(obligationStatus({ status: 'unpaid', due_date: '2026-08-24' }, '2026-08-25'), 'overdue')
  assert.equal(obligationStatus({ status: 'paid', due_date: '2026-08-24' }, '2026-08-25'), 'paid')
})
