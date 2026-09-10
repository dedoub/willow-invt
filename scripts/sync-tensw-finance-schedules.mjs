#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { syncTenswFinanceSchedules } from './lib/tensw-finance-schedule-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const dryRun = process.argv.includes('--dry')
const log = message => console.log(`[tensw-finance-schedule-sync] ${message}`)

syncTenswFinanceSchedules(sb, { dryRun, log })
  .then(result => {
    log(`${dryRun ? 'dry run' : '반영 완료'}: 전체 ${result.desiredCount}건, 추가 ${result.insert.length}건, 갱신 ${result.update.length}건`)
  })
  .catch(error => {
    console.error(`[tensw-finance-schedule-sync] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
