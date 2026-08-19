'use client'

import { useState } from 'react'
import { t } from './linear-tokens'
import { getStoredSort, saveSort } from './linear-page-size'

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
export interface LColumn<T = never> {
  key: string
  label: string
  /** grid-template-columns 값. '52px' · '1.6fr' · 'minmax(80px,1fr)' */
  width: string
  align?: 'left' | 'center' | 'right'
  /** 모바일에서 숨길 컬럼 */
  hideMobile?: boolean
  /**
   * 정렬용 원값. 주면 그 컬럼 머리가 눌린다.
   * 포맷된 문자열로 정렬하면 "1,000" < "9" 가 되므로 반드시 원값을 준다.
   */
  sortValue?: (row: T) => string | number | null | undefined
  /**
   * 첫 클릭 방향. 보이스카드 사용자 표와 같은 규칙 — 이름·구분 같은 텍스트는 오름차순,
   * 금액·날짜는 큰 값/최신이 궁금하므로 내림차순이 먼저다.
   */
  sortFirst?: SortDir
}

export type SortDir = 'asc' | 'desc'
export interface TableSort { key: string; dir: SortDir }

// 보이스카드 사용자 표와 같은 간격·글자. 두 페이지를 오가며 봐도 같은 표로 읽힌다.
const GAP = 6

/**
 * 표 정렬 상태. 같은 머리를 다시 누르면 오름차순 → 내림차순 → 해제로 돈다.
 * 해제하면 블록이 원래 쓰던 정렬(대개 최신순)로 돌아간다. 정렬을 걸었다가
 * 되돌릴 방법이 없으면 화면을 새로고침하는 수밖에 없어서 3단계로 돈다.
 */
export function useTableSort<T>(storageKey: string, columns: LColumn<T>[]) {
  const [sort, setSort] = useState<TableSort | null>(() => {
    const stored = getStoredSort(storageKey)
    // 그 사이 사라진 컬럼이면 복원하지 않는다
    return stored && columns.some(c => c.key === stored.col) ? { key: stored.col, dir: stored.dir } : null
  })

  const toggle = (key: string) => {
    setSort(cur => {
      const first = columns.find(c => c.key === key)?.sortFirst ?? 'asc'
      const next: TableSort | null =
        !cur || cur.key !== key ? { key, dir: first }
          : cur.dir === first ? { key, dir: first === 'asc' ? 'desc' : 'asc' }
            : null
      saveSort(storageKey, next ? { col: next.key, dir: next.dir } : null)
      return next
    })
  }

  /** 정렬이 없으면 원본 순서를 그대로 돌려준다. */
  const apply = (rows: T[]): T[] => {
    if (!sort) return rows
    const col = columns.find(c => c.key === sort.key)
    if (!col?.sortValue) return rows
    const pick = col.sortValue
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = pick(a)
      const vb = pick(b)
      // 빈 값은 방향과 무관하게 항상 뒤로. 위로 올라오면 목록 첫 화면이 빈칸으로 채워진다.
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'ko') * dir
    })
  }

  return { sort, toggle, apply }
}

export function templateOf(columns: LColumn<never>[], mobile = false): string {
  return columns.filter(c => !(mobile && c.hideMobile)).map(c => c.width).join(' ')
}

export function visibleColumns(columns: LColumn<never>[], mobile = false): LColumn<never>[] {
  return columns.filter(c => !(mobile && c.hideMobile))
}

/** 표 머리. 라벨은 스탯 카드 라벨과 같은 시각 언어(모노·대문자·subtle)를 쓴다. */
export function LTableHead<T>({
  columns, mobile = false, sort, onSort,
}: {
  columns: LColumn<T>[]
  mobile?: boolean
  sort?: TableSort | null
  onSort?: (key: string) => void
}) {
  const cols = visibleColumns(columns as LColumn<never>[], mobile)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: templateOf(columns as LColumn<never>[], mobile),
      gap: GAP,
      padding: '0 0 6px',
      alignItems: 'center',
    }}>
      {cols.map(c => {
        const sortable = !!(onSort && (c as LColumn<T>).sortValue)
        const active = sort?.key === c.key
        return (
          <span
            key={c.key}
            onClick={sortable ? () => onSort!(c.key) : undefined}
            style={{
              fontSize: 'calc(9px * var(--fz, 1))', fontFamily: t.font.mono,
              letterSpacing: 0.3, textTransform: 'uppercase',
              color: active ? t.neutrals.text : t.neutrals.subtle,
              display: 'flex', alignItems: 'center', gap: 2,
              justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
              whiteSpace: 'nowrap', overflow: 'hidden',
              cursor: sortable ? 'pointer' : undefined,
              userSelect: 'none',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
            {active && (
              <span style={{ fontSize: '0.85em', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
                {sort!.dir === 'asc' ? '▲' : '▼'}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

/** 표 한 행. 셀은 columns 순서 그대로 children 으로 넘긴다. */
export function LTableRow<T>({
  columns, mobile = false, onClick, children,
}: {
  columns: LColumn<T>[]
  mobile?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: templateOf(columns as LColumn<never>[], mobile),
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
