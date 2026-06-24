import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { ensureTickerTheme } from '@/lib/ensure-ticker-theme'
import { inferAxisFromSector } from '@/lib/infer-axis'
import {
  getClosedOrders,
  getHoldings,
  getStocks,
  filledOrders,
  TossError,
  type TossOrder,
} from '@/lib/toss'

export const dynamic = 'force-dynamic'

interface TradeRow {
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

// 체결 주문 → stock_trades 행. 시간순 처리하며 보유수량을 추적해
// API 이력 시작 이전 매수분에서 비롯된 "고아 매도"(보유 0인데 매도)는 제외한다.
function buildTradeRows(
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
    const dateSrc = o.execution.filledAt || o.orderedAt
    const trade_date = dateSrc.slice(0, 10)

    if (o.side === 'SELL') {
      const sellable = Math.min(qty, pos[o.symbol] || 0)
      if (sellable <= 0) {
        skippedOrphanSells++
        continue
      }
      pos[o.symbol] = (pos[o.symbol] || 0) - sellable
      const ratio = sellable / qty
      rows.push({
        ticker: o.symbol,
        company_name: name,
        market,
        trade_date,
        trade_type: 'sell',
        quantity: sellable,
        price,
        total_amount: filledAmount * ratio,
        currency: o.currency,
        broker: '토스증권',
        memo: o.orderId,
      })
    } else {
      pos[o.symbol] = (pos[o.symbol] || 0) + qty
      rows.push({
        ticker: o.symbol,
        company_name: name,
        market,
        trade_date,
        trade_type: 'buy',
        quantity: qty,
        price,
        total_amount: filledAmount,
        currency: o.currency,
        broker: '토스증권',
        memo: o.orderId,
      })
    }
  }

  return { rows, skippedOrphanSells }
}

// POST - 토스 계좌 체결내역을 stock_trades에 동기화.
// body { confirm: true } 가 없으면 dry-run(요약만 반환, DB 미변경).
export async function POST(request: Request) {
  let confirm = false
  try {
    const body = await request.json().catch(() => ({}))
    confirm = body?.confirm === true
  } catch { /* no body = dry run */ }

  try {
    const db = getServiceSupabase()

    // 1. 토스에서 종료 주문 전량 + 현 보유 + 종목정보 수집
    const [allOrders, holdings] = await Promise.all([getClosedOrders(), getHoldings()])
    const filled = filledOrders(allOrders)

    const nameMap = new Map<string, { name: string; market: 'KR' | 'US' }>()
    for (const h of holdings.items) nameMap.set(h.symbol, { name: h.name, market: h.marketCountry })

    // 보유에 없는(이미 청산된) 종목명은 stocks API로 보충
    const missingNames = [...new Set(filled.map((o) => o.symbol))].filter((s) => !nameMap.has(s))
    if (missingNames.length) {
      const stocks = await getStocks(missingNames).catch(() => new Map())
      for (const [sym, info] of stocks) {
        nameMap.set(sym, { name: info.name, market: info.market.startsWith('K') ? 'KR' : 'US' })
      }
    }

    const { rows, skippedOrphanSells } = buildTradeRows(filled, nameMap)

    // 재구성 보유수량 vs 토스 실제 보유 대조 (검증용)
    const recon: Record<string, number> = {}
    for (const r of rows) recon[r.ticker] = (recon[r.ticker] || 0) + (r.trade_type === 'buy' ? r.quantity : -r.quantity)
    const mismatches = holdings.items
      .map((h) => ({ symbol: h.symbol, holding: Number(h.quantity), recon: recon[h.symbol] || 0 }))
      .filter((m) => Math.abs(m.holding - m.recon) > 0.0001)

    const summary = {
      orders: { closed: allOrders.length, filled: filled.length },
      tradeRows: rows.length,
      symbols: [...new Set(rows.map((r) => r.ticker))].length,
      skippedOrphanSells,
      holdings: holdings.items.length,
      mismatches,
    }

    if (!confirm) {
      return NextResponse.json({ dryRun: true, ...summary })
    }

    // 2. 기존 stock_trades 백업 후 교체
    const batchId = crypto.randomUUID()
    const { data: existing } = await db.from('stock_trades').select('*')
    if (existing?.length) {
      const backup = existing.map((e) => ({
        batch_id: batchId,
        source: 'pre-toss-sync',
        id: e.id,
        ticker: e.ticker,
        company_name: e.company_name,
        market: e.market,
        trade_date: e.trade_date,
        trade_type: e.trade_type,
        quantity: e.quantity,
        price: e.price,
        total_amount: e.total_amount,
        currency: e.currency,
        broker: e.broker,
        memo: e.memo,
        created_at: e.created_at,
      }))
      const { error: backupErr } = await db.from('stock_trades_backup').insert(backup)
      if (backupErr) throw new Error(`백업 실패: ${backupErr.message}`)
    }

    // 전체 삭제 후 토스 기준으로 재삽입
    const { error: delErr } = await db.from('stock_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (delErr) throw new Error(`기존 삭제 실패: ${delErr.message}`)

    if (rows.length) {
      const { error: insErr } = await db.from('stock_trades').insert(rows)
      if (insErr) throw new Error(`삽입 실패: ${insErr.message}`)
    }

    // 3. 보유 종목을 watchlist portfolio 그룹에 추가 (비파괴: 이미 있으면 건드리지 않음)
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

    return NextResponse.json({
      ok: true,
      ...summary,
      backupBatchId: batchId,
      backedUp: existing?.length || 0,
      watchlistAdded,
    })
  } catch (error) {
    if (error instanceof TossError) {
      return NextResponse.json({ error: `토스 API: ${error.message}`, code: error.code }, { status: error.status })
    }
    console.error('toss-sync failed:', error)
    return NextResponse.json({ error: (error as Error).message || 'sync failed' }, { status: 500 })
  }
}
