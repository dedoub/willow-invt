'use client'

import { useState } from 'react'

/**
 * 탭 선택을 기억한다.
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
