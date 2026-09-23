'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LDialog } from '@/app/(dashboard)/_components/linear-dialog'

const PERIOD_LABEL: Record<string, string> = {
  '1m': '1개월', '3m': '3개월', '6m': '6개월', '1y': '1년',
}

interface SeriesPoint {
  date: string
  etf: number
  spy: number | null
  qqq: number | null
  qld: number | null
}

interface ChartData {
  ticker: string
  period: string
  windowDays: number
  series: SeriesPoint[]
}

export function SectorRotationChartModal({
  ticker,
  etfName,
  period,
  onClose,
}: {
  ticker: string
  etfName: string
  period: '1m' | '3m' | '6m' | '1y'
  onClose: () => void
}) {
  const mobile = useIsMobile()
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/willow-mgmt/sector-rotation/series?ticker=${encodeURIComponent(ticker)}&period=${period}`)
      .then(r => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [ticker, period])

  const isBenchEtf = ticker === 'SPY' || ticker === 'QQQ' || ticker === 'QLD'

  return (
    /* 모달 껍데기는 LDialog 하나만 쓴다 — 생 div 에 카드색을 칠하면 카드 문법의 테두리를
       못 받고 막 농도까지 다른 창이 된다(linear-dialog.tsx 머리말). */
    <LDialog title={`${ticker} · ${etfName}`} width={720} onClose={onClose}>
      <div>
        <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.gapSm }}>
          매일 시점의 {PERIOD_LABEL[period]} 수익률 추이 — 벤치마크와 비교
        </div>
        <div style={{ height: mobile ? 280 : 360 }}>
          {loading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>
              데이터 로딩 중…
            </div>
          )}
          {!loading && data && data.series.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={t.chart.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  tickFormatter={(d) => d.slice(2).replace(/-/g, '/').slice(0, 5)}
                  interval={Math.max(0, Math.floor(data.series.length / 8))}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fill: t.neutrals.subtle }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  axisLine={false} tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: t.neutrals.card, border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.lg, fontSize: `calc(${t.type.control}px * var(--fz, 1))` }}
                  labelFormatter={(d) => d}
                  formatter={(v) => typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : String(v ?? '')}
                />
                <Legend wrapperStyle={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, paddingTop: t.density.gapSm }} />
                <ReferenceLine y={0} stroke={t.neutrals.muted} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="etf" name={ticker} stroke="#6366F1" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                {ticker !== 'SPY' && <Line type="monotone" dataKey="spy" name="SPY" stroke="#F59E0B" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                {ticker !== 'QQQ' && <Line type="monotone" dataKey="qqq" name="QQQ" stroke="#10B981" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                {ticker !== 'QLD' && <Line type="monotone" dataKey="qld" name="QLD" stroke="#EC4899" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          )}
          {!loading && (!data || data.series.length === 0) && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>
              데이터가 부족합니다.
            </div>
          )}
        </div>
      </div>
    </LDialog>
  )
}
