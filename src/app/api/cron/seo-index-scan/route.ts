import { NextResponse } from 'next/server'
import { scanSiteIndexStatus } from '@/lib/gsc-index'
import { getGscSite } from '@/lib/gsc'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 매일 사이트맵 전 콘텐츠의 색인 상태를 GSC URL Inspection으로 찍어 스냅샷으로 남긴다.
// 노출·클릭 지표로는 "노출 0"의 원인(미크롤/크롤됐지만 미색인/제외)을 구분할 수 없다.
//
// 밸류체인은 2026-08-04부로 자동 스캔에서 뺐다(프로젝트 일시중지, CEO 결정).
// 매일 1,394쪽을 검사하던 잡이라 비용·노이즈가 가장 컸다. 사이트와 대시보드는
// 그대로 살아 있고 gsc.ts의 사이트 정의도 남겨 뒀으니, 재개는 이 배열에 키를
// 되돌리고 vercel.json 크론을 복구하면 된다. `?site=valuechain`으로 수동
// 일회 실행은 지금도 된다 — 중지한 것은 자동 실행이지 기능이 아니다.
const SCHEDULED_SITES = ['voicecards', 'reviewnotes']

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  // 크론은 Bearer, 수동 실행은 ?secret= 로도 허용
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 명시 호출은 예약 목록이 아니라 사이트 정의를 기준으로 검증한다. 그래야
  // 자동 실행에서 뺀 사이트도 수동 일회 실행이 되고, 오타는 그대로 400이 된다.
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
