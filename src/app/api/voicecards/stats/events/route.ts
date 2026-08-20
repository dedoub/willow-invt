import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getAnonymousEventStats } from '@/lib/voicecards-server'

export const maxDuration = 300

// anonymous_events 집계(vc_event_stats)는 운영 분석 지표라 실시간성이 필요하지 않다.
// Disk IO 예산 보호를 위해 5분→1시간 캐싱 (2026-08-20).
// 일시 실패(null)를 캐싱하면 그동안 '다시 시도'까지 전부 실패 — throw로 캐시를 막는다.
const getCachedAnonStats = unstable_cache(
  async () => {
    const stats = await getAnonymousEventStats()
    if (!stats) throw new Error('vc_event_stats returned null (transient RPC failure)')
    return stats
  },
  ['voicecards-anon-stats'],
  { revalidate: 3600, tags: ['voicecards-stats'] }
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
