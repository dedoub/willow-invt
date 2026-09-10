'use client'

import { useState } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

export interface TrendPoint { date: string; value: number }

/**
 * 단일 시리즈 영역 추이 — 시리즈가 하나이므로 색 대신 회색 단색으로 그린다(t.chart).
 * 가로 눈금은 양 끝 날짜만, 세로는 최대/최소만 둔다. 값은 호버로 읽는다.
 */
export function AreaTrend({ points, height = 200, format }: {
  points: TrendPoint[]
  height?: number
  format?: (v: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = format ?? ((v: number) => Math.round(v).toLocaleString())

  if (points.length < 2) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle,
      }}>데이터 없음</div>
    )
  }

  const values = points.map(p => p.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (points.length - 1)) * 100
  const y = (v: number) => 100 - ((v - min) / span) * 100
  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
  const area = `0,100 ${line} 100,100`

  return (
    <div
      style={{ position: 'relative', height, paddingBottom: t.density.gapLg }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        setHover(Math.round(ratio * (points.length - 1)))
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: `calc(100% - ${t.density.gapLg}px)`, overflow: 'visible' }}>
        {[0, 50, 100].map(p => (
          <line key={p} x1="0" x2="100" y1={p} y2={p} stroke={t.chart.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <polygon points={area} fill={t.chart.monoFill} />
        <polyline points={line} fill="none" stroke={t.chart.mono} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke={t.neutrals.muted} strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      <span style={axis({ left: 0, top: 0 })}>{fmt(max)}</span>
      <span style={axis({ left: 0, bottom: 0 })}>{points[0].date.slice(5)}</span>
      <span style={axis({ right: 0, bottom: 0 })}>{points[points.length - 1].date.slice(5)}</span>

      {hover !== null && (
        <div style={{
          position: 'absolute', left: `${Math.min(80, Math.max(20, x(hover)))}%`, transform: 'translateX(-50%)', top: 0,
          background: '#1E293B', color: '#F8FAFC', pointerEvents: 'none', zIndex: 1,
          fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans,
          borderRadius: t.radius.md, padding: `${t.density.gapSm}px ${t.density.panelPadX}px`, whiteSpace: 'nowrap', lineHeight: 1.4,
        }}>
          <div style={{ opacity: 0.7 }}>{points[hover].date}</div>
          <div style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fmt(points[hover].value)}</div>
        </div>
      )}
    </div>
  )
}

function axis(pos: React.CSSProperties): React.CSSProperties {
  return {
    position: 'absolute', ...pos,
    fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, fontFamily: t.font.mono,
    color: t.neutrals.subtle, lineHeight: 1,
  }
}
