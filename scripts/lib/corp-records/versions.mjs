import { createHash } from 'node:crypto'

const EXT = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/zip': 'zip',
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function extensionForMime(mime) {
  return EXT[mime] ?? 'bin'
}

export function buildStoragePath({ company, docNo, versionNo, sha256, mime }) {
  return `${company}/${docNo}/v${versionNo}_${sha256.slice(0, 8)}.${extensionForMime(mime)}`
}

export function nextVersionNo(existing) {
  return existing.reduce((max, v) => Math.max(max, Number(v.version_no) || 0), 0) + 1
}

export function assertNewVersionAllowed(existing, { sha256, kind }) {
  const dup = existing.find(v => v.sha256 === sha256)
  if (dup) throw new Error(`identical content already stored as v${dup.version_no}`)
  if (kind === 'draft' && existing.some(v => v.kind === 'final_signed')) {
    throw new Error('final_signed version exists; add a new final_signed or reissue instead of a draft')
  }
}
