import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRefNo, parseRefNo } from './ids.mjs'

test('formats decision ref_no with company prefix and 3-digit seq', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'decision', year: 2026, seq: 3 }), 'WI-2026-003')
  assert.equal(formatRefNo({ company: 'tensw', kind: 'decision', year: 2026, seq: 12 }), 'TS-2026-012')
})

test('formats document doc_no with DOC segment', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'document', year: 2026, seq: 12 }), 'WI-DOC-2026-012')
})

test('seq beyond 999 widens instead of truncating', () => {
  assert.equal(formatRefNo({ company: 'willow', kind: 'decision', year: 2026, seq: 1234 }), 'WI-2026-1234')
})

test('rejects unknown company or kind', () => {
  assert.throws(() => formatRefNo({ company: 'nope', kind: 'decision', year: 2026, seq: 1 }), /unknown company/)
  assert.throws(() => formatRefNo({ company: 'willow', kind: 'memo', year: 2026, seq: 1 }), /unknown kind/)
})

test('parses both shapes back', () => {
  assert.deepEqual(parseRefNo('WI-2026-003'), { prefix: 'WI', kind: 'decision', year: 2026, seq: 3 })
  assert.deepEqual(parseRefNo('WI-DOC-2026-012'), { prefix: 'WI', kind: 'document', year: 2026, seq: 12 })
  assert.equal(parseRefNo('garbage'), null)
})
