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
  /**
   * 기본 컨트롤 — 새로고침·설정·외부링크 같은 작은 LHeadBtn 묶음.
   * 항상 제목과 같은 줄 우측에 고정된다. 부피 큰 컨트롤은 tools로.
   */
  action?: ReactNode
  /**
   * 보조 컨트롤 — 세그먼트·셀렉트·검색창·필터칩처럼 폭을 먹는 것들.
   * 데스크톱은 액션 왼쪽에 서고(넘치면 내부 줄바꿈), 모바일은 통째로 아랫줄로 내려간다.
   */
  tools?: ReactNode
  /**
   * tools를 모바일에서도 제목 줄에 그대로 둔다 — 기간 토글처럼 폭이 좁고 위치가 고정돼야 하는 것.
   * 이때 tools는 줄어들지 않고 제목이 대신 줄임표로 밀린다.
   */
  toolsInline?: boolean
  /** 하단 여백 override. 미지정 시 기본값(t.density.gapMd). */
  mb?: number
}

export function LSectionHead({ eyebrow, title, meta, note, action, tools, toolsInline, mb }: LSectionHeadProps) {
  const mobile = useIsMobile()
  const showNote = !!note && !mobile
  const inlineTools = !!tools && (!mobile || !!toolsInline)
  const metaStyle: React.CSSProperties = {
    fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle,
    lineHeight: 1.4, wordBreak: 'keep-all' as const,
  }
  return (
    <div style={{ marginBottom: mb ?? t.density.gapMd }}>
      {/* 1행: 제목 + 기본 컨트롤(action) — 어떤 화면에서도 이 줄은 깨지지 않는다.
          제목은 넘치면 줄임표, action은 flexShrink 0.
          tools는 데스크톱에서 이 줄에 합류하고, toolsInline이면 모바일에서도 남는다. */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.density.kpiGap,
        flexWrap: 'nowrap',
      }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          {eyebrow && (
            <div style={{
              fontSize: 'calc(10.5px * var(--fz, 1))', fontWeight: t.weight.semibold, letterSpacing: 1.2,
              textTransform: 'uppercase' as const, color: t.neutrals.subtle,
              marginBottom: t.density.gapXs, fontFamily: t.font.mono,
            }}>{eyebrow}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: t.density.gapSm, flexWrap: 'wrap' }}>
            {/* 제목은 한 줄 고정 — 넘치면 줄임표(…). 전체 텍스트는 툴팁으로 */}
            <div title={title} style={{
              fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
              fontFamily: t.font.sans, color: t.neutrals.text,
              letterSpacing: -0.2, lineHeight: 1.2,
              minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap' as const,
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{title}</div>
            {meta && !mobile && <div style={metaStyle}>{meta}</div>}
          </div>
        </div>
        {(action || showNote || inlineTools) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: t.density.gapSm,
            flexWrap: toolsInline ? 'nowrap' : 'wrap',
            justifyContent: 'flex-end', marginLeft: 'auto', maxWidth: '100%', minWidth: 0,
            ...(toolsInline ? { flexShrink: 0 } : null),
          }}>
            {showNote && (
              <span style={{
                fontSize: 'calc(9px * var(--fz, 1))', fontWeight: 500, whiteSpace: 'nowrap' as const,
                padding: '2px 6px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, color: t.neutrals.muted,
                maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{note}</span>
            )}
            {inlineTools && (toolsInline ? <div style={{ flexShrink: 0 }}>{tools}</div> : tools)}
            {action && <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexShrink: 0 }}>{action}</div>}
          </div>
        )}
      </div>
      {/* 모바일 tools — 버튼이 많으면 첫 줄을 다투는 대신 통째로 아랫줄 우측 정렬 */}
      {tools && mobile && !toolsInline && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm, flexWrap: 'wrap',
          justifyContent: 'flex-end', marginTop: 6,
        }}>{tools}</div>
      )}
      {/* 모바일 meta — 제목 옆이 아니라 헤더 아랫줄 전체 폭으로 */}
      {meta && mobile && <div style={{ ...metaStyle, marginTop: 3 }}>{meta}</div>}
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
  /** 짧은 텍스트 라벨(t.type.control). 아이콘 없이 쓸 수도 있다. */
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
    fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontFamily: t.font.sans,
    fontWeight: t.weight.regular,
    textDecoration: 'none', whiteSpace: 'nowrap' as const,
  }
  const inner = (
    <>
      {/* busy면 아이콘을 스피너로 교체 (globals.css .spin) — 동기화류 버튼의 진행 표시 */}
      {icon && <LIcon name={busy ? 'loader' : icon} size={13} stroke={1.8} className={busy ? 'spin' : undefined} />}
      {label}
    </>
  )
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" title={title} style={style}>{inner}</a>
  }
  return <button onClick={onClick} disabled={busy} title={title} style={style}>{inner}</button>
}
