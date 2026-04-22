'use client'

import { t } from './linear-tokens'

interface LStatProps {
  label: string
  value: string
  unit?: string
  tone?: 'pos' | 'neg' | 'warn' | 'info' | 'default'
}

export function LStat({ label, value, unit, tone = 'default' }: LStatProps) {
  const color = tone === 'pos' ? t.accent.pos
    : tone === 'neg' ? t.accent.neg
    : tone === 'warn' ? t.accent.warn
    : tone === 'info' ? t.brand[600]
    : t.neutrals.text
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle,
        marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, letterSpacing: -0.3,
        fontVariantNumeric: 'tabular-nums' as const,
        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
        color,
      }}>
        {value}
        {unit && <span style={{ fontSize: 11, marginLeft: 3, color: t.neutrals.muted, fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  )
}
