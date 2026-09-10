'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LCardProps {
  children: ReactNode
  pad?: number | string
  style?: React.CSSProperties
  className?: string
}

export function LCard({ children, pad, style, className }: LCardProps) {
  return (
    // data-lcard: 화면별 테마 실험이 카드 껍데기만 CSS로 덮을 수 있게 하는 표식. 기본 시각은 그대로다.
    <div className={className} data-lcard="" style={{
      background: t.neutrals.card,
      borderRadius: t.radius.lg,
      padding: pad ?? t.density.cardPad,
      fontFamily: t.font.sans,
      color: t.neutrals.text,
      minWidth: 0,
      ...style,
    }}>
      {children}
    </div>
  )
}
