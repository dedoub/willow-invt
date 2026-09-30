// rules.mjs — 반복 규칙을 날짜 회차로 편다.
import { dateKey, parseKey } from './calendar.mjs'

function months(fromKey, toKey) {
  const [fy, fm] = parseKey(fromKey), [ty, tm] = parseKey(toKey)
  const out = []
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) out.push([y, m])
  return out
}

function baseDate(rule, y, m, cal) {
  switch (rule.kind) {
    case 'monthly_day': return cal.shift(dateKey(y, m, Math.min(rule.day, cal.lastDay(y, m))), rule.shift)
    case 'month_end': return cal.shift(dateKey(y, m, cal.lastDay(y, m)), rule.shift ?? 'prev')
    case 'quarterly_day': return rule.months.includes(m) ? cal.shift(dateKey(y, m, Math.min(rule.day, cal.lastDay(y, m))), rule.shift) : null
    case 'yearly_date': return rule.month === m ? cal.shift(dateKey(y, m, Math.min(rule.day, cal.lastDay(y, m))), rule.shift) : null
    case 'business_days_before': {
      const a = baseDate(rule.anchor, y, m, cal)
      return a ? cal.backBusinessDays(a, rule.n) : null
    }
    default: throw new Error(`알 수 없는 규칙: ${rule.kind}`)
  }
}

function periodOf(y, m, offset = 0) {
  const t = new Date(Date.UTC(y, m - 1 - offset, 1))
  return t.toISOString().slice(0, 7)
}

export function expandRule(rule, fromKey, toKey, cal) {
  const out = []
  for (const [y, m] of months(fromKey, toKey)) {
    const d = baseDate(rule, y, m, cal)
    if (d && d >= fromKey && d <= toKey) out.push({ date: d, period: periodOf(y, m, rule.period_offset ?? 0) })
  }
  return out
}
