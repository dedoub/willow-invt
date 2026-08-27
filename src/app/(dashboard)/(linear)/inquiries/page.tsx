// 문의함 — 서버에서 먼저 잠근다.
//
// 다른 화면은 클라이언트에서 useIsAdmin() 으로 가리지만, 여기는 네 앱의 고객
// 문의 본문이 걸린 자리라 껍데기부터 서버 판정을 받는다. 세션 없음(로그인으로)과
// 관리자 아님(홈으로)은 서로 다른 사실이라 가는 곳도 다르다.
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { adminGate } from '@/lib/inquiry-inbox-core'
import { InquiryInbox } from './_components/inquiry-inbox'

export const dynamic = 'force-dynamic'

export default async function InquiriesPage() {
  const gate = adminGate(await getAuthUser())
  if (gate === 'unauthenticated') redirect('/login')
  if (gate === 'forbidden') redirect('/')
  return <InquiryInbox />
}
