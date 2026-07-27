'use client'

import { t } from './linear-tokens'

/**
 * 표의 "N개씩 보기" 선택기.
 *
 * 자유 입력칸이던 것을 드롭다운으로 바꿨다. 숫자를 직접 칠 일은 거의 없는데
 * 칸을 누를 때마다 커서가 잡히고 모바일에서는 키보드까지 올라와서, 값을 고르는
 * 동작치고 대가가 컸다. 프로젝트 페이지네이션 템플릿도 드롭다운을 쓴다.
 */
const OPTIONS = [5, 10, 20, 30, 50, 100]

const STORAGE_PREFIX = 'page-size:'
const DEFAULT_PAGE_SIZE = 10

/** 표별로 마지막에 고른 행수. 서버 렌더 중에는 기본값 */
export function getStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE): number {
  if (typeof window === 'undefined') return fallback
  const n = Number(localStorage.getItem(STORAGE_PREFIX + key))
  return n >= 5 && n <= 100 ? n : fallback
}

export function savePageSize(key: string, n: number): void {
  localStorage.setItem(STORAGE_PREFIX + key, String(n))
}

export function LPageSize({
  value, onChange, bg, fontSize = 11,
}: {
  value: number
  onChange: (n: number) => void
  /** 놓이는 면에 맞춘 배경. 기본은 카드 안쪽 톤 */
  bg?: string
  fontSize?: number
}) {
  // 저장된 값이 목록에 없으면(예전 자유 입력분) 그 값도 보여준다
  const options = OPTIONS.includes(value) ? OPTIONS : [...OPTIONS, value].sort((a, b) => a - b)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label="한 페이지에 보여줄 행 수"
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          border: 'none', outline: 'none', cursor: 'pointer',
          background: bg ?? t.neutrals.card, borderRadius: t.radius.sm,
          fontSize: `calc(${fontSize}px * var(--fz, 1))`, fontFamily: t.font.mono,
          color: t.neutrals.muted, padding: '2px 6px', textAlign: 'center',
        }}
      >
        {options.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span style={{
        fontSize: `calc(${fontSize - 1}px * var(--fz, 1))`,
        color: t.neutrals.subtle, fontFamily: t.font.sans,
      }}>개씩</span>
    </div>
  )
}
