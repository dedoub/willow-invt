import { NextResponse } from 'next/server'
import { INDEXNOW_SITES, submitNewUrls } from '@/lib/indexnow'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 사이트맵에 새로 생긴 URL만 IndexNow로 통보한다. 색인 스캔(21:40 UTC) 직후에 돌려
// 그날 발행분이 하루 안에 나가게 한다. 이미 보낸 URL은 건너뛰므로 반복 실행해도 안전하다.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const only = searchParams.get('site')
  const targets = only ? INDEXNOW_SITES.filter(s => s.key === only) : INDEXNOW_SITES
  if (targets.length === 0) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${only}` }, { status: 400 })
  }

  const results = []
  for (const site of targets) {
    try {
      results.push(await submitNewUrls(site))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[indexnow] ${site.key} 실패:`, message)
      results.push({ siteKey: site.key, error: message })
    }
  }

  return NextResponse.json({ ok: true, results })
}
