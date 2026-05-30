'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { VoicecardsBlock } from './_components/voicecards-block'
import { VoicecardsSettingsDialog } from './_components/voicecards-settings-dialog'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CombinedStats {
  combined: {
    totalRevenue: number
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
    credits: number
    creditsUsed: number
    sheetCount: number
    cards: number
    attempts: number
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
  signinPlatforms: Array<{ platform: string; devices: number }>
  signinLocales: Array<{ locale: string; devices: number }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonorPage() {
  const mobile = useIsMobile()

  // VoiceCards state — 3개 파트 독립 로딩 (사용자/이벤트/매출)
  const [vcUsersLoading, setVcUsersLoading] = useState(true)
  const [vcEventsLoading, setVcEventsLoading] = useState(true)
  const [vcRevenueLoading, setVcRevenueLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [vcUserStats, setVcUserStats] = useState<UserStats | null>(null)
  const [vcAnonStats, setVcAnonStats] = useState<AnonymousEventStats | null>(null)
  const [vcChartData, setVcChartData] = useState<Array<{ date: string; ios: number; android: number; total: number }>>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ReviewNotes state
  const [rnLoading, setRnLoading] = useState(true)
  const [rnRefreshing, setRnRefreshing] = useState(false)
  const [rnStats, setRnStats] = useState<ReviewNotesStats | null>(null)
  const [rnUserStats, setRnUserStats] = useState<ReviewNotesUserStats | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadVoicecards = useCallback(async (refresh = false) => {
    if (refresh) setVcRefreshing(true)
    if (!refresh) {
      setVcUsersLoading(true)
      setVcEventsLoading(true)
      setVcRevenueLoading(true)
    }

    const end = new Date().toISOString().split('T')[0]
    const start = `${new Date().getFullYear()}-01-01`

    // 3개 API 병렬 호출 — 각 응답이 도착하는 대로 즉시 화면 반영
    const usersP = fetch('/api/voicecards/stats/users')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setVcUserStats(data.userStats || null)
      })
      .catch(err => console.error('VoiceCards users load error:', err))
      .finally(() => setVcUsersLoading(false))

    const eventsP = fetch('/api/voicecards/stats/events')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setVcAnonStats(data.anonymousStats || null)
      })
      .catch(err => console.error('VoiceCards events load error:', err))
      .finally(() => setVcEventsLoading(false))

    const revenueP = fetch(`/api/voicecards/stats?startDate=${start}&endDate=${end}`)
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
        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
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
