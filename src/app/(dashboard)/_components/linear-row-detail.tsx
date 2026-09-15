'use client'

import type { ReactNode } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LDialog, LDialogFoot } from '@/app/(dashboard)/_components/linear-dialog'
import { FigureGrid, type FigureItem } from '@/app/(dashboard)/_components/linear-figure-grid'

/**
 * 표에서 행을 눌렀을 때 열리는 상세 — 윌로우 사업관리의 상세 모달과 같은 문법이다.
 *
 * 펼치는 방식은 그 아래 행이 통째로 밀려 읽던 자리를 잃는다 — 윌로우가 같은 이유로
 * 모달로 옮겼고(2026-09-10), 텐소프트웍스·아크로스도 그 뒤를 따랐다(CEO 2026-09-15).
 *
 * 제목은 두지 않는다. 무엇의 상세인지는 첫 칸(거래처·은행·프로젝트명)이 이미 말하고,
 * 제목을 달면 같은 말을 두 번 하게 된다.
 */
export function RowDetailDialog({
  items, cols = 2, extra, onEdit, foot, onClose, width = 460,
}: {
  items: FigureItem[]
  cols?: number
  /** 격자로 담기 어려운 것 — 품목 목록, 긴 메모 같은 것. */
  extra?: ReactNode
  /** 수정만 있으면 이것으로 족하다. 없으면 발을 두지 않는다 — 고칠 수 없는 표가 그렇다. */
  onEdit?: () => void
  /** 수정 말고 더 할 일이 있을 때(발행·입금 찍기 등) 발을 통째로 넘긴다. `onEdit` 보다 우선한다. */
  foot?: ReactNode
  onClose: () => void
  width?: number
}) {
  return (
    <LDialog
      width={width}
      onClose={onClose}
      foot={foot ?? (onEdit ? (
        <LDialogFoot right={<LBtn variant="secondary" size="sm" onClick={onEdit}>수정</LBtn>} />
      ) : undefined)}
    >
      <FigureGrid items={items} cols={cols} />
      {extra}
    </LDialog>
  )
}

/** 상세 안의 작은 목록 — 품목처럼 줄이 여럿인 것. 판을 깔지 않고 줄 사이만 얇은 선으로 나눈다. */
export function DetailList({ title, rows }: { title: string; rows: { left: string; right: string }[] }) {
  if (rows.length === 0) return null
  return (
    <div style={{ paddingTop: t.density.panelPadY, borderTop: `1px solid ${t.neutrals.line}` }}>
      <div style={{
        fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle,
        marginBottom: t.density.gapSm,
      }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: t.density.gapSm,
          padding: `${t.density.tableRowGap}px 0`,
          borderTop: i > 0 ? `1px solid ${t.neutrals.line}` : undefined,
          fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`,
        }}>
          <span style={{ minWidth: 0, color: t.neutrals.text }}>{r.left}</span>
          <span style={{
            fontFamily: t.font.mono, color: t.neutrals.muted, whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {r.right}
          </span>
        </div>
      ))}
    </div>
  )
}
