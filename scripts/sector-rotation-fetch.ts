#!/usr/bin/env npx tsx
/**
 * sector-rotation-fetch.ts
 *
 * Yahoo Finance chart API에서 섹터/테마 ETF의 일별 종가를 가져와
 * sector_index_quotes 테이블에 upsert.
 *
 *   --range=2y   (default) backfill 시 사용. 매일 cron은 --range=1mo 정도면 충분
 *
 * 매일 시장 마감 후 한 번 실행 (launchd 등록 예정)
 */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[sector-rotation] Missing Supabase env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const args = process.argv.slice(2)
const range = (args.find(a => a.startsWith('--range='))?.split('=')[1]) || '2y'
// --full 옵션: ETF 상장 이후 전체 데이터 (period1=0)
const fullHistory = args.includes('--full')

interface YahooChartResult {
  chart: {
    result?: Array<{
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: (number | null)[] }> }
    }>
    error?: unknown
  }
}

async function fetchHistorical(ticker: string): Promise<Array<{ date: string; close: number }>> {
  const url = fullHistory
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=0&period2=${Math.floor(Date.now() / 1000)}`
    : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`)
  const data = (await res.json()) as YahooChartResult
  const result = data.chart?.result?.[0]
  const timestamps = result?.timestamp || []
  const closes = result?.indicators?.quote?.[0]?.close || []
  const rows: Array<{ date: string; close: number }> = []
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i]
    if (c == null || isNaN(c)) continue
    const d = new Date(timestamps[i] * 1000)
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    rows.push({ date: dateStr, close: Math.round(c * 10000) / 10000 })
  }
  return rows
}

async function main() {
  const { data: etfs, error } = await supabase
    .from('sector_index_etfs')
    .select('ticker, name')
    .eq('active', true)
    .order('display_order')

  if (error || !etfs) {
    console.error('[sector-rotation] Failed to load ETFs:', error)
    process.exit(1)
  }

  console.log(`[sector-rotation] Fetching ${etfs.length} ETFs (${fullHistory ? 'FULL history' : `range=${range}`})...`)

  let totalRows = 0
  let totalErrors = 0

  for (const etf of etfs) {
    try {
      const rows = await fetchHistorical(etf.ticker)
      if (rows.length === 0) {
        console.warn(`  ${etf.ticker} (${etf.name}): no data`)
        continue
      }
      const payload = rows.map(r => ({ ticker: etf.ticker, date: r.date, close: r.close }))
      // 1000-row batch upsert
      for (let i = 0; i < payload.length; i += 1000) {
        const slice = payload.slice(i, i + 1000)
        const { error: upErr } = await supabase
          .from('sector_index_quotes')
          .upsert(slice, { onConflict: 'ticker,date' })
        if (upErr) throw upErr
      }
      console.log(`  ${etf.ticker.padEnd(5)} ${etf.name.padEnd(28)} ${rows.length} rows`)
      totalRows += rows.length
    } catch (e) {
      console.error(`  ${etf.ticker} ERROR:`, e instanceof Error ? e.message : e)
      totalErrors++
    }
    // 부드럽게 rate-limit
    await new Promise(r => setTimeout(r, 250))
  }

  console.log(`[sector-rotation] done. ${totalRows} rows upserted, ${totalErrors} errors.`)
}

main().catch(e => {
  console.error('[sector-rotation] fatal:', e)
  process.exit(1)
})
