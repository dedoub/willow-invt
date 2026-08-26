// Turns the 신한은행 기업뱅킹 grids into the same shape the 우리은행 collector
// already writes, so scripts/import-tensw-local-bank.mjs can load either bank
// without knowing which one produced the file.

export const SHINHAN_ORGANIZATION = '0088'

function amount(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '')
  return digits ? Number(digits) : 0
}

function accountDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

export function isoDateFromDotted(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8)
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null
}

// 거래일시 arrives as "2026.08.25 15:53:17".
export function splitTransactedAt(value) {
  const text = String(value ?? '').trim()
  const [datePart = '', timePart = ''] = text.split(/\s+/)
  const time = timePart.match(/^\d{2}:\d{2}:\d{2}$/) ? timePart : null
  return { tr_date: isoDateFromDotted(datePart), tr_time: time }
}

// The grid puts a screen-reader summary in the second cell of every row, so the
// data columns are addressed by index from the third cell onwards.
const TRANSACTION_COLUMNS = Object.freeze({
  transactedAt: 2,
  summary: 3,
  amountIn: 4,
  amountOut: 5,
  description: 6,
  balance: 7,
  branch: 8,
})

export function shinhanTransactionFromCells(cells, account) {
  const at = splitTransactedAt(cells[TRANSACTION_COLUMNS.transactedAt])
  if (!at.tr_date) return null

  return {
    tr_date: at.tr_date,
    tr_time: at.tr_time,
    desc1: cells[TRANSACTION_COLUMNS.summary]?.trim() || null,
    desc2: cells[TRANSACTION_COLUMNS.description]?.trim() || null,
    desc3: cells[TRANSACTION_COLUMNS.branch]?.trim() || null,
    desc4: null,
    amount_in: amount(cells[TRANSACTION_COLUMNS.amountIn]),
    amount_out: amount(cells[TRANSACTION_COLUMNS.amountOut]),
    balance_after: amount(cells[TRANSACTION_COLUMNS.balance]),
    organization: SHINHAN_ORGANIZATION,
    account: accountDigits(account),
  }
}

const ACCOUNT_COLUMNS = Object.freeze({
  productName: 1,
  accountNumber: 2,
  nickname: 4,
  balance: 5,
  availableBalance: 6,
})

export function shinhanAccountFromCells(cells) {
  const accountDisplay = String(cells[ACCOUNT_COLUMNS.accountNumber] ?? '').trim()
  const account = accountDigits(accountDisplay)
  if (account.length < 10) return null

  return {
    account_type: 'deposit',
    account,
    account_display: accountDisplay,
    account_label: `신한 ${accountDisplay}`,
    product_name: String(cells[ACCOUNT_COLUMNS.productName] ?? '').trim() || null,
    balance: amount(cells[ACCOUNT_COLUMNS.balance]),
    available_balance: amount(cells[ACCOUNT_COLUMNS.availableBalance]),
    suspended: false,
  }
}

export function shinhanAccountsPayload(rows, collectedAt) {
  const accounts = rows.map(shinhanAccountFromCells).filter(Boolean)
  if (accounts.length === 0) throw new Error('신한은행 계좌 목록을 읽지 못했어요.')
  return { collected_at: collectedAt, accounts }
}

export function shinhanTransactionsPayload(entries, { collectedAt, startDate, endDate }) {
  const transactions = entries
    .flatMap(entry => entry.rows.map(cells => shinhanTransactionFromCells(cells, entry.account)))
    .filter(Boolean)

  return {
    collected_at: collectedAt,
    start_date: startDate,
    end_date: endDate,
    account_count: entries.length,
    transactions,
  }
}

export function dottedDate(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

export function isoDate(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function collectionWindow(now, days = 14) {
  const end = new Date(now)
  const start = new Date(now.getTime() - (days - 1) * 86_400_000)
  return { start, end }
}
