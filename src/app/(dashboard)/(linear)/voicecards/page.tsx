'use client'

import { useState, useEffect, useCallback } from 'react'
import { VoicecardsBlock } from './_components/voicecards-block'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SearchDemandCard } from '@/app/(dashboard)/_components/search-demand-card'
import { GeoAnswerCard } from '@/app/(dashboard)/_components/geo-answer-card'
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
  // 기기 계정(로그인 없이 크레딧을 쓰는 사용자). 병합된 계정은 제외.
  deviceAccounts: number
  // 그중 실제로 덱을 만든 수 — 퍼널 '학습 활성화'에 구글 활성화와 합산된다.
  deviceAccountsActivated: number
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
    bonusCredits: number
    offerStage: string | null
    offerStageAt: string | null
    creditsUsed: number
    creditsSpent?: number
    hasFolder: boolean
    ownCards?: number
    sheetCount: number
    cards: number
    flips: number
    attempts: number
    cardsToday: number
    attemptsToday: number
    listenToday: number
    flipsToday: number
    spentToday: number
    activeDays7d: number
    purchasedToday: number
    balanceDeltaToday: number
    sheetsDeltaToday: number
    intentPremiumVoice: boolean
    intentAi: boolean
    intentBanner: boolean
    intentGated: boolean
    hotLead: boolean
    purchaseScore: number
    lastIntentAt: string | null
    lastListenEndAt: string | null
    createdAt: string
    activatedAt?: string | null
    lastActiveAt: string | null
    // 설치일 — 이 사용자의 기기 중 가장 이른 first_seen. 뷰 이전 가입자는 null.
    installedAt: string | null
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
  dailyFlips?: Array<{ date: string; flips: number }>
  dailyCreditSpend?: Array<{ date: string; tts: number; ai: number }>
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
  storeVisits?: Array<{ date: string; visitors: number }>
  versions?: Array<{ version: string; devices: number }>
  versionsIos?: Array<{ version: string; devices: number }>
  versionsAndroid?: Array<{ version: string; devices: number }>
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoicecardsPage() {
  const cols = useDashCols()
  const mobile = useIsMobile()
  // 3개 파트 독립 로딩 (사용자/이벤트/매출)
  const [vcUsersLoading, setVcUsersLoading] = useState(true)
  const [vcEventsLoading, setVcEventsLoading] = useState(true)
  const [vcRevenueLoading, setVcRevenueLoading] = useState(true)
  const [vcRefreshing, setVcRefreshing] = useState(false)
  const [vcStats, setVcStats] = useState<CombinedStats | null>(null)
  const [vcUserStats, setVcUserStats] = useState<UserStats | null>(null)
  const [vcAnonStats, setVcAnonStats] = useState<AnonymousEventStats | null>(null)
  const [vcChartData, setVcChartData] = useState<Array<{ date: string; ios: number; android: number; total: number; credits: number; paidUsers?: number }>>([])

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

  useEffect(() => {
    const id = window.setTimeout(() => { void loadVoicecards() }, 0)
    return () => window.clearTimeout(id)
  }, [loadVoicecards])

  const refresh = useCallback(() => loadVoicecards(true), [loadVoicecards])
  useAgentRefresh(['voicecards_'], refresh)

  // 페이지를 보고 있는 동안 1시간마다 자동 새로고침 — 운영 분석 지표라 실시간성보다
  // VoiceCards Supabase Disk IO 예산 보호를 우선한다.
  useEffect(() => {
    const REFRESH_MS = 60 * 60 * 1000
    let last = Date.now()
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < REFRESH_MS) return
      last = Date.now()
      refresh()
    }
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [refresh])

  return (
    <>
      {/*
        페이지 전체가 한 그리드다. 섹션들이 여러 컴포넌트에 나뉘어 있어도 같은 줄에 서야 해서,
        각 컴포넌트는 그리드 없이 조각만 내놓고 배치는 여기서 DOM 순서로 결정된다.

        2열에서 채워지는 순서:
          AI 답변 점유 | 검색 노출      ← 어떻게 발견되는가
          진입 후 행동 | 퍼널 · 가입 후 활동  ← 들어와서 무엇을 하는가
          사용자 (2열을 모두 차지)            ← 누가 쓰는가
      */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols === 2 && !mobile ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
        gap: t.density.blockGap, alignItems: 'start',
      }}>
      <SearchDemandCard site="voicecards" showGscLink={false} leadSlot={<GeoAnswerCard site="voicecards" />} />

      <VoicecardsBlock
        cols={cols}
        usersLoading={vcUsersLoading}
        eventsLoading={vcEventsLoading}
        revenueLoading={vcRevenueLoading}
        stats={vcStats}
        userStats={vcUserStats}
        anonymousStats={vcAnonStats}
        chartData={vcChartData}
        onRefresh={() => loadVoicecards(true)}
        refreshing={vcRefreshing}
      />
      </div>
    </>
  )
}
