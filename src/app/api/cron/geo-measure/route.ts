import { NextResponse } from 'next/server'
import { runGeoMeasurement } from '@/lib/geo-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 주간 GEO 측정. (사이트 × 회차) 단위로 쪼개 호출한다.
// 질문 30개를 한 번에 다 돌리면 함수 제한시간에 걸리고, 회차를 나누면 같은 주 안에서
// 3회 실행 평균이라는 원래 설계도 지킬 수 있다.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const site = searchParams.get('site') || ''
  const runNo = Math.min(5, Math.max(1, Number(searchParams.get('run') || 1)))
  const parts = Math.min(4, Math.max(1, Number(searchParams.get('parts') || 2)))
  const part = Math.min(parts, Math.max(1, Number(searchParams.get('part') || 1)))
  if (!site) return NextResponse.json({ error: 'bad_request', message: 'site 필요' }, { status: 400 })

  try {
    return NextResponse.json({ ok: true, result: await runGeoMeasurement(site, runNo, part, parts) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/geo-measure] 실패:', message)
    return NextResponse.json({ error: 'geo_run_failed', message }, { status: 502 })
  }
}
