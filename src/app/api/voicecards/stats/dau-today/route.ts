import { NextResponse } from 'next/server'
import { revalidateTag, unstable_cache } from 'next/cache'
import { getVoicecardsDauToday } from '@/lib/voicecards-server'

export const maxDuration = 60

// 일별 활동자 차트의 오늘 칸. 나머지 집계(stats/events)는 매시 갱신 MV 라 캐시도 1시간이지만,
// 이 한 칸은 하루가 차오르는 걸 보는 자리라 5분으로 둔다. 오늘 이벤트만 세는 쿼리라
// 1초 안쪽이고, 시간당 12번이어도 mv_event_stats 리프레시(35초) 한 번보다 가볍다.
const getCachedDauToday = unstable_cache(
  async () => {
    const today = await getVoicecardsDauToday()
    // 일시 실패를 캐싱하면 5분 동안 오늘 칸이 통째로 빈다 — throw 로 캐시를 막는다.
    if (!today) throw new Error('vc_dau_today returned null')
    return today
  },
  ['voicecards-dau-today'],
  { revalidate: 300, tags: ['voicecards-dau-today'] }
)

export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  try {
    if (refresh) revalidateTag('voicecards-dau-today', { expire: 0 })
    const today = refresh ? await getVoicecardsDauToday() : await getCachedDauToday()
    if (!today) throw new Error('vc_dau_today returned null')
    return NextResponse.json({ success: true, today })
  } catch (error) {
    console.error('Error fetching voicecards DAU today:', error)
    return NextResponse.json({ error: 'Failed to fetch DAU today' }, { status: 500 })
  }
}
