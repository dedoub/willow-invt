export function paymentKey(payment) {
  if (!payment) return ''
  return `${payment.date}|${payment.amount}|${payment.account ?? ''}`
}

export function findReservedPayment(invoice, payments) {
  const bankRef = String(invoice.bank_ref ?? '')
  const paidDate = bankRef.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? String(invoice.paid_at ?? '').slice(0, 10)
  const paidAmount = Number(invoice.paid_amount)
  if (!paidDate || !paidAmount || !bankRef) return null

  return payments.find(payment => (
    payment.date === paidDate &&
    Number(payment.amount) === paidAmount &&
    (!payment.account || bankRef.includes(payment.account))
  )) ?? null
}
