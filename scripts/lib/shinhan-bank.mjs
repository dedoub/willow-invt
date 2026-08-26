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

// 전체계좌 조회는 상품군마다 표를 따로 그린다. 첫 표만 읽으면 그 아래 외화·정기·
// 대출 계좌가 통째로 빠지므로, 표마다 어떤 계좌인지와 칸 배치를 함께 적어 둔다.
// 잔액이 소수로 찍히는 외화는 통화 칸이 하나 더 있어 배치가 밀린다.
const KRW_COLUMNS = Object.freeze({
  productName: 1,
  accountNumber: 2,
  nickname: 4,
  balance: 5,
  availableBalance: 6,
})

const FOREIGN_COLUMNS = Object.freeze({
  productName: 1,
  accountNumber: 2,
  nickname: 4,
  currency: 5,
  balance: 6,
})

export const SHINHAN_ACCOUNT_GRIDS = Object.freeze([
  Object.freeze({
    grid: 'gridlist1',
    label: '자유입출예금',
    accountType: 'deposit',
    columns: KRW_COLUMNS,
    transactable: true,
  }),
  Object.freeze({
    grid: 'gridlist5',
    label: '외화예금',
    accountType: 'foreign',
    columns: FOREIGN_COLUMNS,
    // 외화 계좌는 계좌별거래내역 화면의 목록에 뜨지 않아 잔액만 가져온다.
    transactable: false,
  }),
])

/** 아직 배치를 확인하지 않은 표. 내역이 생기면 조용히 빠지지 않도록 이름을 남긴다. */
export const SHINHAN_UNMAPPED_GRIDS = Object.freeze({
  gridlist2: '정기예금/적금',
  gridlist3: '신탁',
  gridlist4: '펀드',
  gridlist6: '퇴직연금',
  gridlist7: '대출',
})

function decimalAmount(value) {
  const text = String(value ?? '').replaceAll(',', '').trim()
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : 0
}

export function shinhanAccountFromCells(cells, spec = SHINHAN_ACCOUNT_GRIDS[0]) {
  const columns = spec.columns
  const accountDisplay = String(cells[columns.accountNumber] ?? '').trim()
  const account = accountDigits(accountDisplay)
  if (account.length < 10) return null

  const currency = columns.currency
    ? String(cells[columns.currency] ?? '').trim().toUpperCase() || 'KRW'
    : 'KRW'

  return {
    account_type: spec.accountType,
    account,
    account_display: accountDisplay,
    // 원화 계좌는 지금 쓰는 표기를 그대로 두고, 외화만 통화를 붙여 구분한다.
    account_label: currency === 'KRW' ? `신한 ${accountDisplay}` : `신한 ${accountDisplay} (${currency})`,
    product_name: String(cells[columns.productName] ?? '').trim() || null,
    currency,
    // 외화 잔액은 4.62처럼 소수로 온다.
    balance: currency === 'KRW' ? amount(cells[columns.balance]) : decimalAmount(cells[columns.balance]),
    available_balance: columns.availableBalance != null
      ? amount(cells[columns.availableBalance])
      : null,
    transactable: spec.transactable,
    suspended: false,
  }
}

/**
 * @param {Array<{grid: string, rows: string[][]}>} grids 화면에서 읽은 표들
 */
export function shinhanAccountsPayload(grids, collectedAt) {
  // 예전처럼 표 하나만 넘어오면 자유입출예금으로 본다.
  const normalized = Array.isArray(grids) && grids.length > 0 && Array.isArray(grids[0])
    ? [{ grid: 'gridlist1', rows: grids }]
    : grids

  const accounts = []
  const skipped = []
  for (const { grid, rows } of normalized) {
    const spec = SHINHAN_ACCOUNT_GRIDS.find(item => item.grid === grid)
    if (!spec) {
      if (rows.some(row => row.some(cell => String(cell ?? '').trim()))) {
        skipped.push(SHINHAN_UNMAPPED_GRIDS[grid] ?? grid)
      }
      continue
    }
    for (const row of rows) {
      const account = shinhanAccountFromCells(row, spec)
      if (account) accounts.push(account)
    }
  }

  if (accounts.length === 0) throw new Error('신한은행 계좌 목록을 읽지 못했어요.')
  if (skipped.length > 0) {
    throw new Error(`신한은행에서 아직 읽지 못하는 계좌가 생겼어요: ${skipped.join(', ')}`)
  }
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
