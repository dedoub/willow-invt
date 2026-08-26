import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SHINHAN_ORGANIZATION,
  collectionWindow,
  dottedDate,
  isoDate,
  isoDateFromDotted,
  shinhanAccountFromCells,
  shinhanAccountsPayload,
  shinhanTransactionFromCells,
  shinhanTransactionsPayload,
  splitTransactedAt,
} from './shinhan-bank.mjs'

// Copied off the live grids so the column indices stay honest.
const TRANSACTION_ROW = [
  '1',
  '1행 거래일시 2026.08.25 15:53:17 입금액 4,500,000 출금액 0 내용 강남구상공회',
  '2026.08.25 15:53:17',
  '일괄BZ',
  '4,500,000',
  '0',
  '강남구상공회',
  '46,374,940',
  '서울시',
  '',
  '',
  '메모 팝업 열기',
]

const ACCOUNT_ROW = [
  '1',
  '기업자유예금',
  '140-013-150883',
  '계좌번호 선택',
  '(주)텐소프트웍스',
  '46,374,940',
  '46,374,940',
  '2020.08.03',
  '2026.08.25',
  '',
]

test('splitTransactedAt separates the dotted date from the clock', () => {
  assert.deepEqual(splitTransactedAt('2026.08.25 15:53:17'), { tr_date: '2026-08-25', tr_time: '15:53:17' })
})

test('splitTransactedAt tolerates a row with no time', () => {
  assert.deepEqual(splitTransactedAt('2026.08.25'), { tr_date: '2026-08-25', tr_time: null })
})

test('isoDateFromDotted rejects anything that is not a full date', () => {
  assert.equal(isoDateFromDotted('2026.08'), null)
  assert.equal(isoDateFromDotted(''), null)
})

test('shinhanTransactionFromCells maps the grid onto the shared bank shape', () => {
  assert.deepEqual(shinhanTransactionFromCells(TRANSACTION_ROW, '140-013-150883'), {
    tr_date: '2026-08-25',
    tr_time: '15:53:17',
    desc1: '일괄BZ',
    desc2: '강남구상공회',
    desc3: '서울시',
    desc4: null,
    amount_in: 4_500_000,
    amount_out: 0,
    balance_after: 46_374_940,
    organization: SHINHAN_ORGANIZATION,
    account: '140013150883',
  })
})

test('shinhanTransactionFromCells skips a row without a usable date', () => {
  const header = [...TRANSACTION_ROW]
  header[2] = '합계'
  assert.equal(shinhanTransactionFromCells(header, '140-013-150883'), null)
})

test('shinhanAccountFromCells reads the balance columns, not the dates beside them', () => {
  assert.deepEqual(shinhanAccountFromCells(ACCOUNT_ROW), {
    account_type: 'deposit',
    account: '140013150883',
    account_display: '140-013-150883',
    account_label: '신한 140-013-150883',
    product_name: '기업자유예금',
    balance: 46_374_940,
    available_balance: 46_374_940,
    suspended: false,
  })
})

test('shinhanAccountFromCells ignores a row that carries no account number', () => {
  assert.equal(shinhanAccountFromCells(['', '소계', '', '', '', '0', '0']), null)
})

test('shinhanAccountsPayload fails loudly rather than writing an empty file', () => {
  assert.throws(() => shinhanAccountsPayload([['', '소계', '']], '2026-08-26T00:00:00.000Z'), /읽지 못했어요/)
})

test('shinhanTransactionsPayload carries the queried window with the rows', () => {
  const payload = shinhanTransactionsPayload(
    [{ account: '140-013-150883', rows: [TRANSACTION_ROW] }],
    { collectedAt: '2026-08-26T00:00:00.000Z', startDate: '2026-08-13', endDate: '2026-08-26' },
  )
  assert.equal(payload.account_count, 1)
  assert.equal(payload.transactions.length, 1)
  assert.equal(payload.start_date, '2026-08-13')
  assert.equal(payload.transactions[0].organization, SHINHAN_ORGANIZATION)
})

test('collectionWindow spans the requested number of days inclusive', () => {
  const { start, end } = collectionWindow(new Date('2026-08-26T09:00:00+09:00'), 14)
  assert.equal(isoDate(end), '2026-08-26')
  assert.equal(isoDate(start), '2026-08-13')
})

test('dottedDate formats the way the query form expects', () => {
  assert.equal(dottedDate(new Date('2026-08-03T09:00:00+09:00')), '2026.08.03')
})
