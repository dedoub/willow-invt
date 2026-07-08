'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

// 페이지 바디 레이아웃(한 줄에 2개 vs 1개) 토글.
// 상단바(LinearHeader)의 버튼과 해당 페이지 그리드가 localStorage + 커스텀 이벤트로 동기화된다.
// 페이지별 storage key로 일반화 — MonoR, 밸류체인 등에서 재사용.

function makeColsToggle(key: string) {
  const evt = `${key}-change`

  function read(): 1 | 2 {
    if (typeof window === 'undefined') return 2
    return localStorage.getItem(key) === '1' ? 1 : 2
  }

  function write(v: 1 | 2) {
    localStorage.setItem(key, String(v))
    window.dispatchEvent(new CustomEvent(evt, { detail: v }))
  }

  // 값 구독 훅 (상단바 버튼 · 페이지 공용)
  function useCols(): 1 | 2 {
    const [cols, setCols] = useState<1 | 2>(2)
    useEffect(() => {
      setCols(read())
      const h = (e: Event) => setCols((e as CustomEvent).detail as 1 | 2)
      window.addEventListener(evt, h)
      return () => window.removeEventListener(evt, h)
    }, [])
    return cols
  }

  // 상단바에 들어가는 토글 버튼
  function Toggle() {
    const cols = useCols()
    const toggle = () => write(cols === 2 ? 1 : 2)
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

  return { read, useCols, Toggle }
}

// ─── MonoR ───────────────────────────────────────────────────────────────────
const monor = makeColsToggle('monor-cols')
export const getMonorCols = monor.read
export const useMonorCols = monor.useCols
export const MonorColsToggle = monor.Toggle

// ─── 밸류체인(LLM Wiki) ─────────────────────────────────────────────────────────
const valuechain = makeColsToggle('valuechain-cols')
export const getValuechainCols = valuechain.read
export const useValuechainCols = valuechain.useCols
export const ValuechainColsToggle = valuechain.Toggle
