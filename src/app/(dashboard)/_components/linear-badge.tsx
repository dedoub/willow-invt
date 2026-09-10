'use client'

import { t, tonePalettes, ToneName } from './linear-tokens'
import { ReactNode } from 'react'

interface LBadgeProps {
  tone?: ToneName
  /**
   * 톤 이름에 없는 색(카테고리·거래처·분류 색 등)을 쓸 때. tone보다 우선한다.
   * 크기·패딩·굵기·반경은 그대로 t.badge 를 따르므로 "배지 규격은 하나" 원칙이 유지된다 (2026-09-10 감사).
   */
  palette?: { bg: string; fg: string }
  children: ReactNode
  /** 상태 배지는 pill, 분류·우선순위 배지는 기본(radius 4) — CLAUDE.md 배지 규칙 */
  pill?: boolean
  /** 아이콘·툴팁 등 부가 속성 */
  title?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function LBadge({ tone = 'neutral', palette, children, pill = false, title, style, onClick }: LBadgeProps) {
  const p = palette ?? tonePalettes[tone]
  return (
    <span title={title} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs,
      padding: `${t.badge.padY}px ${t.badge.padX}px`,
      background: p.bg, color: p.fg,
      fontSize: `calc(${t.badge.size}px * var(--fz, 1))`, fontWeight: t.badge.weight,
      borderRadius: pill ? t.radius.pill : t.badge.radius,
      lineHeight: 1.2, fontFamily: t.font.sans, whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}>
      {children}
    </span>
  )
}
