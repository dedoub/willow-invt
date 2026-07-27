import { NextResponse } from 'next/server'
import { scanSiteIndexStatus } from '@/lib/gsc-index'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 매일 사이트맵 전 콘텐츠의 색인 상태를 GSC URL Inspection으로 찍어 스냅샷으로 남긴다.
// 노출·클릭 지표로는 "노출 0"의 원인(미크롤/크롤됐지만 미색인/제외)을 구분할 수 없다.
const SITES = ['voicecards', 'reviewnotes']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  // 크론은 Bearer, 수동 실행은 ?secret= 로도 허용
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const only = searchParams.get('site')
  const targets = only ? SITES.filter(s => s === only) : SITES
  if (targets.length === 0) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${only}` }, { status: 400 })
  }

  const results = []
  for (const siteKey of targets) {
    try {
      results.push(await scanSiteIndexStatus(siteKey))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[seo-index-scan] ${siteKey} 실패:`, message)
      results.push({ siteKey, error: message })
    }
  }

  return NextResponse.json({ ok: true, results })
}
