'use client'

import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign,
  Users,
  TrendingUp,
  RefreshCw,
  CreditCard,
  UserPlus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import type {
  ReviewNotesStats,
  LemonSqueezyOrder,
  LemonSqueezySubscription,
  LemonSqueezyCustomer,
} from '@/lib/lemonsqueezy'

// 숫자 포맷팅
function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value / 100) // LemonSqueezy는 센트 단위
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// 구독 상태 색상
function getSubscriptionStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'on_trial':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'cancelled':
    case 'expired':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'paused':
    case 'past_due':
    case 'unpaid':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default:
      return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
  }
}

// 주문 상태 색상
function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'paid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'refunded':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    default:
      return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
  }
}

// 스켈레톤 컴포넌트
function StatCardSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2 animate-pulse">
          <div className="h-7 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
          <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </CardContent>
    </Card>
  )
}

// 메인 페이지 컴포넌트
export default function ReviewNotesPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState<ReviewNotesStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<LemonSqueezyOrder[]>([])
  const [subscriptions, setSubscriptions] = useState<LemonSqueezySubscription[]>([])
  const [customers, setCustomers] = useState<LemonSqueezyCustomer[]>([])
  const [error, setError] = useState<string | null>(null)

  // 데이터 로드
  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/reviewnotes/stats')

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to fetch data')
      }

      const data = await res.json()
      setStats(data.stats)
      setRecentOrders(data.recentOrders || [])
      setSubscriptions(data.subscriptions || [])
      setCustomers(data.customers || [])
    } catch (err) {
      console.error('Error loading data:', err)
      setError(String(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 활성 구독자 목록
  const activeSubscribers = subscriptions.filter(s => s.attributes.status === 'active')

  return (
    <ProtectedPage pagePath="/monor/reviewnotes">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">ReviewNotes 매출 현황</h1>
            <p className="text-sm text-muted-foreground mt-1">
              LemonSqueezy 연동을 통한 매출 및 구독 현황을 확인하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://app.lemonsqueezy.com/products', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              대시보드
            </Button>
          </div>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* 요약 통계 카드 */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-4">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-4">
            {/* 총 매출 */}
            <Card className="bg-slate-100 dark:bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  총 매출
                </CardTitle>
                <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                  <DollarSign className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats ? formatCurrency(stats.totalRevenueUSD) : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  이번 달: {stats ? formatCurrency(stats.monthlyRevenueUSD) : '-'}
                </p>
              </CardContent>
            </Card>

            {/* MRR */}
            <Card className="bg-slate-100 dark:bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  MRR
                </CardTitle>
                <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                  <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats ? formatCurrency(stats.mrr) : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  월간 반복 매출
                </p>
              </CardContent>
            </Card>

            {/* 활성 구독자 */}
            <Card className="bg-slate-100 dark:bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  활성 구독자
                </CardTitle>
                <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                  <Users className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats ? formatNumber(stats.activeSubscriptions) : '-'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    <Clock className="h-3 w-3" />
                    체험 {stats?.trialSubscriptions || 0}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    취소 {stats?.cancelledSubscriptions || 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 총 고객 */}
            <Card className="bg-slate-100 dark:bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  총 고객
                </CardTitle>
                <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                  <UserPlus className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats ? formatNumber(stats.totalCustomers) : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  이번 달 신규: +{stats?.newCustomersThisMonth || 0}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 하단 그리드: 최근 주문 & 활성 구독자 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* 최근 주문 */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <CardTitle className="text-base">최근 주문</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">
                  총 {stats?.totalOrders || 0}건
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
                  ))}
                </div>
              ) : recentOrders.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {recentOrders.slice(0, 10).map((order) => (
                    <div
                      key={order.id}
                      className="p-2 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {order.attributes.user_name || order.attributes.user_email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.attributes.first_order_item?.product_name || 'Product'} · {formatDate(order.attributes.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${getOrderStatusColor(order.attributes.status)}`}>
                          {order.attributes.status_formatted}
                        </span>
                        <span className="text-sm font-medium">
                          {order.attributes.total_formatted}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  주문 없음
                </p>
              )}
            </CardContent>
          </Card>

          {/* 활성 구독자 */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <CardTitle className="text-base">활성 구독자</CardTitle>
                </div>
                <span className="text-xs text-muted-foreground">
                  {activeSubscribers.length}명
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
                  ))}
                </div>
              ) : activeSubscribers.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {activeSubscribers.map((sub) => (
                    <div
                      key={sub.id}
                      className="p-2 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {sub.attributes.user_name || sub.attributes.user_email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sub.attributes.product_name} · {sub.attributes.variant_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${getSubscriptionStatusColor(sub.attributes.status)}`}>
                          {sub.attributes.status_formatted}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          갱신: {formatDate(sub.attributes.renews_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  활성 구독자 없음
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 주문 통계 */}
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle>주문 통계</CardTitle>
            <CardDescription>
              이번 달 주문 현황
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                <p className="text-2xl font-bold">{stats?.ordersThisMonth || 0}</p>
                <p className="text-xs text-muted-foreground">이번 달 주문</p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                <p className="text-2xl font-bold">{stats?.totalOrders || 0}</p>
                <p className="text-xs text-muted-foreground">총 주문</p>
              </div>
              <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                <p className="text-2xl font-bold text-red-600">{stats?.refundedOrders || 0}</p>
                <p className="text-xs text-muted-foreground">환불</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedPage>
  )
}
