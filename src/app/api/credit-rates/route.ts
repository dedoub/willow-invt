import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getAllRates, setRate } from '@/lib/credit-rates'

export const dynamic = 'force-dynamic'

/**
 * 세 앱의 요율을 읽고 고친다.
 *
 * <b>관리자만.</b> 여기서 한 자 고치면 세 앱 중 하나의 값매김이 즉시 바뀐다 —
 * 배포도, 스토어 심사도 거치지 않는다. 그게 이 화면의 값어치이자 위험이다.
 */
async function requireAdmin(): Promise<Response | null> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  return null
}

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ apps: await getAllRates(), fetchedAt: new Date().toISOString() })
  } catch (error) {
    console.error('credit rates load failed', error)
    return NextResponse.json({ error: '요율을 읽지 못했습니다' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const body = await request.json() as { app?: string; key?: string; value?: number | null; note?: string }
    if (!body.app || !body.key) {
      return NextResponse.json({ error: 'app 과 key 가 필요합니다' }, { status: 400 })
    }
    // `value: null` 은 「지워서 코드 기본값으로 되돌린다」는 뜻이다. 값이 아예
    // 없는 것(undefined)과 구별해야 실수로 전부 지우는 일이 없다.
    if (body.value === undefined) {
      return NextResponse.json({ error: 'value 가 필요합니다(되돌리려면 null)' }, { status: 400 })
    }
    await setRate(body.app, body.key, body.value, body.note)
    return NextResponse.json({ apps: await getAllRates() })
  } catch (error) {
    const message = error instanceof Error ? error.message : '요율을 바꾸지 못했습니다'
    console.error('credit rate patch failed', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
