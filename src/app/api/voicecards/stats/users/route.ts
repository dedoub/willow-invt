import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// 5개 vc_user_* RPC 를 병렬 조회하지만 각각 mv_real_users(10만행) 를 재스캔해 정상 ~2.5s,
// MV 리프레시·체크포인트와 겹치면 ~8s 까지 스파이크. 자동 새로고침이 이 재계산을 반복해서 물지
// 않도록 300초 캐싱 (분석 지표라 5분 staleness 무방). 60초→300초 (2026-07-22).
// 조회 실패 시 반환되는 empty(유저 0명)를 캐싱하면 그동안 0으로 표시 — throw로 캐시를 막는다.
const getCachedUserStats = unstable_cache(
  async () => {
    const stats = await getVoicecardsUserStats()
    if (!stats?.users?.length) throw new Error('voicecards user stats empty (transient fetch failure)')
    return stats
  },
  ['voicecards-user-stats'],
  { revalidate: 300, tags: ['voicecards-stats'] }
)

export async function GET() {
  try {
    const userStats = await getCachedUserStats()
    return NextResponse.json({ success: true, userStats })
  } catch (error) {
    console.error('Error fetching voicecards user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch user stats' }, { status: 500 })
  }
}
