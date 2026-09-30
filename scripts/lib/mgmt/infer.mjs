// infer.mjs — メール·現金·完了スケジュールから"매달 비슷한 날" 반복を見つけて規則候補として作成する。
import { createHash } from 'node:crypto'

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/gi

export function normalizeSubject(s) {
  return String(s ?? '').replace(/^\s*((re|fwd?|회신|전달)\s*:\s*)+/i, '').replace(MONTHS, '')
    .replace(/\d+\s*(월분|월|분)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }
const coveredBySeed = (ev, rules) => rules.some(r => r.company === ev.company && r.completion && (
  (r.completion.to && ev.to && ev.to.includes(r.completion.to)) ||
  (r.completion.counterparty && ev.counterparty && ev.counterparty.includes(r.completion.counterparty))))

export function inferRules(events, { existingRules = [], minMonths = 2, spread = 4 } = {}) {
  const groups = new Map()
  for (const e of events) {
    if (!groups.has(e.key)) groups.set(e.key, [])
    groups.get(e.key).push(e)
  }
  const out = []
  for (const [key, evs] of groups) {
    const byMonth = new Map()
    for (const e of evs.sort((a, b) => a.date.localeCompare(b.date))) if (!byMonth.has(e.date.slice(0, 7))) byMonth.set(e.date.slice(0, 7), e)
    const firsts = [...byMonth.values()]
    if (firsts.length < minMonths) continue
    const daysOf = firsts.map(e => Number(e.date.slice(8, 10)))
    const actual = Math.max(...daysOf) - Math.min(...daysOf)
    if (actual > spread) continue
    const e0 = firsts[0]
    if (coveredBySeed(e0, existingRules)) continue
    const task_key = `inferred-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`
    if (existingRules.some(r => r.company === e0.company && r.task_key === task_key)) continue
    const completion = e0.kind === 'cash' ? { kind: 'cash', table: e0.table, counterparty: e0.counterparty }
      : e0.kind === 'done_schedule' ? null
      : { kind: e0.kind, context: e0.context, ...(e0.to ? { to: e0.to } : {}), ...(e0.subject ? { subject: e0.subject } : {}) }
    out.push({ company: e0.company, task_key, step: 'do', title: e0.label, rule: { kind: 'monthly_day', day: median(daysOf), shift: 'next' },
      lead_days: 1, recipe: null, completion, origin: 'inferred',
      confidence: Math.round(Math.min(1, firsts.length / 4) * (1 - actual / 10) * 100) / 100,
      evidence: firsts.map(e => ({ ref: e.ref, date: e.date })) })
  }
  return out
}
