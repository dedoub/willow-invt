#!/usr/bin/env -S npx tsx
// 법인 서류함 CLI — 모든 쓰기는 이 스크립트를 통해서만 한다.
// spec: docs/superpowers/specs/2026-09-03-corp-records-design.md §8
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import { createCorpDb } from './lib/corp-records/db.mjs'
import { extractPdfText, extractDocxText, convertDocxToPdf, guessMime } from './lib/corp-records/text-extract.mjs'
import { runSeed } from './lib/corp-records/seed.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env.local'), quiet: true })

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    company: { type: 'string', default: 'willow' },
    'as-of': { type: 'string' }, facts: { type: 'string' }, source: { type: 'string' }, key: { type: 'string' },
    at: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, version: { type: 'string' },
    from: { type: 'string' }, to: { type: 'string' }, text: { type: 'string' }, doc: { type: 'string' },
    parent: { type: 'string' }, note: { type: 'string' }, category: { type: 'string' },
    issued: { type: 'string' }, 'issued-by': { type: 'string' }, 'valid-from': { type: 'string' }, 'valid-to': { type: 'string' },
    counterparty: { type: 'string' }, 'contract-start': { type: 'string' }, 'contract-end': { type: 'string' }, tags: { type: 'string' },
    kind: { type: 'string' }, file: { type: 'string' }, convert: { type: 'boolean', default: false },
    status: { type: 'string' }, desc: { type: 'string' }, due: { type: 'string' }, result: { type: 'string' },
    manifest: { type: 'string' },
  },
})

const [cmd, sub, arg] = positionals
const company = flags.company as string
const db = createCorpDb({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, actor: process.env.CORP_ACTOR ?? 'cli' })

function need(name: string): string {
  const v = (flags as Record<string, unknown>)[name]
  if (v === undefined || v === '') throw new Error(`--${name} required`)
  return String(v)
}
function opt(name: string): string | null {
  const v = (flags as Record<string, unknown>)[name]
  return v === undefined ? null : String(v)
}
function out(v: unknown) { console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2)) }

async function readTextFlag(): Promise<string | null> {
  const p = opt('text')
  return p ? readFileSync(p, 'utf8') : null
}

async function main() {
  switch (`${cmd} ${sub ?? ''}`.trim()) {
    case 'profile show': return out(await db.latestProfile(company))
    case 'profile snapshot': {
      const facts = JSON.parse(readFileSync(need('facts'), 'utf8'))
      const source = opt('source') ? (await db.getDocument(opt('source')!)).id : null
      return out(await db.snapshotProfile({ company, asOf: need('as-of'), sourceDocumentId: source, facts, sourceKey: opt('key') }))
    }
    case 'rules list': {
      const at = opt('at')
      const rows = at ? await db.rulesEffectiveAt(company, at) : await db.listRules(company)
      return out(rows.map((r: any) => ({ id: r.id, rule_type: r.rule_type, title: r.title, v: r.version_no, from: r.effective_from, to: r.effective_to, articles: r.articles?.length, note: r.note })))
    }
    case 'rules register': {
      const documentId = opt('doc') ? (await db.getDocument(opt('doc')!)).id : null
      return out(await db.registerRule({
        company, ruleType: need('type'), title: need('title'), versionNo: Number(need('version')), effectiveFrom: need('from'), effectiveTo: opt('to'),
        parentRuleId: opt('parent'), documentId, contentText: (await readTextFlag()) ?? '', note: opt('note'), sourceKey: opt('key'),
      }))
    }
    case 'doc list': return out((await db.listDocuments({ company, docType: opt('type') ?? undefined })).map((d: any) => ({ doc_no: d.doc_no, type: d.doc_type, title: d.title, status: d.status, issued: d.issued_at, valid_to: d.valid_to, v: d.current?.version_no ?? 0 })))
    case 'doc new': return out(await db.createDocument({
      company, docType: need('type'), category: opt('category') ?? 'other', title: need('title'), issuedBy: opt('issued-by'), issuedAt: opt('issued'),
      validFrom: opt('valid-from'), validTo: opt('valid-to'), counterparty: opt('counterparty'), contractStart: opt('contract-start'), contractEnd: opt('contract-end'),
      tags: opt('tags')?.split(',').map(s => s.trim()).filter(Boolean) ?? [], sourceKey: opt('key'),
    }))
    case 'doc add-version': {
      if (!arg) throw new Error('doc_no required')
      let path = need('file')
      if (flags.convert && /\.docx$/i.test(path)) path = convertDocxToPdf(path, dirname(path))
      const buffer = readFileSync(path)
      const mime = guessMime(path)
      let contentText = await readTextFlag()
      if (!contentText && mime === 'application/pdf') contentText = await extractPdfText(buffer)
      if (!contentText && /\.docx$/i.test(need('file'))) contentText = extractDocxText(need('file'))
      const r = await db.addVersion({ docNo: arg, kind: need('kind'), buffer, mime, contentText, note: opt('note') })
      return out({ doc_no: arg, version_no: r.version.version_no, kind: r.version.kind, sha256: r.version.sha256, storage_path: r.version.storage_path, status: r.document.status })
    }
    case 'doc url': return out(await db.signedUrl(arg!, opt('version') ? Number(opt('version')) : undefined))
    case 'action list': return out(await db.listActions({ company, status: opt('status') === 'all' ? null : (opt('status') ?? 'pending') }))
    case 'action add': {
      const documentId = opt('doc') ? (await db.getDocument(opt('doc')!)).id : null
      return out(await db.addAction({ company, documentId, kind: need('kind'), description: need('desc'), dueAt: opt('due'), sourceKey: opt('key') }))
    }
    case 'action done': return out(await db.doneAction(arg!, opt('result') ? JSON.parse(opt('result')!) : null))
    case 'verify': {
      const chain = await db.verifyChain(company)
      const files = await db.verifyStoredVersions(company)
      const bad = files.filter((f: any) => !f.ok)
      const { orphans, missing } = await db.verifyOrphans(company)
      const { unchained } = await db.verifyChainCoverage(company)
      out({ chain, versions: files.length, corrupted: bad, orphans, missing, unchained })
      if (!chain.ok || bad.length || orphans.length || missing.length || unchained.length) process.exit(1)
      return
    }
    case 'seed': return out(await runSeed({ db, manifestPath: need('manifest'), root: ROOT, log: console.log }))
    default:
      console.error('usage: corp-records <profile|rules|doc|action|verify|seed> <sub> [flags]')
      process.exit(2)
  }
}

main().catch(e => { console.error(`❌ ${(e as Error).message}`); process.exit(1) })
