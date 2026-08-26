#!/usr/bin/env node
// Loads a card artifact into the company's approvals table.
//
//   node scripts/import-local-card.mjs --company tensw [--dry]
//
// Which card issuer a company holds comes from the registry, and each issuer
// brings its own mapper because the two sites hand back completely different
// field names.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { financeCompany } from './lib/tensw-local-finance.mjs'
import { mapWooriCardApproval, validateWooriCardPayload } from './lib/woori-card-local.mjs'
import { wooriBillingRow } from './lib/woori-card-statement.mjs'
import { mapKbCardApproval, validateKbCardPayload } from './lib/kb-card-local.mjs'
import { kbBillingRow } from './lib/kb-card-statement.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const MAPPERS = {
  'woori-card': { map: mapWooriCardApproval, validate: validateWooriCardPayload, billing: wooriBillingRow },
  'kb-card': { map: mapKbCardApproval, validate: validateKbCardPayload, billing: kbBillingRow },
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : null
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// 청구내역(이용대금명세서)은 승인내역과 별개 파일이라, 있으면 함께 넣는다.
// 승인내역이 "언제 썼나"라면 이건 "언제 얼마가 빠져나가나"다.
async function importBilling(sb, company, config) {
  const mapper = MAPPERS[config.card.site]
  if (!mapper.billing) return

  const input = path.join(os.homedir(), 'logs', `${company}-local-finance`, config.card.statementFile)
  const statement = await fs.readFile(input, 'utf8').then(JSON.parse).catch(() => null)
  if (!statement) return

  // 카드사마다 명세서 JSON 모양이 달라, 로그는 원본이 아니라 매핑된 행을 읽는다.
  const row = mapper.billing(statement)
  const { data, error } = await sb
    .from(config.tables.cardBilling)
    .upsert(row, { onConflict: 'fingerprint' })
    .select('id')
  if (error) throw error

  console.log(
    `[local-card-import] billing ${row.billing_month}: `
    + `${Number(row.total_amount).toLocaleString()}원 결제일 ${row.payment_due_date} (rows=${data?.length ?? 0})`,
  )
}

async function run() {
  const company = argument('company') ?? 'tensw'
  const config = financeCompany(company)
  const mapper = MAPPERS[config.card.site]
  if (!mapper) throw new Error(`매퍼가 없는 카드사예요: ${config.card.site}`)

  const input = path.join(os.homedir(), 'logs', `${company}-local-finance`, config.card.approvalsFile)
  const payload = JSON.parse(await fs.readFile(input, 'utf8'))
  const summary = mapper.validate(payload)
  const rows = payload.rows.map(mapper.map)

  if (DRY_RUN) {
    console.log(
      `[local-card-import] dry company=${company}, card=${config.card.cardName}, `
      + `raw=${summary.raw_count}, effective=${summary.effective_count}, `
      + `net=${summary.net_krw_amount}, rows=${rows.length}`,
    )
    return
  }

  const sb = supabaseClient()
  const { data, error } = await sb
    .from(config.tables.cardApprovals)
    .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
    .select('id')
  if (error) throw error

  console.log(
    `[local-card-import] company=${company}, card=${config.card.cardName}, rows=${rows.length}, `
    + `newly_inserted=${data?.length ?? 0}, effective=${summary.effective_count}, net=${summary.net_krw_amount}`,
  )

  await importBilling(sb, company, config)
}

run().catch(error => {
  console.error(`[local-card-import] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
