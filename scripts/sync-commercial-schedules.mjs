#!/usr/bin/env node
// ETC 인보이스, 아크로스 세금계산서, 양사 입금을 윌로우 사업관리 일정에 반영한다.
//
//   node scripts/sync-commercial-schedules.mjs [--dry]

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { syncCommercialSchedules } from './lib/commercial-schedule-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Supabase 환경변수가 없어요.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const dryRun = process.argv.includes('--dry')
const log = message => console.log(`[commercial-schedule-sync] ${message}`)

syncCommercialSchedules(supabaseClient(), { dryRun, log })
  .then(result => {
    log(`${dryRun ? 'dry run' : '반영 완료'}: 전체 ${result.desiredCount}건, 추가 ${result.insert.length}건, 갱신 ${result.update.length}건`)
  })
  .catch(error => {
    console.error(`[commercial-schedule-sync] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
