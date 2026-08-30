import { NextResponse } from 'next/server'
import { revalidateTag, unstable_cache } from 'next/cache'
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

// 새로고침 버튼(?refresh=1)은 1시간 캐시를 건너뛴다. 그냥 재요청만 하면 같은 캐시가
// 그대로 돌아와서 버튼이 아무것도 안 하는 것처럼 보였다 — 지표 정의를 고친 직후 특히.
export async function GET(request: Request) {
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  try {
    if (refresh) revalidateTag('voicecards-stats', { expire: 0 })
    const userStats = refresh ? await getVoicecardsUserStats() : await getCachedUserStats()
    return NextResponse.json({ success: true, userStats })
  } catch (error) {
    console.error('Error fetching voicecards user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch user stats' }, { status: 500 })
  }
}
