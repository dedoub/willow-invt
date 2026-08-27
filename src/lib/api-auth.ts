import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

/**
 * 대시보드 데이터 API 접근 판정.
 *
 * 두 부류가 부른다. 브라우저는 로그인 쿠키(auth_token)를 달고 오고, 스케줄러·알림 스크립트는
 * 쿠키가 없어 `Authorization: Bearer $CRON_SECRET` 로 온다. 크론 라우트가 이미 쓰는 열쇠라
 * 새 비밀을 하나 더 만들지 않는다.
 *
 * 통과면 null, 막히면 그대로 반환할 401 응답을 돌려준다.
 *
 *   const denied = await denyUnlessDashboardAccess(request)
 *   if (denied) return denied
 */
export async function denyUnlessDashboardAccess(request: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return null

  const authUser = await getAuthUser()
  if (authUser) return null

  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
}
