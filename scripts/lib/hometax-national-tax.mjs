// Maps 홈택스 납부할 세액 조회/납부 onto the rows
// scripts/import-finance-tax-obligations.mjs feeds into finance_tax_obligations.

export const HOMETAX_SOURCE = 'hometax'

// The grid opens each row with a screen-reader summary cell, so the data starts
// at index 1: 과세구분, 세목, (직전)납부기한, 납부할 세액, 납부세액,
// 전자납부번호, 기납부세액, 귀속연월, 관서명(코드), 담당자
const COLUMNS = Object.freeze({
  taxCategory: 1,
  taxItem: 2,
  dueDate: 3,
  payableAmount: 4,
  noticeNumber: 6,
  paidAmount: 7,
  period: 8,
  office: 9,
})

export function nationalTaxAmount(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

export function nationalTaxDate(value) {
  const match = String(value ?? '').match(/(\d{4})-(\d{2})-(\d{2})/)
  return match ? match[0] : null
}

export function nationalTaxPeriod(value) {
  const match = String(value ?? '').match(/(\d{4})-(\d{2})/)
  return match ? match[0] : null
}

// 부가가치세 has its own ledger type; everything else files under 국세.
export function obligationTypeForTaxItem(taxItem) {
  return /부가/.test(String(taxItem ?? '')) ? 'vat' : 'national_tax'
}

// The grid prints the office as "삼성(120)"; the ledger wants a name a person
// would recognise on a bank statement.
export function taxOfficeName(value) {
  const name = String(value ?? '').replace(/\(.*?\)/g, '').trim()
  if (!name) return '국세청'
  return name.endsWith('세무서') ? name : `${name}세무서`
}

export function nationalTaxObligationFromCells(cells) {
  const taxItem = String(cells[COLUMNS.taxItem] ?? '').trim()
  const amount = nationalTaxAmount(cells[COLUMNS.payableAmount])
  if (!taxItem || amount <= 0) return null

  return {
    obligation_type: obligationTypeForTaxItem(taxItem),
    notice_number: String(cells[COLUMNS.noticeNumber] ?? '').trim() || null,
    period_label: nationalTaxPeriod(cells[COLUMNS.period]),
    title: taxItem,
    agency: taxOfficeName(cells[COLUMNS.office]),
    amount,
    issued_date: null,
    due_date: nationalTaxDate(cells[COLUMNS.dueDate]),
    status: 'unpaid',
    raw: {
      source: 'hometax-local-chrome',
      tax_category: String(cells[COLUMNS.taxCategory] ?? '').trim(),
      already_paid: nationalTaxAmount(cells[COLUMNS.paidAmount]),
      office: String(cells[COLUMNS.office] ?? '').trim(),
    },
  }
}

export function nationalTaxPayload(rows, collectedAt) {
  return {
    collected_at: collectedAt,
    source: HOMETAX_SOURCE,
    obligations: rows.map(nationalTaxObligationFromCells).filter(Boolean),
  }
}
