'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LSectionHeadProps {
  eyebrow?: ReactNode
  title: string
  /** 제목 옆 보조 정보 — 집계 기간·단서처럼 섹션 전체에 걸리는 값 */
  meta?: ReactNode
  action?: ReactNode
  /** 하단 여백 override. 미지정 시 기본값(t.density.gapMd). */
  mb?: number
}

export function LSectionHead({ eyebrow, title, meta, action, mb }: LSectionHeadProps) {
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 'calc(15px * var(--fz, 1))', fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, color: t.neutrals.text,
            letterSpacing: -0.2, lineHeight: 1.2,
          }}>{title}</div>
          {meta && (
            <div style={{
              fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle,
              lineHeight: 1.4, wordBreak: 'keep-all' as const,
            }}>{meta}</div>
          )}
        </div>
      </div>
      {action}
    </div>
  )
}
