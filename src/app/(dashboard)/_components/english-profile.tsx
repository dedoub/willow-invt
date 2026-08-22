'use client'

import { useSyncExternalStore } from 'react'
import { LSegmented } from './linear-segmented'

// 영작 연습(/english) 프로필 선택 — 상단바(LinearHeader actions)의 토글과 페이지가
// localStorage + 커스텀 이벤트로 동기화된다 (cols-toggle과 같은 패턴).

export type EnglishProfile = 'ceo' | 'ryuha' | 'ryuha_written'

const KEY = 'english-profile'
const EVT = 'english-profile-change'

function read(): EnglishProfile {
  if (typeof window === 'undefined') return 'ceo'
  const v = localStorage.getItem(KEY)
  return v === 'ryuha' || v === 'ryuha_written' ? v : 'ceo'
}

export function useEnglishProfile(): EnglishProfile {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVT, notify)
      return () => window.removeEventListener(EVT, notify)
    },
    read,
    () => 'ceo'
  )
}

export function EnglishProfileToggle() {
  const profile = useEnglishProfile()
  return (
    <LSegmented<EnglishProfile>
      value={profile}
      onChange={(v) => {
        localStorage.setItem(KEY, v)
        window.dispatchEvent(new CustomEvent(EVT, { detail: v }))
      }}
      options={[
        { value: 'ceo', label: '아빠' },
        { value: 'ryuha', label: '류하 구어' },
        { value: 'ryuha_written', label: '류하 문어' },
      ]}
    />
  )
}
