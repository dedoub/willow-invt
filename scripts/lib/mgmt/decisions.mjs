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
  if (decision.kind === 'send_approval') return null
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
