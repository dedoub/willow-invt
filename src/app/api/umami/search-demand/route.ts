import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getUmamiSite, getSearchDemandStats } from '@/lib/umami'

// Umami API + 사이트맵을 매 요청 긁으면 느리고 낭비라 10분 캐싱.
// (site, days)가 캐시 키에 포함되므로 사이트/기간별로 따로 캐싱된다.
const getCached = unstable_cache(
  async (siteKey: string, days: number) => {
    const site = getUmamiSite(siteKey)
    if (!site) return null
    return getSearchDemandStats(site, days)
  },
  ['umami-search-demand'],
  { revalidate: 600 },
)

const ALLOWED_DAYS = [7, 30, 90]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const siteKey = searchParams.get('site') || ''
  const daysRaw = Number(searchParams.get('days') || 30)
  const days = ALLOWED_DAYS.includes(daysRaw) ? daysRaw : 30

  if (!getUmamiSite(siteKey)) {
    return NextResponse.json(
      { error: 'unknown_site', message: `알 수 없는 사이트이거나 websiteId 환경변수가 없습니다: ${siteKey}` },
      { status: 400 },
    )
  }

  try {
    const data = await getCached(siteKey, days)
    if (!data) {
      return NextResponse.json({ error: 'unknown_site', message: '사이트 설정 없음' }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (err) {
    console.error('[umami] search-demand error:', err)
    return NextResponse.json(
      { error: 'umami_error', message: String(err instanceof Error ? err.message : err) },
      { status: 502 },
    )
  }
}
