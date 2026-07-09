'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { VoicecardsBlock } from './_components/voicecards-block'
import { VoicecardsSettingsDialog } from './_components/voicecards-settings-dialog'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import { useDashCols } from './_components/cols-toggle'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats } from '@/lib/reviewnotes-supabase'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { kstToday } from '@/lib/kst'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CombinedStats {
  combined: {
    totalRevenue: number
    totalCreditsSold: number
    totalPaidUsers: number
    totalNewDownloads: number
  }
}

interface UserStats {
  totalUsers: number
  activeUsers: number
  totalSheets: number
  totalCards: number
  totalAttempts: number
  totalCredits: number
  dailyLearnActivity: Array<{
    date: string
    cardsLearned: number
    attempts: number
  }>
  dailyCardInventory: Array<{
    date: string
    totalCards: number
  }>
  users: Array<{
    id: string
    nickname: string | null
    email: string | null
    appVersion: string | null
    platform: string | null
    locale: string | null
    country: string | null
    hasPurchased: boolean
    credits: number
    purchasedCredits: number
    creditsUsed: number
    sheetCount: number
    cards: number
    attempts: number
    cardsToday: number
    attemptsToday: number
    listenToday: number
    activeDays7d: number
    purchasedToday: number
    balanceDeltaToday: number
    sheetsDeltaToday: number
    intentPremiumVoice: boolean
    intentAi: boolean
    intentBanner: boolean
    intentGated: boolean
    hotLead: boolean
    lastIntentAt: string | null
    createdAt: string
    lastActiveAt: string | null
  }>
}

interface AnonymousEventStats {
  summary: {
    totalEvents: number
    totalDevices: number
    learnedDevices: number
    signinDevices: number
    learnConversionPct: number
    signinConversionPct: number
  }
  daily: Array<{
    date: string
    devices: number
    appOpened: number
    cardsLearned: number
    promptShown: number
    signinCompleted: number
    loggedDevices: number
    anonDevices: number
  }>
  cumulativeDistinct: Array<{
    date: string
    devices: number
    learned: number
    signin: number
  }>
  dailyCreditUsage: Array<{
    date: string
    credits: number
  }>
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
  countries: Array<{ country: string; devices: number }>
  signinPlatforms: Array<{ platform: string; devices: number }>
  signinLocales: Array<{ locale: string; devices: number }>
  signinCountries: Array<{ country: string; devices: number }>
  payingPlatforms: Array<{ platform: string; devices: number }>
  payingLocales: Array<{ locale: string; devices: number }>
  payingCountries: Array<{ country: string; devices: number }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonorPage() {
  const mobile = useIsMobile()
  const cols = useDashCols()

  // VoiceCards state — 3개 파트 독립 로딩 (사용자/이벤트/매출)
  const [vcUsersLoading, setVcUsersLoading] = useState(true)
  const [vcEventsLoading, setVcEventsLoading] = useState(true)
  const [vcRevenueLoading, setVcRevenueLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [vcUserStats, setVcUserStats] = useState<UserStats | null>(null)
  const [vcAnonStats, setVcAnonStats] = useState<AnonymousEventStats | null>(null)
  const [vcChartData, setVcChartData] = useState<Array<{ date: string; ios: number; android: number; total: number; credits: number; paidUsers?: number }>>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ReviewNotes state
  const [rnLoading, setRnLoading] = useState(true)
  const [rnRefreshing, setRnRefreshing] = useState(false)
  const [rnStats, setRnStats] = useState<ReviewNotesStats | null>(null)
  const [rnUserStats, setRnUserStats] = useState<ReviewNotesUserStats | null>(null)
  const [rnTrafficStats, setRnTrafficStats] = useState<ReviewNotesTrafficStats | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadVoicecards = useCallback(async (refresh = false) => {
    if (refresh) setVcRefreshing(true)
    if (!refresh) {
      setVcUsersLoading(true)
      setVcEventsLoading(true)
      setVcRevenueLoading(true)
    }

    const end = kstToday()
    const start = `${end.slice(0, 4)}-01-01`

    // 3개 API 병렬 호출 — 각 응답이 도착하는 대로 즉시 화면 반영
    const usersP = fetch('/api/voicecards/stats/users', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setVcUserStats(data.userStats || null)
      })
      .catch(err => console.error('VoiceCards users load error:', err))
      .finally(() => setVcUsersLoading(false))

    const eventsP = fetch('/api/voicecards/stats/events', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setVcAnonStats(data.anonymousStats || null)
      })
      .catch(err => console.error('VoiceCards events load error:', err))
      .finally(() => setVcEventsLoading(false))

    const revenueP = fetch(`/api/voicecards/stats?startDate=${start}&endDate=${end}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setVcStats(data.stats)
          setVcChartData(data.chartData || [])
        }
      })
      .catch(err => console.error('VoiceCards revenue load error:', err))
      .finally(() => setVcRevenueLoading(false))

    await Promise.all([usersP, eventsP, revenueP])
    setVcRefreshing(false)
  }, [])

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
      setRnUserStats(data.userStats || null)
      setRnTrafficStats(data.trafficStats || null)
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

  const refreshAll = useCallback(() => {
    loadVoicecards(true)
    loadReviewnotes(true)
  }, [loadVoicecards, loadReviewnotes])
  useAgentRefresh(['voicecards_', 'reviewnotes_'], refreshAll)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr' : (cols === 1 ? '1fr' : '1fr 1fr'),
        gap: 14,
        alignItems: 'start',
      }}>
        <VoicecardsBlock
          usersLoading={vcUsersLoading}
          eventsLoading={vcEventsLoading}
          revenueLoading={vcRevenueLoading}
          stats={vcStats}
          userStats={vcUserStats}
          anonymousStats={vcAnonStats}
          chartData={vcChartData}
          onOpenSettings={() => setSettingsOpen(true)}
          onRefresh={() => loadVoicecards(true)}
          refreshing={vcRefreshing}
        />

        <ReviewnotesBlock
          loading={rnLoading}
          stats={rnStats}
          userStats={rnUserStats}
          trafficStats={rnTrafficStats}
          onRefresh={() => loadReviewnotes(true)}
          refreshing={rnRefreshing}
          error={rnError}
        />
      </div>

      <VoicecardsSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={() => loadVoicecards(true)}
      />
    </>
  )
}
