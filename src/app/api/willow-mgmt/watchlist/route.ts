import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TABLE = 'stock_watchlist'

// Auto-assign investment theme based on sector keyword
async function ensureTickerTheme(db: SupabaseClient, ticker: string, name: string, sector: string, market?: string) {
  const normalizedTicker = ticker.replace('.KS', '')
  const isKR = /^\d{6}$/.test(normalizedTicker)
  const dbTicker = isKR ? `${normalizedTicker}.KS` : normalizedTicker

  const { data: existing } = await db
    .from('investment_tickers')
    .select('id')
    .eq('ticker', dbTicker)
    .maybeSingle()

  let tickerId = existing?.id
  if (!tickerId) {
    const { data: inserted, error } = await db
      .from('investment_tickers')
      .insert({ ticker: dbTicker, name, market: market || (isKR ? 'KR' : 'US') })
      .select('id')
      .single()
    if (error || !inserted) return
    tickerId = inserted.id
  }

  const { count } = await db
    .from('investment_ticker_themes')
    .select('*', { count: 'exact', head: true })
    .eq('ticker_id', tickerId)
  if (count && count > 0) return

  const { data: themes } = await db
    .from('investment_themes')
    .select('id, name, parent_id')

  if (!themes) return
  const s = sector.toLowerCase()

  const SECTOR_THEME_MAP: [RegExp, string][] = [
    [/반도체|semiconductor|chip|메모리|memory|패키징|장비/i, 'AI 반도체'],
    [/에너지|energy|원전|원자력|nuclear|우라늄/i, 'AI 에너지/원전'],
    [/데이터센터|냉각|네트워킹|네트워크|cooling|datacenter|storage|저장/i, '데이터센터/냉각/네트워킹'],
    [/방산|defense|military/i, '방산'],
    [/우주|space|satellite/i, '우주'],
    [/양자|quantum/i, '양자컴퓨팅'],
    [/로보틱스|robot|자동화|automation|자동차/i, '로보틱스'],
  ]

  let themeId: string | null = null
  for (const [pattern, themeName] of SECTOR_THEME_MAP) {
    if (pattern.test(s)) {
      const found = themes.find(t => t.name === themeName)
      if (found) { themeId = found.id; break }
    }
  }

  if (!themeId) {
    const fallback = themes.find(t => t.name === '데이터센터/냉각/네트워킹')
    if (fallback) themeId = fallback.id
  }

  if (themeId) {
    await db.from('investment_ticker_themes').upsert(
      { ticker_id: tickerId, theme_id: themeId },
      { onConflict: 'ticker_id,theme_id' }
    )
  }
}

export async function GET() {
  try {
    const db = getServiceSupabase()
    const { data, error } = await db.from(TABLE).select('*').order('created_at')
    if (error) throw error

    const result: Record<string, Array<Record<string, unknown>>> = { portfolio: [], watchlist: [], benchmark: [] }
    for (const row of data || []) {
      const group = row.group_name as string
      if (!result[group]) result[group] = []
      result[group].push({
        name: row.name,
        ticker: row.ticker,
        sector: row.sector,
        ...(row.axis ? { axis: row.axis } : {}),
        ...(row.pinned ? { pinned: true } : {}),
        ...(row.monitor_date ? { monitorDate: row.monitor_date } : {}),
        ...(row.monitor_price ? { monitorPrice: Number(row.monitor_price) } : {}),
      })
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Failed to read watchlist:', error)
    return NextResponse.json({ error: 'Failed to read watchlist' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, name, ticker, sector, axis, fromGroup, toGroup, monitorDate, monitorPrice } = body
    const db = getServiceSupabase()

    if (action === 'add') {
      if (!name || !ticker || !sector || !toGroup) {
        return NextResponse.json({ error: 'name, ticker, sector, toGroup required' }, { status: 400 })
      }
      const { error } = await db.from(TABLE).upsert({
        name, ticker, sector, group_name: toGroup,
        ...(axis ? { axis } : {}),
      }, { onConflict: 'name,group_name' })
      if (error) throw error
      await ensureTickerTheme(db, ticker, name, sector).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === 'remove') {
      if (!name || !fromGroup) {
        return NextResponse.json({ error: 'name, fromGroup required' }, { status: 400 })
      }
      const { error } = await db.from(TABLE).delete()
        .eq('name', name).eq('group_name', fromGroup)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (action === 'pin') {
      if (!name || !fromGroup) {
        return NextResponse.json({ error: 'name, fromGroup required' }, { status: 400 })
      }
      // Read current state
      const { data: row, error: readErr } = await db.from(TABLE)
        .select('pinned').eq('name', name).eq('group_name', fromGroup).single()
      if (readErr) return NextResponse.json({ error: `${name} not found in ${fromGroup}` }, { status: 404 })

      const newPinned = !row.pinned
      const update: Record<string, unknown> = {
        pinned: newPinned,
        monitor_date: newPinned && monitorDate ? monitorDate : null,
        monitor_price: newPinned && monitorPrice ? monitorPrice : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await db.from(TABLE).update(update)
        .eq('name', name).eq('group_name', fromGroup)
      if (error) throw error
      return NextResponse.json({ ok: true, pinned: newPinned })
    }

    if (action === 'move') {
      if (!name || !fromGroup || !toGroup) {
        return NextResponse.json({ error: 'name, fromGroup, toGroup required' }, { status: 400 })
      }
      const { error } = await db.from(TABLE).update({
        group_name: toGroup, updated_at: new Date().toISOString(),
      }).eq('name', name).eq('group_name', fromGroup)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update watchlist:', error)
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 })
  }
}
