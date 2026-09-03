import { COMPANY_PREFIX } from './constants.mjs'

const KINDS = { decision: '', document: 'DOC' }

export function formatRefNo({ company, kind, year, seq }) {
  const prefix = COMPANY_PREFIX[company]
  if (!prefix) throw new Error(`unknown company: ${company}`)
  if (!(kind in KINDS)) throw new Error(`unknown kind: ${kind}`)
  const seg = KINDS[kind] ? `${KINDS[kind]}-` : ''
  return `${prefix}-${seg}${year}-${String(seq).padStart(3, '0')}`
}

const RE = /^([A-Z]{2})-(?:(DOC)-)?(\d{4})-(\d{3,})$/

export function parseRefNo(refNo) {
  const m = RE.exec(String(refNo ?? ''))
  if (!m) return null
  return { prefix: m[1], kind: m[2] === 'DOC' ? 'document' : 'decision', year: Number(m[3]), seq: Number(m[4]) }
}
