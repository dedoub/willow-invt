// closers.mjs — "했다"는 말이 아니라 기록으로만 닫는다.
import { normalizeSubject } from './infer.mjs'
import { redact } from './redact.mjs'
// days(a, b): a = ISO instant string, b = YYYY-MM-DD key
const days = (a, b) => (new Date(a) - new Date(`${b}T00:00:00Z`)) / 86_400_000

// 증빙 note 는 메일 제목·거래 상대 같은 바깥 글자라 저장 전에 가린다.
const safeNote = ev => ev && ev.note != null ? { ...ev, note: redact(ev.note).text } : ev

export function findEvidence(row, rule, facts) {
  return safeNote(findEvidenceRaw(row, rule, facts))
}

function findEvidenceRaw(row, rule, facts) {
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
      // 추론 규칙의 subject 는 정규화된 제목(월·숫자 제거)이라 날 제목도 같은 정규화를 거쳐 비교한다.
      && (!c.subject || normalizeSubject(m.subject).includes(normalizeSubject(c.subject)))
      && days(m.at, row.schedule_date) >= -10 && days(m.at, row.schedule_date) <= 5)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
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
