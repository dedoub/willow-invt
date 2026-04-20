'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LCardProps {
  children: ReactNode
  pad?: number | string
  style?: React.CSSProperties
}

export function LCard({ children, pad, style }: LCardProps) {
  return (
    <div style={{
      background: t.neutrals.card,
      borderRadius: t.radius.lg,
      padding: pad ?? t.density.cardPad,
      fontFamily: t.font.sans,
      color: t.neutrals.text,
      ...style,
    }}>
      {children}
    </div>
  )
}
