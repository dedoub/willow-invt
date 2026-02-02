import { NextResponse } from 'next/server'
import {
  getReviewNotesStats,
  getOrders,
  getSubscriptions,
  getCustomers,
} from '@/lib/lemonsqueezy'

export async function GET() {
  try {
    const storeId = process.env.LEMONSQUEEZY_STORE_ID

    // 통계 및 상세 데이터 병렬 조회
    const [stats, ordersRes, subscriptionsRes, customersRes] = await Promise.all([
      getReviewNotesStats(),
      getOrders(storeId, 1, 20), // 최근 20개 주문
      getSubscriptions(storeId, 1, 100),
      getCustomers(storeId, 1, 100),
    ])

    return NextResponse.json({
      success: true,
      stats,
      recentOrders: ordersRes.data || [],
      subscriptions: subscriptionsRes.data || [],
      customers: customersRes.data || [],
    })
  } catch (error) {
    console.error('Error fetching ReviewNotes stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics', message: String(error) },
      { status: 500 }
    )
  }
}
