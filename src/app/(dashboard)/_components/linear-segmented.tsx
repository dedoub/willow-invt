'use client'

import { t } from './linear-tokens'

/**
 * Segmented control — 페이지 전반의 필터/토글 UI 표준.
 * 디자인: invest 페이지의 holdings-block 패턴.
 *
 *   <LSegmented value={value} onChange={setValue} options={[
 *     { value: 'all', label: '전체' },
 *     { value: 'KR', label: '국내' },
 *     ...
 *   ]} />
 *
 * 그룹 구분이 필요하면 options 배열 안에 `divider: true` 항목을 넣는다.
 */
export type LSegmentedOption<V extends string> =
  | { value: V; label: string; divider?: false }
  | { divider: true; value?: never; label?: never }

interface Props<V extends string> {
  options: ReadonlyArray<LSegmentedOption<V>>
  value: V
  onChange: (v: V) => void
  size?: 'sm' | 'md'
  /** 라벨 추가 컴팩트 모드 — wiki처럼 옵션이 많을 때 좌우 padding 축소 */
  compact?: boolean
}

export function LSegmented<V extends string>({ options, value, onChange, size = 'sm', compact }: Props<V>) {
  const padY = size === 'sm' ? 4 : 5
  const padX = compact ? 8 : 10
  const fontSize = size === 'sm' ? 11 : 12

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2,
    }}>
      {options.map((opt, idx) => {
        if ('divider' in opt && opt.divider) {
          return <span key={`div-${idx}`} style={{ width: 1, margin: '3px 1px', background: t.neutrals.line }} />
        }
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              border: 'none', cursor: 'pointer',
              padding: `${padY}px ${padX}px`, fontSize, borderRadius: 4,
              fontFamily: t.font.sans,
              fontWeight: active ? t.weight.medium : t.weight.regular,
              background: active ? t.neutrals.card : 'transparent',
              color: t.neutrals.text,
              transition: 'background .12s',
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
