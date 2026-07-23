'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

// 페이지 바디 레이아웃(한 줄에 2개 vs 1개) 토글.
// 상단바(LinearHeader)의 버튼과 해당 페이지 그리드가 localStorage + 커스텀 이벤트로 동기화된다.

// ─── 토글 버튼 프레젠테이션 (경로별/정적 공용) ──────────────────────────────────
function ColsButton({ cols, onToggle }: { cols: 1 | 2; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
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

// ─── 정적 storage key 인스턴스 (특정 페이지 전용으로 쓰고 싶을 때) ────────────────
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

  function Toggle() {
    const cols = useCols()
    return <ColsButton cols={cols} onToggle={() => write(cols === 2 ? 1 : 2)} />
  }

  return { read, useCols, Toggle }
}

// ─── MonoR / 밸류체인 (특정 페이지 전용 정적 key) ───────────────────────────────
const monor = makeColsToggle('monor-cols')
export const getMonorCols = monor.read
export const useMonorCols = monor.useCols
export const MonorColsToggle = monor.Toggle

const valuechain = makeColsToggle('valuechain-cols')
export const getValuechainCols = valuechain.read
export const useValuechainCols = valuechain.useCols
export const ValuechainColsToggle = valuechain.Toggle

// ─── 헤더 전역 토글: 현재 경로별로 저장(페이지별 기억) ──────────────────────────
// 이전엔 'dash-cols' 단일 키라 한 페이지에서 바꾸면 전 페이지가 함께 바뀌었다.
// 이제 'dash-cols:<pathname>' 로 경로별 저장 → 각 페이지가 자기 1열/2열 선택을 독립적으로 기억.
function dashKey(pathname: string) { return `dash-cols:${pathname}` }
function dashEvt(pathname: string) { return `dash-cols:${pathname}-change` }

function readDashCols(pathname: string): 1 | 2 {
  if (typeof window === 'undefined') return 2
  return localStorage.getItem(dashKey(pathname)) === '1' ? 1 : 2
}

// 페이지 그리드/헤더 버튼 공용 — 현재 경로의 값을 구독
export function useDashCols(): 1 | 2 {
  const pathname = usePathname()
  const [cols, setCols] = useState<1 | 2>(2)
  useEffect(() => {
    setCols(readDashCols(pathname))
    const evt = dashEvt(pathname)
    const h = (e: Event) => setCols((e as CustomEvent).detail as 1 | 2)
    window.addEventListener(evt, h)
    return () => window.removeEventListener(evt, h)
  }, [pathname])
  return cols
}

// 상단바 토글 버튼 — 현재 경로 키에 저장
export function DashColsToggle() {
  const pathname = usePathname()
  const cols = useDashCols()
  const toggle = () => {
    const next: 1 | 2 = cols === 2 ? 1 : 2
    localStorage.setItem(dashKey(pathname), String(next))
    window.dispatchEvent(new CustomEvent(dashEvt(pathname), { detail: next }))
  }
  return <ColsButton cols={cols} onToggle={toggle} />
}
