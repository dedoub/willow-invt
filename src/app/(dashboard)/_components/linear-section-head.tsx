'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LSectionHeadProps {
  eyebrow?: ReactNode
  title: string
  action?: ReactNode
  /** 하단 여백 override. 미지정 시 기본값(t.density.gapMd). */
  mb?: number
}

export function LSectionHead({ eyebrow, title, action, mb }: LSectionHeadProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      marginBottom: mb ?? t.density.gapMd,
    }}>
      <div>
        {eyebrow && (
          <div style={{
            fontSize: 'calc(10.5px * var(--fz, 1))', fontWeight: t.weight.semibold, letterSpacing: 1.2,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: 4, fontFamily: t.font.mono,
          }}>{eyebrow}</div>
        )}
        <div style={{
          fontSize: 'calc(15px * var(--fz, 1))', fontWeight: t.weight.semibold,
          fontFamily: t.font.sans, color: t.neutrals.text,
          letterSpacing: -0.2, lineHeight: 1.2,
        }}>{title}</div>
      </div>
      {action}
    </div>
  )
}
