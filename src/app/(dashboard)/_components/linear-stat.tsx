'use client'

import { useState, useRef } from 'react'
import { t } from './linear-tokens'

export interface SparkPoint { date: string; value: number }

interface LStatProps {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: 'pos' | 'neg' | 'warn' | 'info' | 'default'
  sparkline?: number[] | SparkPoint[]
  sparkFormat?: (v: number) => string
}

function Sparkline({
  data, color, format,
}: { data: SparkPoint[]; color: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  if (!data.length) return null
  const w = 60, h = 18
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = data.length > 1 ? w / (data.length - 1) : 0
  const xy = data.map((d, i) => ({
    x: i * step,
    y: h - ((d.value - min) / range) * h,
  }))
  const points = xy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastX = xy[xy.length - 1].x, lastY = xy[xy.length - 1].y

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * w
    let nearest = 0
    let dmin = Infinity
    for (let i = 0; i < xy.length; i++) {
      const d = Math.abs(xy[i].x - x)
      if (d < dmin) { dmin = d; nearest = i }
    }
    setHover(nearest)
  }

  const fmt = format ?? ((v: number) => v.toLocaleString())

  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg
        ref={svgRef}
        width={w} height={h}
        style={{ overflow: 'visible', cursor: 'crosshair', display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={1.6} fill={color} />
        {hover != null && (
          <>
            <line x1={xy[hover].x} y1={0} x2={xy[hover].x} y2={h} stroke={t.neutrals.line} strokeWidth={0.8} strokeDasharray="2 2" />
            <circle cx={xy[hover].x} cy={xy[hover].y} r={2.4} fill={color} stroke={t.neutrals.card} strokeWidth={1} />
          </>
        )}
      </svg>
      {hover != null && (
        <div style={{
          position: 'absolute',
          left: Math.max(0, Math.min(w - 70, xy[hover].x - 35)),
          bottom: h + 6,
          background: t.neutrals.text, color: t.neutrals.card,
          fontSize: 9.5, fontFamily: t.font.sans,
          padding: '3px 6px', borderRadius: t.radius.sm,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          zIndex: 10, lineHeight: 1.3,
        }}>
          <div style={{ fontFamily: t.font.mono, opacity: 0.7, fontSize: 8.5 }}>{data[hover].date}</div>
          <div style={{ fontWeight: 600 }}>{fmt(data[hover].value)}</div>
        </div>
      )}
    </div>
  )
}

export function LStat({ label, value, unit, sub, tone = 'default', sparkline, sparkFormat }: LStatProps) {
  const color = tone === 'pos' ? t.accent.pos
    : tone === 'neg' ? t.accent.neg
    : tone === 'warn' ? t.accent.warn
    : tone === 'info' ? t.brand[600]
    : t.neutrals.text
  // Normalize: number[] → SparkPoint[] (date defaults to index)
  const sparkData: SparkPoint[] = (sparkline ?? []).map((p, i) =>
    typeof p === 'number' ? { date: String(i), value: p } : p
  )
  const sparkColor = sparkData.length > 1
    ? (sparkData[sparkData.length - 1].value >= sparkData[0].value ? t.accent.pos : t.accent.neg)
    : t.neutrals.muted
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px', position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: 2,
          }}>{label}</div>
          <div style={{
            fontSize: 13, fontWeight: 600, letterSpacing: -0.3,
            fontVariantNumeric: 'tabular-nums' as const,
            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
            color,
          }}>
            {value}
            {unit && <span style={{ fontSize: 11, marginLeft: 3, color: t.neutrals.muted, fontWeight: 400 }}>{unit}</span>}
          </div>
          {sub && (
            <div style={{
              fontSize: 9.5, color: t.neutrals.muted, marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{sub}</div>
          )}
        </div>
        {sparkData.length > 1 && (
          <div style={{ flexShrink: 0 }}>
            <Sparkline data={sparkData} color={sparkColor} format={sparkFormat} />
          </div>
        )}
      </div>
    </div>
  )
}
