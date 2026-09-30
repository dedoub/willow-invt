// infer.mjs — 메일·현금·완료 일정에서 "매달 비슷한 날" 반복을 찾아 규칙 후보로 만든다.
import { createHash } from 'node:crypto'
import { redact } from './redact.mjs'

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/gi

export function normalizeSubject(s) {
  return String(s ?? '').replace(/^\s*((re|fwd?|회신|전달)\s*:\s*)+/i, '').replace(MONTHS, '')
    .replace(/\d+\s*(월분|월|분)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

const circularDistance = (a, b) => Math.min(Math.abs(a - b), 31 - Math.abs(a - b))
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }

const coveredBySeed = (ev, rules) => rules.some(r => {
  if (r.company !== ev.company || !r.completion) return false
  const counterpartyMatch = (r.completion.to && ev.to && ev.to.includes(r.completion.to)) ||
    (r.completion.counterparty && ev.counterparty && ev.counterparty.includes(r.completion.counterparty))
  if (!counterpartyMatch) return false
  // If seed has a subject, candidate label must contain it
  if (r.completion.subject) {
    const normalizedLabel = normalizeSubject(ev.label || '')
    return normalizedLabel.includes(r.completion.subject)
  }
  return true
})

export function inferRules(events, { existingRules = [], minMonths = 2, spread = 4 } = {}) {
  const groups = new Map()
  for (const e of events) {
    const keyWithCompany = `${e.company}|${e.key}`
    if (!groups.has(keyWithCompany)) groups.set(keyWithCompany, [])
    groups.get(keyWithCompany).push(e)
  }
  const out = []
  for (const [keyWithCompany, evs] of groups) {
    const [, key] = keyWithCompany.split('|')
    const byMonth = new Map()
    for (const e of evs.sort((a, b) => a.date.localeCompare(b.date))) if (!byMonth.has(e.date.slice(0, 7))) byMonth.set(e.date.slice(0, 7), e)
    const firsts = [...byMonth.values()]
    if (firsts.length < minMonths) continue
    let daysOf = firsts.map(e => Number(e.date.slice(8, 10)))

    // Circular distance: check if dates wrap around month boundary
    let actual = 0
    for (let i = 0; i < daysOf.length; i++) {
      for (let j = i + 1; j < daysOf.length; j++) {
        actual = Math.max(actual, circularDistance(daysOf[i], daysOf[j]))
      }
    }

    if (actual > spread) continue

    // Rotate days <15 by +31 to make cluster contiguous if wrapping
    const hasWrapped = daysOf.some(d => d > 25) && daysOf.some(d => d < 7)
    if (hasWrapped) {
      daysOf = daysOf.map(d => d < 15 ? d + 31 : d)
    }

    const e0 = firsts[0]
    if (coveredBySeed(e0, existingRules)) continue
    const task_key = `inferred-${createHash('sha1').update(`${e0.company}:${key}`).digest('hex').slice(0, 8)}`
    if (existingRules.some(r => r.company === e0.company && r.task_key === task_key)) continue
    const completion = e0.kind === 'cash' ? { kind: 'cash', table: e0.table, counterparty: e0.counterparty }
      : e0.kind === 'done_schedule' ? null
      : { kind: e0.kind, context: e0.context, ...(e0.to ? { to: e0.to } : {}), ...(e0.subject ? { subject: e0.subject } : {}) }

    const medianDay = median(daysOf)
    const finalDay = hasWrapped && medianDay > 31 ? medianDay - 31 : medianDay

    out.push({ company: e0.company, task_key, step: 'do', title: redact(e0.label).text, rule: { kind: 'monthly_day', day: finalDay, shift: 'next' },
      lead_days: 1, recipe: null, completion, origin: 'inferred',
      confidence: Math.round(Math.min(1, firsts.length / 4) * (1 - actual / 10) * 100) / 100,
      evidence: firsts.map(e => ({ ref: e.ref, date: e.date })) })
  }
  return out
}
