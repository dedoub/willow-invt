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
  SHINHAN_ACCOUNT_GRIDS,
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
    currency: 'KRW',
    balance: 46_374_940,
    available_balance: 46_374_940,
    transactable: true,
    suspended: false,
  })
})

// 2026-08-26 전체계좌 조회의 외화예금 표에서 그대로 가져온 행.
const FOREIGN_ROW = [
  '1', '외화 체인지업 예금', '180-011-030723', '계좌번호 선택',
  '윌로우인베스트먼트(', 'USD', '4.62', '2021.05.04', '', '',
]

test('외화 계좌는 통화 칸 때문에 잔액 위치가 한 칸 밀린다', () => {
  const spec = SHINHAN_ACCOUNT_GRIDS.find(item => item.grid === 'gridlist5')
  const account = shinhanAccountFromCells(FOREIGN_ROW, spec)

  assert.equal(account.account_type, 'foreign')
  assert.equal(account.currency, 'USD')
  // 원화 배치로 읽으면 통화 문자열을 잔액으로 잡아 0이 된다.
  assert.equal(account.balance, 4.62)
  assert.equal(account.account_label, '신한 180-011-030723 (USD)')
  assert.equal(account.transactable, false)
})

test('shinhanAccountsPayload는 표를 모두 읽고, 모르는 표에 내역이 생기면 막는다', () => {
  const payload = shinhanAccountsPayload([
    { grid: 'gridlist1', rows: [ACCOUNT_ROW] },
    { grid: 'gridlist5', rows: [FOREIGN_ROW] },
    { grid: 'gridlist7', rows: [['', '', '', '', '', '', '']] },
  ], '2026-08-26T00:00:00.000Z')
  assert.deepEqual(payload.accounts.map(a => a.currency), ['KRW', 'USD'])

  // 대출 표에 계좌가 생기면 조용히 빠뜨리지 않고 실패한다.
  assert.throws(() => shinhanAccountsPayload([
    { grid: 'gridlist1', rows: [ACCOUNT_ROW] },
    { grid: 'gridlist7', rows: [['1', '기업일반자금대출', '140-000-000000']] },
  ], '2026-08-26T00:00:00.000Z'), /아직 읽지 못하는 계좌/)
})

test('shinhanAccountFromCells ignores a row that carries no account number', () => {
  assert.equal(shinhanAccountFromCells(['', '소계', '', '', '', '0', '0']), null)
})

test('shinhanAccountsPayload fails loudly rather than writing an empty file', () => {
  assert.throws(() => shinhanAccountsPayload([['', '소계', '']], '2026-08-26T00:00:00.000Z'), /읽지 못했어요/)
})

test('예전처럼 표 하나만 넘겨도 자유입출예금으로 읽는다', () => {
  const payload = shinhanAccountsPayload([ACCOUNT_ROW], '2026-08-26T00:00:00.000Z')
  assert.equal(payload.accounts.length, 1)
  assert.equal(payload.accounts[0].currency, 'KRW')
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
