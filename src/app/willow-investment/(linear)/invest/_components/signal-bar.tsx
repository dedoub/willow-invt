'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LStat } from '@/app/willow-investment/_components/linear-stat'

interface SignalBarProps {
  totalValue?: string
  cumulativeReturnPct?: number
  buyCount: number
  holdCount: number
  usdKrw: number
  loading?: boolean
}

export function SignalBar({ totalValue, cumulativeReturnPct, buyCount, holdCount, usdKrw, loading }: SignalBarProps) {
  if (loading) {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
      }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: '8px 10px', height: 52,
          }} />
        ))}
      </div>
    )
  }

  const retPct = cumulativeReturnPct ?? 0
  const retTone = retPct > 0 ? 'neg' as const : retPct < 0 ? 'pos' as const : 'default' as const

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
    }}>
      <LStat label="전체 평가액" value={totalValue || '-'} tone="default" />
      <LStat label="누적수익률" value={`${retPct > 0 ? '+' : ''}${retPct.toFixed(1)}%`} tone={retTone} />
      <LStat label="추매" value={String(buyCount)} tone={buyCount > 0 ? 'pos' : 'default'} unit="종목" />
      <LStat label="대기" value={String(holdCount)} tone="default" unit="종목" />
      <LStat label="USD/KRW" value={usdKrw.toLocaleString()} tone="default" />
    </div>
  )
}
