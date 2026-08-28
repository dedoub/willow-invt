'use client'

// 한 줄 알림. 카드 안에서 "이건 실패했다 / 이건 주의해라 / 이건 참고다"를 말한다.
//
// 문의함이 자기 파일 안에 같은 것을 두고 톤 색을 직접 적어 뒀는데, 그 값이
// `tonePalettes` 의 danger·warn·info 와 글자 하나까지 같았다. 팔레트를 두 곳에
// 적어 두면 한쪽만 바뀐다. 여기로 올리고 토큰에서 색을 읽는다.
//
// 오류를 카드 왼쪽 굵은 선으로 표시하던 자리도 이걸로 바꿨다 — 표면 구분은
// 배경색이 기본이고, 선은 경계가 필요한 곳에만 쓴다(디자인 시스템 원칙 4).

import { t, tonePalettes, type ToneName } from './linear-tokens'
import { LIcon } from './linear-icons'

export type NoticeTone = Extract<ToneName, 'danger' | 'warn' | 'info' | 'neutral'>

export function LNotice({ tone, text, icon = 'info' }: {
  tone: NoticeTone
  text: string
  /** 기본은 info. 뜻이 더 좁은 아이콘이 있으면 바꾼다. */
  icon?: string
}) {
  const palette = tone === 'neutral'
    ? { bg: t.neutrals.inner, fg: t.neutrals.muted }
    : tonePalettes[tone]
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: t.density.gapSm,
      background: palette.bg, color: palette.fg,
      borderRadius: t.radius.md,
      padding: `${t.density.gapSm}px ${t.density.gapMd}px`,
      marginBottom: t.density.gapSm,
      fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, lineHeight: 1.5,
      wordBreak: 'break-word',
    }}>
      <LIcon name={icon} size={13} stroke={1.8} />
      <span style={{ minWidth: 0 }}>{text}</span>
    </div>
  )
}
