'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { VoicecardsBlock } from './_components/voicecards-block'
import { VoicecardsSettingsDialog } from './_components/voicecards-settings-dialog'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats } from '@/lib/reviewnotes-supabase'

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
  users: Array<{
    nickname: string | null
    credits: number
    sheetCount: number
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
  demoSheets: Array<{ sheetId: string; cards: number; devices: number }>
  platforms: Array<{ platform: string; devices: number; events: number }>
  locales: Array<{ locale: string; devices: number }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonorPage() {
  const mobile = useIsMobile()

  // VoiceCards state
  const [vcLoading, setVcLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [vcUserStats, setVcUserStats] = useState<UserStats | null>(null)
  const [vcAnonStats, setVcAnonStats] = useState<AnonymousEventStats | null>(null)
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
    else setVcLoading(true)
    try {
      const end = new Date().toISOString().split('T')[0]
      const start = `${new Date().getFullYear()}-01-01`
      const res = await fetch(`/api/voicecards/stats?startDate=${start}&endDate=${end}`)
      if (res.ok) {
        const data = await res.json()
        setVcStats(data.stats)
        setVcUserStats(data.userStats || null)
        setVcAnonStats(data.anonymousStats || null)
      }
    } catch (err) {
      console.error('VoiceCards load error:', err)
    } finally {
      setVcLoading(false)
      setVcRefreshing(false)
    }
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>MonoR Apps</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>류하 학습에 필요한 교육용 모바일/웹앱을 직접 개발</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
        gap: 14,
        alignItems: 'start',
      }}>
        <VoicecardsBlock
          loading={vcLoading}
          stats={vcStats}
          userStats={vcUserStats}
          anonymousStats={vcAnonStats}
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
