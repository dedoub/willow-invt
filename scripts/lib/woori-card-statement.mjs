// Parses the 우리카드 이용대금명세서 summary into a statement record.
// The approvals collector already stores individual purchases; this is the
// billed total the card company will actually withdraw.

export const WOORI_CARD_ORGANIZATION = '0309'

export function statementAmount(value) {
  const digits = String(value ?? '').replace(/[^\d-]/g, '')
  return digits ? Number(digits) : 0
}

export function dottedToIso(value) {
  const match = String(value ?? '').match(/(\d{4})\.(\d{2})\.(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

// 결제일 is printed as MM.DD without a year, so it is resolved against the
// statement date and rolled into the next year when it falls before it.
export function resolvePaymentDate(monthDay, statementIso) {
  const match = String(monthDay ?? '').match(/(\d{2})\.(\d{2})/)
  if (!match || !statementIso) return null
  const [, month, day] = match
  const year = Number(statementIso.slice(0, 4))
  const candidate = `${year}-${month}-${day}`
  return candidate >= statementIso ? candidate : `${year + 1}-${month}-${day}`
}

export function statementHeader(text) {
  const body = String(text ?? '').replace(/\s+/g, ' ')
  const period = body.match(/(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/)
  const statementDate = body.match(/명세서작성일[^\d]*(\d{4}\.\d{2}\.\d{2})/)
  const paymentDay = body.match(/(\d{2}\.\d{2})\s*대표카드번호/)
  const cardNo = body.match(/대표카드번호\s*([\d*-]+)/)
  const account = body.match(/결제계좌\s*(\[[^\]]+\]\s*[\d*]+)/)

  const statementIso = dottedToIso(statementDate?.[1])
  return {
    statement_date: statementIso,
    period_start: dottedToIso(period?.[1]),
    period_end: dottedToIso(period?.[2]),
    payment_date: resolvePaymentDate(paymentDay?.[1], statementIso),
    card_no: cardNo?.[1] ?? null,
    settlement_account: account?.[1]?.replace(/\s+/g, ' ').trim() ?? null,
  }
}

// 연회비 rows omit the fee column, so the total is read from the last cell
// rather than from a fixed index.
export function statementLineFromCells(cells) {
  const label = String(cells[0] ?? '').trim()
  if (!label || label === '청구내역') return null
  return {
    label,
    principal: statementAmount(cells[1]),
    fee: cells.length >= 4 ? statementAmount(cells[2]) : 0,
    total: statementAmount(cells[cells.length - 1]),
  }
}

export function wooriCardStatement(rows, headerText, collectedAt) {
  const lines = rows.map(statementLineFromCells).filter(Boolean)
  const monthly = lines.find(line => line.label === '당월계')
  const header = statementHeader(headerText)

  if (!header.statement_date) throw new Error('우리카드 명세서 작성일을 읽지 못했어요.')
  if (!monthly) throw new Error('우리카드 명세서 당월계를 읽지 못했어요.')

  return {
    collected_at: collectedAt,
    organization: WOORI_CARD_ORGANIZATION,
    ...header,
    lines: lines.filter(line => line.label !== '당월계'),
    monthly_principal: monthly.principal,
    monthly_fee: monthly.fee,
    billed_amount: monthly.total,
  }
}

/**
 * 적재용 행. 우리카드 명세서는 청구년월을 따로 주지 않고 결제일만 주므로,
 * 결제일이 속한 달을 청구년월로 삼는다 — 2026-09-07 결제분은 202609다.
 */
export function wooriBillingRow(statement) {
  const paymentDate = statement.payment_date ?? statement.statement_date
  if (!paymentDate) throw new Error('우리카드 명세서에 결제일이 없어요.')
  const billingMonth = paymentDate.slice(0, 7).replace('-', '')

  const lineTotal = label => statement.lines.find(line => line.label === label)?.total ?? null

  return {
    organization: statement.organization,
    billing_month: billingMonth,
    card_no: statement.card_no,
    payment_due_date: paymentDate,
    total_amount: statement.billed_amount,
    // 명세서가 청구내역을 항목별로 나눠 주므로 그대로 옮긴다.
    full_amount: lineTotal('일시불'),
    installment_amount: lineTotal('할부'),
    overseas_use: lineTotal('해외이용'),
    annual_fee: lineTotal('연회비'),
    amount_outstanding: lineTotal('전월미결제금액'),
    cash_service: lineTotal('국외단기카드대출'),
    payment_account: statement.settlement_account,
    raw: {
      source: 'woori-local-chrome',
      collected_at: statement.collected_at,
      statement_date: statement.statement_date,
      period_start: statement.period_start,
      period_end: statement.period_end,
      monthly_principal: statement.monthly_principal,
      monthly_fee: statement.monthly_fee,
      lines: statement.lines,
    },
    // 청구는 카드번호와 무관하게 한 달에 하나다. 금액을 지문에 넣었더니 카드가
    // 재발급돼 번호가 바뀐 달에 같은 청구가 두 행으로 남았다 — 202608 이 그랬다.
    // 달만 보면 금액이 정정돼도 같은 행을 고쳐 쓴다.
    fingerprint: statement.organization + '|' + billingMonth,
  }
}
