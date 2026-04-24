'use client'

import { useState, useEffect, useCallback } from 'react'
import { useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { VoicecardsBlock } from './_components/voicecards-block'
import { VoicecardsSettingsDialog } from './_components/voicecards-settings-dialog'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats, LemonSqueezyOrder, LemonSqueezySubscription } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  dateRange: { start: string; end: string }
}

interface ConnectionStatus {
  ios: { connected: boolean; appId?: string }
  android: { connected: boolean; packageName?: string }
}

interface ChartDataPoint {
  date: string
  ios: number
  android: number
  total: number
}

type DateRangeType = 'daily' | 'weekly' | 'monthly'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(type: DateRangeType): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  switch (type) {
    case 'daily': start.setDate(end.getDate() - 7); break
    case 'weekly': start.setDate(end.getDate() - 30); break
    case 'monthly': start.setMonth(end.getMonth() - 6); break
  }
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonorPage() {
  const mobile = useIsMobile()

  // VoiceCards state
  const [vcLoading, setVcLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    ios: { connected: false }, android: { connected: false },
  })
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [dateRange, setDateRange] = useState<DateRangeType>('weekly')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ReviewNotes state
  const [rnLoading, setRnLoading] = useState(true)
  const [rnRefreshing, setRnRefreshing] = useState(false)
  const [rnStats, setRnStats] = useState<ReviewNotesStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<LemonSqueezyOrder[]>([])
  const [subscriptions, setSubscriptions] = useState<LemonSqueezySubscription[]>([])
  const [userStats, setUserStats] = useState<ReviewNotesUserStats | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadVoicecards = useCallback(async (refresh = false) => {
    if (refresh) setVcRefreshing(true)
    else setVcLoading(true)
    try {
      const range = getDateRange(dateRange)
      const res = await fetch(`/api/voicecards/stats?startDate=${range.start}&endDate=${range.end}`)
      if (res.ok) {
        const data = await res.json()
        setConnectionStatus(data.connection)
        setVcStats(data.stats)
        setChartData(data.chartData || [])
      }
    } catch (err) {
      console.error('VoiceCards load error:', err)
    } finally {
      setVcLoading(false)
      setVcRefreshing(false)
    }
  }, [dateRange])

  const loadReviewnotes = useCallback(async (refresh = false) => {
    if (refresh) setRnRefreshing(true)
    else setRnLoading(true)
    setRnError(null)
    try {
      const res = await fetch('/api/reviewnotes/stats')
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.message || 'Failed to fetch')
      }
      const data = await res.json()
      setRnStats(data.stats)
      setRecentOrders(data.recentOrders || [])
      setSubscriptions(data.subscriptions || [])
      setUserStats(data.userStats || null)
    } catch (err) {
      console.error('ReviewNotes load error:', err)
      setRnError(String(err))
    } finally {
      setRnLoading(false)
      setRnRefreshing(false)
    }
  }, [])

  useEffect(() => { loadVoicecards() }, [loadVoicecards])
  useEffect(() => { loadReviewnotes() }, [loadReviewnotes])

  const handleDateRangeChange = (range: DateRangeType) => {
    setDateRange(range)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
      <VoicecardsBlock
        loading={vcLoading}
        connectionStatus={connectionStatus}
        stats={vcStats}
        chartData={chartData}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefresh={() => loadVoicecards(true)}
        refreshing={vcRefreshing}
      />

      <ReviewnotesBlock
        loading={rnLoading}
        stats={rnStats}
        recentOrders={recentOrders}
        subscriptions={subscriptions}
        userStats={userStats}
        onRefresh={() => loadReviewnotes(true)}
        refreshing={rnRefreshing}
        error={rnError}
      />

      <VoicecardsSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => loadVoicecards(true)}
      />
    </div>
  )
}
