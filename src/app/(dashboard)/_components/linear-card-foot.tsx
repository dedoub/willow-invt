'use client'

import { ReactNode } from 'react'
import { t } from './linear-tokens'

/**
 * 카드 하단 메타 바 — "2026-09-10 기준", "1-8 / 35", "업데이트 1시간 전"처럼 카드 전체에 걸리는 부가 정보 한 줄.
 * 헤더 meta는 제목을 설명하는 짧은 단서만 두고, 시각·건수·출처는 여기로 내린다 (2026-09-10 카드 문법).
 * 좌우 두 슬롯. 표 페이지네이션(LPageSize + 페이지 이동)이 있는 카드는 그 줄이 이 자리를 겸한다.
 */
export function LCardFoot({ left, right, style }: { left?: ReactNode; right?: ReactNode; style?: React.CSSProperties }) {
  if (!left && !right) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: t.density.kpiGap,
      marginTop: t.density.gapMd, paddingTop: t.density.panelPadY,
      borderTop: `1px solid ${t.neutrals.line}`,
      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
      fontFamily: t.font.sans, lineHeight: 1.4, minWidth: 0,
      ...style,
    }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</span>
      <span style={{ flexShrink: 0, fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>{right}</span>
    </div>
  )
}
