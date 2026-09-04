const MATCH_WINDOW_DAYS = 45

function normalize(value) {
  return String(value ?? '')
    .replace(/[（(]주[)）]|주식회사|유한회사|사단법인|㈜/g, '')
    .replace(/[\s\-_.·]/g, '')
    .toLowerCase()
}

function invoiceParty(invoice) {
  if (invoice.transe_type === 'purchase') {
    return {
      company: invoice.supplier_company,
      regNo: invoice.supplier_reg_number,
      representative: null,
    }
  }
  return {
    company: invoice.contractor_company,
    regNo: invoice.contractor_reg_number,
    representative: invoice.contractor_name,
  }
}

function dayDistance(a, b) {
  return Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000
}

export function formatBusinessNumber(value) {
  if (!value) return null
  const digits = String(value).replace(/\D/g, '')
  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : String(value)
}

export function choosePromotionCandidate(invoice, candidates, takenIds) {
  const party = normalize(invoiceParty(invoice).company)
  const expectedType = invoice.transe_type === 'purchase' ? 'purchase' : 'sales'

  const eligible = candidates.filter(candidate => {
    const candidateType = candidate.invoice_type ?? 'sales'
    return (
      !takenIds.has(candidate.id) &&
      candidateType === expectedType &&
      Number(candidate.total_amount) === Number(invoice.total_amount) &&
      normalize(candidate.counterparty) === party &&
      dayDistance(candidate.issue_date, invoice.reporting_date) <= MATCH_WINDOW_DAYS
    )
  })

  eligible.sort((a, b) => {
    const rank = status => (['planned', 'scheduled'].includes(status) ? 0 : 1)
    const rankDiff = rank(a.payment_status) - rank(b.payment_status)
    if (rankDiff) return rankDiff
    return dayDistance(a.issue_date, invoice.reporting_date) - dayDistance(b.issue_date, invoice.reporting_date)
  })
  return eligible[0] ?? null
}

export function findExistingPromotion(invoice, stagingRows) {
  if (!invoice.approval_no) return null
  return stagingRows.find(row => (
    row.id !== invoice.id &&
    row.approval_no === invoice.approval_no &&
    row.status === 'promoted' &&
    row.sales_id
  )) ?? null
}

export function buildLinkedSalesPatch(invoice, candidate) {
  const patch = {}
  if (candidate.issue_date !== invoice.reporting_date) patch.issue_date = invoice.reporting_date
  if (['planned', 'scheduled'].includes(candidate.payment_status)) patch.payment_status = 'pending'
  return patch
}

export function buildNewSalesRow(invoice) {
  const party = invoiceParty(invoice)
  const purchase = invoice.transe_type === 'purchase'
  return {
    invoice_type: purchase ? 'purchase' : 'sales',
    issue_date: invoice.reporting_date,
    counterparty: party.company || party.regNo || '미상',
    business_number: formatBusinessNumber(party.regNo),
    representative: party.representative,
    supply_amount: invoice.supply_amount,
    tax_amount: invoice.tax_amount,
    total_amount: invoice.total_amount,
    items: invoice.rep_items ? [{ description: invoice.rep_items }] : [],
    payment_status: 'pending',
    notes: `홈택스 ${purchase ? '매입 ' : ''}자동수집 (승인번호 ${invoice.approval_no ?? '-'})`,
  }
}
