// 답변 발행 — 보이스카드·포틀만. 두 앱은 자체 관리자 화면이 없어서 이 대시보드가
// 유일한 필자다. 스크립타·리뷰노트는 각자 /admin/inquiries 가 있으므로 여기서 막는다.
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  adminGate, ADMIN_GATE_STATUS, appSpec, publishGuard,
  PUBLISH_GUARD_MESSAGE, PUBLISH_GUARD_STATUS,
  publishInquiryReply, readThreadChannel,
} from '@/lib/inquiry-inbox'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const gate = adminGate(await getAuthUser())
  if (gate !== 'ok') {
    return NextResponse.json(
      { error: gate === 'unauthenticated' ? '로그인이 필요하다' : '관리자만 답할 수 있다' },
      { status: ADMIN_GATE_STATUS[gate] },
    )
  }

  let payload: { app?: unknown; threadId?: unknown; body?: unknown }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: '본문을 읽지 못했다' }, { status: 400 })
  }

  const app = typeof payload.app === 'string' ? payload.app : ''
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : ''
  const body = typeof payload.body === 'string' ? payload.body : ''
  const spec = appSpec(app)

  // 채널 조회 전에 앱·본문부터 판정한다 — 읽기 전용 앱에 대고 DB를 두드릴 이유가 없다.
  const preflight = publishGuard(spec, null, body)
  if (preflight !== 'ok') {
    return NextResponse.json(
      { error: PUBLISH_GUARD_MESSAGE[preflight] },
      { status: PUBLISH_GUARD_STATUS[preflight] },
    )
  }
  if (!spec) return NextResponse.json({ error: '모르는 앱이다' }, { status: 400 })
  if (!threadId) return NextResponse.json({ error: '스레드 id 가 없다' }, { status: 400 })

  try {
    const thread = await readThreadChannel(spec, threadId)
    if (!thread) return NextResponse.json({ error: '없는 스레드다' }, { status: 404 })

    const verdict = publishGuard(spec, thread, body)
    if (verdict !== 'ok') {
      return NextResponse.json(
        { error: PUBLISH_GUARD_MESSAGE[verdict] },
        { status: PUBLISH_GUARD_STATUS[verdict] },
      )
    }

    // 한 트랜잭션(publish_inquiry_reply). 메시지만 들어가고 플래그가 안 서는
    // 중간 상태는 존재하지 않는다 — 던지면 삽입도 함께 되돌아간다.
    const { channel } = await publishInquiryReply(spec, threadId, body)
    return NextResponse.json({ ok: true, app: spec.key, threadId, channel })
  } catch (err) {
    console.error('inquiry 답변 발행 실패:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
