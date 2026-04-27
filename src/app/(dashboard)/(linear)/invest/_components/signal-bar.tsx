'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'

interface SignalBarProps {
  totalValue?: string
  cumulativeReturnPct?: number
  gainSub?: string
  buyTickers: string[]
  holdTickers: string[]
  usdKrw: number
  loading?: boolean
}

export function SignalBar({ totalValue, cumulativeReturnPct, gainSub, buyTickers, holdTickers, usdKrw, loading }: SignalBarProps) {
  const mobile = useIsMobile()
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)'

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8 }}>
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

  const buyLabel = buyTickers.length > 0 ? buyTickers.join(', ') : '-'
  const holdLabel = holdTickers.length > 0 ? holdTickers.join(', ') : '-'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8 }}>
      <LStat label="평가액 (세후)" value={totalValue || '-'} tone="default" />
      <LStat label="누적수익률" value={`${retPct > 0 ? '+' : ''}${retPct.toFixed(1)}%`} tone={retTone} sub={gainSub} />
      <LStat label="추매" value={String(buyTickers.length)} tone={buyTickers.length > 0 ? 'pos' : 'default'} sub={buyLabel} />
      <LStat label="대기" value={String(holdTickers.length)} tone="default" sub={holdLabel} />
      <LStat label="USD/KRW" value={usdKrw.toLocaleString()} tone="default" />
    </div>
  )
}
