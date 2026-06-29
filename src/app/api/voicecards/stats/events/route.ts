import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getAnonymousEventStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// anonymous_events 집계 — 60초 캐싱 (이전 5분)
const getCachedAnonStats = unstable_cache(
  async () => getAnonymousEventStats(),
  ['voicecards-anon-stats'],
  { revalidate: 60, tags: ['voicecards-stats'] }
)

export async function GET() {
  try {
    const anonymousStats = await getCachedAnonStats()
    return NextResponse.json({ success: true, anonymousStats })
  } catch (error) {
    console.error('Error fetching voicecards anonymous events:', error)
    return NextResponse.json({ error: 'Failed to fetch anonymous events' }, { status: 500 })
  }
}
