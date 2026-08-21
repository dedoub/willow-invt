'use client'

import { useState, useEffect, useCallback } from 'react'
import { PortleBlock } from './_components/portle-block'
import type { PortleStats } from '@/lib/portle-types'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
import { useDashCols } from '@/app/(dashboard)/_components/cols-toggle'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { SearchDemandCard } from '@/app/(dashboard)/_components/search-demand-card'
import { GeoAnswerCard } from '@/app/(dashboard)/_components/geo-answer-card'

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortlePage() {
  const cols = useDashCols()
  const mobile = useIsMobile()
  const [ptLoading, setPtLoading] = useState(true)
  const [ptRefreshing, setPtRefreshing] = useState(false)
  const [ptStats, setPtStats] = useState<PortleStats | null>(null)
  const [ptError, setPtError] = useState<string | null>(null)

  const loadPortle = useCallback(async (refresh = false) => {
    if (refresh) setPtRefreshing(true)
    else setPtLoading(true)
    setPtError(null)
    try {
      const res = await fetch('/api/portle/stats', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch')
      setPtStats(data.stats)
    } catch (err) {
      console.error('Portle load error:', err)
      setPtError(String(err))
    } finally {
      setPtLoading(false)
      setPtRefreshing(false)
    }
  }, [])

  useEffect(() => { loadPortle() }, [loadPortle])

  const refresh = useCallback(() => loadPortle(true), [loadPortle])
  useAgentRefresh(['portle_'], refresh)

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
        AI 답변 점유 | 검색 노출      ← 어떻게 발견되는가
        진입 후 행동 | AI 사용 · 안정성  ← 들어와서 무엇을 하는가
        사용자 (2열을 모두 차지)          ← 누가 쓰는가
    */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: cols === 2 && !mobile ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
      gap: t.density.blockGap, alignItems: 'start',
    }}>
    <SearchDemandCard site="portle" leadSlot={<GeoAnswerCard site="portle" />} />

    <PortleBlock
      cols={cols}
      loading={ptLoading}
      stats={ptStats}
      onRefresh={() => loadPortle(true)}
      refreshing={ptRefreshing}
      error={ptError}
    />
    </div>
    </>
  )
}
