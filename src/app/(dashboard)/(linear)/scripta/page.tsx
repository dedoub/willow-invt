'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScriptaBlock } from './_components/scripta-block'
import type { ScriptaStats, ScriptaUser } from '@/lib/scripta-types'
import type { CreditSalesStats } from '@/lib/lemonsqueezy'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SearchDemandCard } from '@/app/(dashboard)/_components/search-demand-card'
import { GeoAnswerCard } from '@/app/(dashboard)/_components/geo-answer-card'

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScriptaPage() {
  const cols = useDashCols()
  const mobile = useIsMobile()
  const [scLoading, setScLoading] = useState(true)
  const [scRefreshing, setScRefreshing] = useState(false)
  const [scStats, setScStats] = useState<ScriptaStats | null>(null)
  const [scUsers, setScUsers] = useState<ScriptaUser[]>([])
  const [scSales, setScSales] = useState<CreditSalesStats | null>(null)
  const [scError, setScError] = useState<string | null>(null)

  const loadScripta = useCallback(async (refresh = false) => {
    if (refresh) setScRefreshing(true)
    else setScLoading(true)
    setScError(null)
    try {
      const res = await fetch('/api/scripta/stats')
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch')
      setScStats(data.stats)
      setScUsers(data.users || [])
      setScSales(data.sales || null)
    } catch (err) {
      console.error('Scripta load error:', err)
      setScError(String(err))
    } finally {
      setScLoading(false)
      setScRefreshing(false)
    }
  }, [])

  useEffect(() => { loadScripta() }, [loadScripta])

  const refresh = useCallback(() => loadScripta(true), [loadScripta])
  useAgentRefresh(['scripta_'], refresh)

  // 페이지를 보고 있는 동안 5분마다 자동 새로고침 (리뷰노트 페이지와 동일 규칙)
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
        AI 답변 점유 · 검색 노출 | 퍼널 · 학습 구조
        사용자 (2열을 모두 차지)
    */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols === 2 && !mobile ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
      gap: t.density.blockGap, alignItems: 'start',
    }}>
    <SearchDemandCard site="scripta" showGscLink={false} leadSlot={<GeoAnswerCard site="scripta" />} />

    <ScriptaBlock
      cols={cols}
      loading={scLoading}
      stats={scStats}
      users={scUsers}
      sales={scSales}
      onRefresh={() => loadScripta(true)}
      refreshing={scRefreshing}
      error={scError}
    />
    </div>
    </>
  )
}
