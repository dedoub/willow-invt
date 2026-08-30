'use client'

import { useEffect, useState } from 'react'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
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

/** 표 안의 날짜·숫자는 본문보다 한 단계 작은 모노로 맞춘다. */
const TABLE_NUMERIC_SIZE = 11

export type SortDir = 'asc' | 'desc'
export interface TableSort { key: string; dir: SortDir }

// 보이스카드 사용자 표와 같은 간격·글자·색. 두 페이지를 오가며 봐도 같은 표로 읽힌다.
// 행은 선으로 나누지 않고 채운 카드로 띄운다 — 선이 없으니 가로 스크롤에서 잘려도 덜 지저분하다.
const GAP = t.density.tableColGap
const ROW_GAP = t.density.tableRowGap
const ROW_PAD_X = t.density.tableRowPadX

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
      padding: `0 ${ROW_PAD_X}px 5px`,
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
              fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, fontFamily: t.font.mono,
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
        padding: `5px ${ROW_PAD_X}px`,
        alignItems: 'center',
        background: t.neutrals.inner,
        borderRadius: t.radius.sm,
        fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {children}
    </div>
  )
}

/**
 * 표 본문. 행 사이를 선이 아니라 2px 틈으로 띄운다.
 * minWidth를 컬럼 정의에서 계산해 좁은 폭에서는 가로로 스크롤한다 — 하드코딩하면
 * 열을 하나 추가할 때마다 마지막 열이 행 배경 밖으로 삐져나온다.
 */
/** 컬럼 정의에서 표가 찌그러지지 않는 최소 폭을 구한다. */
export function tableMinWidth(columns: LColumn<never>[] | LColumn<unknown>[], mobile = false): number {
  const cols = visibleColumns(columns as LColumn<never>[], mobile)
  return cols.reduce((sum, c) => {
    const m = c.width.match(/minmax\((\d+)px/) || c.width.match(/^(\d+)px$/)
    return sum + (m ? Number(m[1]) : 0)
  }, 0) + GAP * Math.max(0, cols.length - 1) + ROW_PAD_X * 2
}

/**
 * 표 머리와 본문을 하나의 가로 스크롤 안에 함께 둔다. 본문만 스크롤하면 좁은
 * 화면에서 머리와 열이 어긋나 표가 깨져 보인다.
 */
export function LTableScroll({ columns, mobile = false, minWidth, children }: {
  /** LColumn 기반 표. 직접 짠 grid 표는 대신 minWidth를 넘긴다. */
  columns?: LColumn<never>[] | LColumn<unknown>[]
  mobile?: boolean
  minWidth?: number
  children: React.ReactNode
}) {
  const min = minWidth ?? (columns ? tableMinWidth(columns, mobile) : 0)
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: min }}>{children}</div>
    </div>
  )
}

export function LTableBody({ columns, mobile = false, children }: {
  columns: LColumn<never>[] | LColumn<unknown>[]
  mobile?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ minWidth: tableMinWidth(columns, mobile), display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
      {children}
    </div>
  )
}

/** 목록이 비었을 때. 네 블록이 같은 자리·같은 톤으로 말하게 한다. */
export function LTableEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: `${t.density.gapLg}px 0`, textAlign: 'center',
      fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, color: t.neutrals.subtle,
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
      fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontWeight: t.weight.medium, textAlign: 'center',
      background: tone.bg, color: tone.fg,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </span>
  )
}

/** 금액 셀. 부호와 색을 한 곳에서 정한다. */
/**
 * 표 안의 날짜. 표마다 슬라이스 폭과 글자 크기가 달라 같은 화면에서 다른 표로
 * 읽히던 것을 한곳으로 모은다. 기본은 월-일이고 연도는 툴팁으로 남긴다.
 */
/**
 * 표 안 모노 칸의 공통 껍데기. 날짜·숫자·비율이 서로 다른 크기로 찍히던 것을
 * 여기 하나로 모은다.
 */
