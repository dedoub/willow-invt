'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

interface LBtnProps {
  variant?: BtnVariant
  size?: BtnSize
  children: ReactNode
  icon?: ReactNode
  onClick?: () => void
  style?: React.CSSProperties
  disabled?: boolean
}

const sizes = {
  sm: { h: 28, px: 10, fs: 12 },
  md: { h: 34, px: 14, fs: 13 },
  lg: { h: 40, px: 18, fs: 14 },
}

const variants = {
  primary:   { bg: t.neutrals.inner, fg: t.neutrals.text },
  secondary: { bg: t.neutrals.inner, fg: t.neutrals.muted },
  ghost:     { bg: 'transparent', fg: t.neutrals.text },
  brand:     { bg: t.brand[600], fg: '#fff' },
  danger:    { bg: t.accent.neg, fg: '#fff' },
}

export function LBtn({ variant = 'primary', size = 'md', children, icon, onClick, style, disabled }: LBtnProps) {
  const s = sizes[size]
  const v = variants[variant]
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs,
      background: v.bg, color: v.fg,
      fontWeight: t.weight.regular, fontFamily: t.font.sans,
      borderRadius: t.radius.sm, border: 'none', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}>
      {icon}{children}
    </button>
  )
}
