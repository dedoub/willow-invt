'use client'

import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { ReactNode } from 'react'

interface SignalBarProps {
  totalValue?: string
  cumulativeReturnPct?: number
  gainSub?: string
  buyTickers: string[]
  holdTickers: string[]
  usdKrw: number
  loading?: boolean
  actions?: ReactNode
}

export function SignalBar({ totalValue, cumulativeReturnPct, gainSub, buyTickers, holdTickers, usdKrw, loading, actions }: SignalBarProps) {
  const mobile = useIsMobile()
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)'

  if (loading) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="OVERVIEW" title="포트폴리오 시그널" action={actions} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 14px 14px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              background: t.neutrals.inner, borderRadius: t.radius.sm,
              padding: '8px 10px', height: 52,
            }} />
          ))}
        </div>
      </LCard>
    )
  }

  const retPct = cumulativeReturnPct ?? 0
  const retTone = retPct > 0 ? 'neg' as const : retPct < 0 ? 'pos' as const : 'default' as const

  const buyLabel = buyTickers.length > 0 ? buyTickers.join(', ') : '-'
  const holdLabel = holdTickers.length > 0 ? holdTickers.join(', ') : '-'

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="OVERVIEW" title="포트폴리오 시그널" action={actions} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 14px 14px' }}>
        <LStat label="평가액 (세후)" value={totalValue || '-'} tone="default" />
        <LStat label="누적수익률" value={`${retPct > 0 ? '+' : ''}${retPct.toFixed(1)}%`} tone={retTone} sub={gainSub} />
        <LStat label="추매" value={String(buyTickers.length)} tone={buyTickers.length > 0 ? 'pos' : 'default'} sub={buyLabel} wrap />
        <LStat label="대기" value={String(holdTickers.length)} tone="default" sub={holdLabel} wrap />
        <LStat label="USD/KRW" value={usdKrw.toLocaleString()} tone="default" />
      </div>
    </LCard>
  )
}
