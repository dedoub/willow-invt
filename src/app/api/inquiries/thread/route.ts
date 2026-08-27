// 한 스레드의 대화 전량.
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { adminGate, ADMIN_GATE_STATUS, appSpec, loadInquiryConversation } from '@/lib/inquiry-inbox'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = adminGate(await getAuthUser())
  if (gate !== 'ok') {
    return NextResponse.json(
      { error: gate === 'unauthenticated' ? '로그인이 필요하다' : '관리자만 볼 수 있다' },
      { status: ADMIN_GATE_STATUS[gate] },
    )
  }

  const app = request.nextUrl.searchParams.get('app') ?? ''
  const threadId = request.nextUrl.searchParams.get('id') ?? ''
  const spec = appSpec(app)
  if (!spec) return NextResponse.json({ error: '모르는 앱이다' }, { status: 400 })
  if (!threadId) return NextResponse.json({ error: '스레드 id 가 없다' }, { status: 400 })

  try {
    const messages = await loadInquiryConversation(spec, threadId)
    // 요청한 스레드를 그대로 돌려준다 — 화면이 "이 응답이 지금 고른 스레드의 것인가"를
    // 확인할 수 있어야 한다.
    return NextResponse.json({ app: spec.key, threadId, messages })
  } catch (err) {
    console.error('inquiry 대화 조회 실패:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
