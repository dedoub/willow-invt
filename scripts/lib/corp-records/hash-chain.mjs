import { createHash } from 'node:crypto'
import { GENESIS_HASH } from './constants.mjs'

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`
}

export function computeEventHash({ prevHash, entityType, entityId, event, payload, at }) {
  const atDate = new Date(at)
  if (Number.isNaN(atDate.getTime())) throw new Error('invalid at')
  const material = [prevHash, entityType, entityId, event, canonicalize(payload ?? {}), atDate.toISOString()].join('|')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

export function verifyChain(events) {
  let prev = GENESIS_HASH
  for (const row of events) {
    if (row.prev_hash !== prev) return { ok: false, brokenAt: row.id, count: events.length }
    const expected = computeEventHash({
      prevHash: row.prev_hash, entityType: row.entity_type, entityId: row.entity_id,
      event: row.event, payload: row.payload, at: row.at,
    })
    if (expected !== row.hash) return { ok: false, brokenAt: row.id, count: events.length }
    prev = row.hash
  }
  return { ok: true, brokenAt: null, count: events.length }
}
