import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import {
  getReviewNotesStats,
  getOrders,
  getSubscriptions,
  getCustomers,
} from '@/lib/lemonsqueezy'
import { getReviewNotesUserStats, getReviewNotesTrafficStats, getReviewNotesContentStats, recordReviewNotesMrr } from '@/lib/reviewnotes-supabase'

// 결제(LemonSqueezy) + Supabase 집계(User 전수, PageView 대량)를 통째로 5분 캐싱.
// supabase-js fetch는 no-store라 라우트 segment revalidate가 안 먹으므로 unstable_cache로 결과를 캐싱한다.
const getCachedReviewNotesData = unstable_cache(
  async () => {
    const storeId = process.env.LEMONSQUEEZY_STORE_ID

    // 통계 및 상세 데이터 병렬 조회
    const [stats, ordersRes, subscriptionsRes, customersRes, userStats, trafficStats, contentStats] = await Promise.all([
      getReviewNotesStats(),
      getOrders(storeId, 1, 20), // 최근 20개 주문
      getSubscriptions(storeId, 1, 100),
      getCustomers(storeId, 1, 100),
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

    // 오늘 MRR 스냅샷 기록 (MRR 스파크라인용 히스토리 축적 — 실패해도 응답엔 영향 없음)
    await recordReviewNotesMrr(stats.mrr, stats.activeSubscriptions).catch(() => {})

    return {
      stats,
      recentOrders: ordersRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      customers: customersRes.data || [],
      userStats,
      trafficStats,
      contentStats,
    }
  },
  ['reviewnotes-stats'],
  // 60초 캐시 — 보이스카드(events/users)와 동일 신선도로 맞춤 (2026-07-16 CEO).
  // LemonSqueezy 3콜 + Supabase RPC 묶음이 1분당 최대 1회. 뷰어가 CEO 1인이라 레이트리밋 여유.
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
