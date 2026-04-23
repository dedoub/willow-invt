'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { ETFDisplayData, HistoricalDataPoint } from '@/lib/supabase-etf'

interface StatsBlockProps {
  etfs: ETFDisplayData[]
  historicalData: HistoricalDataPoint[]
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

function fmtUsd(v: number | null): string {
  if (v == null) return '-'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
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

const FIXED_OVERHEAD = 2083.33

export function StatsBlock({ etfs, historicalData }: StatsBlockProps) {
  const totalAum = etfs.reduce((sum, e) => sum + (e.aum || 0), 0)
  const totalMonthlyFee = etfs.reduce((sum, e) => sum + e.totalMonthlyFee, 0) + FIXED_OVERHEAD
  const totalRemainingFee = etfs.reduce((sum, e) => sum + (e.remainingFee || 0), 0)

  return (
    <LCard>
      <LSectionHead eyebrow="DASHBOARD" title="운용 현황" />
      <div style={{ display: 'flex', gap: 10 }}>
        <StatCard
          label="총 AUM"
          value={fmtUsd(totalAum)}
          sub={`${etfs.length}개 상품`}
          sparkData={historicalData.map(d => d.totalAum)}
        />
        <StatCard
          label="월 수수료"
          value={fmtUsd(totalMonthlyFee)}
          sub="Platform + PM Fee"
          sparkData={historicalData.map(d => d.totalMonthlyFee)}
        />
        <StatCard
          label="잔여 수수료"
          value={fmtUsd(totalRemainingFee)}
          sub="36개월 프로라타"
          sparkData={historicalData.map(d => d.totalRemainingFee)}
        />
      </div>
    </LCard>
  )
}
