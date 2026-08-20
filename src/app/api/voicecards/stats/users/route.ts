import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'
import { VOICECARDS_USER_STATS_CACHE_KEY } from '@/lib/voicecards-device-journey'

export const maxDuration = 300

// 5개 vc_user_* RPC 를 병렬 조회한다. 운영 분석 지표라 실시간성이 필요하지 않으므로
// Disk IO 예산 보호를 위해 5분→1시간 캐싱 (2026-08-20).
// 조회 실패 시 반환되는 empty(유저 0명)를 캐싱하면 그동안 0으로 표시 — throw로 캐시를 막는다.
const getCachedUserStats = unstable_cache(
  async () => {
    const stats = await getVoicecardsUserStats()
    if (!stats?.users?.length) throw new Error('voicecards user stats empty (transient fetch failure)')
    return stats
  },
  [VOICECARDS_USER_STATS_CACHE_KEY],
  { revalidate: 3600, tags: ['voicecards-stats'] }
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
