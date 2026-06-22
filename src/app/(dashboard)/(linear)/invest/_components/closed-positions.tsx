'use client'

import { useMemo } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import type { StockTradeFull } from './holdings-block'

interface ClosedPositionsProps {
  stockTrades: StockTradeFull[]
  fxHistory: Record<string, number>
  usdKrwRate: number
}

interface ClosedRow {
  ticker: string
  name: string
  realizedKrw: number
  costKrw: number   // 청산된 원가 (수익률 계산용)
  fullyClosed: boolean
}

/** 청산 손익: 매도가 발생한 종목의 실현손익 (KRW, 매도시점 과거환율 기준). */
export function ClosedPositions({ stockTrades, fxHistory, usdKrwRate }: ClosedPositionsProps) {
  const { rows, totalRealized } = useMemo(() => {
    const getFxRate = (date: string): number => {
      const d = new Date(date)
      for (let i = 0; i < 5; i++) {
        const key = d.toISOString().slice(0, 10)
        if (fxHistory[key]) return fxHistory[key]
        d.setDate(d.getDate() - 1)
      }
      return usdKrwRate
    }

    type Acc = { ticker: string; name: string; qty: number; krwCost: number; realizedKrw: number; soldCostKrw: number; hadSell: boolean }
    const map = new Map<string, Acc>()
    const sorted = [...stockTrades].sort((a, b) => new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id))

    for (const tr of sorted) {
      const key = tr.ticker.replace('.KS', '')
      const prev = map.get(key) || { ticker: key, name: tr.company_name || key, qty: 0, krwCost: 0, realizedKrw: 0, soldCostKrw: 0, hadSell: false }
      const isUS = tr.market === 'US'
      const histRate = isUS ? getFxRate(tr.trade_date) : 1
      if (tr.trade_type === 'buy') {
        prev.qty += tr.quantity
        prev.krwCost += tr.total_amount * histRate
      } else {
        const krwAvg = prev.qty > 0 ? prev.krwCost / prev.qty : 0
        const soldBasisKrw = krwAvg * tr.quantity
        prev.realizedKrw += tr.total_amount * histRate - soldBasisKrw
        prev.soldCostKrw += soldBasisKrw
        prev.hadSell = true
        prev.qty -= tr.quantity
        prev.krwCost -= soldBasisKrw
        if (prev.qty <= 0) { prev.qty = 0; prev.krwCost = 0 }
      }
      if (tr.company_name) prev.name = tr.company_name
      map.set(key, prev)
    }

    const rows: ClosedRow[] = []
    let totalRealized = 0
    for (const a of map.values()) {
      if (!a.hadSell) continue
      rows.push({ ticker: a.ticker, name: a.name, realizedKrw: a.realizedKrw, costKrw: a.soldCostKrw, fullyClosed: a.qty <= 0 })
      totalRealized += a.realizedKrw
    }
    rows.sort((x, y) => y.realizedKrw - x.realizedKrw)
    return { rows, totalRealized }
  }, [stockTrades, fxHistory, usdKrwRate])

  const fmtKrw = (v: number) => {
    const a = Math.abs(v)
    const s = a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : `${Math.round(a / 1e4).toLocaleString()}만`
    return `${v >= 0 ? '+' : '−'}₩${s}`
  }
  const toneColor = (v: number) => v > 0 ? t.accent.pos : v < 0 ? t.accent.neg : t.neutrals.muted

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="REALIZED" title="청산 손익" action={
          rows.length > 0 ? (
            <span style={{ fontSize: 'calc(12px * var(--fz, 1))', fontWeight: t.weight.semibold, fontVariantNumeric: 'tabular-nums', color: toneColor(totalRealized) }}>
              {fmtKrw(totalRealized)}
            </span>
          ) : undefined
        } />
      </div>
      <div>
        {rows.map(r => {
          const retPct = r.costKrw > 0 ? (r.realizedKrw / r.costKrw) * 100 : 0
          return (
            <div key={r.ticker} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8,
              padding: '8px 14px', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 'calc(12px * var(--fz, 1))',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontWeight: t.weight.medium }}>{r.ticker}</span>
                <span style={{ color: t.neutrals.muted, fontSize: 'calc(11px * var(--fz, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{
                  flexShrink: 0, display: 'inline-block', padding: '1px 5px', borderRadius: t.radius.sm,
                  fontSize: 'calc(9.5px * var(--fz, 1))', fontWeight: t.weight.medium,
                  background: t.neutrals.inner, color: t.neutrals.muted,
                }}>{r.fullyClosed ? '전량' : '일부'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums', fontWeight: t.weight.medium, color: toneColor(r.realizedKrw) }}>
                  {fmtKrw(r.realizedKrw)}
                </span>
                <span style={{ fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.subtle, width: 52, textAlign: 'right' }}>
                  {retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle }}>
            청산된 종목이 없습니다
          </div>
        )}
      </div>
    </LCard>
  )
}
