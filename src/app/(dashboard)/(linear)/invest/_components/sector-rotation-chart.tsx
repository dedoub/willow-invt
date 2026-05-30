'use client'

import { useEffect, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.35)', backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'relative', width: mobile ? '92vw' : 720, maxWidth: '92vw',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: t.font.sans,
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              TRAILING {period.toUpperCase()} RETURN · LAST 1Y
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, color: t.neutrals.text }}>
              {ticker} <span style={{ color: t.neutrals.muted, fontWeight: t.weight.regular }}>· {etfName}</span>
            </div>
            <div style={{ fontSize: 11, color: t.neutrals.subtle, marginTop: 2 }}>
              매일 시점의 {PERIOD_LABEL[period]} 수익률 추이 — 벤치마크와 비교
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Chart */}
        <div style={{ padding: '0 20px 20px', height: mobile ? 280 : 360 }}>
          {loading && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: 12 }}>
              데이터 로딩 중…
            </div>
          )}
          {!loading && data && data.series.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={t.neutrals.line} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: t.neutrals.subtle }}
                  tickFormatter={(d) => d.slice(2).replace(/-/g, '/').slice(0, 5)}
                  interval={Math.max(0, Math.floor(data.series.length / 8))}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: t.neutrals.subtle }}
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  axisLine={false} tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{ background: t.neutrals.card, border: 'none', borderRadius: 8, fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                  labelFormatter={(d) => d}
                  formatter={(v) => typeof v === 'number' ? `${(v * 100).toFixed(2)}%` : String(v ?? '')}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <ReferenceLine y={0} stroke={t.neutrals.muted} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="etf" name={ticker} stroke="#6366F1" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                {ticker !== 'SPY' && <Line type="monotone" dataKey="spy" name="SPY" stroke="#F59E0B" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                {ticker !== 'QQQ' && <Line type="monotone" dataKey="qqq" name="QQQ" stroke="#10B981" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                {ticker !== 'QLD' && <Line type="monotone" dataKey="qld" name="QLD" stroke="#EC4899" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
              </LineChart>
            </ResponsiveContainer>
          )}
          {!loading && (!data || data.series.length === 0) && (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.subtle, fontSize: 12 }}>
              데이터가 부족합니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
