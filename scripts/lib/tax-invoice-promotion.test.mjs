import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLinkedSalesPatch,
  buildNewSalesRow,
  choosePromotionCandidate,
  findExistingPromotion,
} from './tax-invoice-promotion.mjs'

const invoice = {
  transe_type: 'sales',
  approval_no: '20260902-10260902-56490489',
  reporting_date: '2026-09-02',
  issue_date: '2026-09-02',
  contractor_reg_number: '3128202552',
  contractor_company: '독립기념관',
  contractor_name: '한시준',
  supply_amount: 3_000_000,
  tax_amount: 300_000,
  total_amount: 3_300_000,
  rep_items: '유지보수 용역 - 8월',
}

test('links a matching scheduled sale and marks it as issued', () => {
  const candidates = [
    { id: 'scheduled', issue_date: '2026-09-30', counterparty: '독립기념관', total_amount: 3_300_000, payment_status: 'scheduled' },
    { id: 'other', issue_date: '2026-09-04', counterparty: '다른 거래처', total_amount: 3_300_000, payment_status: 'scheduled' },
  ]

  const selected = choosePromotionCandidate(invoice, candidates, new Set())
  assert.equal(selected?.id, 'scheduled')
  assert.deepEqual(buildLinkedSalesPatch(invoice, selected), {
    issue_date: '2026-09-02',
    payment_status: 'pending',
  })
})

test('creates a pending sales row when no planned row matches', () => {
  assert.deepEqual(buildNewSalesRow(invoice), {
    invoice_type: 'sales',
    issue_date: '2026-09-02',
    counterparty: '독립기념관',
    business_number: '312-82-02552',
    representative: '한시준',
    supply_amount: 3_000_000,
    tax_amount: 300_000,
    total_amount: 3_300_000,
    items: [{ description: '유지보수 용역 - 8월' }],
    payment_status: 'pending',
    notes: '홈택스 자동수집 (승인번호 20260902-10260902-56490489)',
  })
})

test('does not reuse a sales row already linked to another tax invoice', () => {
  const candidates = [
    { id: 'taken', issue_date: '2026-09-02', counterparty: '독립기념관', total_amount: 3_300_000, payment_status: 'pending' },
  ]

  assert.equal(choosePromotionCandidate(invoice, candidates, new Set(['taken'])), null)
})

test('recognizes a legacy staging row with the same approval number', () => {
  const existing = [
    { id: 'legacy', approval_no: invoice.approval_no, status: 'promoted', sales_id: 'existing-sale' },
    { id: 'other', approval_no: 'different', status: 'promoted', sales_id: 'other-sale' },
  ]

  assert.deepEqual(findExistingPromotion(invoice, existing), existing[0])
})
