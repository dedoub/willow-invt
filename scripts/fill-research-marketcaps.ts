// stock_research 테이블에서 시가총액 NULL인 종목들 야후에서 fetch & 갱신
// 사용: npx tsx scripts/fill-research-marketcaps.ts

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

interface Row {
  id: string
  ticker: string
  market: string | null
}

// yahoo-finance2 — quoteSummary 자동 crumb 처리
import YahooFinance from 'yahoo-finance2'
const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

async function fetchMcap(ticker: string, market: string | null): Promise<{ mcap: number; currency: string } | null> {
  const isKR = /^\d{6}$/.test(ticker.replace('.KS', '')) || market === 'KR'
  const symbol = isKR ? `${ticker.replace('.KS', '')}.KS` : ticker
  try {
    const q = await yahoo.quote(symbol)
    if (!q?.marketCap || q.marketCap <= 0) return null
    return { mcap: q.marketCap, currency: q.currency || (isKR ? 'KRW' : 'USD') }
  } catch {
    return null
  }
}

async function main() {
  const { data: rows, error: err } = await supabase
    .from('stock_research')
    .select('id, ticker, market, market_cap_b, market_cap_m, verdict, track, scan_date')
    .order('scan_date', { ascending: false })
  if (err) { console.error(err); process.exit(1) }

  // ticker별 latest only + filter
  const seen = new Set<string>()
  const targets: Row[] = []
  for (const r of rows || []) {
    if (seen.has(r.ticker)) continue
    seen.add(r.ticker)
    if (!r.verdict?.startsWith('pass')) continue
    if (r.track === 'ETF') continue
    if (r.market_cap_b != null || r.market_cap_m != null) continue
    targets.push({ id: r.id, ticker: r.ticker, market: r.market })
  }
  console.log(`대상: ${targets.length}개 종목`)

  let filled = 0
  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5)
    const results = await Promise.all(batch.map(t => fetchMcap(t.ticker, t.market)))
    for (let j = 0; j < batch.length; j++) {
      const r = batch[j]
      const m = results[j]
      if (!m) {
        console.log(`  ❌ ${r.ticker}: 데이터 없음`)
        continue
      }
      const updates: Record<string, number> = {}
      if (m.currency === 'KRW') {
        // 한국 종목: 억 단위로 저장 (market_cap_m: million → 억으로 환산)
        updates.market_cap_m = Math.round(m.mcap / 1e8)
      } else {
        updates.market_cap_b = Math.round(m.mcap / 1e9 * 10) / 10
        if (updates.market_cap_b < 0.1) updates.market_cap_b = Math.round(m.mcap / 1e6) / 1000
      }
      // 같은 ticker의 모든 row 업데이트 (latest만 update해도 되지만 일관성 위해 모두)
      const { error: updErr } = await supabase
        .from('stock_research')
        .update(updates)
        .eq('ticker', r.ticker)
        .is(m.currency === 'KRW' ? 'market_cap_m' : 'market_cap_b', null)
      if (updErr) {
        console.log(`  ⚠️ ${r.ticker}: ${updErr.message}`)
        continue
      }
      filled++
      const display = m.currency === 'KRW'
        ? `${(updates.market_cap_m! / 10000).toFixed(1)}조`
        : `$${updates.market_cap_b}B`
      console.log(`  ✅ ${r.ticker}: ${display} (${m.currency})`)
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`\n완료: ${filled}/${targets.length} 종목 갱신`)
}

main().catch(e => { console.error(e); process.exit(1) })
