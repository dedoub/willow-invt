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
  /** 추매+돌파: 수익률 트리거 충족 + 매물대 돌파 (강한 매수) */
  buyBreakoutTickers: string[]
  /** 추매: 트리거는 충족했으나 박스권 (관망) */
  buyOnlyTickers: string[]
  /** 돌파: 트리거 미달이나 매물대 돌파 (추매 후보) */
  breakoutOnlyTickers: string[]
  usdKrw: number
  loading?: boolean
  actions?: ReactNode
}

export function SignalBar({ totalValue, cumulativeReturnPct, gainSub, buyBreakoutTickers, buyOnlyTickers, breakoutOnlyTickers, usdKrw, loading, actions }: SignalBarProps) {
  const mobile = useIsMobile()
  const cols = mobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)'

  if (loading) {
    return (
      <LCard pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
          <LSectionHead eyebrow="OVERVIEW" title="포트폴리오 시그널" action={actions} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 14px 14px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
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
  // 미국식: 수익=pos(녹색), 손실=neg(빨강)
  const retTone = retPct > 0 ? 'pos' as const : retPct < 0 ? 'neg' as const : 'default' as const

  const join = (arr: string[]) => arr.length > 0 ? arr.join(', ') : '-'

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="OVERVIEW" title="포트폴리오 시그널" action={actions} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '0 14px 14px' }}>
        <LStat label="평가액 (세후)" value={totalValue || '-'} tone="default" />
        <LStat label="누적수익률" value={`${retPct > 0 ? '+' : ''}${retPct.toFixed(1)}%`} tone={retTone} sub={gainSub} />
        <LStat label="추매+돌파" value={String(buyBreakoutTickers.length)} tone={buyBreakoutTickers.length > 0 ? 'pos' : 'default'} sub={join(buyBreakoutTickers)} wrap />
        <LStat label="추매" value={String(buyOnlyTickers.length)} tone="default" sub={join(buyOnlyTickers)} wrap />
        <LStat label="돌파" value={String(breakoutOnlyTickers.length)} tone={breakoutOnlyTickers.length > 0 ? 'pos' : 'default'} sub={join(breakoutOnlyTickers)} wrap />
        <LStat label="USD/KRW" value={usdKrw.toLocaleString()} tone="default" />
      </div>
    </LCard>
  )
}
