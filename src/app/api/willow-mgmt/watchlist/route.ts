import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { ensureTickerTheme } from '@/lib/ensure-ticker-theme'

export const dynamic = 'force-dynamic'

const TABLE = 'stock_watchlist'

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
