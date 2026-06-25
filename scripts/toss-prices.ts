#!/usr/bin/env npx tsx
/**
 * toss-prices.ts
 *
 * 보유/워치리스트 종목의 토스 현재가·시총·변동률·환율을 받아 toss_price_snapshot에 적재.
 * 토스 Open API는 IP 허용목록이 걸려 있어 허용된 IP(맥)에서 launchd로 주기 실행한다.
 * Vercel 배포본은 이 테이블을 읽어 토스 기준 잔고를 표시(토스앱과 일치).
 *
 * 실행: npx tsx scripts/toss-prices.ts   (또는 npm run toss:prices)
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { snapshotTossPrices } from '../src/lib/toss-prices'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[toss-prices] Missing Supabase env (.env.local)')
  process.exit(1)
}
if (!process.env.TOSS_CLIENT_ID || !process.env.TOSS_CLIENT_SECRET) {
  console.error('[toss-prices] Missing TOSS_CLIENT_ID / TOSS_CLIENT_SECRET (.env.local)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  const ts = new Date().toISOString()
  try {
    // 워치리스트(포트폴리오/관심/벤치마크) 전 종목 + 보유 종목 = 페이지가 가격을 쓰는 대상.
    const { data: wl } = await supabase.from('stock_watchlist').select('ticker')
    const symbols = [...new Set((wl || []).map((w) => (w.ticker as string).replace('.KS', '')))]
    if (!symbols.length) {
      console.warn(`[toss-prices ${ts}] no watchlist symbols`)
      process.exit(0)
    }
    const r = await snapshotTossPrices(supabase, symbols)
    console.log(`[toss-prices ${ts}] OK · symbols ${r.symbols} · covered ${r.covered} · fx ${r.fx}`)
    process.exit(0)
  } catch (e) {
    console.error(`[toss-prices ${ts}] FAILED:`, (e as Error).message)
    process.exit(1)
  }
}

main()
