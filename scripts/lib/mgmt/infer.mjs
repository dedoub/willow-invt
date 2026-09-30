// infer.mjs — 메일·현금·완료 일정에서 "매달 비슷한 날" 반복을 찾아 규칙 후보로 만든다.
import { createHash } from 'node:crypto'
import { redact } from './redact.mjs'

const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/gi

export function normalizeSubject(s) {
  return String(s ?? '').replace(/^\s*((re|fwd?|회신|전달)\s*:\s*)+/i, '').replace(MONTHS, '')
    .replace(/\d+\s*(월분|월|분)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim()
}

// C2 가드레일. 세금·보험·급여는 씨앗 규칙이 이미 맡는다(제목의 숫자는 정규화로 빠지므로 '4대보험'은 '대보험'으로도 본다).
export const SEED_COVERED_WORDS = ['국세', '지방세', '원천', '소득세', '국민연금', '건강보험', '고용보험', '산재', '4대보험', '대보험', '부가세', '급여']
// 개인·가족·개인투자·잡음 — 규칙으로도, judge 입력으로도 쓰지 않는다(I9 isPersonalItem 과 같은 목록).
export const PERSONAL_WORDS = ['류하', '김류하', '가족', '증권', '거래내역', '미래에셋', '병원', '보안 위험', 'security alert', '로그인 알림']
const hasAny = (text, words) => { const t = String(text ?? '').toLowerCase(); return words.some(w => t.includes(w.toLowerCase())) }
const candidateText = ev => [ev.counterparty, ev.label, ev.subject].filter(Boolean).join(' ')
export const isSeedCoveredWord = ev => hasAny(candidateText(ev), SEED_COVERED_WORDS)
export const isPersonalCandidate = ev => hasAny(candidateText(ev), PERSONAL_WORDS)
// 순수 판정: 규칙 후보에서 뺄 이벤트인가(씨앗이 맡는 세금·보험·급여, 또는 개인·잡음).
export function isExcludedCandidate(ev) {
  return isSeedCoveredWord(ev) || isPersonalCandidate(ev)
}

// 실행당 새 추론 규칙 상한·신뢰 하한·최소 개월.
export const INFER_LIMIT = 5
export const MIN_CONFIDENCE = 0.6
export const MIN_MONTHS = 3

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

export function inferRules(events, { existingRules = [], minMonths = MIN_MONTHS, spread = 4, minConfidence = MIN_CONFIDENCE, limit = INFER_LIMIT } = {}) {
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
    if (isExcludedCandidate(e0) || coveredBySeed(e0, existingRules)) continue
    const task_key = `inferred-${createHash('sha1').update(`${e0.company}:${key}`).digest('hex').slice(0, 8)}`
    if (existingRules.some(r => r.company === e0.company && r.task_key === task_key)) continue
    const completion = e0.kind === 'cash' ? { kind: 'cash', table: e0.table, counterparty: e0.counterparty }
      : e0.kind === 'done_schedule' ? null
      : { kind: e0.kind, context: e0.context, ...(e0.to ? { to: e0.to } : {}), ...(e0.subject ? { subject: e0.subject } : {}) }

    const medianDay = median(daysOf)
    const finalDay = hasWrapped && medianDay > 31 ? medianDay - 31 : medianDay

    const confidence = Math.round(Math.min(1, firsts.length / 4) * (1 - actual / 10) * 100) / 100
    if (confidence < minConfidence) continue
    out.push({ company: e0.company, task_key, step: 'do', title: redact(e0.label).text, rule: { kind: 'monthly_day', day: finalDay, shift: 'next' },
      lead_days: 1, recipe: null, completion, origin: 'inferred', confidence,
      evidence: firsts.map(e => ({ ref: e.ref, date: e.date })) })
  }
  // 신뢰 높은 것부터, 실행당 limit 개까지만.
  return out.sort((a, b) => b.confidence - a.confidence || b.evidence.length - a.evidence.length).slice(0, limit)
}
