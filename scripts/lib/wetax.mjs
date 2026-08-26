// Maps the 위택스 지방세 납부대상 grid onto the rows
// scripts/import-finance-tax-obligations.mjs feeds into finance_tax_obligations.

export const WETAX_SOURCE = 'wetax'

// 전체선택, 과세연월, 세목/과목, 구분, 납세자, 금액, 납부기한, 자치단체,
// 전자납부번호, 납부상태
const COLUMNS = Object.freeze({
  period: 1,
  title: 2,
  kind: 3,
  taxpayer: 4,
  amount: 5,
  dueDate: 6,
  agency: 7,
  noticeNumber: 8,
  status: 9,
})

const STATUS_BY_LABEL = Object.freeze({
  미납: 'unpaid',
  체납: 'overdue',
  납부: 'paid',
  납부완료: 'paid',
  취소: 'cancelled',
})

export function wetaxAmount(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

export function wetaxDate(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/)
  if (!match) return null
  const [, year, month, day] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export function wetaxPeriod(value) {
  const match = String(value ?? '').trim().match(/(\d{4})[-.](\d{1,2})/)
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : null
}

export function wetaxStatus(label) {
  const text = String(label ?? '').replace(/\s+/g, '')
  for (const [key, value] of Object.entries(STATUS_BY_LABEL)) {
    if (text.includes(key)) return value
  }
  return 'unpaid'
}

export function wetaxObligationFromCells(cells) {
  const title = String(cells[COLUMNS.title] ?? '').trim()
  const amount = wetaxAmount(cells[COLUMNS.amount])
  const agency = String(cells[COLUMNS.agency] ?? '').trim()
  if (!title || !agency || amount <= 0) return null

  return {
    obligation_type: 'local_tax',
    notice_number: String(cells[COLUMNS.noticeNumber] ?? '').trim() || null,
    period_label: wetaxPeriod(cells[COLUMNS.period]),
    title,
    agency,
    amount,
    issued_date: null,
    due_date: wetaxDate(cells[COLUMNS.dueDate]),
    status: wetaxStatus(cells[COLUMNS.status]),
    raw: {
      source: 'wetax-local-chrome',
      period: String(cells[COLUMNS.period] ?? '').trim(),
      kind: String(cells[COLUMNS.kind] ?? '').trim(),
      taxpayer: String(cells[COLUMNS.taxpayer] ?? '').trim(),
      status_label: String(cells[COLUMNS.status] ?? '').trim(),
    },
  }
}

export function wetaxObligationsPayload(rows, collectedAt) {
  const obligations = rows.map(wetaxObligationFromCells).filter(Boolean)
  return { collected_at: collectedAt, source: WETAX_SOURCE, obligations }
}

// The grid renders a single placeholder row when nothing matches the query, and
// that row must not be mistaken for an empty but successful collection.
export function isEmptyResultRow(cells) {
  return cells.length <= 2 && /검색결과가 없습니다/.test(cells.join(' '))
}
