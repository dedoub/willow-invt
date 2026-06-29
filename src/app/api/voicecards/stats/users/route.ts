import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// DB 집계 RPC로 ~1초대로 단축됨(이전 ~15초). 신선도 위해 60초 캐싱.
const getCachedUserStats = unstable_cache(
  async () => getVoicecardsUserStats(),
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
