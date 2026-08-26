#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { localTaxInvoiceRow } from './lib/daily-finance-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.HOME || '/Users/dongwookkim'
const INPUT = path.join(HOME, 'logs', 'tensw-local-finance', 'latest-tax-invoices.json')
const DRY_RUN = process.argv.includes('--dry')

dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function run() {
  const payload = JSON.parse(await fs.readFile(INPUT, 'utf8'))
  const invoices = [...(payload.sales ?? []), ...(payload.purchases ?? [])]
  const rows = invoices.map(localTaxInvoiceRow)

  if (rows.length === 0) throw new Error('홈택스 로컬 수집 결과가 비어 있어요.')
  if (rows.some(row => !row.reporting_date || !row.transe_type)) {
    throw new Error('홈택스 로컬 수집 결과 검증에 실패했어요.')
  }

  if (DRY_RUN) {
    console.log(`[local-tax-import] dry run: invoices=${rows.length}`)
    return
  }

  const { data, error } = await client()
    .from('tensw_codef_tax_invoices')
    .upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
    .select('id')
  if (error) throw error

  console.log(`[local-tax-import] invoices=${rows.length}, newly_inserted=${data?.length ?? 0}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
