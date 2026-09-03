import assert from 'node:assert/strict'
import test from 'node:test'
import { fillTemplate } from './bundle.mjs'

test('fillTemplate substitutes without interpreting $-sequences in the value', () => {
  // String.replace/replaceAll treat a plain-string replacement's $&, $$, $` as match references.
  // fillTemplate must insert values verbatim regardless.
  const value = "text with $& and $$ and $` and $' inside"
  const out = fillTemplate('before {{x}} after', { x: value })
  assert.equal(out, `before ${value} after`)
})

test('fillTemplate replaces every occurrence of the same key', () => {
  const out = fillTemplate('{{ref}} / {{ref}}', { ref: 'WT-S-2026-014' })
  assert.equal(out, 'WT-S-2026-014 / WT-S-2026-014')
})

test('fillTemplate leaves unknown placeholders untouched', () => {
  const out = fillTemplate('{{known}} {{unknown}}', { known: 'x' })
  assert.equal(out, 'x {{unknown}}')
})

test('fillTemplate treats null/undefined values as empty string', () => {
  const out = fillTemplate('[{{a}}][{{b}}]', { a: null, b: undefined })
  assert.equal(out, '[][]')
})
