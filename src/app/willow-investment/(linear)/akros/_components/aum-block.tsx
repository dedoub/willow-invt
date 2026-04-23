'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LStat } from '@/app/willow-investment/_components/linear-stat'
import { TimeSeriesData } from '@/lib/supabase-etf'

interface AumBlockProps {
  timeSeries: TimeSeriesData[]
  productCount: number
}

function Sparkline({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return null
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 120, h = 36
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.value - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={t.brand[500]} strokeWidth={1.5} />
    </svg>
  )
}

function fmtEok(v: number | null | undefined): string {
  if (v == null) return '-'
  return `${(v / 100000000).toFixed(1)}억`
}

export function AumBlock({ timeSeries, productCount }: AumBlockProps) {
  const latest = timeSeries.length > 0 ? timeSeries[timeSeries.length - 1] : null
  const sparkData = timeSeries.map(d => ({ date: d.date, value: d.total_aum_krw || 0 }))

  return (
    <LCard>
      <LSectionHead eyebrow="AUM DASHBOARD" title="운용 현황" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <LStat label="총 AUM" value={fmtEok(latest?.total_aum_krw)} unit="원" />
        <LStat label="상품 수" value={String(productCount)} unit="개" />
        <div style={{
          background: t.neutrals.inner, borderRadius: t.radius.sm,
          padding: '8px 12px',
        }}>
          <div style={{ fontSize: 9, fontFamily: t.font.mono, color: t.neutrals.subtle, marginBottom: 4, letterSpacing: 0.5 }}>
            AUM TREND
          </div>
          <Sparkline data={sparkData} />
        </div>
      </div>
    </LCard>
  )
}
