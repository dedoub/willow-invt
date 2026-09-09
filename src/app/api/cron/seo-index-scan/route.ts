import { NextResponse } from 'next/server'
import { scanSiteIndexStatus } from '@/lib/gsc-index'
import { getGscSite } from '@/lib/gsc'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 매일 사이트맵 전 콘텐츠의 색인 상태를 GSC URL Inspection으로 찍어 스냅샷으로 남긴다.
// 노출·클릭 지표로는 "노출 0"의 원인(미크롤/크롤됐지만 미색인/제외)을 구분할 수 없다.
//
// Portle은 2026-08-20, Scripta는 2026-08-27 데일리 SEO 프로토콜에 추가했다.
// ValueChain.wiki는 CEO 지시에 따라 2026-09-09 데일리 SEO 프로토콜에 재추가했다.
// 각 도메인 속성 권한이 서비스 계정으로 붙어 있어야 실제 스냅샷이 저장된다.
const SCHEDULED_SITES = ['voicecards', 'reviewnotes', 'portle', 'scripta', 'valuechain']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  // 크론은 Bearer, 수동 실행은 ?secret= 로도 허용
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 명시 호출은 예약 목록이 아니라 사이트 정의를 기준으로 검증한다.
  const only = searchParams.get('site')
  if (only && !getGscSite(only)) {
    return NextResponse.json({ error: 'unknown_site', message: `알 수 없는 사이트: ${only}` }, { status: 400 })
  }
  const targets = only ? [only] : SCHEDULED_SITES

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
