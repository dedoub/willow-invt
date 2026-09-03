import assert from 'node:assert/strict'
import test from 'node:test'
import { formatB2bRef, parseB2bRef } from './ids.mjs'

test('formats work ref_no with no kind segment', () => {
  assert.equal(formatB2bRef({ provider: 'willow', client: 'tensw', kind: 'work', year: 2026, seq: 14 }), 'WT-2026-014')
})

test('formats engagement ref_no with E segment', () => {
  assert.equal(formatB2bRef({ provider: 'willow', client: 'tensw', kind: 'engagement', year: 2026, seq: 2 }), 'WT-E-2026-002')
})

test('formats settlement ref_no with S segment', () => {
  assert.equal(formatB2bRef({ provider: 'willow', client: 'tensw', kind: 'settlement', year: 2026, seq: 3 }), 'WT-S-2026-003')
})

test('seq beyond 999 widens instead of truncating', () => {
  assert.equal(formatB2bRef({ provider: 'willow', client: 'tensw', kind: 'engagement', year: 2026, seq: 1234 }), 'WT-E-2026-1234')
})

test('rejects unknown company', () => {
  assert.throws(() => formatB2bRef({ provider: 'nope', client: 'tensw', kind: 'work', year: 2026, seq: 1 }), /unknown company: nope/)
  assert.throws(() => formatB2bRef({ provider: 'willow', client: 'nope', kind: 'work', year: 2026, seq: 1 }), /unknown company: nope/)
})

test('rejects unknown kind', () => {
  assert.throws(() => formatB2bRef({ provider: 'willow', client: 'tensw', kind: 'invoice', year: 2026, seq: 1 }), /unknown kind: invoice/)
})

test('round-trips work/engagement/settlement refs through parse', () => {
  assert.deepEqual(parseB2bRef('WT-2026-014'), { provider: 'W', client: 'T', kind: 'work', year: 2026, seq: 14 })
  assert.deepEqual(parseB2bRef('WT-E-2026-002'), { provider: 'W', client: 'T', kind: 'engagement', year: 2026, seq: 2 })
  assert.deepEqual(parseB2bRef('WT-S-2026-003'), { provider: 'W', client: 'T', kind: 'settlement', year: 2026, seq: 3 })
})

test('parses widened seq back', () => {
  assert.deepEqual(parseB2bRef('WT-E-2026-1234'), { provider: 'W', client: 'T', kind: 'engagement', year: 2026, seq: 1234 })
})

test('parse returns null for garbage', () => {
  assert.equal(parseB2bRef('garbage'), null)
  assert.equal(parseB2bRef(''), null)
  assert.equal(parseB2bRef(undefined), null)
})
