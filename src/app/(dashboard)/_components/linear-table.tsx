'use client'

import { t } from './linear-tokens'

/**
 * 섹션 안에 들어가는 목록 표의 공용 뼈대.
 *
 * `DataTable`(linear-data-table)은 제목·정렬·페이지네이션까지 안고 있는 완제품이라
 * 이미 자기 필터·KPI·페이지네이션을 가진 경영관리 블록들에는 맞지 않는다. 여기서는
 * 헤더와 행이 같은 컬럼 정의를 공유하게만 해서, 헤더와 셀이 어긋나는 일을 구조적으로 막는다.
 *
 *   const COLS: LColumn[] = [
 *     { key: 'date', label: '날짜', width: '52px' },
 *     { key: 'amount', label: '금액', width: '1fr', align: 'right' },
 *   ]
 *   <LTableHead columns={COLS} />
 *   {rows.map(r => <LTableRow key={r.id} columns={COLS} onClick={...}>...</LTableRow>)}
 */
export interface LColumn {
  key: string
  label: string
  /** grid-template-columns 값. '52px' · '1.6fr' · 'minmax(80px,1fr)' */
  width: string
  align?: 'left' | 'right'
  /** 모바일에서 숨길 컬럼 */
  hideMobile?: boolean
}

const GAP = 8

export function templateOf(columns: LColumn[], mobile = false): string {
  return columns.filter(c => !(mobile && c.hideMobile)).map(c => c.width).join(' ')
}

export function visibleColumns(columns: LColumn[], mobile = false): LColumn[] {
  return columns.filter(c => !(mobile && c.hideMobile))
}

/** 표 머리. 라벨은 스탯 카드 라벨과 같은 시각 언어(모노·대문자·subtle)를 쓴다. */
export function LTableHead({ columns, mobile = false }: { columns: LColumn[]; mobile?: boolean }) {
  const cols = visibleColumns(columns, mobile)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: templateOf(columns, mobile),
      gap: GAP,
      padding: '0 0 6px',
      alignItems: 'center',
    }}>
      {cols.map(c => (
        <span
          key={c.key}
          style={{
            fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono,
            letterSpacing: 0.8, textTransform: 'uppercase',
            color: t.neutrals.subtle,
            textAlign: c.align === 'right' ? 'right' : 'left',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  )
}

/** 표 한 행. 셀은 columns 순서 그대로 children 으로 넘긴다. */
export function LTableRow({
  columns, mobile = false, onClick, children,
}: {
  columns: LColumn[]
  mobile?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: templateOf(columns, mobile),
        gap: GAP,
        padding: '10px 0',
        alignItems: 'center',
        borderTop: `1px solid ${t.neutrals.line}`,
        fontSize: 'calc(12px * var(--fz, 1))',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {children}
    </div>
  )
}

/** 목록이 비었을 때. 네 블록이 같은 자리·같은 톤으로 말하게 한다. */
export function LTableEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '16px 0', textAlign: 'center',
      fontSize: 'calc(12px * var(--fz, 1))', color: t.neutrals.subtle,
      borderTop: `1px solid ${t.neutrals.line}`,
    }}>
      {children}
    </div>
  )
}

/** 상태·구분 배지. 현금관리 타입 배지 스타일을 공용으로 뺐다. */
export function LTableBadge({ tone, children }: { tone: { bg: string; fg: string }; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 6px', borderRadius: t.radius.sm,
      fontSize: 'calc(10px * var(--fz, 1))', fontWeight: t.weight.medium, textAlign: 'center',
      background: tone.bg, color: tone.fg,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </span>
  )
}

/** 금액 셀. 부호와 색을 한 곳에서 정한다. */
export function LTableAmount({
  value, positive, muted, strike,
}: { value: number; positive?: boolean; muted?: boolean; strike?: boolean }) {
  return (
    <span style={{
      textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
      color: muted ? t.neutrals.subtle : positive ? t.accent.pos : t.accent.neg,
      textDecoration: strike ? 'line-through' : undefined,
      whiteSpace: 'nowrap',
    }}>
      {muted ? '' : positive ? '+' : '-'}{Math.abs(Math.round(value)).toLocaleString()}
    </span>
  )
}
