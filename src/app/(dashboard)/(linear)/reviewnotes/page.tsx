'use client'

import { useState, useEffect, useCallback } from 'react'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats, ReviewNotesContentStats } from '@/lib/reviewnotes-supabase'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { SearchDemandCard } from '@/app/(dashboard)/_components/search-demand-card'
import { GeoAnswerCard } from '@/app/(dashboard)/_components/geo-answer-card'

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewnotesPage() {
  const cols = useDashCols()
  const [rnLoading, setRnLoading] = useState(true)
  const [rnRefreshing, setRnRefreshing] = useState(false)
  const [rnStats, setRnStats] = useState<ReviewNotesStats | null>(null)
  const [rnUserStats, setRnUserStats] = useState<ReviewNotesUserStats | null>(null)
  const [rnTrafficStats, setRnTrafficStats] = useState<ReviewNotesTrafficStats | null>(null)
  const [rnContentStats, setRnContentStats] = useState<ReviewNotesContentStats | null>(null)
  const [rnError, setRnError] = useState<string | null>(null)

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
      setRnContentStats(data.contentStats || null)
    } catch (err) {
      console.error('ReviewNotes load error:', err)
      setRnError(String(err))
    } finally {
      setRnLoading(false)
      setRnRefreshing(false)
    }
  }, [])

  useEffect(() => { loadReviewnotes() }, [loadReviewnotes])

  const refresh = useCallback(() => loadReviewnotes(true), [loadReviewnotes])
  useAgentRefresh(['reviewnotes_'], refresh)

  // 페이지를 보고 있는 동안 5분마다 자동 새로고침 (VoiceCards 페이지와 동일 규칙)
  useEffect(() => {
    const REFRESH_MS = 5 * 60 * 1000
    let last = Date.now()
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < REFRESH_MS) return
      last = Date.now()
      refresh()
    }
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [refresh])

  return (
    <>
    {/* 최상단: 검색 수요 포착 (Umami) — 앱 지표와 별개로 웹에서 수요를 잡고 있는지 본다 */}
    <div style={{ marginBottom: 14 }}>
      <SearchDemandCard site="reviewnotes" />
    </div>

    {/* 검색 다음은 답변엔진. 검색이 "결과에 뜨는가"라면 여기는 "추천되는가"를 본다 */}
    <div style={{ marginBottom: 14 }}>
      <GeoAnswerCard site="reviewnotes" />
    </div>

    <ReviewnotesBlock
      cols={cols}
      loading={rnLoading}
      stats={rnStats}
      userStats={rnUserStats}
      trafficStats={rnTrafficStats}
      contentStats={rnContentStats}
      onRefresh={() => loadReviewnotes(true)}
      refreshing={rnRefreshing}
      error={rnError}
    />
    </>
  )
}
