// 한 스레드의 대화 전량과, CEO 봇이 써 둔 답변 초안.
//
// 초안은 **여기서만** 나간다(목록 라우트에는 없다). 사람이 스레드를 열 때 입력창을
// 빈 칸이 아니라 고칠 초안으로 채우는 것이 이 칸의 유일한 쓰임이다.
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  adminGate, ADMIN_GATE_STATUS, appSpec,
  loadInquiryConversation, loadInquiryDraft,
  type InquiryDraftDto,
} from '@/lib/inquiry-inbox'

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

    // 초안을 못 읽었다고 대화까지 버리지는 않는다 — 대화는 이미 손에 있고, 그게
    // 이 화면의 본체다. 대신 null 로 뭉개지도 않는다. `draft: null`(초안이 없다)과
    // `draftError`(못 읽었다)는 다른 사실이고, 화면은 둘을 다르게 그려야 한다.
    let draft: InquiryDraftDto | null = null
    let draftError: string | null = null
    try {
      draft = await loadInquiryDraft(spec, threadId)
    } catch (err) {
      console.error('inquiry 초안 조회 실패:', err)
      draftError = String(err)
    }

    // 요청한 스레드를 그대로 돌려준다 — 화면이 "이 응답이 지금 고른 스레드의 것인가"를
    // 확인할 수 있어야 한다.
    return NextResponse.json({ app: spec.key, threadId, messages, draft, draftError })
  } catch (err) {
    console.error('inquiry 대화 조회 실패:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
