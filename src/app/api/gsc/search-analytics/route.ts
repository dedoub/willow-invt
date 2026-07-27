import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getGscSite, getSearchConsoleStats } from '@/lib/gsc'

// GSC 데이터는 하루 단위로만 갱신되므로 30분 캐싱으로 충분하다.
async function fetchFresh(siteKey: string, days: number) {
  const site = getGscSite(siteKey)
  if (!site) return null
  return getSearchConsoleStats(site, days)
}

const getCached = unstable_cache(fetchFresh, ['gsc-search-analytics'], { revalidate: 1800 })

const ALLOWED_DAYS = [7, 30, 90]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const siteKey = searchParams.get('site') || ''
  const daysRaw = Number(searchParams.get('days') || 30)
  const days = ALLOWED_DAYS.includes(daysRaw) ? daysRaw : 30

  if (!getGscSite(siteKey)) {
    return NextResponse.json(
      { error: 'unknown_site', message: `알 수 없는 사이트: ${siteKey}` },
      { status: 400 },
    )
  }

  // 새로고침 버튼은 캐시를 건너뛴다
  const refresh = searchParams.get('refresh') === '1'

  try {
    const data = refresh ? await fetchFresh(siteKey, days) : await getCached(siteKey, days)
    if (!data) {
      return NextResponse.json({ error: 'unknown_site', message: '사이트 설정 없음' }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[gsc] search-analytics error:', message)
    return NextResponse.json({ error: 'gsc_error', message }, { status: 502 })
  }
}
