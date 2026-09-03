import { COMPANY_INITIAL, REF_KINDS } from './constants.mjs'

const KIND_BY_SEGMENT = Object.fromEntries(Object.entries(REF_KINDS).map(([kind, seg]) => [seg, kind]))

export function formatB2bRef({ provider, client, kind, year, seq }) {
  const providerInitial = COMPANY_INITIAL[provider]
  if (!providerInitial) throw new Error(`unknown company: ${provider}`)
  const clientInitial = COMPANY_INITIAL[client]
  if (!clientInitial) throw new Error(`unknown company: ${client}`)
  if (!(kind in REF_KINDS)) throw new Error(`unknown kind: ${kind}`)
  const seg = REF_KINDS[kind] ? `${REF_KINDS[kind]}-` : ''
  return `${providerInitial}${clientInitial}-${seg}${year}-${String(seq).padStart(3, '0')}`
}

const RE = /^([A-Z])([A-Z])-(?:([A-Z])-)?(\d{4})-(\d{3,})$/

export function parseB2bRef(ref) {
  const m = RE.exec(String(ref ?? ''))
  if (!m) return null
  const segment = m[3] ?? ''
  if (!(segment in KIND_BY_SEGMENT)) return null
  return {
    provider: m[1],
    client: m[2],
    kind: KIND_BY_SEGMENT[segment],
    year: Number(m[4]),
    seq: Number(m[5]),
  }
}
