'use client'

import { useState, useRef } from 'react'
import { Info } from 'lucide-react'
import { t } from './linear-tokens'

export interface SparkPoint { date: string; value: number }

interface LStatProps {
  label: string
  value: string
  valueExtra?: React.ReactNode
  unit?: string
  sub?: string
  tone?: 'pos' | 'neg' | 'warn' | 'info' | 'default'
  sparkline?: number[] | SparkPoint[]
  sparkline2?: number[] | SparkPoint[]
  spark2Color?: string
  sparkFormat?: (v: number) => string
  dualScale?: boolean
  // 지표 정의 설명 — 카드 hover 시 즉시 뜨는 커스텀 툴팁 (네이티브 title은 ~1s 지연)
  title?: string
}

function Sparkline({
  data, color, format, data2, color2, dualScale,
}: { data: SparkPoint[]; color: string; format?: (v: number) => string; data2?: SparkPoint[]; color2?: string; dualScale?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  if (!data.length) return null
  const w = 60, h = 18
  // 기본: 두 시리즈를 같은 축에 맞춤(합친 min/max). dualScale=true면 시리즈별 독립 스케일(이중 y축)
  // — 스케일이 크게 다른 두 지표(예: 크레딧 vs 유료 유저 수)를 한 스파크라인에 겹칠 때 사용.
  const scaleOf = (arr: SparkPoint[]) => {
    const vs = arr.map(d => d.value)
    const mn = Math.min(...vs), mx = Math.max(...vs)
    return { mn, range: (mx - mn) || 1 }
  }
  const shared = scaleOf([...data, ...(data2 ?? [])])
  const s1 = dualScale ? scaleOf(data) : shared
  const s2 = dualScale && data2 && data2.length ? scaleOf(data2) : shared
  const project = (arr: SparkPoint[], s: { mn: number; range: number }) => {
    const step = arr.length > 1 ? w / (arr.length - 1) : 0
    return arr.map((d, i) => ({ x: i * step, y: h - ((d.value - s.mn) / s.range) * h }))
  }
  const xy = project(data, s1)
  const points = xy.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lastX = xy[xy.length - 1].x, lastY = xy[xy.length - 1].y
  const xy2 = data2 && data2.length > 1 ? project(data2, s2) : null
  const points2 = xy2 ? xy2.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') : null

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
        {points2 && (
          <polyline points={points2} fill="none" stroke={color2 ?? t.accent.warn} strokeWidth={1} strokeDasharray="2 2" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        )}
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
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.sans,
          padding: '3px 6px', borderRadius: t.radius.sm,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          zIndex: 10, lineHeight: 1.3,
        }}>
          <div style={{ fontFamily: t.font.mono, opacity: 0.7, fontSize: 'calc(8.5px * var(--fz, 1))' }}>{data[hover].date}</div>
          <div style={{ fontWeight: 600 }}>{fmt(data[hover].value)}</div>
        </div>
      )}
    </div>
  )
}

export function LStat({ label, value, valueExtra, unit, sub, tone = 'default', sparkline, sparkline2, spark2Color, sparkFormat, dualScale, title, wrap }: LStatProps & { wrap?: boolean }) {
  const [showTip, setShowTip] = useState(false)
  const color = tone === 'pos' ? t.accent.pos
    : tone === 'neg' ? t.accent.neg
    : tone === 'warn' ? t.accent.warn
    : tone === 'info' ? t.brand[600]
    : t.neutrals.text
  // Normalize: number[] → SparkPoint[] (date defaults to index)
  const sparkData: SparkPoint[] = (sparkline ?? []).map((p, i) =>
    typeof p === 'number' ? { date: String(i), value: p } : p
  )
  const sparkData2: SparkPoint[] = (sparkline2 ?? []).map((p, i) =>
    typeof p === 'number' ? { date: String(i), value: p } : p
  )
  const sparkColor = sparkData.length > 1
    ? (sparkData[sparkData.length - 1].value >= sparkData[0].value ? t.accent.pos : t.accent.neg)
    : t.neutrals.muted
  return (
    <div
      onMouseEnter={title ? () => setShowTip(true) : undefined}
      onMouseLeave={title ? () => setShowTip(false) : undefined}
      style={{
        background: t.neutrals.inner, borderRadius: t.radius.sm,
        padding: '8px 10px', position: 'relative',
        minWidth: 0,
      }}
    >
      {/* 지표 정의 툴팁 — 스파크라인 hover 툴팁과 동일한 시각 언어(반전 배경), 지연 없음 */}
      {title && showTip && (
        <div style={{
          position: 'absolute', left: 0, bottom: 'calc(100% + 6px)',
          minWidth: 200, maxWidth: 280,
          background: t.neutrals.text, color: t.neutrals.card,
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.sans,
          padding: '6px 8px', borderRadius: t.radius.sm,
          pointerEvents: 'none', zIndex: 30, lineHeight: 1.5,
          wordBreak: 'keep-all', whiteSpace: 'normal',
        }}>
          {title}
        </div>
      )}
      {/* Row 1: label/value (왼쪽) + sparkline (오른쪽) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3,
            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {label}
            {title && <Info size={10} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.75 }} aria-label="지표 설명" />}
          </div>
          <div style={{
            fontSize: 'calc(13px * var(--fz, 1))', fontWeight: 600, letterSpacing: -0.3,
            fontVariantNumeric: 'tabular-nums' as const,
            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
            color,
          }}>
            {value}
            {unit && <span style={{ fontSize: 'calc(11px * var(--fz, 1))', marginLeft: 3, color: t.neutrals.muted, fontWeight: 400 }}>{unit}</span>}
            {valueExtra}
          </div>
        </div>
        {sparkData.length > 1 && (
          <div style={{ flexShrink: 0 }}>
            <Sparkline
              data={sparkData}
              color={sparkColor}
              format={sparkFormat}
              data2={sparkData2.length > 1 ? sparkData2 : undefined}
              color2={spark2Color}
              dualScale={dualScale}
            />
          </div>
        )}
      </div>
      {/* Row 2: sub (전체 폭) */}
      {sub && (
        <div style={wrap ? {
          fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, marginTop: 4,
          wordBreak: 'break-word' as const, lineHeight: 1.4,
        } : {
          fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.muted, marginTop: 4,
          whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{sub}</div>
      )}
    </div>
  )
}
