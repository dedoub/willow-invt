'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LSectionHeadProps {
  eyebrow?: string
  title: string
  action?: ReactNode
}

export function LSectionHead({ eyebrow, title, action }: LSectionHeadProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      marginBottom: t.density.gapMd,
    }}>
      <div>
        {eyebrow && (
          <div style={{
            fontSize: 10.5, fontWeight: t.weight.semibold, letterSpacing: 1.2,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: 4, fontFamily: t.font.mono,
          }}>{eyebrow}</div>
        )}
        <div style={{
          fontSize: 15, fontWeight: t.weight.semibold,
          fontFamily: t.font.sans, color: t.neutrals.text,
          letterSpacing: -0.2, lineHeight: 1.2,
        }}>{title}</div>
      </div>
      {action}
    </div>
  )
}
