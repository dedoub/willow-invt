import { NextResponse } from 'next/server'
import { getIndexStatusSummary } from '@/lib/gsc-index'
import { getGscSite } from '@/lib/gsc'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const site = searchParams.get('site') || ''
  const days = Math.min(180, Math.max(7, Number(searchParams.get('days') || 30)))

  if (!getGscSite(site)) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${site}` }, { status: 400 })
  }

  try {
    return NextResponse.json(await getIndexStatusSummary(site, days))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[seo/index-status] error:', message)
    return NextResponse.json({ error: 'index_status_error', message }, { status: 502 })
  }
}
