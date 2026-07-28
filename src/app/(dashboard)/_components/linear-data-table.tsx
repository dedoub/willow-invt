'use client'

import { useMemo, useState } from 'react'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { getStoredPageSize, savePageSize } from './linear-page-size'

// 검색 수요 카드에서 쓰던 표를 공용으로 뺐다. GEO 답변 점유 섹션도 같은 표를 쓰기 때문에,
// 한쪽만 고쳐 두 화면이 어긋나는 걸 막는다. 스타일 토큰은 원본 그대로 옮겨왔다.

const mono = (size: number): React.CSSProperties => ({
  fontSize: `calc(${size}px * var(--fz, 1))`, fontFamily: t.font.mono,
  fontVariantNumeric: 'tabular-nums' as const,
})

export const panelStyle: React.CSSProperties = {
  background: t.neutrals.inner, borderRadius: t.radius.sm,
  padding: '8px 10px', height: '100%', boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', minWidth: 0,
}

export const panelTitle: React.CSSProperties = {
  ...mono(9.5), letterSpacing: 0.8, textTransform: 'uppercase' as const,
  color: t.neutrals.subtle, whiteSpace: 'nowrap' as const,
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, minHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle, textAlign: 'center' as const,
      wordBreak: 'keep-all' as const, lineHeight: 1.5, padding: '0 4px',
    }}>
      {children}
    </div>
  )
}

type SortDir = 'asc' | 'desc'

export interface TableColumn {
  key: string
  label: string
  width: string
  align?: 'left' | 'right'
}

export interface TableRow {
  key: string
  href?: string
  cells: React.ReactNode[]
  /** 정렬용 원값 — cells와 같은 순서. 포맷된 문자열로 정렬하면 1,000 < 9가 되므로 분리한다. */
  sort?: Array<string | number>
}

const headCell: React.CSSProperties = {
  ...mono(9), letterSpacing: 0.3, textTransform: 'uppercase' as const,
  color: t.neutrals.subtle, whiteSpace: 'nowrap' as const, overflow: 'hidden',
}
const textCell: React.CSSProperties = {
  fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.text,
  whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
}
const numCell: React.CSSProperties = {
  ...mono(10), color: t.neutrals.muted, textAlign: 'right' as const, whiteSpace: 'nowrap' as const,
}

/**
 * 첫 컬럼 고정. 좁은 폭에서 표가 가로로 스크롤되면 무엇에 대한 행인지 알려주는 첫 컬럼이
 * 제일 먼저 밀려나가 남은 숫자들이 어느 행 것인지 알 수 없게 된다.
 *
 * 음수 마진 + 같은 크기의 패딩으로 행의 좌측 패딩(8px)까지 덮는다. 안 그러면 그 8px 틈으로
 * 뒤 컬럼이 지나가는 게 보인다. 스크롤이 없는 폭에서는 sticky가 아무 일도 하지 않는다.
 */
const stickyCell = (bg: string): React.CSSProperties => ({
  position: 'sticky', left: 0, zIndex: 1, background: bg,
  marginLeft: -8, paddingLeft: 8,
})

