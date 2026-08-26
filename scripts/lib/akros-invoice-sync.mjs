// 아크로스 인보이스 화면(/akros)의 세금계산서 목록을 홈택스 수집분과 계좌 입금으로
// 채운다.
//
// 그 화면은 손으로 관리해 왔고, 발행일(issued_at)과 수금일(paid_at)이 핵심이다.
// 자문료는 매달 같은 금액(13,750,000원)이라 금액만으로는 어느 달 건인지 가릴 수
// 없다. 그래서 날짜를 함께 본다.

/** 아크로스테크놀로지스. 상호는 표기가 흔들려도 사업자번호는 그대로다. */
export const AKROS_REG_NUMBER = '1608802104'

export function digits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

export function isAkrosInvoice(invoice) {
  if (invoice.transe_type === 'purchase') return false
  if (digits(invoice.contractor_reg_number) === AKROS_REG_NUMBER) return true
  // 사업자번호가 비어 오는 행이 있어 상호도 함께 본다.
  return /아크로스/.test(String(invoice.contractor_company ?? ''))
}

export function daysBetween(a, b) {
  const left = Date.parse(`${a}T00:00:00Z`)
  const right = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(left) || Number.isNaN(right)) return Number.POSITIVE_INFINITY
  return Math.round((right - left) / 86_400_000)
}

export function toDate(value) {
  return value ? String(value).slice(0, 10) : null
}

/**
 * 이미 화면에 있는 건인지 찾는다. 발행일이 비어 있는 행은 발행 기준일(invoice_date)로
 * 본다 — 과거 행은 작성월과 실제 발행일이 한 달까지 벌어져 있다.
 */
export function findExisting(rows, invoice, toleranceDays = 5) {
  const issued = invoice.reporting_date
  const amount = Number(invoice.total_amount)
  return rows.find(row => {
    if (Number(row.amount) !== amount) return false
    const candidates = [toDate(row.issued_at), toDate(row.invoice_date)].filter(Boolean)
    return candidates.some(date => Math.abs(daysBetween(date, issued)) <= toleranceDays)
  }) ?? null
}

/**
 * 계산서에 대응하는 입금을 찾는다. 발행 전에 들어온 돈은 이 계산서의 수금이 아니다.
 */
export function findPayment(payments, invoice, windowDays = 90) {
  const issued = invoice.reporting_date
  const amount = Number(invoice.total_amount)
  return payments
    .filter(payment => Number(payment.amount) === amount)
    .filter(payment => {
      const gap = daysBetween(issued, payment.payment_date)
      return gap >= -3 && gap <= windowDays
    })
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0] ?? null
}

/**
 * 무엇을 넣고 무엇을 고칠지 계획만 만든다. 쓰기는 호출부가 한다.
 *
 * 이미 있는 행의 발행일·금액·비고는 건드리지 않는다 — 사람이 손으로 맞춰 둔 값을
 * 수집분이 덮어쓰면 안 된다. 비어 있는 수금일만 채운다.
 */
export function planAkrosSync(invoices, rows, payments) {
  const insert = []
  const updatePaid = []

  for (const invoice of invoices.filter(isAkrosInvoice)) {
    const payment = findPayment(payments, invoice)
    const existing = findExisting(rows, invoice)

    if (!existing) {
      insert.push({
        invoice_date: invoice.reporting_date,
        amount: Number(invoice.total_amount),
        issued_at: invoice.issue_date ?? invoice.reporting_date,
        paid_at: payment?.payment_date ?? null,
        notes: invoice.rep_items ?? null,
      })
      continue
    }

    if (!existing.paid_at && payment) {
      updatePaid.push({ id: existing.id, paid_at: payment.payment_date, amount: Number(invoice.total_amount) })
    }
  }

  return { insert, updatePaid }
}
