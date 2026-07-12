import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// DB 집계 RPC로 ~1초대로 단축됨(이전 ~15초). 신선도 위해 60초 캐싱.
// 조회 실패 시 반환되는 empty(유저 0명)를 캐싱하면 60초 동안 0으로 표시 — throw로 캐시를 막는다.
const getCachedUserStats = unstable_cache(
  async () => {
    const stats = await getVoicecardsUserStats()
    if (!stats?.users?.length) throw new Error('voicecards user stats empty (transient fetch failure)')
    return stats
  },
  ['voicecards-user-stats'],
  { revalidate: 60, tags: ['voicecards-stats'] }
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
