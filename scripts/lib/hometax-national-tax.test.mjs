import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HOMETAX_SOURCE,
  nationalTaxAmount,
  nationalTaxDate,
  nationalTaxObligationFromCells,
  nationalTaxPayload,
  nationalTaxPeriod,
  obligationTypeForTaxItem,
  taxOfficeName,
} from './hometax-national-tax.mjs'

// Copied off the live 납부할 세액 조회/납부 grid.
const ROW = [
  '부가가치세 2026-08-31 5,000',
  '',
  '부가가치세',
  '2026-08-31',
  '5,000,000',
  '',
  '0126-2608-1-41-0397946',
  '0',
  '2026-01',
  '삼성(120)',
  '은진용(02 30117402)',
]

test('nationalTaxAmount reads the payable column, separators and all', () => {
  assert.equal(nationalTaxAmount('5,000,000'), 5_000_000)
  assert.equal(nationalTaxAmount(''), 0)
})

test('nationalTaxDate and nationalTaxPeriod pick out the parts they need', () => {
  assert.equal(nationalTaxDate('2026-08-31'), '2026-08-31')
  assert.equal(nationalTaxDate('미정'), null)
  assert.equal(nationalTaxPeriod('2026-01'), '2026-01')
})

test('obligationTypeForTaxItem separates VAT from the rest', () => {
  assert.equal(obligationTypeForTaxItem('부가가치세'), 'vat')
  assert.equal(obligationTypeForTaxItem('법인세'), 'national_tax')
})

test('taxOfficeName drops the office code and names the office', () => {
  assert.equal(taxOfficeName('삼성(120)'), '삼성세무서')
  assert.equal(taxOfficeName('삼성세무서'), '삼성세무서')
  assert.equal(taxOfficeName(''), '국세청')
})

test('nationalTaxObligationFromCells maps a notice onto the obligation ledger', () => {
  const obligation = nationalTaxObligationFromCells(ROW)
  assert.equal(obligation.obligation_type, 'vat')
  assert.equal(obligation.title, '부가가치세')
  assert.equal(obligation.agency, '삼성세무서')
  assert.equal(obligation.amount, 5_000_000)
  assert.equal(obligation.due_date, '2026-08-31')
  assert.equal(obligation.period_label, '2026-01')
  assert.equal(obligation.notice_number, '0126-2608-1-41-0397946')
  assert.equal(obligation.status, 'unpaid')
  assert.equal(obligation.raw.already_paid, 0)
})

test('nationalTaxObligationFromCells skips a row with nothing payable', () => {
  const settled = [...ROW]
  settled[4] = '0'
  assert.equal(nationalTaxObligationFromCells(settled), null)
})

test('nationalTaxPayload keeps only the rows that carry a balance', () => {
  const settled = [...ROW]
  settled[4] = '0'
  const payload = nationalTaxPayload([ROW, settled], '2026-08-26T00:00:00.000Z')
  assert.equal(payload.source, HOMETAX_SOURCE)
  assert.equal(payload.obligations.length, 1)
})
