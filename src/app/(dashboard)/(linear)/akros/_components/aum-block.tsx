'use client'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import type { TimeSeriesData } from '@/lib/etf-types'

interface AumBlockProps {
  timeSeries: TimeSeriesData[]
  productCount: number
  yearLaunches: number
}

function fmtKrw(v: number | null | undefined): string {
  if (v == null) return '-'
  return `${Math.round(v).toLocaleString('ko-KR')}억원`
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return '-'
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}m`
}

export function AumBlock({ timeSeries, yearLaunches }: AumBlockProps) {
  const mobile = useIsMobile()
  const latest = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null
  const currentYear = new Date().getFullYear()

  return (
    <LCard>
      <LSectionHead eyebrow="AUM DASHBOARD" title="운용 현황" />
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
        <LStat
          label="총 AUM"
          value={fmtKrw(latest?.total_aum_krw)}
          sub={fmtUsd(latest?.total_aum_usd)}
          sparkline={timeSeries.map(d => ({ date: d.date, value: d.total_aum_krw || 0 }))}
        />
        <LStat
          label="상품 수"
          value={latest ? String(latest.total_products) : '-'}
          sub={`${currentYear}년 ${yearLaunches}개 출시`}
          sparkline={timeSeries.map(d => ({ date: d.date, value: d.total_products || 0 }))}
        />
        <LStat
          label="총 ARR"
          value={fmtKrw(latest?.total_arr_krw)}
          sub={fmtUsd(latest?.total_arr_usd)}
          sparkline={timeSeries.map(d => ({ date: d.date, value: d.total_arr_krw || 0 }))}
        />
      </div>
    </LCard>
  )
}
