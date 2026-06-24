// 토스 체결내역 → stock_trades 동기화 핵심 로직 (Next 비의존).
// API 라우트(로컬용)와 launchd 스크립트(scripts/toss-sync.ts)가 공유한다.
// 모든 토스 호출은 허용 IP에서만 성공하므로 이 함수는 고정 IP 환경에서 실행해야 한다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureTickerTheme } from './ensure-ticker-theme'
import { inferAxisFromSector } from './infer-axis'
import { getClosedOrders, getHoldings, getStocks, filledOrders, type TossOrder } from './toss'

export interface TradeRow {
  ticker: string
  company_name: string
  market: 'KR' | 'US'
  trade_date: string
  trade_type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  currency: 'KRW' | 'USD'
  broker: string
  memo: string | null
}

export interface SyncSummary {
  orders: { closed: number; filled: number }
  tradeRows: number
  symbols: number
  skippedOrphanSells: number
  holdings: number
  mismatches: { symbol: string; holding: number; recon: number }[]
}

// 체결 주문 → stock_trades 행. 시간순 처리하며 보유수량을 추적해
// API 이력 시작 이전 매수분에서 비롯된 "고아 매도"(보유 0인데 매도)는 캡/제외한다.
export function buildTradeRows(
  orders: TossOrder[],
  nameMap: Map<string, { name: string; market: 'KR' | 'US' }>,
): { rows: TradeRow[]; skippedOrphanSells: number } {
  const sorted = [...orders].sort((a, b) => {
    const ta = a.execution.filledAt || a.orderedAt
    const tb = b.execution.filledAt || b.orderedAt
    return ta.localeCompare(tb)
  })

  const pos: Record<string, number> = {}
  const rows: TradeRow[] = []
  let skippedOrphanSells = 0

  for (const o of sorted) {
    const qty = Number(o.execution.filledQuantity)
    if (!(qty > 0)) continue
    const price = Number(o.execution.averageFilledPrice ?? o.price ?? 0)
    if (!(price > 0)) continue

    const info = nameMap.get(o.symbol)
    const market: 'KR' | 'US' = info?.market || (/^\d{6}$/.test(o.symbol) ? 'KR' : 'US')
    const name = info?.name || o.symbol
    const filledAmount = o.execution.filledAmount ? Number(o.execution.filledAmount) : qty * price
    const trade_date = (o.execution.filledAt || o.orderedAt).slice(0, 10)

    if (o.side === 'SELL') {
      const sellable = Math.min(qty, pos[o.symbol] || 0)
      if (sellable <= 0) {
        skippedOrphanSells++
        continue
      }
      pos[o.symbol] = (pos[o.symbol] || 0) - sellable
      rows.push({
        ticker: o.symbol, company_name: name, market, trade_date, trade_type: 'sell',
        quantity: sellable, price, total_amount: filledAmount * (sellable / qty),
        currency: o.currency, broker: '토스증권', memo: o.orderId,
      })
    } else {
      pos[o.symbol] = (pos[o.symbol] || 0) + qty
      rows.push({
        ticker: o.symbol, company_name: name, market, trade_date, trade_type: 'buy',
        quantity: qty, price, total_amount: filledAmount,
        currency: o.currency, broker: '토스증권', memo: o.orderId,
      })
    }
  }

  return { rows, skippedOrphanSells }
}

export interface SyncResult extends SyncSummary {
  dryRun?: boolean
  ok?: boolean
  backupBatchId?: string
  backedUp?: number
  watchlistAdded?: number
}

