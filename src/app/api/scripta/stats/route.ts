import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getScriptaStats } from '@/lib/scripta-supabase'
import { getScriptaSalesStats } from '@/lib/lemonsqueezy'

// supabase-js fetch는 no-store라 라우트 segment revalidate가 안 먹으므로 unstable_cache로 결과를 캐싱한다.
// 60초 — 리뷰노트/보이스카드와 같은 신선도. 뷰어가 CEO 1인이라 RPC 2콜/분이면 충분히 여유.
const getCachedScriptaData = unstable_cache(
  async () => {
    // 결제는 리뷰노트와 같은 스토어라 상품(Scripta Credits)으로 갈라 받는다.
    // 실패해도 DB 집계는 살린다 — 대시보드 전체가 LS 장애에 묶이지 않게.
    const [db, sales] = await Promise.all([
      getScriptaStats(),
      getScriptaSalesStats().catch(err => {
        console.error('Error fetching Scripta sales:', err)
        return null
      }),
    ])
    return { ...db, sales }
  },
  ['scripta-stats'],
  { revalidate: 60, tags: ['scripta-stats'] }
)

export async function GET() {
  try {
    const data = await getCachedScriptaData()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Error fetching Scripta stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics', message: String(error) },
      { status: 500 }
    )
  }
}
