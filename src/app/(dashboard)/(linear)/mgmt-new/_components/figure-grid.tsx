'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'

/**
 * 카드·모달 공통 지표 격자 — 라벨 위, 값 아래, 줄 사이만 얇은 선.
 * 상자도 회색 판도 쓰지 않는다. 카드와 상세 모달이 같은 문법을 쓰게 한 곳에 모아둔다
 * (2026-09-10 사업관리 NEW 카드 문법).
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
  /** 2 이상이면 그 줄 전체를 쓴다 */
  span?: number
  title?: string
}

export function FigureGrid({ items, cols }: { items: FigureItem[]; cols: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {items.map((f, i) => (
        <div key={f.label} title={f.title} style={{
          padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
          minWidth: 0, display: 'flex', flexDirection: 'column', gap: t.density.tableRowGap,
          // 구분선은 열 수를 보고 첫 줄만 건너뛴다 — 모바일 2열에서 3열 기준으로 그으면 지그재그가 된다
          borderTop: i >= cols ? `1px solid ${t.neutrals.line}` : undefined,
          gridColumn: f.span && f.span > 1 ? `span ${f.span}` : undefined,
        }}>
          <span style={{ fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle, whiteSpace: 'nowrap' }}>
            {f.label}
          </span>
          <span style={{
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
            fontWeight: f.prose ? t.weight.regular : t.weight.semibold,
            fontFamily: f.mono ? t.font.mono : t.font.sans,
            fontVariantNumeric: f.mono ? 'tabular-nums' : undefined,
            color: f.tone === 'pos' ? t.accent.pos : f.tone === 'neg' ? t.accent.neg : t.neutrals.text,
            lineHeight: f.prose ? 1.6 : 1.3,
            whiteSpace: f.prose ? 'pre-wrap' : 'nowrap',
            overflow: f.prose ? undefined : 'hidden', textOverflow: f.prose ? undefined : 'ellipsis',
          }}>
            {f.value}
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

/** 마지막 줄이 덜 찼으면 남은 칸까지 늘린다 — 안 그러면 그 위 구분선이 반만 그어진다 */
export function fillLastRow(items: FigureItem[], cols: number) {
  const rest = items.length % cols
  if (rest !== 0) items[items.length - 1].span = cols - rest + 1
  return items
}
