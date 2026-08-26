import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WOORI_CARD_ORGANIZATION,
  wooriBillingRow,
  dottedToIso,
  resolvePaymentDate,
  statementAmount,
  statementHeader,
  statementLineFromCells,
  wooriCardStatement,
} from './woori-card-statement.mjs'

// Copied off the live 이용대금명세서 요약내역.
const ROWS = [
  ['청구내역', '원금(원)', '수수료(원)', '합계(원)'],
  ['전월미결제금액', '0', '0', '0'],
  ['일시불', '0', '0', '0'],
  ['할부', '0', '0', '0'],
  ['국외단기카드대출', '0', '0', '0'],
  ['해외이용', '2,837,998', '8,422', '2,846,420'],
  ['연회비', '0', '0'],
  ['당월계', '2,837,998', '8,422', '2,846,420'],
]

const HEADER = '09.07 대표카드번호 5589-****-****-3029 결제계좌 [우리은행] 10054034***** '
  + '명세서작성일 도움말 2026.08.16 일시불/할부 2026.07.13 ~ 2026.08.12 이메일발송'

test('statementAmount reads the separated figures', () => {
  assert.equal(statementAmount('2,846,420'), 2_846_420)
  assert.equal(statementAmount(''), 0)
})

test('dottedToIso converts the printed dates', () => {
  assert.equal(dottedToIso('2026.08.16'), '2026-08-16')
  assert.equal(dottedToIso('없음'), null)
})

test('resolvePaymentDate rolls a payment day that falls before the statement into next year', () => {
  assert.equal(resolvePaymentDate('09.07', '2026-08-16'), '2026-09-07')
  assert.equal(resolvePaymentDate('01.07', '2026-12-16'), '2027-01-07')
  assert.equal(resolvePaymentDate('', '2026-08-16'), null)
})

test('statementHeader pulls the period, card and settlement account apart', () => {
  const header = statementHeader(HEADER)
  assert.equal(header.statement_date, '2026-08-16')
  assert.equal(header.period_start, '2026-07-13')
  assert.equal(header.period_end, '2026-08-12')
  assert.equal(header.payment_date, '2026-09-07')
  assert.equal(header.card_no, '5589-****-****-3029')
  assert.equal(header.settlement_account, '[우리은행] 10054034*****')
})

test('statementLineFromCells takes the total from the last cell, not a fixed index', () => {
  assert.deepEqual(statementLineFromCells(['해외이용', '2,837,998', '8,422', '2,846,420']),
    { label: '해외이용', principal: 2_837_998, fee: 8_422, total: 2_846_420 })
  // 연회비 has no fee column at all.
  assert.deepEqual(statementLineFromCells(['연회비', '0', '0']),
    { label: '연회비', principal: 0, fee: 0, total: 0 })
  assert.equal(statementLineFromCells(['청구내역', '원금(원)']), null)
})

test('wooriCardStatement reports the billed total and keeps the breakdown', () => {
  const statement = wooriCardStatement(ROWS, HEADER, '2026-08-26T00:00:00.000Z')
  assert.equal(statement.organization, WOORI_CARD_ORGANIZATION)
  assert.equal(statement.billed_amount, 2_846_420)
  assert.equal(statement.monthly_principal, 2_837_998)
  assert.equal(statement.monthly_fee, 8_422)
  assert.equal(statement.payment_date, '2026-09-07')
  assert.equal(statement.lines.length, 6)
  assert.ok(statement.lines.every(line => line.label !== '당월계'))
})

test('wooriCardStatement refuses a page it could not read', () => {
  assert.throws(() => wooriCardStatement(ROWS, '내용 없음', '2026-08-26T00:00:00.000Z'), /작성일/)
  assert.throws(() => wooriCardStatement([['일시불', '0', '0', '0']], HEADER, '2026-08-26T00:00:00.000Z'), /당월계/)
})

test('wooriBillingRow는 결제일이 속한 달을 청구년월로 삼는다', () => {
  const statement = wooriCardStatement(ROWS, HEADER, '2026-08-26T00:00:00.000Z')
  const row = wooriBillingRow(statement)

  // 2026-09-07 결제분은 202609 청구다 — 명세서 작성일(2026-08-16)이 아니다.
  assert.equal(row.billing_month, '202609')
  assert.equal(row.payment_due_date, '2026-09-07')
  assert.equal(row.total_amount, 2_846_420)
  assert.equal(row.overseas_use, 2_846_420)
  assert.equal(row.full_amount, 0)
  assert.equal(row.amount_outstanding, 0)
  assert.equal(row.payment_account, '[우리은행] 10054034*****')
  assert.equal(row.raw.monthly_fee, 8_422)
  // 같은 청구는 같은 지문이어야 다시 넣어도 늘지 않는다.
  assert.equal(wooriBillingRow(statement).fingerprint, row.fingerprint)
})
