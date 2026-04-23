'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { TimeSeriesData } from '@/lib/supabase-etf'

interface AumBlockProps {
  timeSeries: TimeSeriesData[]
  productCount: number
  yearLaunches: number
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const h = 28
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: h }}>
      <polyline points={points} fill="none" stroke={t.brand[500]} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function fmtKrw(v: number | null | undefined): string {
  if (v == null) return '-'
  return `${Math.round(v).toLocaleString('ko-KR')}억원`
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null) return '-'
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}m`
}

interface StatCardProps {
  label: string
  value: string
  sub: string
  sparkData: number[]
}

function StatCard({ label, value, sub, sparkData }: StatCardProps) {
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px', minWidth: 0, flex: 1,
    }}>
      <div style={{
        fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle,
        marginBottom: 6,
      }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 600, letterSpacing: -0.3,
            fontVariantNumeric: 'tabular-nums', color: t.neutrals.text,
            whiteSpace: 'nowrap',
          }}>{value}</div>
          <div style={{
            fontSize: 10, color: t.neutrals.muted, marginTop: 1,
            whiteSpace: 'nowrap',
          }}>{sub}</div>
        </div>
        <div style={{ width: 80, flexShrink: 0 }}>
          <Sparkline data={sparkData} />
        </div>
      </div>
    </div>
  )
}

export function AumBlock({ timeSeries, productCount, yearLaunches }: AumBlockProps) {
  const latest = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null
  const currentYear = new Date().getFullYear()

  return (
    <LCard>
      <LSectionHead eyebrow="AUM DASHBOARD" title="운용 현황" />
      <div style={{ display: 'flex', gap: 10 }}>
        <StatCard
          label="총 AUM"
          value={fmtKrw(latest?.total_aum_krw)}
          sub={fmtUsd(latest?.total_aum_usd)}
          sparkData={timeSeries.map(d => d.total_aum_krw || 0)}
        />
        <StatCard
          label="상품 수"
          value={latest ? String(latest.total_products) : '-'}
          sub={`${currentYear}년 ${yearLaunches}개 출시`}
          sparkData={timeSeries.map(d => d.total_products || 0)}
        />
        <StatCard
          label="총 ARR"
          value={fmtKrw(latest?.total_arr_krw)}
          sub={fmtUsd(latest?.total_arr_usd)}
          sparkData={timeSeries.map(d => d.total_arr_krw || 0)}
        />
      </div>
    </LCard>
  )
}
