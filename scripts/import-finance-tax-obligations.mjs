#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { normalizeObligation } from './lib/tax-obligation-matcher.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

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
  const company = argument('company')
  const source = argument('source')
  const input = argument('input')
  if (!['tensw', 'willow'].includes(company) || !['hometax', 'wetax', 'nhis'].includes(source) || !input) {
    throw new Error('--company tensw|willow --source hometax|wetax|nhis --input FILE 이 필요해요.')
  }

  const payload = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'))
  const obligations = Array.isArray(payload) ? payload : payload.obligations
  if (!Array.isArray(obligations)) throw new Error('입력 JSON에 obligations 배열이 없어요.')

  const rows = obligations.map(item => normalizeObligation({ ...item, company, source }))
  if (rows.some(row => !row.title || !row.agency || !Number.isFinite(row.amount))) {
    throw new Error('세금 고지 필수값(title, agency, amount) 검증에 실패했어요.')
  }

  if (process.argv.includes('--dry')) {
    console.log(`[tax-obligation-import] dry run: company=${company}, source=${source}, rows=${rows.length}`)
    return
  }

  const { data, error } = await supabaseClient()
    .from('finance_tax_obligations')
    .upsert(rows, { onConflict: 'company,source,fingerprint' })
    .select('id')
  if (error) throw error

  console.log(`[tax-obligation-import] company=${company}, source=${source}, rows=${data?.length ?? 0}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : JSON.stringify(error))
  process.exitCode = 1
})
