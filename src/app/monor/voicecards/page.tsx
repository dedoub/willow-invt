'use client'

import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Settings,
  Apple,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// 타입 정의
interface IAPStats {
  platform: 'ios' | 'android'
  date: string
  revenue: number
  currency: string
  activeSubscriptions: number
  newSubscriptions: number
  churnedSubscriptions: number
  renewedSubscriptions: number
  refundCount: number
  refundAmount: number
}

interface ConnectionStatus {
  ios: { connected: boolean; appId?: string }
  android: { connected: boolean; packageName?: string }
}

interface CombinedStats {
  ios: IAPStats | null
  android: IAPStats | null
  combined: {
    totalRevenue: number
    totalActiveSubscriptions: number
    totalNewSubscriptions: number
    totalChurnedSubscriptions: number
    totalRefunds: number
  }
  dateRange: {
    start: string
    end: string
  }
}

interface ChartDataPoint {
  date: string
  ios: number
  android: number
  total: number
}

// 날짜 범위 타입
type DateRangeType = 'daily' | 'weekly' | 'monthly'

// 숫자 포맷팅
function formatCurrency(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(1)}억원`
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만원`
  }
  return `${value.toLocaleString()}원`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatChange(current: number, previous: number): { value: string; isPositive: boolean } {
  if (previous === 0) return { value: '-', isPositive: true }
  const change = ((current - previous) / previous) * 100
  return {
    value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    isPositive: change >= 0,
  }
}

