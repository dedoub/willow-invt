// 토스 가격 스냅샷 — 보유/워치리스트 종목의 현재가·시총·변동률·환율을 토스에서 받아
// toss_price_snapshot 테이블에 upsert. launchd 잡(scripts/toss-prices.ts)이 주기 실행.
// Vercel 배포본은 이 테이블을 읽어 토스 기준 값을 표시한다 (IP 차단으로 직접호출 불가).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPrices, getStocks, getPrevClose, getExchangeRate } from './toss'

export const FX_SNAPSHOT_KEY = '_FX_USDKRW'

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  // 변동률: 토스 일봉 전일 종가 대비. MARKET_DATA_CHART rate-limit에 막히지 않도록
  // 동시 3개 + 호출당 150ms 간격으로 천천히 (15분 잡이라 지연 무관). 실패 시 null.
  const prevCloses = new Map<string, number | null>()
  await mapLimit(covered, 3, async (s) => {
    prevCloses.set(s, await getPrevClose(s))
    await sleep(150)
  })

  const now = new Date().toISOString()
  // 변동률 성공 여부로 두 묶음으로 나눈다. 실패(null)한 종목은 change_percent 키를 빼서
  // upsert → 기존 변동률을 보존(덮어쓰지 않음). 몇 사이클에 걸쳐 채워지고 한 번 채워지면 유지.
  const withChange: Record<string, unknown>[] = []
  const noChange: Record<string, unknown>[] = []
  for (const s of covered) {
    const p = prices.get(s)!
    const price = Number(p.lastPrice)
    const prev = prevCloses.get(s)
    const shares = stocks.get(s)?.sharesOutstanding
    const base = {
      symbol: s,
      last_price: price,
      market_cap: shares ? price * Number(shares) : null,
      currency: p.currency,
      updated_at: now,
    }
    if (prev) withChange.push({ ...base, change_percent: ((price - prev) / prev) * 100 })
    else noChange.push(base)
  }

  // 환율 (변동률 없는 묶음에 포함)
  const fx = await getExchangeRate('USD', 'KRW')
  if (fx && fx > 0) {
    noChange.push({ symbol: FX_SNAPSHOT_KEY, last_price: fx, market_cap: null, currency: 'KRW', updated_at: now })
  }

  if (withChange.length) {
    const { error } = await db.from('toss_price_snapshot').upsert(withChange, { onConflict: 'symbol' })
    if (error) throw new Error(`스냅샷 upsert(change) 실패: ${error.message}`)
  }
  if (noChange.length) {
    // change_percent 컬럼 미포함 → 충돌 시 기존 변동률 보존
    const { error } = await db.from('toss_price_snapshot').upsert(noChange, { onConflict: 'symbol' })
    if (error) throw new Error(`스냅샷 upsert(price) 실패: ${error.message}`)
  }

  return { symbols: uniq.length, covered: covered.length, fx }
}
