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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const MAPPERS = {
  'woori-card': { map: mapWooriCardApproval, validate: validateWooriCardPayload },
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

  const { data, error } = await supabaseClient()
    .from(config.tables.cardApprovals)
    .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
    .select('id')
  if (error) throw error

  console.log(
    `[local-card-import] company=${company}, card=${config.card.cardName}, rows=${rows.length}, `
    + `newly_inserted=${data?.length ?? 0}, effective=${summary.effective_count}, net=${summary.net_krw_amount}`,
  )
}

run().catch(error => {
  console.error(`[local-card-import] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