export function DataTable({
  title, meta, columns, rows, empty, minWidth,
}: {
  title: string
  /** 제목 우측 보조 정보 — 검사일·총계처럼 표 전체에 걸리는 값 */
  meta?: React.ReactNode
  columns: TableColumn[]
  rows: TableRow[]
  empty: React.ReactNode
  minWidth?: number
}) {
  const template = columns.map(c => c.width).join(' ')

  // 사용자 테이블과 동일한 페이지네이션 — 개수 입력 + 쉐브론 네비게이션.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(() => getStoredPageSize(title))
  const [perPageInput, setPerPageInput] = useState(() => String(getStoredPageSize(title)))
  const commitPerPage = () => {
    const n = Math.max(1, Math.min(100, Number(perPageInput) || 10))
    setPerPageInput(String(n))
    setPerPage(n)
    setPage(1)
    savePageSize(title, n)
  }
  // 정렬 — 사용자 테이블과 동일하게 헤더 클릭, 같은 컬럼 재클릭 시 방향 토글.
  // 기본값은 원본 순서(각 표가 이미 의미 있는 순서로 넘어온다).
  const [sortIdx, setSortIdx] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const handleSort = (i: number) => {
    if (i === sortIdx) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return }
    setSortIdx(i)
    // 텍스트 컬럼은 오름차순, 숫자는 내림차순이 기본
    setSortDir(columns[i].align === 'right' ? 'desc' : 'asc')
    setPage(1)
  }

  const sortedRows = useMemo(() => {
    if (sortIdx == null) return rows
    const mul = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a.sort?.[sortIdx], bv = b.sort?.[sortIdx]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
      return String(av ?? '').localeCompare(String(bv ?? ''), 'ko') * mul
    })
  }, [rows, sortIdx, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / perPage))
  const safePage = Math.min(page, totalPages)
  const pageRows = sortedRows.slice((safePage - 1) * perPage, safePage * perPage)
  return (
    <div style={panelStyle}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 6, marginBottom: 6, flexWrap: 'wrap' as const,
      }}>
        <div style={panelTitle}>{title}</div>
        {meta && (
          <div style={{ ...mono(9), color: t.neutrals.subtle, lineHeight: 1.5 }}>{meta}</div>
        )}
      </div>
      {rows.length === 0 ? <EmptyLine>{empty}</EmptyLine> : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: minWidth ?? 300, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: template, gap: 6, alignItems: 'center', padding: '0 8px 5px' }}>
              {columns.map((c, i) => {
                const active = sortIdx === i
                return (
                  <button key={c.key} onClick={() => handleSort(i)} title={`${c.label} 기준 정렬`}
                    style={{
                      ...headCell, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                      display: 'flex', alignItems: 'center', gap: 2, width: '100%',
                      justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
                      color: active ? t.neutrals.text : t.neutrals.subtle,
                      ...(i === 0 ? stickyCell(t.neutrals.inner) : null),
                    }}>
                    {c.label}
                    <span style={{ fontSize: '0.85em', lineHeight: 1, opacity: active ? 1 : 0 }}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  </button>
                )
              })}
            </div>
            {pageRows.map(r => {
              const inner = columns.map((c, i) => (
                <div key={c.key} style={{
                  ...(c.align === 'right' ? numCell : textCell),
                  ...(i === 0 ? stickyCell(t.neutrals.card) : null),
                }}>{r.cells[i]}</div>
              ))
              const rowStyle: React.CSSProperties = {
                display: 'grid', gridTemplateColumns: template, gap: 6, alignItems: 'center',
                padding: '5px 8px', borderRadius: t.radius.sm, background: t.neutrals.card,
                textDecoration: 'none', color: 'inherit',
              }
              return r.href ? (
                <a key={r.key} href={r.href} target="_blank" rel="noopener noreferrer" style={rowStyle}>{inner}</a>
              ) : (
                <div key={r.key} style={rowStyle}>{inner}</div>
              )
            })}
          </div>
        </div>
      )}
      {sortedRows.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 6, paddingTop: 6, borderTop: `1px solid ${t.neutrals.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={perPageInput}
              onChange={e => setPerPageInput(e.target.value.replace(/\D/g, ''))}
              onBlur={commitPerPage}
              onKeyDown={e => { if (e.key === 'Enter') commitPerPage() }}
              style={{
                width: 30, textAlign: 'center', border: 'none',
                background: t.neutrals.card, borderRadius: t.radius.sm,
                fontSize: 'calc(10.5px * var(--fz, 1))', fontFamily: t.font.mono, color: t.neutrals.muted,
                padding: '2px 0', outline: 'none',
              }}
            />
            <span style={{ fontSize: 'calc(9.5px * var(--fz, 1))', color: t.neutrals.subtle }}>개씩</span>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{
                  background: 'transparent', border: 'none', padding: 3, borderRadius: 4,
                  cursor: safePage === 1 ? 'default' : 'pointer',
                  color: safePage === 1 ? t.neutrals.line : t.neutrals.muted,
                  opacity: safePage === 1 ? 0.4 : 1,
                }}>
                <LIcon name="chevronLeft" size={12} stroke={2} />
              </button>
              <span style={{ ...mono(9.5), color: t.neutrals.muted }}>
                {(safePage - 1) * perPage + 1}-{Math.min(safePage * perPage, sortedRows.length)} / {sortedRows.length}
              </span>
              <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{
                  background: 'transparent', border: 'none', padding: 3, borderRadius: 4,
                  cursor: safePage >= totalPages ? 'default' : 'pointer',
                  color: safePage >= totalPages ? t.neutrals.line : t.neutrals.muted,
                  opacity: safePage >= totalPages ? 0.4 : 1,
                }}>
                <LIcon name="chevronRight" size={12} stroke={2} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
