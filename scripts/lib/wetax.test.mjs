import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WETAX_SOURCE,
  isEmptyResultRow,
  wetaxAmount,
  wetaxDate,
  wetaxObligationFromCells,
  wetaxObligationsPayload,
  wetaxPeriod,
  wetaxStatus,
} from './wetax.mjs'

// Copied off the live 지방세 납부대상 grid.
const ROW = [
  '1행',
  '2026-08',
  '주민세 (사업소분)',
  '신고분',
  '주식회사 텐소프트웍스 (Ten Softworks)',
  '62,500 원',
  '2026-08-31',
  '서울특별시 강남구',
  '11680-1-10-26-8-5040370-4',
  '미납',
]

test('wetaxAmount strips the currency word and separators', () => {
  assert.equal(wetaxAmount('62,500 원'), 62_500)
  assert.equal(wetaxAmount(''), 0)
})

test('wetaxDate pads a single-digit month or day', () => {
  assert.equal(wetaxDate('2026-8-3'), '2026-08-03')
  assert.equal(wetaxDate('2026.08.31'), '2026-08-31')
  assert.equal(wetaxDate('기한없음'), null)
})

test('wetaxPeriod keeps the taxable month', () => {
  assert.equal(wetaxPeriod('2026-08'), '2026-08')
  assert.equal(wetaxPeriod(''), null)
})

test('wetaxStatus maps the Korean labels onto the ledger states', () => {
  assert.equal(wetaxStatus('미납'), 'unpaid')
  assert.equal(wetaxStatus('체납'), 'overdue')
  assert.equal(wetaxStatus('납부완료'), 'paid')
  assert.equal(wetaxStatus('알 수 없음'), 'unpaid')
})

test('wetaxObligationFromCells maps a notice onto the obligation ledger', () => {
  const obligation = wetaxObligationFromCells(ROW)
  assert.equal(obligation.obligation_type, 'local_tax')
  assert.equal(obligation.title, '주민세 (사업소분)')
  assert.equal(obligation.agency, '서울특별시 강남구')
  assert.equal(obligation.amount, 62_500)
  assert.equal(obligation.due_date, '2026-08-31')
  assert.equal(obligation.period_label, '2026-08')
  assert.equal(obligation.notice_number, '11680-1-10-26-8-5040370-4')
  assert.equal(obligation.status, 'unpaid')
  assert.equal(obligation.raw.kind, '신고분')
})

test('wetaxObligationFromCells drops a row with no amount', () => {
  const empty = [...ROW]
  empty[5] = '0 원'
  assert.equal(wetaxObligationFromCells(empty), null)
})

test('isEmptyResultRow recognises the placeholder the grid shows when nothing matches', () => {
  assert.equal(isEmptyResultRow(['검색결과가 없습니다.']), true)
  assert.equal(isEmptyResultRow(ROW), false)
})

test('wetaxObligationsPayload skips the placeholder and keeps real notices', () => {
  const payload = wetaxObligationsPayload([['검색결과가 없습니다.'], ROW], '2026-08-26T00:00:00.000Z')
  assert.equal(payload.source, WETAX_SOURCE)
  assert.equal(payload.obligations.length, 1)
  assert.equal(payload.obligations[0].amount, 62_500)
})
