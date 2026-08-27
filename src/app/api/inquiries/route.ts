// 네 앱 문의 목록. 읽기만 한다.
import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { adminGate, ADMIN_GATE_STATUS, INQUIRY_APPS, loadInquiryInbox } from '@/lib/inquiry-inbox'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = adminGate(await getAuthUser())
  if (gate !== 'ok') {
    return NextResponse.json(
      { error: gate === 'unauthenticated' ? '로그인이 필요하다' : '관리자만 볼 수 있다' },
      { status: ADMIN_GATE_STATUS[gate] },
    )
  }

  try {
    const results = await loadInquiryInbox()
    return NextResponse.json({
      apps: INQUIRY_APPS.map(spec => ({
        key: spec.key, label: spec.label, dot: spec.dot,
        writable: spec.writable, adminUrl: spec.adminUrl,
      })),
      results,
    })
  } catch (err) {
    console.error('inquiry inbox 조회 실패:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
