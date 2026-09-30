// ledger.mjs — 원장(*_mgmt_schedules) 행 계획. 닫힌 행은 되돌리지 않는다.
import { expandRule } from './rules.mjs'

export const tableFor = company => company === 'willow' ? 'willow_mgmt_schedules' : 'tensw_mgmt_schedules'
export const scheduleKey = (company, task, period, step) => `mgmt:${company}:${task}:${period}:${step}`
const fill = (title, period) => title.replaceAll('{period}', period)

// Ruling R1: 재무 동기화는 원래 마감일을 그대로 쓰지만 규칙은 shift 로 영업일을 옮긴다.
// 같은 납부 건이면 날짜가 며칠 어긋나도 흡수해야 하므로, 접두사가 같고 ±3일 안이면 흡수한다.
const ADOPT_WINDOW_DAYS = 3
const daysBetween = (a, b) => Math.abs((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

export function planOccurrences(rules, existingRows, { from, to, cal }) {
  const byKey = new Map(existingRows.filter(r => r.source_key).map(r => [r.source_key, r]))
  const insert = [], update = []
  for (const rule of rules) {
    for (const { date, period } of expandRule(rule.rule, from, to, cal)) {
      const key = scheduleKey(rule.company, rule.task_key, period, rule.step)
      const title = fill(rule.title, period)
      const found = byKey.get(key)
      if (found) {
        const patch = {}
        if (found.schedule_date !== date) patch.schedule_date = date
        if (found.title !== title) patch.title = title
        if (Object.keys(patch).length) update.push({ id: found.id, patch })
        continue
      }
      if (rule.adopt_prefix && existingRows.some(r => r.source_key?.startsWith(rule.adopt_prefix) && daysBetween(r.schedule_date, date) <= ADOPT_WINDOW_DAYS)) continue
      insert.push({
        title, schedule_date: date, type: 'deadline', category: 'other', source_key: key,
        origin: rule.origin ?? 'seed', recipe: rule.recipe ?? null, agent_state: 'planned',
        evidence: [], is_completed: false, rule_id: rule.id ?? null,
      })
    }
  }
  return { insert, update }
}

export function planMissed(rows, todayKey) {
  return rows
    .filter(r => !r.is_completed && ['planned', 'preparing'].includes(r.agent_state) && r.schedule_date < todayKey)
    .map(r => ({ id: r.id, patch: { agent_state: 'missed' } }))
}

export async function applyPlan(sb, table, plan, { dryRun = false, log = () => {} } = {}) {
  for (const row of plan.insert ?? []) {
    log(`추가 ${table} ${row.schedule_date} ${row.title}`)
    if (!dryRun) { const { error } = await sb.from(table).insert(row); if (error && error.code !== '23505') throw error }
  }
  for (const { id, patch } of plan.update ?? []) {
    log(`갱신 ${table} ${id} ${JSON.stringify(patch)}`)
    if (!dryRun) { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error }
  }
}
