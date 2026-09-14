'use client'

import { useSyncExternalStore } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

/**
 * 전체화면 단추 — 스크립타의 것(components/layout/fullscreen-control.tsx)을 그대로 옮겼다.
 * 거기서 겪은 두 가지가 이 모양의 이유다.
 *
 * 전체화면인지 아닌지는 우리 것이 아니다. 브라우저가 쥐고 있고 Esc·F11·OS 창 단추로
 * 언제든 바뀐다. 그때 알려 주는 것은 `fullscreenchange` 하나뿐이라, state 로 흉내 내면
 * 창으로 돌아온 화면에 「나가기」가 남는다. 그래서 바깥 저장소를 그대로 읽는다.
 *
 * 서버에는 `document` 가 없어 서버 스냅샷을 따로 준다 — 첫 렌더가 서버와 달라지면
 * React 는 그 화면을 통째로 버린다.
 */

const subscribe = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

/** 서버에는 전체화면이라는 개념이 없다. 언제나 "못 하고, 아니다". */
const notOnTheServer = () => false

export function FullscreenToggle() {
  // 못 하는 브라우저에는 단추를 아예 그리지 않는다. iOS 사파리는 영상이 아닌 요소에
  // 전체화면을 주지 않아서, 아이폰에서는 눌러도 아무 일이 없는 단추만 남는다.
  // 아무 일도 없는 단추는 없는 단추보다 나쁘다 — 자기가 뭘 잘못했는지 찾게 된다.
  const available = useSyncExternalStore(subscribe, () => Boolean(document.fullscreenEnabled), notOnTheServer)
  const full = useSyncExternalStore(subscribe, () => Boolean(document.fullscreenElement), notOnTheServer)

  if (!available) return null

  const toggle = () => {
    try {
      // 지금 어느 쪽인지도 문서에게 묻는다. 우리가 센 값을 쓰면, 바깥에서 막 나왔는데
      // 이벤트가 아직 안 온 순간에 반대쪽을 부른다.
      const settled = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
      // 브라우저는 요청을 거절할 수 있다(사용자 제스처로 안 쳐 주거나 권한 정책이 막을 때).
      // 거절되면 아무 일도 일어나지 않고 `fullscreenchange` 도 오지 않으니 그림은 그대로다 —
      // 그게 사실과 맞는 그림이다.
      void Promise.resolve(settled).catch(() => {})
    } catch {
      // 그 자리에서 던지는 구현도 있다. 같은 이유로 조용히 둔다.
    }
  }

  const label = full ? '전체화면 나가기' : '전체화면'
  return (
    <button
      type="button"
      onClick={toggle}
      title={full ? '전체화면 나가기 (Esc)' : '전체화면으로 보기'}
      aria-label={label}
      aria-pressed={full}
      style={{
        height: t.density.controlH, padding: `0 ${t.density.controlPadXSm}px`, borderRadius: t.radius.md,
        background: t.neutrals.inner, color: t.neutrals.text,
        border: 'none', cursor: 'pointer',
        fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.regular,
        display: 'inline-flex', alignItems: 'center', gap: t.density.gapSm,
        fontFamily: t.font.sans, whiteSpace: 'nowrap',
      }}
    >
      <LIcon name={full ? 'minimize' : 'maximize'} size={14} stroke={1.8} color="currentColor" />
      <span>{full ? '창으로' : '전체화면'}</span>
    </button>
  )
}