// 토스 계좌 체결내역을 stock_trades에 동기화.
// confirm=false면 dry-run(요약만, DB 미변경).
export async function runTossSync(db: SupabaseClient, confirm: boolean): Promise<SyncResult> {
  // 1. 종료 주문 전량 + 현 보유 + 종목정보.
  // 토스는 동시 호출 시 rate-limit이 민감하므로 순차로 호출한다 (latency 무관).
  const holdings = await getHoldings()
  const allOrders = await getClosedOrders()
  const filled = filledOrders(allOrders)

  const nameMap = new Map<string, { name: string; market: 'KR' | 'US' }>()
  for (const h of holdings.items) nameMap.set(h.symbol, { name: h.name, market: h.marketCountry })

  const missingNames = [...new Set(filled.map((o) => o.symbol))].filter((s) => !nameMap.has(s))
  if (missingNames.length) {
    const stocks = await getStocks(missingNames).catch(() => new Map())
    for (const [sym, info] of stocks) {
      nameMap.set(sym, { name: info.name, market: info.market.startsWith('K') ? 'KR' : 'US' })
    }
  }

  const { rows, skippedOrphanSells } = buildTradeRows(filled, nameMap)

  const recon: Record<string, number> = {}
  for (const r of rows) recon[r.ticker] = (recon[r.ticker] || 0) + (r.trade_type === 'buy' ? r.quantity : -r.quantity)
  const mismatches = holdings.items
    .map((h) => ({ symbol: h.symbol, holding: Number(h.quantity), recon: recon[h.symbol] || 0 }))
    .filter((m) => Math.abs(m.holding - m.recon) > 0.0001)

  const summary: SyncSummary = {
    orders: { closed: allOrders.length, filled: filled.length },
    tradeRows: rows.length,
    symbols: [...new Set(rows.map((r) => r.ticker))].length,
    skippedOrphanSells,
    holdings: holdings.items.length,
    mismatches,
  }

  if (!confirm) return { dryRun: true, ...summary }

  // 2. 기존 stock_trades 백업 후 교체
  const batchId = crypto.randomUUID()
  const { data: existing } = await db.from('stock_trades').select('*')
  if (existing?.length) {
    const backup = existing.map((e) => ({
      batch_id: batchId, source: 'pre-toss-sync',
      id: e.id, ticker: e.ticker, company_name: e.company_name, market: e.market,
      trade_date: e.trade_date, trade_type: e.trade_type, quantity: e.quantity, price: e.price,
      total_amount: e.total_amount, currency: e.currency, broker: e.broker, memo: e.memo,
      created_at: e.created_at,
    }))
    const { error } = await db.from('stock_trades_backup').insert(backup)
    if (error) throw new Error(`백업 실패: ${error.message}`)
    // 백업 무한증가 방지 — 14일 지난 스냅샷 정리 (실패해도 동기화는 진행).
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    await db.from('stock_trades_backup').delete().lt('backed_up_at', cutoff)
  }

  const { error: delErr } = await db.from('stock_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) throw new Error(`기존 삭제 실패: ${delErr.message}`)

  if (rows.length) {
    const { error: insErr } = await db.from('stock_trades').insert(rows)
    if (insErr) throw new Error(`삽입 실패: ${insErr.message}`)
  }

  // 3. 보유 종목을 watchlist portfolio에 비파괴 추가
  const { data: wl } = await db.from('stock_watchlist').select('ticker')
  const existingTickers = new Set((wl || []).map((w) => (w.ticker as string).replace('.KS', '')))
  let watchlistAdded = 0
  for (const h of holdings.items) {
    if (existingTickers.has(h.symbol)) continue
    const wlTicker = h.marketCountry === 'KR' ? `${h.symbol}.KS` : h.symbol
    const sector = '미분류'
    const axis = inferAxisFromSector(sector)
    const { error } = await db.from('stock_watchlist').upsert(
      { name: h.name, ticker: wlTicker, sector, group_name: 'portfolio', ...(axis ? { axis } : {}) },
      { onConflict: 'name,group_name' },
    )
    if (!error) {
      watchlistAdded++
      await ensureTickerTheme(db, wlTicker, h.name, sector).catch(() => {})
    }
  }

  return { ok: true, ...summary, backupBatchId: batchId, backedUp: existing?.length || 0, watchlistAdded }
}
