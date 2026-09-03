import assert from 'node:assert/strict'
import test from 'node:test'
import { sha256Hex, extensionForMime, buildStoragePath, nextVersionNo, assertNewVersionAllowed } from './versions.mjs'

test('sha256Hex hashes bytes', () => {
  assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('extensionForMime maps known types and falls back to bin', () => {
  assert.equal(extensionForMime('application/pdf'), 'pdf')
  assert.equal(extensionForMime('image/png'), 'png')
  assert.equal(extensionForMime('image/jpeg'), 'jpg')
  assert.equal(extensionForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'docx')
  assert.equal(extensionForMime('text/weird'), 'bin')
})

test('buildStoragePath embeds doc_no, version and sha prefix', () => {
  const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  assert.equal(
    buildStoragePath({ company: 'willow', docNo: 'WI-DOC-2026-012', versionNo: 2, sha256: sha, mime: 'application/pdf' }),
    'willow/WI-DOC-2026-012/v2_ba7816bf.pdf',
  )
})

test('nextVersionNo continues from the highest existing version', () => {
  assert.equal(nextVersionNo([]), 1)
  assert.equal(nextVersionNo([{ version_no: 1 }, { version_no: 3 }]), 4)
})

test('assertNewVersionAllowed rejects duplicate content', () => {
  const existing = [{ version_no: 1, kind: 'draft', sha256: 'aa' }]
  assert.throws(() => assertNewVersionAllowed(existing, { sha256: 'aa', kind: 'final_signed' }), /identical content already stored as v1/)
})

test('assertNewVersionAllowed rejects a draft after a signed final exists', () => {
  const existing = [{ version_no: 1, kind: 'draft', sha256: 'aa' }, { version_no: 2, kind: 'final_signed', sha256: 'bb' }]
  assert.throws(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'draft' }), /final_signed version exists/)
  assert.doesNotThrow(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'reissue' }))
  assert.doesNotThrow(() => assertNewVersionAllowed(existing, { sha256: 'cc', kind: 'final_signed' }))
})
