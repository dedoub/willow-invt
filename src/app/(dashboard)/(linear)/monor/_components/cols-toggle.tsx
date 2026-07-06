'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

// MonoR 페이지 바디 레이아웃(한 줄에 2개 vs 1개) 토글.
// 상단바(LinearHeader)의 버튼과 monor 페이지 그리드가 localStorage + 커스텀 이벤트로 동기화된다.

const KEY = 'monor-cols'
const EVT = 'monor-cols-change'

export function getMonorCols(): 1 | 2 {
  if (typeof window === 'undefined') return 2
  return localStorage.getItem(KEY) === '1' ? 1 : 2
}

function writeMonorCols(v: 1 | 2) {
  localStorage.setItem(KEY, String(v))
  window.dispatchEvent(new CustomEvent(EVT, { detail: v }))
}

// 값 구독 훅 (상단바 버튼 · monor 페이지 공용)
export function useMonorCols(): 1 | 2 {
  const [cols, setCols] = useState<1 | 2>(2)
  useEffect(() => {
    setCols(getMonorCols())
    const h = (e: Event) => setCols((e as CustomEvent).detail as 1 | 2)
    window.addEventListener(EVT, h)
    return () => window.removeEventListener(EVT, h)
  }, [])
  return cols
}

// 상단바에 들어가는 토글 버튼
export function MonorColsToggle() {
  const cols = useMonorCols()
  const toggle = () => writeMonorCols(cols === 2 ? 1 : 2)
  return (
    <button
      onClick={toggle}
      title={cols === 2 ? '한 줄에 1개로 보기' : '한 줄에 2개로 보기'}
      aria-label="바디 레이아웃 열 전환"
      style={{
        height: 28, padding: '0 10px', borderRadius: 6,
        background: t.neutrals.inner, color: t.neutrals.text,
        border: 'none', cursor: 'pointer',
        fontSize: 'calc(11px * var(--fz, 1))', fontWeight: t.weight.regular,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontFamily: t.font.sans,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        {cols === 2 ? (
          <>
            <rect x="1" y="2" width="5" height="10" rx="1.2" fill="currentColor" />
            <rect x="8" y="2" width="5" height="10" rx="1.2" fill="currentColor" />
          </>
        ) : (
          <rect x="2.5" y="2" width="9" height="10" rx="1.2" fill="currentColor" />
        )}
      </svg>
      <span>{cols === 2 ? '2열' : '1열'}</span>
    </button>
  )
}
