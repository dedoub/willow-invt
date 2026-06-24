#!/usr/bin/env npx tsx
/**
 * toss-sync.ts
 *
 * 토스증권 계좌 체결내역을 stock_trades 테이블에 동기화한다.
 * 토스 Open API는 IP 허용목록이 걸려 있어 Vercel(고정 IP 없음)에서는 실패하므로,
 * 허용된 IP(집/사무실 맥)에서 launchd로 주기 실행한다.
 * 결과는 Supabase에 저장되고, 배포된 invest 페이지가 이를 읽어 외부에서도 최신값 표시.
 *
 *   --dry    : dry-run (DB 미변경, 요약만 출력)
 *   기본     : confirm 동기화 (기존 stock_trades 백업 후 교체)
 *
 * 실행: npx tsx scripts/toss-sync.ts   (또는 npm run toss:sync)
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { runTossSync } from '../src/lib/toss-sync'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[toss-sync] Missing Supabase env (.env.local)')
  process.exit(1)
}
if (!process.env.TOSS_CLIENT_ID || !process.env.TOSS_CLIENT_SECRET) {
  console.error('[toss-sync] Missing TOSS_CLIENT_ID / TOSS_CLIENT_SECRET (.env.local)')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const ts = new Date().toISOString()
  try {
    const r = await runTossSync(supabase, !dryRun)
    if (r.dryRun) {
      console.log(`[toss-sync ${ts}] DRY-RUN ok · filled ${r.orders.filled} · rows ${r.tradeRows} · symbols ${r.symbols} · holdings ${r.holdings} · mismatches ${r.mismatches.length}`)
    } else {
      console.log(`[toss-sync ${ts}] OK · rows ${r.tradeRows} · symbols ${r.symbols} · backedUp ${r.backedUp} · watchlistAdded ${r.watchlistAdded} · mismatches ${r.mismatches.length}`)
    }
    if (r.mismatches.length) {
      console.warn('[toss-sync] mismatches:', JSON.stringify(r.mismatches))
    }
    process.exit(0)
  } catch (e) {
    console.error(`[toss-sync ${ts}] FAILED:`, (e as Error).message)
    process.exit(1)
  }
}

main()
