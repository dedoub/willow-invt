'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'

import { useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { StatRows } from '@/app/(dashboard)/_components/linear-stat-rows'
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
    // 눈썹(AUM DASHBOARD)은 뺀다 — 한글 제목이 이미 무엇인지 말한다(사업관리 2026-09-10).
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <LSectionHead title="전체현황" mb={0} />
      </div>
      {/* 지표는 칸 사이를 띄우지 않고 줄 위에만 가로줄을 둔다 — 보이스카드·포틀과 같은 리듬. */}
      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px` }}>
      <StatRows cols={mobile ? 'repeat(1, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))'}>
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
      </StatRows>
      </div>
      {/* 어느 날짜의 숫자인지 카드가 스스로 말한다 — 표가 없어 쪽넘김 줄이 그 일을 못 한다. */}
      <LCardFoot
        left="아크로스 운용 데이터 · 일별 스냅샷"
        right={latest?.date}
        style={{ marginTop: 0, padding: `${t.density.panelPadY}px ${t.density.cardPad}px` }}
      />
    </LCard>
  )
}
