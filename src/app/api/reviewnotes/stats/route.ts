import { NextResponse } from 'next/server'
import {
  getReviewNotesStats,
  getOrders,
  getSubscriptions,
  getCustomers,
} from '@/lib/lemonsqueezy'
import { getReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

export async function GET() {
  try {
    const storeId = process.env.LEMONSQUEEZY_STORE_ID

    // 통계 및 상세 데이터 병렬 조회
    const [stats, ordersRes, subscriptionsRes, customersRes, userStats] = await Promise.all([
      getReviewNotesStats(),
      getOrders(storeId, 1, 20), // 최근 20개 주문
      getSubscriptions(storeId, 1, 100),
      getCustomers(storeId, 1, 100),
      getReviewNotesUserStats().catch(err => {
        console.error('Error fetching user stats:', err)
        return null
      }),
    ])

    return NextResponse.json({
      success: true,
      stats,
      recentOrders: ordersRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      customers: customersRes.data || [],
      userStats,
    })
  } catch (error) {
    console.error('Error fetching ReviewNotes stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics', message: String(error) },
      { status: 500 }
    )
  }
}
