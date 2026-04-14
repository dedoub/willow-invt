import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

// Try project-local first (works on Vercel), then external path (local dev with live sync)
const LOCAL_PATH = join(process.cwd(), 'data', 'watchlist.json')
const EXTERNAL_PATH = join(process.cwd(), '..', 'portfolio', 'monitor', 'watchlist.json')
const TMP_PATH = '/tmp/watchlist.json'

function getWatchlistPath(): string {
  if (existsSync(EXTERNAL_PATH)) return EXTERNAL_PATH
  if (existsSync(LOCAL_PATH)) return LOCAL_PATH
  return TMP_PATH
}

interface WatchlistEntry {
  ticker: string
  sector: string
  axis?: string
  pinned?: boolean
}

type WatchlistData = Record<string, Record<string, WatchlistEntry>>

function readWatchlist(): WatchlistData {
  const primary = getWatchlistPath()
  // On Vercel: if primary is read-only, check if /tmp has a newer copy
  if (existsSync(TMP_PATH) && primary !== TMP_PATH) {
    try {
      return JSON.parse(readFileSync(TMP_PATH, 'utf-8'))
    } catch { /* fall through to primary */ }
  }
  return JSON.parse(readFileSync(primary, 'utf-8'))
}

function writeWatchlist(data: WatchlistData) {
  const primary = getWatchlistPath()
  try {
    writeFileSync(primary, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Vercel read-only filesystem: write to /tmp instead
    writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf-8')
  }
}

export async function GET() {
  try {
    const data = readWatchlist()
    const result = {
      portfolio: Object.entries(data.portfolio || {}).map(([name, v]) => ({ name, ...v })),
      watchlist: Object.entries(data.watchlist || {}).map(([name, v]) => ({ name, ...v })),
      benchmark: Object.entries(data.benchmark || {}).map(([name, v]) => ({ name, ...v })),
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
    const { action, name, ticker, sector, axis, fromGroup, toGroup } = body
    const data = readWatchlist()

    if (action === 'add') {
      if (!name || !ticker || !sector || !toGroup) {
        return NextResponse.json({ error: 'name, ticker, sector, toGroup required' }, { status: 400 })
      }
      if (!data[toGroup]) data[toGroup] = {}
      data[toGroup][name] = { ticker, sector, ...(axis ? { axis } : {}) }
      writeWatchlist(data)
      return NextResponse.json({ ok: true })
    }

    if (action === 'remove') {
      if (!name || !fromGroup) {
        return NextResponse.json({ error: 'name, fromGroup required' }, { status: 400 })
      }
      if (data[fromGroup]?.[name]) {
        delete data[fromGroup][name]
        writeWatchlist(data)
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'pin') {
      if (!name || !fromGroup) {
        return NextResponse.json({ error: 'name, fromGroup required' }, { status: 400 })
      }
      const entry = data[fromGroup]?.[name]
      if (!entry) {
        return NextResponse.json({ error: `${name} not found in ${fromGroup}` }, { status: 404 })
      }
      entry.pinned = !entry.pinned
      if (!entry.pinned) delete entry.pinned
      writeWatchlist(data)
      return NextResponse.json({ ok: true, pinned: !!entry.pinned })
    }

    if (action === 'move') {
      if (!name || !fromGroup || !toGroup) {
        return NextResponse.json({ error: 'name, fromGroup, toGroup required' }, { status: 400 })
      }
      const entry = data[fromGroup]?.[name]
      if (!entry) {
        return NextResponse.json({ error: `${name} not found in ${fromGroup}` }, { status: 404 })
      }
      delete data[fromGroup][name]
      if (!data[toGroup]) data[toGroup] = {}
      data[toGroup][name] = entry
      writeWatchlist(data)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update watchlist:', error)
    return NextResponse.json({ error: 'Failed to update watchlist' }, { status: 500 })
  }
}