// 날짜 범위 계산
function getDateRange(type: DateRangeType): { start: string; end: string } {
  const end = new Date()
  const start = new Date()

  switch (type) {
    case 'daily':
      start.setDate(end.getDate() - 7)
      break
    case 'weekly':
      start.setDate(end.getDate() - 30)
      break
    case 'monthly':
      start.setMonth(end.getMonth() - 6)
      break
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
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

// 연결 상태 배너
function ConnectionBanner({
  status,
  onOpenSettings,
}: {
  status: ConnectionStatus
  onOpenSettings: () => void
}) {
  const iosConnected = status.ios.connected
  const androidConnected = status.android.connected

  if (iosConnected && androidConnected) return null

  return (
    <div className="rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            API 연결이 필요합니다
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {!iosConnected && !androidConnected
              ? 'App Store Connect와 Google Play 모두 연결되지 않았습니다.'
              : !iosConnected
              ? 'App Store Connect API가 연결되지 않았습니다.'
              : 'Google Play API가 연결되지 않았습니다.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4 mr-1" />
            설정하기
          </Button>
        </div>
      </div>
    </div>
  )
}

// 설정 모달
function CredentialsModal({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const [saving, setSaving] = useState(false)

  // iOS 설정
  const [iosIssuerId, setIosIssuerId] = useState('')
  const [iosKeyId, setIosKeyId] = useState('')
  const [iosPrivateKey, setIosPrivateKey] = useState('')
  const [iosAppId, setIosAppId] = useState('')

  // Android 설정
  const [androidServiceAccount, setAndroidServiceAccount] = useState('')
  const [androidPackageName, setAndroidPackageName] = useState('')

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/voicecards/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ios_issuer_id: iosIssuerId || null,
          ios_key_id: iosKeyId || null,
          ios_private_key: iosPrivateKey || null,
          ios_app_id: iosAppId || null,
          android_service_account: androidServiceAccount || null,
          android_package_name: androidPackageName || null,
        }),
      })

      if (res.ok) {
        onSave()
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Error saving credentials:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-4 border-b">
          <DialogTitle>API 설정</DialogTitle>
          <DialogDescription>
            App Store Connect와 Google Play Developer API 인증 정보를 입력하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 px-1 -mx-1 py-4">
          {/* iOS 설정 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Apple className="h-4 w-4" />
              App Store Connect API
            </div>
            <div className="space-y-3 pl-6">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Issuer ID</label>
                <Input
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={iosIssuerId}
                  onChange={(e) => setIosIssuerId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Key ID</label>
                <Input
                  placeholder="XXXXXXXXXX"
                  value={iosKeyId}
                  onChange={(e) => setIosKeyId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Private Key (.p8 내용)</label>
                <Textarea
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  value={iosPrivateKey}
                  onChange={(e) => setIosPrivateKey(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">App ID (Vendor Number)</label>
                <Input
                  placeholder="123456789"
                  value={iosAppId}
                  onChange={(e) => setIosAppId(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Android 설정 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Smartphone className="h-4 w-4" />
              Google Play Developer API
            </div>
            <div className="space-y-3 pl-6">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Service Account JSON</label>
                <Textarea
                  placeholder='{"type": "service_account", ...}'
                  value={androidServiceAccount}
                  onChange={(e) => setAndroidServiceAccount(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Package Name</label>
                <Input
                  placeholder="com.example.app"
                  value={androidPackageName}
                  onChange={(e) => setAndroidPackageName(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
          <div />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 메인 페이지 컴포넌트
export default function VoicecardsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    ios: { connected: false },
    android: { connected: false },
  })
  const [stats, setStats] = useState<CombinedStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [dateRange, setDateRange] = useState<DateRangeType>('weekly')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 데이터 로드
  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)

    try {
      const range = getDateRange(dateRange)
      const res = await fetch(
        `/api/voicecards/stats?startDate=${range.start}&endDate=${range.end}`
      )

      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data.connection)
        setStats(data.stats)
        setChartData(data.chartData || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [dateRange])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 날짜 범위 변경
  const handleDateRangeChange = (range: DateRangeType) => {
    setDateRange(range)
  }

  return (
    <ProtectedPage pagePath="/monor/voicecards">
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">VoiceCards 인앱결제 통계</h1>
            <p className="text-sm text-muted-foreground mt-1">
              App Store와 Google Play의 인앱결제 현황을 확인하세요.
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
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-1" />
              설정
            </Button>
          </div>
        </div>

        {/* 연결 상태 배너 */}
        <ConnectionBanner
          status={connectionStatus}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* 날짜 범위 필터 */}
        <div className="flex flex-wrap gap-1 items-center">
          {(['daily', 'weekly', 'monthly'] as DateRangeType[]).map((range) => (
            <button
              key={range}
              onClick={() => handleDateRangeChange(range)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                dateRange === range
                  ? 'bg-slate-900 text-white dark:bg-slate-600'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
            >
              {range === 'daily' ? '일간' : range === 'weekly' ? '주간' : '월간'}
            </button>
          ))}
        </div>

        {/* 요약 통계 카드 */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
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
                  {stats ? formatCurrency(stats.combined.totalRevenue) : '-'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    <Apple className="h-3 w-3" />
                    {stats?.ios ? formatCurrency(stats.ios.revenue) : '-'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <Smartphone className="h-3 w-3" />
                    {stats?.android ? formatCurrency(stats.android.revenue) : '-'}
                  </span>
                </div>
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
                  {stats ? formatNumber(stats.combined.totalActiveSubscriptions) : '-'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    <Apple className="h-3 w-3" />
                    {stats?.ios ? formatNumber(stats.ios.activeSubscriptions) : '-'}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <Smartphone className="h-3 w-3" />
                    {stats?.android ? formatNumber(stats.android.activeSubscriptions) : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 순증감 */}
            <Card className="bg-slate-100 dark:bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  구독 순증감
                </CardTitle>
                <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                  {stats && stats.combined.totalNewSubscriptions - stats.combined.totalChurnedSubscriptions >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats
                    ? `${stats.combined.totalNewSubscriptions - stats.combined.totalChurnedSubscriptions >= 0 ? '+' : ''}${formatNumber(
                        stats.combined.totalNewSubscriptions - stats.combined.totalChurnedSubscriptions
                      )}`
                    : '-'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  신규 {stats?.combined.totalNewSubscriptions || 0} / 해지{' '}
                  {stats?.combined.totalChurnedSubscriptions || 0}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 플랫폼별 상세 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* iOS */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Apple className="h-5 w-5" />
                  <CardTitle className="text-base">App Store</CardTitle>
                </div>
                {connectionStatus.ios.connected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    연결됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    미연결
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              ) : stats?.ios ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">매출</p>
                    <p className="text-lg font-bold">{formatCurrency(stats.ios.revenue)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">구독자</p>
                    <p className="text-lg font-bold">{formatNumber(stats.ios.activeSubscriptions)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">신규</p>
                    <p className="text-lg font-bold text-emerald-600">
                      +{formatNumber(stats.ios.newSubscriptions)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">해지</p>
                    <p className="text-lg font-bold text-red-600">
                      -{formatNumber(stats.ios.churnedSubscriptions)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">갱신</p>
                    <p className="text-lg font-bold">{formatNumber(stats.ios.renewedSubscriptions)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">환불</p>
                    <p className="text-lg font-bold text-amber-600">
                      {formatNumber(stats.ios.refundCount)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  데이터 없음
                </p>
              )}
            </CardContent>
          </Card>

          {/* Android */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  <CardTitle className="text-base">Google Play</CardTitle>
                </div>
                {connectionStatus.android.connected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    연결됨
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    미연결
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {loading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              ) : stats?.android ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">매출</p>
                    <p className="text-lg font-bold">{formatCurrency(stats.android.revenue)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">구독자</p>
                    <p className="text-lg font-bold">{formatNumber(stats.android.activeSubscriptions)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">신규</p>
                    <p className="text-lg font-bold text-emerald-600">
                      +{formatNumber(stats.android.newSubscriptions)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">해지</p>
                    <p className="text-lg font-bold text-red-600">
                      -{formatNumber(stats.android.churnedSubscriptions)}
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">갱신</p>
                    <p className="text-lg font-bold">{formatNumber(stats.android.renewedSubscriptions)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-700">
                    <p className="text-xs text-muted-foreground">환불</p>
                    <p className="text-lg font-bold text-amber-600">
                      {formatNumber(stats.android.refundCount)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  데이터 없음
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 매출 추이 차트 */}
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle>매출 추이</CardTitle>
            <CardDescription>
              기간별 플랫폼 매출 현황
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="h-64 flex items-center justify-center animate-pulse">
                <div className="h-48 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => {
                        const date = new Date(value)
                        return `${date.getMonth() + 1}/${date.getDate()}`
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => {
                        if (value >= 10000) return `${(value / 10000).toFixed(0)}만`
                        return value.toString()
                      }}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value) || 0)}
                      labelFormatter={(label) => {
                        const date = new Date(label)
                        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="ios"
                      name="App Store"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="android"
                      name="Google Play"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="합계"
                      stroke="#6366f1"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                차트 데이터가 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 설정 모달 */}
      <CredentialsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSave={() => loadData(true)}
      />
    </ProtectedPage>
  )
}
