import { NextResponse } from 'next/server'
import { getGeoAnswerStats } from '@/lib/geo-answers'
import { getGscSite } from '@/lib/gsc'

export const dynamic = 'force-dynamic'

// 주 1회 측정이라 캐시 여지가 크지만, 러너를 수동으로 돌린 직후 바로 보고 싶은 경우가 많아
// 캐시 없이 간다. 조회량 자체가 작다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const site = searchParams.get('site') || ''
  const days = Math.min(365, Math.max(7, Number(searchParams.get('days') || 90)))

  if (!getGscSite(site)) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${site}` }, { status: 400 })
  }

  try {
    return NextResponse.json(await getGeoAnswerStats(site, days))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[geo/answers] error:', message)
    return NextResponse.json({ error: 'geo_error', message }, { status: 502 })
  }
}
