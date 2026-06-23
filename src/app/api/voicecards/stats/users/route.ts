import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// anonymous_events_real_users 전수 스캔(앱버전·크레딧)을 포함해 ~15초 걸리므로 5분 캐싱.
const getCachedUserStats = unstable_cache(
  async () => getVoicecardsUserStats(),
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
