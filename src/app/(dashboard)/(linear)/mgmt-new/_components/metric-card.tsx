'use client'

import { ReactNode } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LCardFoot } from '@/app/(dashboard)/_components/linear-card-foot'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

/**
 * 지표 카드 — 카드 하나가 지표 하나를 맡는다.
 * 눈썹(영어) · 제목(한글) · 값 · 보조 2열 · 하단 메타 한 줄로 자리가 고정돼 있어
 * 카드가 몇 개 늘어도 읽는 순서가 같다 (레퍼런스: coderthemes Simple의 KPI 카드 문법).
 * 색은 값이 변동·상태를 뜻할 때만 쓴다 — 단순 금액은 기본색.
 */
export function MetricCard({
  eyebrow, title, icon, value, unit, tone = 'default', pairs, foot, footRight,
}: {
  eyebrow: string
  title: string
  icon?: string
  value: ReactNode
  unit?: string
  tone?: 'default' | 'pos' | 'neg'
  /** 값 아래 보조 2열. 라벨은 caption, 값은 control 크기 */
  pairs?: Array<{ label: string; value: ReactNode }>
  foot?: ReactNode
  footRight?: ReactNode
}) {
  const valueColor = tone === 'pos' ? t.accent.pos : tone === 'neg' ? t.accent.neg : t.neutrals.text
  return (
    <LCard style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <LSectionHead
        eyebrow={eyebrow}
        title={title}
        action={icon ? <span style={{ color: t.neutrals.subtle, display: 'flex' }}><LIcon name={icon} size={15} stroke={1.8} /></span> : undefined}
        mb={t.density.gapMd}
      />

      <div style={{
        display: 'flex', alignItems: 'baseline', gap: t.density.gapXs,
        fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums',
        fontSize: `calc(${t.type.display}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
        color: valueColor, lineHeight: 1.1, minWidth: 0,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        {unit && (
          <span style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.regular, color: t.neutrals.subtle }}>
            {unit}
          </span>
        )}
      </div>

      {pairs && pairs.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${pairs.length}, minmax(0, 1fr))`,
          gap: t.density.kpiGap, marginTop: t.density.gapMd,
        }}>
          {pairs.map(pair => (
            <div key={pair.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, marginBottom: t.density.tableRowGap }}>
                {pair.label}
              </div>
              <div style={{
                fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.mono,
                fontVariantNumeric: 'tabular-nums', color: t.neutrals.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {pair.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
        <LCardFoot left={foot} right={footRight} />
      </div>
    </LCard>
  )
}
