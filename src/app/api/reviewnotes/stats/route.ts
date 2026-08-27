import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getReviewNotesSalesStats } from '@/lib/lemonsqueezy'
import { getReviewNotesUserStats, getReviewNotesTrafficStats, getReviewNotesContentStats } from '@/lib/reviewnotes-supabase'

// 결제(LemonSqueezy) + Supabase 집계(User 전수, PageView 대량)를 통째로 캐싱.
// supabase-js fetch는 no-store라 라우트 segment revalidate가 안 먹으므로 unstable_cache로 결과를 캐싱한다.
//
// 2026-08-27: 구독을 접고 크레딧 팩으로 간 뒤로 구독·고객·MRR 조회를 걷어냈다. 구독자가 0명이라
// 그 세 콜은 늘 빈 배열과 $0을 물어왔고, 남은 플랜 컬럼 때문에 있지도 않은 월 매출이 잡혔다.
// 지금 돈이 오가는 유일한 경로는 'ReviewNotes Credits' 상품 주문이다.
const getCachedReviewNotesData = unstable_cache(
  async () => {
    const [sales, userStats, trafficStats, contentStats] = await Promise.all([
      // 결제는 스크립타와 같은 스토어라 상품으로 갈라 받는다. 실패해도 DB 집계는 살린다.
      getReviewNotesSalesStats().catch(err => {
        console.error('Error fetching ReviewNotes sales:', err)
        return null
      }),
      getReviewNotesUserStats().catch(err => {
        console.error('Error fetching user stats:', err)
        return null
      }),
      getReviewNotesTrafficStats().catch(err => {
        console.error('Error fetching traffic stats:', err)
        return null
      }),
      getReviewNotesContentStats().catch(err => {
        console.error('Error fetching content stats:', err)
        return null
      }),
    ])

    return { sales, userStats, trafficStats, contentStats }
  },
  ['reviewnotes-stats'],
  // 60초 캐시 — 보이스카드(events/users)와 동일 신선도로 맞춤 (2026-07-16 CEO).
  { revalidate: 60, tags: ['reviewnotes-stats'] }
)

export async function GET() {
  try {
    const data = await getCachedReviewNotesData()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('Error fetching ReviewNotes stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics', message: String(error) },
      { status: 500 }
    )
  }
}
