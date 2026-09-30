// closers.mjs — "했다"는 말이 아니라 기록으로만 닫는다.
// days(a, b): a = ISO instant string, b = YYYY-MM-DD key
const days = (a, b) => (new Date(a) - new Date(`${b}T00:00:00Z`)) / 86_400_000

export function findEvidence(row, rule, facts) {
  const c = rule.completion
  if (!c) return null
  if (c.kind === 'tax') {
    const hits = (facts.taxObligations ?? []).filter(t => t.company === rule.company && c.types.includes(t.obligation_type) && Math.abs(days(`${t.due_date}T00:00:00Z`, row.schedule_date)) <= 5)
    if (!hits.length || hits.some(t => t.status !== 'paid')) return null
    return { kind: 'tax', ref: hits.map(t => t.id).join(','), at: hits.map(t => t.paid_at).filter(Boolean).sort().at(-1) ?? null, note: `고지 ${hits.length}건 납부` }
  }
  if (c.kind === 'sent_mail' || c.kind === 'received_mail') {
    const list = c.kind === 'sent_mail' ? facts.sentMail : facts.receivedMail
    const isSent = c.kind === 'sent_mail'
    const hit = (list ?? []).filter(m => m.context === c.context
      && (isSent ? (!c.to || (m.to ?? '').includes(c.to)) : (!c.from || (m.from ?? '').includes(c.from)))
      && (!c.subject || (m.subject ?? '').includes(c.subject))
      && days(m.at, row.schedule_date) >= -10 && days(m.at, row.schedule_date) <= 5)
      .sort((a, b) => b.at.localeCompare(a.at))[0]
    return hit ? { kind: c.kind, ref: hit.id, at: hit.at, note: hit.subject } : null
  }
  if (c.kind === 'cash') {
    const hit = (facts.cash ?? []).find(x => x.table === c.table
      && ((c.category && x.category === c.category) || (c.counterparty && (x.counterparty ?? '').includes(c.counterparty)))
      && Math.abs(days(`${x.date}T00:00:00Z`, row.schedule_date)) <= 3)
    return hit ? { kind: 'cash', ref: hit.id, at: hit.date, note: hit.counterparty ?? hit.category } : null
  }
  return null
}

export const closePatch = (row, ev) => ({ is_completed: true, agent_state: 'done', evidence: [...(row.evidence ?? []), ev] })
