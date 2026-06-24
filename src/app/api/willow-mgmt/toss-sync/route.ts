import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { runTossSync } from '@/lib/toss-sync'
import { TossError } from '@/lib/toss'

export const dynamic = 'force-dynamic'

// POST - 토스 계좌 체결내역을 stock_trades에 동기화.
// body { confirm: true } 가 없으면 dry-run(요약만 반환, DB 미변경).
//
// 주의: 토스 Open API는 IP 허용목록이 걸려 있어, 고정 IP가 없는 Vercel
// 서버리스에서는 실패한다. 운영 동기화는 허용 IP에서 도는 launchd 스크립트
// (scripts/toss-sync.ts)가 담당하고, 이 라우트는 로컬 개발/수동 실행용이다.
export async function POST(request: Request) {
  let confirm = false
  try {
    const body = await request.json().catch(() => ({}))
    confirm = body?.confirm === true
  } catch { /* no body = dry run */ }

  try {
    const result = await runTossSync(getServiceSupabase(), confirm)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof TossError) {
      return NextResponse.json({ error: `토스 API: ${error.message}`, code: error.code }, { status: error.status })
    }
    console.error('toss-sync failed:', error)
    return NextResponse.json({ error: (error as Error).message || 'sync failed' }, { status: 500 })
  }
}
