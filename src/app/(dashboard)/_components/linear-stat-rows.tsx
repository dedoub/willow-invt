'use client'

import { Children } from 'react'
import { t } from './linear-tokens'

/**
 * 지표 줄 — 사업관리 카드의 지표 격자(FigureGrid)와 같은 리듬.
 * 칸 사이는 띄우지 않고, 첫 줄을 뺀 나머지 줄 위에만 가로줄을 둔다.
 * LStat 은 스파크라인까지 들고 있어 그대로 두고, 줄만 여기서 그린다(2026-09-11).
 */

/**
 * 마지막 칸이 차지할 열 수.
 *
 * 구분선은 칸마다 제 위에 긋는다. 그래서 마지막 줄이 덜 차면 그 줄에 없는 칸 위로는
 * 선이 안 그어지고, 앞 줄 끝 칸 아래가 뚫린 것처럼 보인다 — 리뷰노트 활동 지표를
 * 모바일(2열)에서 보면 지표가 다섯이라 마지막 줄이 한 칸뿐이고, '문제 풀이' 밑에만
 * 선이 빠졌다(2026-09-13 CEO).
 *
 * FigureGrid 가 같은 문제를 같은 방법으로 푼다: 마지막 칸을 남은 폭만큼 늘려 줄을 채운다.
 */
export function lastRowSpan(count: number, perRow: number): number {
  if (count <= 0 || perRow <= 1) return 1
  // 한 줄에 다 들어가면 늘리지 않는다. 첫 줄에는 어차피 선을 긋지 않으므로 채울 이유가
  // 없고, 늘리면 지표 하나만 이유 없이 넓어진다(와이드 1열 모드의 5개 지표).
  if (count <= perRow) return 1
  const remainder = count % perRow
  // 마지막 줄이 꽉 찼으면 늘릴 것이 없다.
  return remainder === 0 ? 1 : perRow - remainder + 1
}

export function StatRows({ cols, children }: { cols: string; children: React.ReactNode }) {
  const perRow = Number(/repeat\((\d+)/.exec(cols)?.[1] ?? '1')
  const items = Children.toArray(children)
  const span = lastRowSpan(items.length, perRow)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, alignContent: 'start' }}>
      {items.map((child, i) => (
        <div key={i} style={{
          minWidth: 0,
          borderTop: i >= perRow ? `1px solid ${t.neutrals.line}` : undefined,
          gridColumn: i === items.length - 1 && span > 1 ? `span ${span}` : undefined,
        }}>
          {child}
        </div>
      ))}
    </div>
  )
}
