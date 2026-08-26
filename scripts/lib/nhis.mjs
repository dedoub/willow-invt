// Maps 사회보험통합징수포털's 사업장 보험료 고지/납부 현황 grid onto the rows
// scripts/import-finance-tax-obligations.mjs feeds into finance_tax_obligations.

export const NHIS_SOURCE = 'nhis'
export const NHIS_AGENCY = '국민건강보험공단'

// The screen queries one insurance at a time; the radio value is what the form
// posts, and the obligation type is what the ledger stores.
export const NHIS_INSURANCES = Object.freeze([
  { id: 'health', value: '10', label: '건강보험', obligationType: 'health_insurance' },
  { id: 'pension', value: '20', label: '국민연금', obligationType: 'pension' },
  { id: 'goyong', value: '30', label: '고용보험', obligationType: 'employment_insurance' },
  { id: 'sanjae', value: '40', label: '산재보험', obligationType: 'industrial_accident' },
])

function amount(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

export function nhisDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null
}

// Both 월 and 납부마감일 are merged across the rows of one month, so the 요양
// row that follows 건강 arrives two cells short and inherits them from above.
const FULL_ROW_CELLS = 10

export function withCarriedMonth(rows) {
  let month = null
  let dueDate = null
  return rows.map(row => {
    const hasMonth = /^\d{1,2}$/.test(String(row[0] ?? '').trim())
    if (hasMonth) month = String(row[0]).trim().padStart(2, '0')
    const cells = hasMonth ? row.slice(1) : [...row]

    if (cells.length >= FULL_ROW_CELLS) {
      dueDate = cells[2]
    } else if (dueDate !== null) {
      cells.splice(2, 0, dueDate)
    }
    return { month, cells }
  })
}

// After the month is removed every row reads the same way:
// 구분, 고지금액, 납부마감일, 납부일, 수납 보험료/연체금/총액, 미납 보험료/연체금/총액
const COLUMNS = Object.freeze({
  kind: 0,
  noticedAmount: 1,
  dueDate: 2,
  paidDate: 3,
  unpaidTotal: 9,
})

export function nhisObligationFromRow({ month, cells }, { year, insurance }) {
  const kind = String(cells[COLUMNS.kind] ?? '').trim()
  const noticed = amount(cells[COLUMNS.noticedAmount])
  if (!month || !kind || noticed <= 0) return null

  const unpaid = amount(cells[COLUMNS.unpaidTotal])
  const paidDate = nhisDate(cells[COLUMNS.paidDate])
  const dueDate = nhisDate(cells[COLUMNS.dueDate])

  return {
    obligation_type: insurance.obligationType,
    notice_number: null,
    period_label: `${year}-${month}`,
    // 건강보험 splits into 건강 and 요양 rows; keeping the kind makes the two
    // notices distinct instead of collapsing onto one fingerprint.
    title: `${insurance.label} (${kind})`,
    agency: NHIS_AGENCY,
    amount: noticed,
    issued_date: null,
    due_date: dueDate,
    status: unpaid > 0 ? 'unpaid' : 'paid',
    raw: {
      source: 'nhis-local-chrome',
      insurance: insurance.label,
      kind,
      paid_date: paidDate,
      unpaid_total: unpaid,
    },
  }
}

export function nhisObligations(rows, { year, insurance }) {
  return withCarriedMonth(rows)
    .map(row => nhisObligationFromRow(row, { year, insurance }))
    .filter(Boolean)
}

export function nhisObligationsPayload(groups, collectedAt) {
  return {
    collected_at: collectedAt,
    source: NHIS_SOURCE,
    obligations: groups.flat(),
  }
}
