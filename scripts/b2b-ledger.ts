#!/usr/bin/env -S npx tsx
// B2B 용역 거래 원장 CLI — 모든 쓰기는 이 스크립트를 통해서만 한다.
// spec: docs/superpowers/plans/2026-09-03-b2b-ledger-phase1.md
import { parseArgs } from 'node:util'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'
import { createB2bDb } from './lib/b2b-ledger/db.mjs'
import { buildBundle, registerBundle } from './lib/b2b-ledger/bundle.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env.local'), quiet: true })

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string' }, client: { type: 'string' }, title: { type: 'string' },
    scope: { type: 'string' }, 'rate-card': { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
    doc: { type: 'string' }, approval: { type: 'string' }, key: { type: 'string' },
    agreement: { type: 'string' }, project: { type: 'string' }, contract: { type: 'string' }, role: { type: 'string' },
    'fee-basis': { type: 'string' }, 'fee-percent': { type: 'string' }, 'fee-amount': { type: 'string' },
    basis: { type: 'string' }, billing: { type: 'string' }, agreed: { type: 'string' },
    engagement: { type: 'string' },
    requested: { type: 'string' }, request: { type: 'string' }, performed: { type: 'string' }, purpose: { type: 'string' },
    contacts: { type: 'string' },
    kind: { type: 'string' }, 'source-table': { type: 'string' }, 'source-id': { type: 'string' },
    url: { type: 'string' }, at: { type: 'string' },
    method: { type: 'string' }, factors: { type: 'string' }, computed: { type: 'string' }, by: { type: 'string' },
    period: { type: 'string' }, supply: { type: 'string' }, vat: { type: 'string' }, total: { type: 'string' },
    'invoice-willow': { type: 'string' }, 'invoice-tensw': { type: 'string' },
    work: { type: 'string' },
    confirmation: { type: 'string' }, statement: { type: 'string' },
    willow: { type: 'string' }, tensw: { type: 'string' },
    status: { type: 'string' },
  },
})

const [cmd, sub, arg] = positionals
const db = createB2bDb({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, actor: process.env.CORP_ACTOR ?? 'cli' })

function need(name: string): string {
  const v = (flags as Record<string, unknown>)[name]
  if (v === undefined || v === '') throw new Error(`--${name} required`)
  return String(v)
}
function opt(name: string): string | null {
  const v = (flags as Record<string, unknown>)[name]
  return v === undefined ? null : String(v)
}
// raw() preserves "flag absent" as undefined (vs opt()'s null) for functions that
// build partial-update patches by checking `!== undefined`.
function raw(name: string): string | undefined {
  const v = (flags as Record<string, unknown>)[name]
  return v === undefined ? undefined : String(v)
}
function rawList(name: string): string[] | undefined {
  const v = raw(name)
  return v === undefined ? undefined : v.split(',').map(s => s.trim()).filter(Boolean)
}
function needInt(name: string): number {
  const n = Number(need(name))
  if (!Number.isInteger(n)) throw new Error(`--${name} must be an integer`)
  return n
}
function optInt(name: string): number | null {
  const v = opt(name)
  if (v === null) return null
  const n = Number(v)
  if (!Number.isInteger(n)) throw new Error(`--${name} must be an integer`)
  return n
}
function readJson(name: string, def: unknown): unknown {
  const v = opt(name)
  if (v === null) return def
  if (v.endsWith('.json') && existsSync(v)) return JSON.parse(readFileSync(v, 'utf8'))
  return JSON.parse(v)
}
function out(v: unknown) { console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2)) }

async function doReconcile(ref: string) {
  const preview = await db.previewReconcile(ref)
  const sql = await db.reconcileSettlement(ref)
  out({ preview, sql })
  if (!sql.ok) process.exit(1)
}

