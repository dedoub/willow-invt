'use client'

import { useState, useEffect, useCallback } from 'react'
import { ReviewnotesBlock } from './_components/reviewnotes-block'
import type { ReviewNotesStats } from '@/lib/lemonsqueezy'
import type { ReviewNotesUserStats, ReviewNotesTrafficStats, ReviewNotesContentStats } from '@/lib/reviewnotes-types'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SearchDemandCard } from '@/app/(dashboard)/_components/search-demand-card'
import { GeoAnswerCard } from '@/app/(dashboard)/_components/geo-answer-card'

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewnotesPage() {
  const cols = useDashCols()
  const mobile = useIsMobile()
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
    {/*
      페이지 전체가 한 그리드다. 섹션들이 여러 컴포넌트에 나뉘어 있어도 같은 줄에 서야 해서,
      각 컴포넌트는 그리드 없이 조각만 내놓고 배치는 여기서 DOM 순서로 결정된다.

      2열에서 채워지는 순서:
        AI 답변 점유 | 검색 노출      ← 어떻게 발견되는가
        진입 후 행동 | 퍼널 · 운영 지표  ← 들어와서 무엇을 하는가
        사용자 |
    */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols === 2 && !mobile ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
      gap: t.density.blockGap, alignItems: 'start',
    }}>
    <SearchDemandCard site="reviewnotes" showGscLink={false} leadSlot={<GeoAnswerCard site="reviewnotes" />} />

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
    </div>
    </>
  )
}
