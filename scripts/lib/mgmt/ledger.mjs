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
        // 사람이 적은 행(origin manual)은 날짜·제목을 사람 것 그대로 둔다.
        if (found.origin === 'manual') continue
        const patch = {}
        if (found.schedule_date !== date) patch.schedule_date = date
        if (found.title !== title) patch.title = title
        if (Object.keys(patch).length) update.push({ id: found.id, patch })
        continue
      }
      // 같은 회차를 가리키는 키(접두사 + 대상 월)가 있으면 날짜와 상관없이 그 행을 쓴다.
      if (rule.adopt_prefix && byKey.has(`${rule.adopt_prefix}${period}`)) continue
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

// onWrite(table, row): 쓰기가 성공한 뒤 DB 가 돌려준 행으로 부른다(교훈 장부의 snapshot 용).
// onWrite 가 있을 때만 .select('*').single() 로 행을 돌려받는다. 23505(이미 있음)는 쓴 게 아니므로 부르지 않는다.
export async function applyPlan(sb, table, plan, { dryRun = false, log = () => {}, onWrite = null } = {}) {
  for (const row of plan.insert ?? []) {
    log(`추가 ${table} ${row.schedule_date} ${row.title}`)
    if (dryRun) continue
    if (onWrite) {
      const { data, error } = await sb.from(table).insert(row).select('*').single()
      if (error && error.code !== '23505') throw error
      if (!error && data) await onWrite(table, data)
    } else { const { error } = await sb.from(table).insert(row); if (error && error.code !== '23505') throw error }
  }
  for (const { id, patch } of plan.update ?? []) {
    log(`갱신 ${table} ${id} ${JSON.stringify(patch)}`)
    if (dryRun) continue
    if (onWrite) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select('*').single()
      if (error) throw error
      if (data) await onWrite(table, data)
    } else { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) throw error }
  }
}
