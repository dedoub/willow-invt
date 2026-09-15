'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { StatRows } from '@/app/(dashboard)/_components/linear-stat-rows'
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
    // 눈썹(DASHBOARD)은 두지 않는다 — 한글 제목이 이미 무엇인지 말한다(사업관리 2026-09-10).
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead title="운용 현황" mb={0} />
      </div>
      {/* 지표는 칸 사이를 띄우지 않고 줄 위에만 가로줄을 둔다 — 보이스카드·포틀과 같은 리듬. */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px` }}>
      <StatRows cols={mobile ? 'repeat(1, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))'}>
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
      </StatRows>
      </div>
      {/* 어느 날짜의 숫자인지 카드가 스스로 말한다 — 표가 없어 쪽넘김 줄이 그 일을 못 한다. */}
      <LCardFoot
        left="ETC 운용 데이터 · 일별 스냅샷"
        right={historicalData.length > 0 ? historicalData[historicalData.length - 1].date : undefined}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}
