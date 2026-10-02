// decisions.mjs — 결정함 메시지·버튼과 저녁 요약.
const CO = { tensw: '텐소', willow: '윌로우' }

export function decisionMessage(d) {
  const rec = d.options.find(o => o.id === d.recommended)
  const text = [`[${CO[d.company]}] ${d.question}`, rec ? `추천: ${rec.label}` : null].filter(Boolean).join('\n')
  const buttons = [d.options.map((o, i) => ({ text: o.label, callback_data: `mgmt:${d.id}:${i}` })), [{ text: '보류', callback_data: `mgmt:${d.id}:hold` }]]
  return { text, buttons }
}

export function parseDecisionCallback(data) {
  const m = /^mgmt:([0-9a-f-]{36}):(\d{1,2}|hold)$/.exec(String(data))
  return m ? { id: m[1], option: m[2] } : null
}

export function reuseAnswer(decision, past) {
  // 발송 승인·보안(평문 비밀 공유)은 매번 대표가 본다 — 지난 답으로 자동 처리하지 않는다.
  if (decision.kind === 'send_approval' || decision.kind === 'security') return null
  return past.find(p => p.status === 'answered' && p.subject_key === decision.subject_key && p.answer && p.answer !== 'hold')?.answer ?? null
}

export function digestMessage({ date, done, created, inferred, missed, openDecisions, failures, reused = [] }) {
  const parts = []
  if (done.length) parts.push(`완료 ${done.length}: ${done.join(', ')}`)
  if (created.length) parts.push(`새 일정 ${created.length}: ${created.join(', ')}`)
  if (inferred.length) parts.push(`새 반복 규칙(추정) ${inferred.length}: ${inferred.join(', ')} — 빼려면 "규칙 빼 <이름>"`)
  if (missed.length) parts.push(`빠짐 ${missed.length}: ${missed.join(', ')}`)
  if (reused.length) parts.push(`지난 판단 재사용 ${reused.length}: ${reused.join(', ')}`)
  if (openDecisions.length) parts.push(`대기 중인 결정 ${openDecisions.length}건`)
  if (failures.length) parts.push(`실패·재시도 예정: ${failures.join(', ')}`)
  return parts.length ? [`경영관리 ${date}`, ...parts].join('\n') : null
}

// 메일·스페이스에서 나온 결정(scope·money 등)에 대표가 답하면, 그 답을 기록부(decision)에 남긴다.
// 전에는 missed·rule_review 답만 반영하고 나머지는 답을 받아도 아무 일도 없었다(임치 '회수' 답이 묻힘, 2026-10-02).
export const CASE_DECISION_KINDS = ['send_approval', 'money', 'scope', 'attendee', 'classify', 'security']
export function answerLabel(d) {
  return (d.options ?? []).find(o => o.id === d.answer)?.label ?? d.answer
}
export function decisionEntry(d) {
  if (!d?.answer || d.answer === 'hold') return null
  return {
    company: d.company, case_id: null, kind: 'decision', body: `대표 결정: ${d.question} → ${answerLabel(d)}`,
    actor: '대표', assignee: null, due_date: null, source: 'decision', source_ref: d.id,
    occurred_at: d.answered_at ?? new Date().toISOString(),
  }
}
// 판단 프롬프트에 넣을 한 줄
export const decisionLine = d => `${d.question} → ${answerLabel(d)} (${String(d.answered_at ?? '').slice(0, 10)})`
// 보낸 뒤 오래 답이 없는 결정은 접는다 — 계속 쌓이면 결정함이 막힌다. 저녁 요약에 접은 것을 알린다.
export const STALE_DECISION_DAYS = 14
export const isStaleDecision = (d, now = new Date()) => d.status === 'sent' && (now - new Date(d.created_at)) / 86_400_000 > STALE_DECISION_DAYS
