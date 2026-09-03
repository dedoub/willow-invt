import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, computeEventHash, verifyChain } from './hash-chain.mjs'
import { GENESIS_HASH } from './constants.mjs'

const base = { entityType: 'decision', entityId: 'd1', event: 'created', at: '2026-09-03T03:00:00.000Z' }

test('canonicalize sorts keys recursively so hash is order-independent', () => {
  assert.equal(canonicalize({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}')
  assert.equal(canonicalize(null), 'null')
})

test('computeEventHash is deterministic and 64 hex chars', () => {
  const h1 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1, y: 2 } })
  const h2 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { y: 2, x: 1 } })
  assert.equal(h1, h2)
  assert.match(h1, /^[0-9a-f]{64}$/)
  const h3 = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1, y: 3 } })
  assert.notEqual(h1, h3)
})

function chain(n) {
  const out = []
  let prev = GENESIS_HASH
  for (let i = 1; i <= n; i++) {
    const row = { id: i, prev_hash: prev, entity_type: 'decision', entity_id: `d${i}`, event: 'created', payload: { i }, at: `2026-09-03T03:00:0${i}.000Z` }
    row.hash = computeEventHash({ prevHash: prev, entityType: row.entity_type, entityId: row.entity_id, event: row.event, payload: row.payload, at: row.at })
    out.push(row)
    prev = row.hash
  }
  return out
}

test('verifyChain accepts an intact chain and an empty chain', () => {
  assert.deepEqual(verifyChain(chain(3)), { ok: true, brokenAt: null, count: 3 })
  assert.deepEqual(verifyChain([]), { ok: true, brokenAt: null, count: 0 })
})

test('verifyChain reports the first tampered row', () => {
  const rows = chain(4)
  rows[2].payload = { i: 99 }
  assert.deepEqual(verifyChain(rows), { ok: false, brokenAt: 3, count: 4 })
})

test('verifyChain reports a broken link (prev_hash mismatch)', () => {
  const rows = chain(3)
  rows[1].prev_hash = 'f'.repeat(64)
  assert.deepEqual(verifyChain(rows), { ok: false, brokenAt: 2, count: 3 })
})

test('computeEventHash normalizes timestamp rendering (Z vs +00:00)', () => {
  const a = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1 }, at: '2026-09-03T03:00:00.433Z' })
  const b = computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: { x: 1 }, at: '2026-09-03T03:00:00.433+00:00' })
  assert.equal(a, b)
  assert.throws(() => computeEventHash({ ...base, prevHash: GENESIS_HASH, payload: {}, at: 'nope' }), /invalid at/)
})
