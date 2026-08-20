'use client'

import { t } from './linear-tokens'

export interface LFilterChipOption<V extends string> {
  value: V
  label: string
  /** 활성 시 적용할 커스텀 톤 — 카테고리 색 등 도메인 의미를 살릴 때 사용 */
  tone?: { bg: string; fg: string }
}

type Props<V extends string> = {
  options: ReadonlyArray<LFilterChipOption<V>>
  onChange: (v: V) => void
  size?: 'sm' | 'md'
  gap?: number
} & ({ multi: true; value: V[] } | { multi?: false; value: V })

/**
 * Pill 필터 chip — 카테고리/태그/섹션 필터의 표준.
 * 옵션 5+개·자유 필터링 용도.
 *
 *   <LFilterChip options={[{value: 'all', label: '전체'}, ...]} value={v} onChange={setV} />
 *
 * 카테고리 색을 살리고 싶을 땐 옵션에 `tone: { bg, fg }`를 넣는다.
 */
export function LFilterChip<V extends string>(props: Props<V>) {
  const { options, onChange, size = 'sm', gap = t.density.gapXs + 1 } = props
  const height = size === 'sm' ? t.density.controlHSm : t.density.controlHMd
  const padX = size === 'sm' ? t.density.controlPadXSm : 12
  const fontSize = size === 'sm' ? t.type.badge : t.type.tableBody
  const isActive = (v: V) => props.multi ? props.value.includes(v) : props.value === v

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap, flexWrap: 'wrap' as const }}>
      {options.map(opt => {
        const active = isActive(opt.value)
        const activeBg = opt.tone?.bg ?? t.brand[100]
        const activeFg = opt.tone?.fg ?? t.brand[700]
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              border: 'none', cursor: 'pointer',
              height, padding: `0 ${padX}px`, fontSize, borderRadius: t.radius.pill,
              fontFamily: t.font.sans,
              fontWeight: active ? t.weight.medium : t.weight.regular,
              background: active ? activeBg : t.neutrals.inner,
              color: active ? activeFg : t.neutrals.muted,
              transition: 'background .12s, color .12s',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
