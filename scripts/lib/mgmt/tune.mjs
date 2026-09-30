// tune.mjs — 규칙이 실제와 어긋나면 스스로 고친다. 고친 것은 교훈으로 남긴다.
// 거절되지 않고(at 있는) 마지막 증빙의 날짜. 대표가 거절한 증빙은 완료 근거로 보지 않는다.
const doneDate = o => (o.evidence ?? []).filter(e => e?.kind !== 'rejected' && e?.at).at(-1)?.at?.slice(0, 10) ?? null

// monthly_day 규칙의 어긋남: 완료일의 '일'과 규칙의 **지금** day 사이 원형(31일) 거리, 부호 있음, -15..+15.
// schedule_date(그 회차가 실제로 언제 잡혔는지)가 아니라 day-of-month 만 본다 — shift_day 로 rule.day 를
// 이미 옮긴 뒤, 옛 schedule_date 그대로인 같은 회차를 다음 주에 다시 봐도 새 day 기준 어긋남이 0이 되어
// 또 옮기지 않는다(멱등). schedule_date 로 쟀다면 매주 같은 회차로 계속 밀려났을 것이다.
function circularDayDiff(doneDay, ruleDay) {
  return ((doneDay - ruleDay + 15 + 31) % 31) - 15
}

// today: KST 'YYYY-MM-DD'. 주면 아직 마감 안 된(오늘 이상) 회차는 계산에서 뺀다(방어적 이중 필터 —
// stepTune 이 이미 걸러도 여기서 한 번 더). lastKeepAt: 이 규칙의 rule_review 에 가장 최근 '유지'로
// 답한 시각(ISO). 그보다 앞선 빠짐만으로는 다시 묻지 않는다(같은 빠짐을 되풀이해서 묻지 않는다).
export function planTuning(rule, occurrences, { today = null, lastKeepAt = null } = {}) {
  const eligible = today ? occurrences.filter(o => o.schedule_date < today) : occurrences
  const recent = [...eligible].sort((a, b) => a.schedule_date.localeCompare(b.schedule_date))
  const last2 = recent.slice(-2), last3 = recent.slice(-3)
  if (last2.length === 2 && last2.every(o => o.agent_state === 'missed')) {
    const stale = lastKeepAt && !last2.every(o => o.schedule_date > String(lastKeepAt).slice(0, 10))
    // stale(유지 답변보다 앞선 빠짐뿐) 이면 다시 묻지도, 아래 deactivate 로 흘러 조용히 끄지도 않는다 — 그대로 둔다.
    if (!stale) return [{ kind: 'ask_disable', lesson: `"${rule.task_key}/${rule.step}" 규칙이 두 번 연속 빠졌다` }]
    return []
  }
  // 추정 규칙 + 두 회차 모두 근거 없음(missed 아닌, 아직 완료되지 않은) → 조용히 끈다.
  // missed 두 번은 위에서 먼저 걸러 ask_disable 로 가므로(대표에게 물음), 여기 오는 건 missed 로
  // 표시되기 전 상태(아직 marked 안 된 지난 회차 등)뿐이다.
  if (rule.origin === 'inferred' && last2.length === 2 && last2.every(o => !o.is_completed))
    return [{ kind: 'deactivate', lesson: `추정 규칙 "${rule.title ?? rule.task_key}" 는 두 회차 근거가 없어 껐다` }]
  if (last3.length === 3 && last3.every(o => o.is_completed && doneDate(o))) {
    // 사람이 날짜를 직접 적은(origin manual) 회차는 규칙의 날짜에 대해 아무것도 말해주지 않으므로 제외.
    const allRuleDated = last3.every(o => o.origin !== 'manual')
    if (allRuleDated && rule.rule?.kind === 'monthly_day') {
      const diffs = last3.map(o => circularDayDiff(Number(doneDate(o).slice(8, 10)), rule.rule.day))
      if (diffs.every(d => Math.abs(d) > 2) && (diffs.every(d => d > 0) || diffs.every(d => d < 0))) {
        const to = Math.min(28, Math.max(1, rule.rule.day + Math.round(diffs.reduce((a, b) => a + b, 0) / 3)))
        return [{ kind: 'shift_day', to, lesson: `"${rule.title ?? rule.task_key}" 는 매월 ${rule.rule.day}일이 아니라 ${to}일쯤 끝난다(최근 3회)` }]
      }
    }
    if (rule.origin === 'inferred') return [{ kind: 'confirm', confidence: 1 }]
  }
  return []
}
