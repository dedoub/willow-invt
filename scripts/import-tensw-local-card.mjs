#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  mapWooriCardApproval,
  validateWooriCardPayload,
} from './lib/woori-card-local.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INPUT_PATH = path.join(os.homedir(), 'logs', 'tensw-local-finance', 'latest-woori-card-approvals.json')
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function run() {
  const payload = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'))
  const summary = validateWooriCardPayload(payload)
  const rows = payload.rows.map(mapWooriCardApproval)

  if (DRY_RUN) {
    console.log(
      `[woori-card-import] dry raw=${summary.raw_count}, effective=${summary.effective_count}, `
      + `net=${summary.net_krw_amount}, rows=${rows.length}`,
    )
    return
  }

  const { data, error } = await supabaseClient()
    .from('tensw_codef_card_approvals')
    .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
    .select('id')
  if (error) throw error

  console.log(
    `[woori-card-import] rows=${rows.length}, newly_inserted=${data?.length ?? 0}, `
    + `effective=${summary.effective_count}, net=${summary.net_krw_amount}`,
  )
}

run().catch(error => {
  console.error(`[woori-card-import] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
