// Parses the KB국민카드 기업 이용대금명세서 into a billing record.
//
// The approvals collector stores what was spent; this is the figure KB actually
// withdraws. The screen prints one row per department with 결제일, 실제출금일 and
// 결제금액 for the billing month chosen in its 조회기간 select.

import crypto from 'node:crypto'

export const KB_CARD_ORGANIZATION = '0301'

export const KB_STATEMENT_COLUMNS = Object.freeze({
  departmentNo: 0,
  departmentName: 1,
  paymentDate: 2,
  withdrawnDate: 3,
  amount: 4,
})

export function statementAmount(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '')
  return digits ? Number(digits) : 0
}

export function dottedToIso(value) {
  const match = String(value ?? '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

export function isEmptyStatementRow(cells) {
  return cells.length < 5 || String(cells[0] ?? '').includes('조회 내역이 없습니다')
}

export function statementLineFromCells(cells) {
  if (isEmptyStatementRow(cells)) return null
  return {
    department_no: String(cells[KB_STATEMENT_COLUMNS.departmentNo] ?? '').trim() || null,
    department_name: String(cells[KB_STATEMENT_COLUMNS.departmentName] ?? '').trim() || null,
    payment_date: dottedToIso(cells[KB_STATEMENT_COLUMNS.paymentDate]),
    withdrawn_date: dottedToIso(cells[KB_STATEMENT_COLUMNS.withdrawnDate]),
    amount: statementAmount(cells[KB_STATEMENT_COLUMNS.amount]),
  }
}

export function billingFingerprint(row) {
  return crypto
    .createHash('sha1')
    .update([row.organization, row.billing_month, row.department_name ?? '', row.total_amount].join('|'))
    .digest('hex')
}

/**
 * 부서가 여러 개면 행도 여러 개다. 청구 총액은 그 합이고, 결제일은 모두 같으므로
 * 첫 행에서 가져온다.
 */
export function kbCardStatement(rows, billingMonth, collectedAt) {
  const lines = rows.map(statementLineFromCells).filter(Boolean)
  if (lines.length === 0) throw new Error(`KB카드 ${billingMonth} 명세서에 청구 내역이 없어요.`)
  if (!/^\d{6}$/.test(String(billingMonth))) {
    throw new Error(`청구년월은 YYYYMM 여야 해요: ${billingMonth}`)
  }

  const row = {
    collected_at: collectedAt,
    organization: KB_CARD_ORGANIZATION,
    billing_month: String(billingMonth),
    card_no: null,
    payment_due_date: lines[0].payment_date,
    withdrawn_date: lines[0].withdrawn_date,
    total_amount: lines.reduce((sum, line) => sum + line.amount, 0),
    department_name: lines.length === 1 ? lines[0].department_name : null,
    lines,
  }
  return { ...row, fingerprint: billingFingerprint(row) }
}

/** 적재용 행. lines/collected_at 은 raw 에 담는다. */
export function kbBillingRow(statement) {
  return {
    organization: statement.organization,
    billing_month: statement.billing_month,
    card_no: statement.card_no,
    payment_due_date: statement.payment_due_date,
    total_amount: statement.total_amount,
    department_name: statement.department_name,
    raw: {
      source: 'kb-local-chrome',
      collected_at: statement.collected_at,
      withdrawn_date: statement.withdrawn_date,
      lines: statement.lines,
    },
    fingerprint: statement.fingerprint,
  }
}
