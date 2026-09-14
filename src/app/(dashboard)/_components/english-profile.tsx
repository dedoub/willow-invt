'use client'

import { useSyncExternalStore } from 'react'
import { t } from './linear-tokens'
import { LSegmented } from './linear-segmented'
import { PRACTICE_TARGETS, DEFAULT_TARGET_ID, targetsByLearner } from '@/lib/english-targets'

// 영작 연습(/english) 대상 선택 — 상단바(LinearHeader actions)의 토글과 페이지가
// localStorage + 커스텀 이벤트로 동기화된다 (cols-toggle과 같은 패턴).
// 목록은 lib/english-targets 한 곳에서 온다. 대상을 늘려도 여기는 고칠 것이 없다.

export type EnglishProfile = string

const KEY = 'english-profile'
const EVT = 'english-profile-change'

function read(): EnglishProfile {
  if (typeof window === 'undefined') return DEFAULT_TARGET_ID
  const v = localStorage.getItem(KEY)
  // 목록에 없는 값이 남아 있던 브라우저도 기본 대상으로 돌아온다.
  return PRACTICE_TARGETS.some(x => x.id === v) ? (v as string) : DEFAULT_TARGET_ID
}

export function useEnglishProfile(): EnglishProfile {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVT, notify)
      return () => window.removeEventListener(EVT, notify)
    },
    read,
    () => DEFAULT_TARGET_ID
  )
}

function select(id: string) {
  localStorage.setItem(KEY, id)
  window.dispatchEvent(new CustomEvent(EVT, { detail: id }))
}

/**
 * 사람으로 한 번, 문체로 한 번 나눠 보여 준다.
 * 대상을 한 줄로 늘어놓으면 "아빠·구어 / 아빠·문어 / 류하·구어 / 류하·문어"처럼
 * 같은 말이 반복되고 상단바가 금방 넘친다. 사람 이름은 묶음 앞에 한 번만 적는다.
 */
export function EnglishProfileToggle() {
  const profile = useEnglishProfile()
  const groups = targetsByLearner()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapMd, minWidth: 0 }}>
      {groups.map(group => (
        <div key={group.learner} style={{ display: 'flex', alignItems: 'center', gap: t.density.gapXs, minWidth: 0 }}>
          <span style={{
            fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {group.learner}
          </span>
          <LSegmented
            value={group.targets.some(x => x.id === profile) ? profile : ''}
            onChange={select}
            options={group.targets.map(x => ({ value: x.id, label: x.label, title: x.meta }))}
          />
        </div>
      ))}
    </div>
  )
}
