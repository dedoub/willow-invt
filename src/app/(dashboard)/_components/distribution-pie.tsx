'use client'

// 분포 파이 카드 — 탭 전환(기기/활성/결제 등) + 도넛 + 범례(%).
// voicecards-block에서 추출한 공용 컴포넌트 (2026-07-15) — 보이스카드/리뷰노트 공용.
// 모바일에서는 도넛을 숨기고 범례만 표시.

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { t, useIsMobile } from './linear-tokens'

export function DistributionPie({
  title, tabs, palette, unit, topN,
}: {
  title: string
  tabs: Array<{ key: string; label: string; data: Array<{ name: string; value: number }> }>
  palette: string[]
  unit?: string
  topN?: number  // 상위 N개만 표시하고 나머지는 "기타"로 합침
}) {
  const [activeTab, setActiveTab] = useState(tabs[0].key)
  const current = tabs.find(t => t.key === activeTab) ?? tabs[0]
  const mobile = useIsMobile()
  const OTHER_LABEL = '기타'
  const OTHER_COLOR = '#94a3b8'

  // 상위 N개 + 나머지 "기타"로 집계
  const aggregateTopN = (rows: Array<{ name: string; value: number }>) => {
    if (!topN || rows.length <= topN) return rows
    const sorted = [...rows].sort((a, b) => b.value - a.value)
    const top = sorted.slice(0, topN)
    const rest = sorted.slice(topN)
    const otherValue = rest.reduce((sum, r) => sum + r.value, 0)
    return otherValue > 0 ? [...top, { name: OTHER_LABEL, value: otherValue }] : top
  }
  const data = aggregateTopN(current.data)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  // Color mapping: 모든 탭의 상위 N개 카테고리에 일관된 색 할당, "기타"는 항상 회색
  const allTopNames = Array.from(new Set(
    tabs.flatMap(tb => aggregateTopN(tb.data).map(d => d.name)).filter(n => n !== OTHER_LABEL)
  ))
  const colorByName = new Map<string, string>(allTopNames.map((name, i) => [name, palette[i % palette.length]]))
  colorByName.set(OTHER_LABEL, OTHER_COLOR)

  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px', height: '100%', boxSizing: 'border-box' as const,
      display: 'flex', flexDirection: 'column' as const,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap' as const, gap: 4, marginBottom: 6,
      }}>
        <div style={{
          fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.8,
          textTransform: 'uppercase' as const, color: t.neutrals.subtle,
          whiteSpace: 'nowrap' as const,
        }}>
          {title}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(tb => {
            const active = activeTab === tb.key
            return (
              <button
                key={tb.key}
                onClick={() => setActiveTab(tb.key)}
                style={{
                  padding: '2px 6px', borderRadius: t.radius.sm, border: 'none', cursor: 'pointer',
                  whiteSpace: 'nowrap' as const,
                  fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 500, fontFamily: t.font.sans,
                  background: active ? t.brand[500] : 'transparent',
                  color: active ? '#fff' : t.neutrals.muted,
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {tb.label}
              </button>
            )
          })}
        </div>
      </div>
      {data.length === 0 || total === 0 ? (
        <div style={{
          height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle,
        }}>
          데이터 없음
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {!mobile && (
            <div style={{ width: 80, height: 80, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%" cy="50%"
                    innerRadius={20} outerRadius={36}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((d, i) => (
                      <Cell key={i} fill={colorByName.get(d.name) ?? palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 'calc(11px * var(--fz, 1))', background: '#1E293B', border: 'none', borderRadius: 6, padding: '6px 10px' }}
                    itemStyle={{ color: '#F8FAFC' }}
                    labelStyle={{ color: '#F8FAFC' }}
                    formatter={(value, name) => [`${value}${unit ?? ''}`, String(name)]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            {data.map(d => {
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
              return (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: colorByName.get(d.name) ?? t.neutrals.subtle, flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 0,
                  }}>
                    {d.name}
                  </span>
                  <span style={{
                    fontSize: 'calc(10px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
