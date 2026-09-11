'use client'

import { Children } from 'react'
import { t } from './linear-tokens'

/**
 * 지표 줄 — 사업관리 카드의 지표 격자(FigureGrid)와 같은 리듬.
 * 칸 사이는 띄우지 않고, 첫 줄을 뺀 나머지 줄 위에만 가로줄을 둔다.
 * LStat 은 스파크라인까지 들고 있어 그대로 두고, 줄만 여기서 그린다(2026-09-11).
 */
export function StatRows({ cols, children }: { cols: string; children: React.ReactNode }) {
  const perRow = Number(/repeat\((\d+)/.exec(cols)?.[1] ?? '1')
  const items = Children.toArray(children)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, alignContent: 'start' }}>
      {items.map((child, i) => (
        <div key={i} style={{
          minWidth: 0,
          borderTop: i >= perRow ? `1px solid ${t.neutrals.line}` : undefined,
        }}>
          {child}
        </div>
      ))}
    </div>
  )
}
