// tune.mjs — 규칙이 실제와 어긋나면 스스로 고친다. 고친 것은 교훈으로 남긴다.
const dayDiff = (doneKey, planKey) => Math.round((new Date(`${doneKey}T00:00:00Z`) - new Date(`${planKey}T00:00:00Z`)) / 86_400_000)
// 거절되지 않고(at 있는) 마지막 증빙의 날짜. 대표가 거절한 증빙은 완료 근거로 보지 않는다.
const doneDate = o => (o.evidence ?? []).filter(e => e?.kind !== 'rejected' && e?.at).at(-1)?.at?.slice(0, 10) ?? null

export function planTuning(rule, occurrences) {
  const recent = [...occurrences].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))
  const last2 = recent.slice(-2), last3 = recent.slice(-3)
  if (last2.length === 2 && last2.every(o => o.agent_state === 'missed'))
    return [{ kind: 'ask_disable', lesson: `"${rule.task_key}/${rule.step}" 규칙이 두 번 연속 빠졌다` }]
  if (rule.origin === 'inferred' && last2.length === 2 && last2.every(o => !o.is_completed))
    return [{ kind: 'deactivate', lesson: `추정 규칙 "${rule.title ?? rule.task_key}" 는 두 회차 근거가 없어 껐다` }]
  if (last3.length === 3 && last3.every(o => o.is_completed && doneDate(o))) {
    const diffs = last3.map(o => dayDiff(doneDate(o), o.schedule_date))
    // 사람이 날짜를 직접 적은(origin manual) 회차는 규칙의 날짜에 대해 아무것도 말해주지 않으므로 제외.
    const allRuleDated = last3.every(o => o.origin !== 'manual')
    if (allRuleDated && rule.rule?.kind === 'monthly_day' && diffs.every(d => Math.abs(d) > 2) && (diffs.every(d => d > 0) || diffs.every(d => d < 0))) {
      const to = Math.min(28, Math.max(1, rule.rule.day + Math.round(diffs.reduce((a, b) => a + b, 0) / 3)))
      return [{ kind: 'shift_day', to, lesson: `"${rule.title ?? rule.task_key}" 는 매월 ${rule.rule.day}일이 아니라 ${to}일쯤 끝난다(최근 3회)` }]
    }
    if (rule.origin === 'inferred') return [{ kind: 'confirm', confidence: 1 }]
  }
  return []
}
