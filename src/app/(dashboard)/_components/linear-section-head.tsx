'use client'

import { t, useIsMobile } from './linear-tokens'
import { LIcon } from './linear-icons'
import { ReactNode } from 'react'

interface LSectionHeadProps {
  eyebrow?: ReactNode
  title: string
  /** 제목 옆 보조 정보 — 집계 기간·단서처럼 섹션 전체에 걸리는 값. 좁으면 제목 아래로 줄바꿈된다. */
  meta?: ReactNode
  /**
   * 정보 칩 — 집계 방식·데이터 출처 같은 부가 설명. 액션 줄 왼쪽에 칩으로 붙는다.
   * 모바일에서는 숨긴다 — 꼭 보여야 하는 정보면 note가 아니라 meta로 넣을 것.
   */
  note?: ReactNode
  action?: ReactNode
  /** 하단 여백 override. 미지정 시 기본값(t.density.gapMd). */
  mb?: number
}

export function LSectionHead({ eyebrow, title, meta, note, action, mb }: LSectionHeadProps) {
  const mobile = useIsMobile()
  const showNote = !!note && !mobile
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.density.kpiGap,
      // 액션이 넓으면 제목을 짓누르는 대신 아랫줄로 내려간다 — 모바일 깨짐 방지의 핵심.
      flexWrap: 'wrap',
      marginBottom: mb ?? t.density.gapMd,
    }}>
      {/* 좁은 화면에서 보조 정보가 길어지면 제목 아래로 흘러야 우측 액션과 안 겹친다 */}
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        {eyebrow && (
          <div style={{
            fontSize: 'calc(10.5px * var(--fz, 1))', fontWeight: t.weight.semibold, letterSpacing: 1.2,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: t.density.gapXs, fontFamily: t.font.mono,
          }}>{eyebrow}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: t.density.gapSm, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
            fontFamily: t.font.sans, color: t.neutrals.text,
            letterSpacing: -0.2, lineHeight: 1.2,
          }}>{title}</div>
          {meta && (
            <div style={{
              fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
              lineHeight: 1.4, wordBreak: 'keep-all' as const,
            }}>{meta}</div>
          )}
        </div>
      </div>
      {(action || showNote) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap',
          justifyContent: 'flex-end', marginLeft: 'auto', maxWidth: '100%', minWidth: 0,
        }}>
          {showNote && (
            <span style={{
              fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 500, whiteSpace: 'nowrap' as const,
              padding: '2px 6px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, color: t.neutrals.muted,
              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{note}</span>
          )}
          {action}
        </div>
      )}
    </div>
  )
}

// ─── 섹션 헤더 우측 컨트롤 ─────────────────────────────────────────────────────
//
// 헤더 우측에 서는 모든 버튼의 단일 프리미티브 — 새로고침·설정·외부 링크·짧은 라벨 액션.
// 28px(controlHSm) 정사각 기본, 라벨이 있으면 옆으로 자란다. href를 주면 <a>(새 탭)로 렌더.
// 블록마다 RefreshButton/iconBtn/linkBtn을 복제하던 것을 이걸로 대체한다 (2026-08-21 정비).

interface LHeadBtnProps {
  /** LIcon 이름. label만 있는 버튼(예: 'GSC')은 생략 가능. */
  icon?: string
  /** 짧은 텍스트 라벨(mono 9.5px). 아이콘 없이 쓸 수도 있다. */
  label?: ReactNode
  /** 툴팁 겸 접근성 라벨 — 아이콘만 있는 버튼에는 반드시 넣을 것 */
  title?: string
  onClick?: () => void
  /** 있으면 외부 링크(<a> 새 탭)로 렌더 */
  href?: string
  /** 진행 중 — 비활성 + 반투명 */
  busy?: boolean
}

export function LHeadBtn({ icon, label, title, onClick, href, busy }: LHeadBtnProps) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    height: t.density.controlHSm, minWidth: t.density.controlHSm,
    padding: label ? '0 8px' : 0, boxSizing: 'border-box',
    borderRadius: t.radius.sm, background: t.neutrals.inner, border: 'none',
    color: t.neutrals.muted, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
    fontSize: 'calc(9.5px * var(--fz, 1))', fontFamily: t.font.mono, letterSpacing: 0.3,
    textDecoration: 'none', whiteSpace: 'nowrap' as const,
  }
  const inner = (
    <>
      {icon && <LIcon name={icon} size={13} stroke={1.8} />}
      {label}
    </>
  )
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" title={title} style={style}>{inner}</a>
  }
  return <button onClick={onClick} disabled={busy} title={title} style={style}>{inner}</button>
}
