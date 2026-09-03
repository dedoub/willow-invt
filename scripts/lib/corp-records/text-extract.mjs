import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function guessMime(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

export async function extractPdfText(buffer) {
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = String(result?.text ?? '').replace(/-- \d+ of \d+ --/g, '').replace(/[ \t]+/g, ' ').trim()
    return text
  } finally {
    await parser.destroy?.()
  }
}

export function extractDocxText(path) {
  const unzip = spawnSync('unzip', ['-p', path, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (unzip.status !== 0) throw new Error(`unzip failed for ${path}: ${unzip.stderr}`)
  return unzip.stdout
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .split('\n').filter(line => line.trim()).join('\n')
}

export function convertDocxToPdf(path, outDir) {
  const out = join(outDir, basename(path).replace(/\.docx$/i, '.pdf'))
  if (existsSync(out)) return out
  const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, path], { encoding: 'utf8' })
  if (r.status !== 0 || !existsSync(out)) throw new Error(`soffice convert failed for ${path}: ${r.stderr || r.stdout}`)
  return out
}
