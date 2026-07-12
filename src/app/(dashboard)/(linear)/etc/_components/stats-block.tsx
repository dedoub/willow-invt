'use client'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import type { ETFDisplayData, HistoricalDataPoint } from '@/lib/etf-types'

interface StatsBlockProps {
  etfs: ETFDisplayData[]
  historicalData: HistoricalDataPoint[]
}

function fmtUsd(v: number | null): string {
  if (v == null) return '-'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

const FIXED_OVERHEAD = 2083.33

export function StatsBlock({ etfs, historicalData }: StatsBlockProps) {
  const mobile = useIsMobile()
  const totalAum = etfs.reduce((sum, e) => sum + (e.aum || 0), 0)
  const totalMonthlyFee = etfs.reduce((sum, e) => sum + e.totalMonthlyFee, 0) + FIXED_OVERHEAD
  const totalRemainingFee = etfs.reduce((sum, e) => sum + (e.remainingFee || 0), 0)

  return (
    <LCard>
      <LSectionHead eyebrow="DASHBOARD" title="운용 현황" />
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
        <LStat
          label="총 AUM"
          value={fmtUsd(totalAum)}
          sub={`${etfs.length}개 상품`}
          sparkline={historicalData.map(d => ({ date: d.date, value: d.totalAum }))}
        />
        <LStat
          label="월 수수료"
          value={fmtUsd(totalMonthlyFee)}
          sub="Platform + PM Fee"
          sparkline={historicalData.map(d => ({ date: d.date, value: d.totalMonthlyFee }))}
        />
        <LStat
          label="잔여 수수료"
          value={fmtUsd(totalRemainingFee)}
          sub="36개월 프로라타"
          sparkline={historicalData.map(d => ({ date: d.date, value: d.totalRemainingFee }))}
        />
      </div>
    </LCard>
  )
}