async function main() {
  if (cmd === 'reconcile') {
    if (!sub) throw new Error('ref required')
    return doReconcile(sub)
  }
  if (cmd === 'bundle') {
    if (!sub) throw new Error('ref required')
    const built = await buildBundle(db, sub)
    return out(await registerBundle(db, sub, built))
  }

  switch (`${cmd} ${sub ?? ''}`.trim()) {
    case 'agreement new': return out(await db.createAgreement({
      provider: need('provider'), client: need('client'), title: need('title'),
      scope: readJson('scope', []), rateCard: readJson('rate-card', {}),
      effectiveFrom: need('from'), effectiveTo: opt('to'),
      documentDocNo: opt('doc'), approvalDecisionRef: opt('approval'), sourceKey: opt('key'),
    }))
    case 'agreement activate': return out(await db.activateAgreement(needArg(arg)))
    case 'agreement list': return out(await db.listAgreements({}))

    case 'engagement new': return out(await db.createEngagement({
      agreementId: need('agreement'), projectId: need('project'), clientContractId: opt('contract'),
      roleScope: readJson('role', []), feeBasis: need('fee-basis'),
      feePercent: optInt('fee-percent'), feeAmount: optInt('fee-amount'),
      basisText: need('basis'), billingPlan: readJson('billing', []),
      agreedAt: need('agreed'), documentDocNo: opt('doc'), sourceKey: opt('key'),
    }))
    case 'engagement list': return out(await db.listEngagements({ agreementId: need('agreement') }))
    case 'engagement show': return out(await db.getEngagement(needArg(arg)))

    case 'work new': return out(await db.createWork({
      agreementId: need('agreement'), engagementId: opt('engagement') ? (await db.getEngagement(opt('engagement')!)).id : null, projectId: opt('project'),
      title: need('title'), periodFrom: need('from'), periodTo: need('to'), requestedAt: opt('requested'),
      requestText: need('request'), performedText: need('performed'), purpose: opt('purpose'),
      contacts: readJson('contacts', []), sourceKey: opt('key'),
    }))
    case 'work confirm': return out(await db.confirmWork(needArg(arg)))
    case 'work evidence': return out(await db.addEvidence({
      workRef: needArg(arg), kind: need('kind'), sourceTable: opt('source-table'), sourceId: opt('source-id'),
      title: opt('title'), url: opt('url'), occurredAt: opt('at'), docNo: opt('doc'),
    }))
    case 'work price': return out(await db.priceWork({
      workRef: needArg(arg), method: need('method'), factors: readJson('factors', {}), basisText: need('basis'),
      computedAmount: optInt('computed'), agreedAmount: needInt('agreed'), decidedBy: opt('by'),
    }))

    case 'settle open': return out(await db.openSettlement({
      agreementId: need('agreement'), engagementId: opt('engagement') ? (await db.getEngagement(opt('engagement')!)).id : null, periodLabel: opt('period'),
      supplyAmount: needInt('supply'), vatAmount: needInt('vat'), totalAmount: optInt('total'),
      openedFrom: need('from'), taxInvoiceWillowId: opt('invoice-willow'), taxInvoiceTenswId: opt('invoice-tensw'),
      sourceKey: opt('key'),
    }))
    case 'settle attach': return out(await db.attachWork(needArg(arg), need('work').split(',').map(s => s.trim()).filter(Boolean)))
    case 'settle docs': return out(await db.setDocuments(needArg(arg), { confirmationDocNo: raw('confirmation'), statementDocNo: raw('statement') }))
    case 'settle invoices': return out(await db.linkInvoices(needArg(arg), { willowId: raw('willow'), tenswId: raw('tensw') }))
    case 'settle cash': return out(await db.linkCash(needArg(arg), { willowIds: rawList('willow'), tenswIds: rawList('tensw') }))
    case 'settle status': return out(await db.setStatus(needArg(arg), need('to')))
    case 'settle show': return out(await db.getSettlement(needArg(arg)))
    case 'settle list': return out(await db.listSettlements({ status: opt('status') ?? undefined }))

    default:
      console.error('usage: b2b-ledger <agreement|engagement|work|settle|reconcile|bundle> <sub> [flags]')
      process.exit(2)
  }
}

function needArg(v: string | undefined): string {
  if (!v) throw new Error('ref/id required')
  return v
}

main().catch(e => { console.error(`❌ ${(e as Error).message}`); process.exit(1) })
