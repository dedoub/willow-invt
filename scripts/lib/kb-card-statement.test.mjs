import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KB_CARD_ORGANIZATION,
  dottedToIso,
  isEmptyStatementRow,
  kbBillingRow,
  kbCardStatement,
  statementAmount,
  statementLineFromCells,
} from './kb-card-statement.mjs'

// 2026-08-26 명세서조회 화면에서 그대로 가져온 행.
const ROW = ['00000', '윌로우인베스트먼트(주)', '2026.08.27', '2026.08.27', '8,803,242원']

test('금액과 날짜를 읽는다', () => {
  assert.equal(statementAmount('8,803,242원'), 8_803_242)
  assert.equal(statementAmount(''), 0)
  assert.equal(dottedToIso('2026.08.27'), '2026-08-27')
  assert.equal(dottedToIso('-'), null)
})

test('빈 결과 행은 내역으로 세지 않는다', () => {
  assert.equal(isEmptyStatementRow(['조회 내역이 없습니다.']), true)
  assert.equal(isEmptyStatementRow(ROW), false)
  assert.equal(statementLineFromCells(['조회 내역이 없습니다.']), null)
})

test('kbCardStatement는 청구 총액과 결제일을 뽑는다', () => {
  const statement = kbCardStatement([ROW], '202608', '2026-08-26T00:00:00.000Z')

  assert.equal(statement.organization, KB_CARD_ORGANIZATION)
  assert.equal(statement.billing_month, '202608')
  assert.equal(statement.total_amount, 8_803_242)
  assert.equal(statement.payment_due_date, '2026-08-27')
  assert.equal(statement.department_name, '윌로우인베스트먼트(주)')
  assert.match(statement.fingerprint, /^[0-9a-f]{40}$/)
})

test('부서가 여럿이면 총액은 합이고 부서명은 비운다', () => {
  const second = ['00001', '윌로우 리서치', '2026.08.27', '2026.08.27', '1,000,000원']
  const statement = kbCardStatement([ROW, second], '202608', '2026-08-26T00:00:00.000Z')
  assert.equal(statement.total_amount, 9_803_242)
  assert.equal(statement.department_name, null)
  assert.equal(statement.lines.length, 2)
})

test('읽지 못한 화면은 그대로 실패시킨다', () => {
  assert.throws(() => kbCardStatement([['조회 내역이 없습니다.']], '202609', ''), /청구 내역이 없어요/)
  assert.throws(() => kbCardStatement([ROW], '2026-08', ''), /YYYYMM/)
})

test('kbBillingRow는 적재 형태로 옮기고 원본을 raw에 남긴다', () => {
  const row = kbBillingRow(kbCardStatement([ROW], '202608', '2026-08-26T00:00:00.000Z'))
  assert.equal(row.billing_month, '202608')
  assert.equal(row.total_amount, 8_803_242)
  assert.equal(row.raw.withdrawn_date, '2026-08-27')
  assert.equal(row.raw.lines.length, 1)
})
