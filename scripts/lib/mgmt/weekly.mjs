// weekly.mjs — 한 주 성적표와, 반복되는데 레시피가 없는 일을 스킬 후보로.
export function scorecard({ from, to, writes, reverts, closedByEvidence, missed, asked, reused, judgeFailures }) {
  const revertRate = Math.round((reverts / Math.max(1, writes)) * 100) / 100
  const text = [
    `경영관리 주간 점검 (${from}~${to})`,
    `쓴 일정 ${writes} · 근거로 닫음 ${closedByEvidence} · 되돌림 ${reverts} (${Math.round(revertRate * 100)}%)`,
    `빠짐 ${missed} · 물어본 결정 ${asked} · 지난 판단 재사용 ${reused} · 해석 실패 ${judgeFailures}`,
  ].join('\n')
  return { text, revertRate }
}

export const normalizeTodo = s => String(s ?? '').replace(/\([^)]*\)/g, '').replace(/[\d,.]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 20)

// entries = mgmt_entries 의 kind='todo', assignee 에 김동욱 포함, occurred_at 최근 days 일.
// 묶는 키 = company + ':' + normalizeTodo(body). recipes 에 이름이 들어간 항목(레시피 있음)은 후보에서 뺀다.
export function skillCandidates(entries, recipes, { now = new Date(), minCount = 3, days = 28 } = {}) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const groups = new Map()
  for (const e of entries) {
    if (e.kind !== 'todo' || !(e.assignee ?? '').includes('김동욱') || e.occurred_at < since) continue
    const label = normalizeTodo(e.body)
    if (!label || recipes.some(r => label.includes(r))) continue
    const key = `${e.company}:${label}`
    if (!groups.has(key)) groups.set(key, { key, label, count: 0, refs: [] })
    const g = groups.get(key); g.count++; g.refs.push(e.source_ref)
  }
  return [...groups.values()].filter(g => g.count >= minCount).sort((a, b) => b.count - a.count)
}
