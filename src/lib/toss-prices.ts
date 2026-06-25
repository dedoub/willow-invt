// 토스 가격 스냅샷 — 보유/워치리스트 종목의 현재가·시총·변동률·환율을 토스에서 받아
// toss_price_snapshot 테이블에 upsert. launchd 잡(scripts/toss-prices.ts)이 주기 실행.
// Vercel 배포본은 이 테이블을 읽어 토스 기준 값을 표시한다 (IP 차단으로 직접호출 불가).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPrices, getStocks, getPrevClose, getExchangeRate } from './toss'

export const FX_SNAPSHOT_KEY = '_FX_USDKRW'

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export interface SnapshotResult {
  symbols: number
  covered: number
  fx: number | null
}

export async function snapshotTossPrices(db: SupabaseClient, symbols: string[]): Promise<SnapshotResult> {
  const uniq = [...new Set(symbols.filter((s) => s && s !== FX_SNAPSHOT_KEY))]

  const [prices, stocks] = await Promise.all([
    getPrices(uniq).catch(() => new Map()),
    getStocks(uniq).catch(() => new Map()),
  ])

  const covered = uniq.filter((s) => prices.has(s))
  // 변동률: 토스 일봉 전일 종가 대비 (best-effort, 실패 시 null)
  const prevCloses = new Map<string, number | null>()
  await mapLimit(covered, 8, async (s) => {
    prevCloses.set(s, await getPrevClose(s))
  })

  const rows = covered.map((s) => {
    const p = prices.get(s)!
    const price = Number(p.lastPrice)
    const prev = prevCloses.get(s)
    const changePercent = prev ? ((price - prev) / prev) * 100 : null
    const shares = stocks.get(s)?.sharesOutstanding
    return {
      symbol: s,
      last_price: price,
      market_cap: shares ? price * Number(shares) : null,
      change_percent: changePercent,
      currency: p.currency,
      updated_at: new Date().toISOString(),
    }
  })

  // 환율
  const fx = await getExchangeRate('USD', 'KRW')
  if (fx && fx > 0) {
    rows.push({
      symbol: FX_SNAPSHOT_KEY,
      last_price: fx,
      market_cap: null,
      change_percent: null,
      currency: 'KRW',
      updated_at: new Date().toISOString(),
    })
  }

  if (rows.length) {
    const { error } = await db.from('toss_price_snapshot').upsert(rows, { onConflict: 'symbol' })
    if (error) throw new Error(`스냅샷 upsert 실패: ${error.message}`)
  }

  return { symbols: uniq.length, covered: covered.length, fx }
}
