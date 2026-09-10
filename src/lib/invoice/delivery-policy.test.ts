import assert from 'node:assert/strict'
import test from 'node:test'
import { allowedInvoiceDeliveryTargets, isReferralFeeInvoice } from './delivery-policy'

test('Referral Fee가 하나라도 포함된 인보이스는 은행에만 발송한다', () => {
  const invoice = {
    line_items: [
      { description: 'Monthly Fee - September 2026', amount: 2083.33 },
      { description: 'KMCA Start-up Referral Fee', amount: 5000 },
    ],
  }

  assert.equal(isReferralFeeInvoice(invoice), true)
  assert.deepEqual(allowedInvoiceDeliveryTargets(invoice), ['bank'])
})

test('일반 Monthly Fee 인보이스는 ETC와 은행에 발송할 수 있다', () => {
  const invoice = {
    line_items: [{ description: 'Monthly Fee - September 2026', amount: 2083.33 }],
  }

  assert.equal(isReferralFeeInvoice(invoice), false)
  assert.deepEqual(allowedInvoiceDeliveryTargets(invoice), ['etc', 'bank'])
})
