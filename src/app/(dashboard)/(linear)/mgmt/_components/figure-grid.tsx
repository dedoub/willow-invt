'use client'

import type { ReactNode } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'

/**
 * 카드·모달 공통 지표 격자 — 라벨 위, 값 아래, 줄 사이만 얇은 선.
 * 상자도 회색 판도 쓰지 않는다. 카드와 상세 모달이 같은 문법을 쓰게 한 곳에 모아둔다
 * (2026-09-10 사업관리 카드 문법).
 *
 * 격자는 바깥 여백을 스스로 두지 않는다 — 카드 패딩(cardPad)을 준 컨테이너 안에 넣으면
 * 칸이 제 패딩(panelPadX)을 더해 카드 지표와 같은 자리에 선다.
 */
export type FigureItem = {
  label: string
  value: string
  /** 값 아래 보조 한 줄 (예: "2026-09-10 기준") */
  sub?: string
  tone?: 'pos' | 'neg'
  /** 숫자·날짜는 mono + tabular */
  mono?: boolean
  /** 산문(적요·설명) — 굵기를 빼고 줄바꿈을 허용한다 */
  prose?: boolean
  /** 값이 길면 줄바꿈한다 — 잘라내면 곤란한 이름(거래처 등) */
  wrap?: boolean
  /** 2 이상이면 그 줄 전체를 쓴다 */
  span?: number
  title?: string
  /** 라벨 옆 작은 스위치 — 그 값이 무엇을 뜻하는지 바꾸는 컨트롤만 여기에 둔다 */
  labelExtra?: ReactNode
  /** 칸을 누르면 상세를 여는 지표(은행 잔고 등) */
  onClick?: () => void
  /** 값 옆 작은 꼬리표 — 증감처럼 그 숫자에 붙는 값 */
  valueExtra?: ReactNode
}

export function FigureGrid({ items, cols }: { items: FigureItem[]; cols: number }) {
  const laid = layout(items, cols)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {laid.map((f, i) => (
        <div key={`${i}-${f.label}`} title={f.title} onClick={f.onClick} style={{
          cursor: f.onClick ? 'pointer' : undefined,
          padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
          minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
          // 구분선은 열 수를 보고 첫 줄만 건너뛴다 — 모바일 2열에서 3열 기준으로 그으면 지그재그가 된다
          borderTop: i >= f.firstRowCount ? `1px solid ${t.neutrals.line}` : undefined,
          gridColumn: f.span > 1 ? `span ${f.span}` : undefined,
        }}>
          <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
            {f.label}
            {f.labelExtra}
          </span>
          <span style={{
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
            fontWeight: f.prose ? t.weight.regular : t.weight.semibold,
            fontFamily: f.mono ? t.font.mono : t.font.sans,
            fontVariantNumeric: f.mono ? 'tabular-nums' : undefined,
            color: f.tone === 'pos' ? t.accent.pos : f.tone === 'neg' ? t.accent.neg : t.neutrals.text,
            lineHeight: f.prose ? 1.6 : 1.3,
            whiteSpace: f.prose ? 'pre-wrap' : f.wrap ? 'normal' : 'nowrap',
            wordBreak: f.wrap ? 'break-word' : undefined,
            overflow: f.prose || f.wrap ? undefined : 'hidden',
            textOverflow: f.prose || f.wrap ? undefined : 'ellipsis',
          }}>
            {f.value}
            {f.valueExtra}
          </span>
          {f.sub && (
            <span style={{ fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
              {f.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * 칸을 줄에 앉히면서 빈칸을 없앤다.
 * 줄 끝에 한 칸이 비면 그 위 구분선이 반만 그어지므로, 앞 칸을 남은 폭만큼 늘려 줄을 채운다.
 * 마지막 줄도 같은 규칙으로 채운다.
 */
function layout(items: FigureItem[], cols: number): Array<FigureItem & { span: number; firstRowCount: number }> {
  const laid = items.map(f => ({ ...f, span: Math.min(Math.max(f.span ?? 1, 1), cols), firstRowCount: 0 }))
  let col = 0
  let firstRowCount = laid.length
  for (let i = 0; i < laid.length; i++) {
    if (col + laid[i].span > cols) {
      if (i > 0) laid[i - 1].span += cols - col
      col = 0
    }
    col += laid[i].span
    if (col >= cols) {
      if (firstRowCount === laid.length) firstRowCount = i + 1
      col = 0
    }
  }
  if (col > 0 && laid.length > 0) laid[laid.length - 1].span += cols - col
  for (const f of laid) f.firstRowCount = firstRowCount
  return laid
}
