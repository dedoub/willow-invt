import crypto from 'node:crypto'

const AGENCY_KEYWORDS = {
  hometax: ['국세', '국세청', '세무서', '부가세', '부가가치세'],
  wetax: ['지방세', '위택스', '시청', '구청', '도청'],
  nhis: ['건강보험', '국민건강', '사회보험', '국민연금', '고용보험', '산재보험'],
}

function dateValue(value) {
  if (!value) return null
  const timestamp = Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(timestamp) ? null : timestamp
}

function compact(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase()
}

export function normalizeObligation(input) {
  const stableKey = [
    input.company,
    input.source,
    input.notice_number || '',
    input.obligation_type,
    input.amount,
    input.due_date || '',
    input.period_label || '',
  ].join('|')

  return {
    company: input.company,
    source: input.source,
    obligation_type: input.obligation_type,
    notice_number: input.notice_number || null,
    period_label: input.period_label || null,
    title: input.title,
    agency: input.agency,
    amount: Number(input.amount),
    issued_date: input.issued_date || null,
    due_date: input.due_date || null,
    status: input.status || 'unpaid',
    source_payload: input.source_payload || input.raw || {},
    fingerprint: crypto.createHash('sha256').update(stableKey).digest('hex'),
    collected_at: input.collected_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function obligationStatus(obligation, today = new Date().toISOString().slice(0, 10)) {
  if (obligation.status !== 'unpaid' && obligation.status !== 'overdue') return obligation.status
  if (obligation.due_date && obligation.due_date < today) return 'overdue'
  return 'unpaid'
}

export function findPaymentMatch(obligation, cashRows, { dayWindow = 14 } = {}) {
  const issuedAt = dateValue(obligation.issued_date)
  const dueAt = dateValue(obligation.due_date)
  const earliest = issuedAt ?? (dueAt === null ? null : dueAt - dayWindow * 86_400_000)
  const latest = dueAt === null ? null : dueAt + dayWindow * 86_400_000
  const keywords = AGENCY_KEYWORDS[obligation.source] || [obligation.agency]

  const matches = cashRows.filter((row) => {
    if (row.type !== 'expense' || Number(row.amount) !== Number(obligation.amount)) return false
    const paidAt = dateValue(row.payment_date)
    if (paidAt === null) return false
    if (earliest !== null && paidAt < earliest) return false
    if (latest !== null && paidAt > latest) return false

    const haystack = compact(`${row.counterparty || ''} ${row.description || ''} ${row.notes || ''}`)
    return keywords.some((keyword) => haystack.includes(compact(keyword)))
  })

  return matches.length === 1 ? matches[0] : null
}
