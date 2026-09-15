'use client'

import { useState } from 'react'

/**
 * 탭·칩 선택을 기억한다.
 *
 * 같은 카드를 늘 같은 모양으로 열고 싶은데, 새로고침 한 번에 기본값으로 돌아가면
 * 매번 같은 탭을 다시 누르게 된다. 행수(`page-size:`)·정렬(`table-sort:`)이 이미
 * 그렇게 저장되고 있어서, 탭도 같은 자리에 같은 방식으로 둔다.
 *
 *   const SMOOTH = ['ma3', 'raw'] as const
 *   const [smooth, setSmooth] = useStoredTab('re-zone-smooth', SMOOTH, 'ma3')
 *
 * 저장된 값이 지금 있는 선택지에 없으면(탭을 빼거나 이름을 바꿨으면) 기본값으로
 * 돌아간다 — 사라진 탭을 복원하면 아무것도 고르지 않은 화면이 된다.
 */
const PREFIX = 'tab:'

export function useStoredTab<V extends string>(key: string, values: readonly V[], fallback: V) {
  const read = (): V => {
    if (typeof window === 'undefined') return fallback
    try {
      const stored = localStorage.getItem(PREFIX + key)
      return values.includes(stored as V) ? (stored as V) : fallback
    } catch {
      return fallback
    }
  }

  const [value, setValue] = useState<V>(read)

  const choose = (next: V) => {
    setValue(next)
    // 사파리 비공개 창처럼 저장이 막힌 곳에서도 탭은 눌려야 한다.
    try { localStorage.setItem(PREFIX + key, next) } catch { /* 이번 화면에서만 기억한다 */ }
  }

  return [value, choose] as const
}

/**
 * 여러 개를 함께 고르는 칩(자치구처럼)의 선택을 기억한다.
 *
 * 저장된 목록에서 지금 없는 값은 버리고, 남는 게 없으면 기본값으로 돌아간다 —
 * 하나도 고르지 않은 화면은 빈 표가 되어 무엇을 눌러야 할지 알 수 없다.
 */
export function useStoredTabs<V extends string>(key: string, values: readonly V[], fallback: readonly V[]) {
  const read = (): V[] => {
    if (typeof window === 'undefined') return [...fallback]
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (!raw) return [...fallback]
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return [...fallback]
      const kept = parsed.filter((v): v is V => values.includes(v as V))
      return kept.length > 0 ? kept : [...fallback]
    } catch {
      return [...fallback]
    }
  }

  const [value, setValue] = useState<V[]>(read)

  const choose = (next: V[]) => {
    setValue(next)
    try { localStorage.setItem(PREFIX + key, JSON.stringify(next)) } catch { /* 이번 화면에서만 기억한다 */ }
  }

  return [value, choose] as const
}
