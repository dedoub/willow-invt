import assert from 'node:assert/strict'
import test from 'node:test'

import { findReservedPayment, paymentKey } from './payment-reconcile.mjs'

test('reserves the bank transaction already used by a completed invoice', () => {
  const deposits = [
    { source: 'bank', date: '2026-08-07', amount: 1_920_000, account: '신한 140-013-150883' },
    { source: 'bank', date: '2026-09-07', amount: 1_920_000, account: '신한 140-013-150883' },
  ]
  const invoice = {
    paid_at: '2026-08-06T15:00:00+00:00',
    paid_amount: 1_920_000,
    bank_ref: '2026-08-07 신한 140-013-150883 ₩1,920,000',
  }

  assert.equal(paymentKey(findReservedPayment(invoice, deposits)), paymentKey(deposits[0]))
})

test('does not reserve a transaction when the completed invoice has no matching bank row', () => {
  const invoice = {
    paid_at: '2026-08-07T00:00:00+09:00',
    paid_amount: 1_920_000,
    bank_ref: '2026-08-07 신한 140-013-150883 ₩1,920,000',
  }

  assert.equal(findReservedPayment(invoice, []), null)
})

test('treats cash and raw bank copies of the same transaction as one payment', () => {
  const cash = { source: 'cash', date: '2026-08-07', amount: 1_920_000, account: '신한 140-013-150883' }
  const bank = { source: 'bank', date: '2026-08-07', amount: 1_920_000, account: '신한 140-013-150883' }

  assert.equal(paymentKey(cash), paymentKey(bank))
})
