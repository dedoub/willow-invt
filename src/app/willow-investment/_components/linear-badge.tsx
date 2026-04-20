'use client'

import { t, tonePalettes, ToneName } from './linear-tokens'
import { ReactNode } from 'react'

interface LBadgeProps {
  tone?: ToneName
  children: ReactNode
  pill?: boolean
}

export function LBadge({ tone = 'neutral', children, pill = false }: LBadgeProps) {
  const p = tonePalettes[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: `${t.badge.padY}px ${t.badge.padX}px`,
      background: p.bg, color: p.fg,
      fontSize: t.badge.size, fontWeight: t.badge.weight,
      borderRadius: pill ? 999 : t.badge.radius,
      lineHeight: 1.2, fontFamily: t.font.sans,
    }}>
      {children}
    </span>
  )
}
