import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getPortleStats } from '@/lib/portle-supabase'

// Portle DB 집계를 60초 캐싱 — 보이스카드/리뷰노트와 동일 신선도.
// supabase-js fetch는 no-store라 라우트 revalidate가 안 먹으므로 unstable_cache로 결과를 캐싱한다.
const getCachedPortleStats = unstable_cache(
  async () => getPortleStats(),
  ['portle-stats'],
  { revalidate: 60, tags: ['portle-stats'] }
)

export async function GET() {
  try {
    const stats = await getCachedPortleStats()
    return NextResponse.json({ success: true, stats })
  } catch (error) {
    console.error('Portle stats error:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Portle 통계 조회 실패' },
      { status: 500 }
    )
  }
}