export function LTableMono({ children, align = 'left', tone, strong }: {
  children: React.ReactNode
  align?: 'left' | 'right'
  tone?: 'muted' | 'text' | 'warn' | 'neg'
  strong?: boolean
}) {
  const color = tone === 'text' ? t.neutrals.text
    : tone === 'warn' ? t.accent.warn
      : tone === 'neg' ? t.accent.neg
        : t.neutrals.muted
  return (
    <span style={{
      textAlign: align, fontFamily: t.font.mono, color,
      fontWeight: strong ? 500 : undefined,
      fontVariantNumeric: 'tabular-nums',
      fontSize: `calc(${TABLE_NUMERIC_SIZE}px * var(--fz, 1))`, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

/** 'md'는 월-일, 'ymd'는 두 자리 연도까지. 원본 전체는 툴팁으로 남는다. */
export function LTableDate({ value, format = 'md', tone }: {
  value?: string | null
  format?: 'md' | 'ymd' | 'full'
  tone?: 'muted' | 'neg'
}) {
  const text = String(value ?? '')
  const shown = !text ? '-'
    : format === 'full' ? text
      : format === 'ymd' ? text.slice(2)
        : text.slice(5)
  return <LTableMono tone={tone}><span title={text || undefined}>{shown}</span></LTableMono>
}

/** 부호 없이 값만 읽는 숫자 칸. 부호와 색이 필요하면 LTableAmount를 쓴다. */
export function LTableNumber({ value, align = 'right', tone = 'text' }: {
  value: number
  align?: 'left' | 'right'
  tone?: 'muted' | 'text' | 'warn' | 'neg'
}) {
  return <LTableMono align={align} tone={tone} strong>{Math.round(value).toLocaleString()}</LTableMono>
}

export function LTableAmount({
  value, positive, muted, strike,
}: { value: number; positive?: boolean; muted?: boolean; strike?: boolean }) {
  return (
    <span style={{
      textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
      fontFamily: t.font.mono, fontSize: `calc(${TABLE_NUMERIC_SIZE}px * var(--fz, 1))`,
      color: muted ? t.neutrals.subtle : positive ? t.accent.pos : t.accent.neg,
      textDecoration: strike ? 'line-through' : undefined,
      whiteSpace: 'nowrap',
    }}>
      {muted ? '' : positive ? '+' : '-'}{Math.abs(Math.round(value)).toLocaleString()}
    </span>
  )
}

/**
 * 표 아래 "N개씩" 행수 조절.
 *
 * 스무 개 넘는 표가 저마다 같은 입력칸을 손으로 복사해 두고 있었다. 한 군데로 모아
 * 두면 행수를 고르는 방식이 표마다 갈리지 않는다.
 *
 * 입력과 드롭다운을 함께 둔다 — 흔히 쓰는 값은 목록에서 한 번에 고르고, 목록에 없는
 * 수(예: 17)는 그대로 쳐 넣을 수 있어야 한다. 그래서 select 를 입력칸 오른쪽 끝에
 * 투명하게 겹쳐 둔다. 쉐브론 자리를 누르면 네이티브 메뉴가 열리고, 그 왼쪽은 여전히
 * 입력칸이라 타이핑이 막히지 않는다. 팝오버를 직접 만들지 않으므로 바깥 클릭·키보드
 * 조작·모바일 휠은 브라우저가 알아서 처리한다.
 */
const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100]

export function LPageSize({ value, onChange, min = 1, max = 100, options = PAGE_SIZE_OPTIONS }: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  options?: number[]
}) {
  const [draft, setDraft] = useState(String(value))
  // 바깥에서 값이 바뀌면(다른 기기의 저장값 복원 등) 입력칸도 따라간다.
  useEffect(() => { setDraft(String(value)) }, [value])

  const commit = (raw: string) => {
    const n = Math.max(min, Math.min(max, Number(raw) || value))
    setDraft(String(n))
    if (n !== value) onChange(n)
  }

  // 지금 값이 목록에 없으면(직접 친 수) 함께 넣는다 — 없으면 select 가 빈칸으로 보인다.
  const items = Array.from(new Set([...options, value])).filter(n => n >= min && n <= max).sort((a, b) => a - b)

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: t.density.gapXs }}>
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === 'Enter') commit(draft) }}
          aria-label="한 페이지에 보일 행 수"
          style={{
            width: 42, paddingLeft: 4, paddingRight: 14, textAlign: 'center',
            border: 'none', background: t.neutrals.inner, borderRadius: t.radius.sm,
            fontSize: `calc(${t.type.label}px * var(--fz, 1))`, fontFamily: t.font.mono,
            color: t.neutrals.muted, paddingTop: 2, paddingBottom: 2, outline: 'none',
          }}
        />
        <span style={{
          position: 'absolute', right: 3, top: '50%', transform: 'translateY(-50%)',
          display: 'inline-flex', color: t.neutrals.subtle, pointerEvents: 'none',
        }}>
          <LIcon name="chevronDown" size={10} stroke={2} />
        </span>
        {/* 쉐브론 자리에만 겹치는 투명 select — 왼쪽은 입력칸으로 남는다 */}
        <select
          value={value}
          onChange={e => commit(e.target.value)}
          aria-label="행 수 고르기"
          style={{
            position: 'absolute', right: 0, top: 0, height: '100%', width: 16,
            opacity: 0, cursor: 'pointer', border: 'none', padding: 0, margin: 0,
          }}
        >
          {items.map(n => <option key={n} value={n}>{n}개씩</option>)}
        </select>
      </span>
      <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle }}>개씩</span>
    </span>
  )
}
