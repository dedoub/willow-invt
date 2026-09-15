'use client'

import type { ReactNode } from 'react'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

/**
 * 모달 껍데기 — 사업관리(윌로우)가 쓰던 모양을 그대로 꺼내 둔 것이다.
 *
 * 꺼낸 이유는 텐소프트웍스 쪽이 제각각이었기 때문이다. 같은 화면에서 행을 누르는데
 * 어떤 것은 모달이 뜨고 어떤 것은 표 안에서 펼쳐졌고, 모달끼리도 껍데기가 달랐다 —
 * 생 div 에 카드색을 칠한 것, 반경이 다른 것, 흐림 없는 다른 농도의 막을 쓰는 것.
 * 한 곳에 두면 다음에 또 갈라질 일이 없다(CEO 2026-09-15).
 *
 * 두 가지 쓰임이 있고 껍데기는 같다.
 *   · 상세 — 제목 없이 닫기만. 무엇의 상세인지는 아래 항목이 이미 말한다.
 *   · 편집 — 제목줄(LSectionHead)에 닫기를 붙인다.
 * 가르는 것은 `title` 의 유무다.
 *
 * 카드는 `LCard` 여야 한다. 생 div 에 배경색을 칠하면 theme-outline 이 카드에 두르는
 * 테두리를 못 받아 화면에서 혼자 다른 물건이 된다.
 */

export function LDialog({
  title, width = 460, z = 1000, onClose, children, foot,
}: {
  /** 있으면 제목줄, 없으면 닫기 단추만. */
  title?: string
  width?: number
  /** 편집 모달이 상세 모달 위에 뜰 때만 올린다(상세 1000 → 편집 1100). */
  z?: number
  onClose: () => void
  children: ReactNode
  /** 아래 단추 줄. `LDialogFoot` 을 넣는다. */
  foot?: ReactNode
}) {
  const mobile = useIsMobile()
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: z,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      {/* 막을 누르면 닫힌다. 카드가 그 위에 있어 카드 안 누름은 여기까지 오지 않는다. */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)',
      }} />

      <LCard pad={0} style={{
        position: 'relative', width: mobile ? '100%' : width, maxWidth: '100%', maxHeight: '85vh',
        // 머리와 발은 붙박이고 가운데만 구른다 — 긴 내용에서 닫기와 저장이 화면 밖으로 밀리지 않는다.
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {title ? (
          <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY, flexShrink: 0 }}>
            <LSectionHead title={title} action={<CloseButton onClose={onClose} />} mb={0} />
          </div>
        ) : (
          <div style={{
            padding: `${t.density.gapSm}px ${t.density.gapSm}px 0`,
            display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
          }}>
            <CloseButton onClose={onClose} />
          </div>
        )}

        <div style={{
          padding: `0 ${t.density.cardPad}px`, overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
        }}>
          {children}
        </div>

        {foot && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexShrink: 0,
            margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingBottom: t.density.cardPad,
          }}>
            {foot}
          </div>
        )}
      </LCard>
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} title="닫기" aria-label="닫기" style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
      display: 'flex', alignItems: 'center',
    }}>
      <LIcon name="x" size={14} stroke={2} />
    </button>
  )
}

/**
 * 모달 발 — 왼쪽은 되돌리는 쪽(삭제), 오른쪽은 나아가는 쪽(취소·저장·수정).
 * 왼쪽이 비면 오른쪽만 끝으로 붙는다.
 */
export function LDialogFoot({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <>
      {left}
      <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginLeft: 'auto' }}>
        {right}
      </div>
    </>
  )
}
