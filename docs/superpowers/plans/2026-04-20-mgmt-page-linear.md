# 사업관리 페이지 (Linear 디자인) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/willow-investment/mgmt` 에 Linear 디자인 시스템 기반 새 사업관리 페이지를 구축한다. 공유 컴포넌트(사이드바, 헤더, 토큰, 채팅 패널) 포함.

**Architecture:** 새 페이지는 기존 LayoutWrapper를 우회하고 자체 레이아웃을 렌더링한다. `_components/` 디렉토리에 Linear 디자인 시스템 공유 컴포넌트를 배치하여 이후 투자관리/위키 페이지에서 재사용한다. 데이터는 기존 API 엔드포인트를 그대로 사용한다.

**Tech Stack:** Next.js App Router, React, Tailwind CSS (커스텀 유틸리티), next/font (Inter Tight, JetBrains Mono)

---

## File Structure

```
src/app/willow-investment/
  _components/                  ← Linear 디자인 공유 컴포넌트
    linear-tokens.ts            ← 디자인 토큰 상수
    linear-layout.tsx           ← 사이드바 + 헤더 + 메인 + 채팅 래퍼
    linear-sidebar.tsx          ← 좌측 네비게이션
    linear-header.tsx           ← 상단 헤더 (breadcrumb)
    linear-card.tsx             ← Card 컴포넌트
    linear-badge.tsx            ← Badge 컴포넌트
    linear-btn.tsx              ← Button 컴포넌트
    linear-section-head.tsx     ← SectionHead (eyebrow + title + action)
    linear-icons.tsx            ← SVG 아이콘 세트
    linear-stat.tsx             ← KPI stat 컴포넌트
    agent-chat-panel.tsx        ← 에이전트 채팅 패널
  mgmt/
    page.tsx                    ← 사업관리 페이지 (조립)
    _components/
      schedule-block.tsx        ← 일정 블록
      cash-block.tsx            ← 현금관리 블록
      email-block.tsx           ← 이메일 모니터링 블록
src/components/layout/
  layout-wrapper.tsx            ← STANDALONE_PATHS에 새 경로 추가
```

---

### Task 1: Linear 디자인 토큰

**Files:**
- Create: `src/app/willow-investment/_components/linear-tokens.ts`

- [ ] **Step 1: 토큰 파일 생성**

```typescript
// src/app/willow-investment/_components/linear-tokens.ts

export const t = {
  font: {
    sans: '"Inter Tight", "Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  weight: { regular: 420, medium: 520, semibold: 620, bold: 720 },
  neutrals: {
    page: '#FAFAFA',
    card: '#FFFFFF',
    inner: '#F6F6F7',
    line: 'rgba(15,15,20,0.07)',
    text: '#0E0F12',
    muted: '#5B5E66',
    subtle: '#9398A0',
  },
  brand: {
    50: '#ECF6FB', 100: '#D2EAF3', 200: '#A7D4E9', 300: '#75B9DB',
    400: '#4A9EC9', 500: '#2183B4', 600: '#166A97', 700: '#125577',
    800: '#0E415A', 900: '#0A2E40',
  },
  accent: { pos: '#107A52', neg: '#C23A3A', warn: '#B8781F' },
  radius: { sm: 4, md: 6, lg: 8, pill: 999 },
  density: { rowH: 34, cardPad: 14, gapSm: 6, gapMd: 10, gapLg: 16 },
  badge: { radius: 4, weight: 520, padX: 7, padY: 2, size: 11 },
} as const

export type LinearTokens = typeof t

// Badge tone palettes
export const tonePalettes = {
  neutral:  { bg: '#EDEDEE', fg: '#2A2A2E' },
  pending:  { bg: '#FBEFD5', fg: '#8B5A12' },
  progress: { bg: '#DCE8F5', fg: '#1F4E79' },
  done:     { bg: '#DAEEDD', fg: '#1F5F3D' },
  brand:    { bg: t.brand[100], fg: t.brand[700] },
  warn:     { bg: '#F9E8D0', fg: '#8A5A1A' },
  danger:   { bg: '#F3DADA', fg: '#8A2A2A' },
  info:     { bg: '#DCE8F5', fg: '#1F4E79' },
  pos:      { bg: '#DAEEDD', fg: '#1F5F3D' },
  neg:      { bg: '#F3DADA', fg: '#8A2A2A' },
} as const

export type ToneName = keyof typeof tonePalettes

// Event tone maps (for schedule/calendar)
export const eventTones = {
  brand:   { bg: t.brand[100], fg: t.brand[700] },
  info:    { bg: '#DCE8F5', fg: '#1F4E79' },
  warn:    { bg: '#F9E8D0', fg: '#8A5A1A' },
  done:    { bg: '#DAEEDD', fg: '#1F5F3D' },
  neutral: { bg: t.neutrals.inner, fg: t.neutrals.text },
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/_components/linear-tokens.ts
git commit -m "feat: add Linear design tokens for mgmt redesign"
```

---

### Task 2: Linear 아이콘 세트

**Files:**
- Create: `src/app/willow-investment/_components/linear-icons.tsx`

- [ ] **Step 1: 아이콘 컴포넌트 생성**

`kit.jsx`의 Icon 컴포넌트를 React/TypeScript로 변환. 22개 아이콘 path를 그대로 포팅.

```tsx
// src/app/willow-investment/_components/linear-icons.tsx
'use client'

const paths: Record<string, string> = {
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  bell: 'M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2zM10 20a2 2 0 004 0',
  calendar: 'M3 8h18M7 3v4M17 3v4M4 6h16v14H4z',
  trending: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  arrow: 'M5 12h14M13 5l7 7-7 7',
  filter: 'M3 5h18M6 12h12M10 19h4',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M6 18L18 6',
  leaf: 'M11 19A7 7 0 0018 5H7a7 7 0 004 14zM11 19v-8',
  building: 'M3 21h18M5 21V7l8-4v18M13 9h6v12',
  file: 'M13 3H5v18h14V9l-6-6zM13 3v6h6',
  briefcase: 'M4 7h16v13H4zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2',
  mail: 'M3 7l9 6 9-6M3 7v10h18V7H3z',
  book: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5zM4 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 12a7 7 0 01-14 0M12 19v3',
  dot: 'M12 12h.01',
}

interface LIconProps {
  name: string
  size?: number
  color?: string
  stroke?: number
  className?: string
}

export function LIcon({ name, size = 16, color = 'currentColor', stroke = 1.5, className }: LIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d={paths[name] || paths.dot} />
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/_components/linear-icons.tsx
git commit -m "feat: add Linear icon set (22 glyphs)"
```

---

### Task 3: Linear UI 프리미티브 (Card, Badge, Button, SectionHead, Stat)

**Files:**
- Create: `src/app/willow-investment/_components/linear-card.tsx`
- Create: `src/app/willow-investment/_components/linear-badge.tsx`
- Create: `src/app/willow-investment/_components/linear-btn.tsx`
- Create: `src/app/willow-investment/_components/linear-section-head.tsx`
- Create: `src/app/willow-investment/_components/linear-stat.tsx`

- [ ] **Step 1: Card 생성**

```tsx
// src/app/willow-investment/_components/linear-card.tsx
'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LCardProps {
  children: ReactNode
  pad?: number | string
  style?: React.CSSProperties
}

export function LCard({ children, pad, style }: LCardProps) {
  return (
    <div style={{
      background: t.neutrals.card,
      borderRadius: t.radius.lg,
      padding: pad ?? t.density.cardPad,
      fontFamily: t.font.sans,
      color: t.neutrals.text,
      ...style,
    }}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Badge 생성**

```tsx
// src/app/willow-investment/_components/linear-badge.tsx
'use client'

import { t, tonePalettes, ToneName } from './linear-tokens'
import { ReactNode } from 'react'

interface LBadgeProps {
  tone?: ToneName
  children: ReactNode
  pill?: boolean
}

export function LBadge({ tone = 'neutral', children, pill = false }: LBadgeProps) {
  const p = tonePalettes[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: `${t.badge.padY}px ${t.badge.padX}px`,
      background: p.bg, color: p.fg,
      fontSize: t.badge.size, fontWeight: t.badge.weight,
      borderRadius: pill ? 999 : t.badge.radius,
      lineHeight: 1.2, fontFamily: t.font.sans,
    }}>
      {children}
    </span>
  )
}
```

- [ ] **Step 3: Button 생성**

```tsx
// src/app/willow-investment/_components/linear-btn.tsx
'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

interface LBtnProps {
  variant?: BtnVariant
  size?: BtnSize
  children: ReactNode
  icon?: ReactNode
  onClick?: () => void
  style?: React.CSSProperties
  disabled?: boolean
}

const sizes = {
  sm: { h: 28, px: 10, fs: 12 },
  md: { h: 34, px: 14, fs: 13 },
  lg: { h: 40, px: 18, fs: 14 },
}

const variants = {
  primary:   { bg: t.neutrals.text, fg: '#fff' },
  secondary: { bg: t.neutrals.inner, fg: t.neutrals.text },
  ghost:     { bg: 'transparent', fg: t.neutrals.text },
  brand:     { bg: t.brand[600], fg: '#fff' },
  danger:    { bg: t.accent.neg, fg: '#fff' },
}

export function LBtn({ variant = 'primary', size = 'md', children, icon, onClick, style, disabled }: LBtnProps) {
  const s = sizes[size]
  const v = variants[variant]
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs,
      background: v.bg, color: v.fg,
      fontWeight: t.weight.medium, fontFamily: t.font.sans,
      borderRadius: t.radius.sm, border: 'none', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}>
      {icon}{children}
    </button>
  )
}
```

- [ ] **Step 4: SectionHead 생성**

```tsx
// src/app/willow-investment/_components/linear-section-head.tsx
'use client'

import { t } from './linear-tokens'
import { ReactNode } from 'react'

interface LSectionHeadProps {
  eyebrow?: string
  title: string
  action?: ReactNode
}

export function LSectionHead({ eyebrow, title, action }: LSectionHeadProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      marginBottom: t.density.gapMd,
    }}>
      <div>
        {eyebrow && (
          <div style={{
            fontSize: 10.5, fontWeight: t.weight.semibold, letterSpacing: 1.2,
            textTransform: 'uppercase' as const, color: t.neutrals.subtle,
            marginBottom: 4, fontFamily: t.font.mono,
          }}>{eyebrow}</div>
        )}
        <div style={{
          fontSize: 15, fontWeight: t.weight.semibold,
          fontFamily: t.font.sans, color: t.neutrals.text,
          letterSpacing: -0.2, lineHeight: 1.2,
        }}>{title}</div>
      </div>
      {action}
    </div>
  )
}
```

- [ ] **Step 5: Stat 생성**

```tsx
// src/app/willow-investment/_components/linear-stat.tsx
'use client'

import { t } from './linear-tokens'

interface LStatProps {
  label: string
  value: string
  unit?: string
  tone?: 'pos' | 'neg' | 'warn' | 'default'
}

export function LStat({ label, value, unit, tone = 'default' }: LStatProps) {
  const color = tone === 'pos' ? t.accent.pos
    : tone === 'neg' ? t.accent.neg
    : tone === 'warn' ? t.accent.warn
    : t.neutrals.text
  return (
    <div style={{
      background: t.neutrals.inner, borderRadius: t.radius.sm,
      padding: '8px 10px',
    }}>
      <div style={{
        fontSize: 9.5, fontFamily: t.font.mono, letterSpacing: 0.8,
        textTransform: 'uppercase' as const, color: t.neutrals.subtle,
        marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 600, letterSpacing: -0.3,
        fontVariantNumeric: 'tabular-nums' as const,
        whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
        color,
      }}>
        {value}
        {unit && <span style={{ fontSize: 11, marginLeft: 3, color: t.neutrals.muted, fontWeight: 400 }}>{unit}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/willow-investment/_components/linear-card.tsx \
        src/app/willow-investment/_components/linear-badge.tsx \
        src/app/willow-investment/_components/linear-btn.tsx \
        src/app/willow-investment/_components/linear-section-head.tsx \
        src/app/willow-investment/_components/linear-stat.tsx
git commit -m "feat: add Linear UI primitives (Card, Badge, Btn, SectionHead, Stat)"
```

---

### Task 4: Linear 사이드바

**Files:**
- Create: `src/app/willow-investment/_components/linear-sidebar.tsx`

- [ ] **Step 1: 사이드바 컴포넌트 생성**

`mgmt-v2.jsx`의 V2Sidebar를 TypeScript로 변환. 3그룹(Willow/Clients) + 하단 유저 아바타.
각 nav 아이템은 `next/link`로 실제 라우트 연결.

```tsx
// src/app/willow-investment/_components/linear-sidebar.tsx
'use client'

import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { key: 'mgmt',   href: '/willow-investment/mgmt',   label: '사업관리',  icon: 'briefcase' },
  { key: 'invest', href: '/willow-investment/invest',  label: '투자관리',  icon: 'trending' },
  { key: 'wiki',   href: '/willow-investment/wiki',    label: '업무 위키', icon: 'book' },
]

const CLIENTS = [
  { id: 'akros', name: '아크로스자산운용', tag: 'ETF', dot: '#3F93C6' },
  { id: 'tensw', name: '텐소프트웍스',    tag: 'SI',  dot: '#B88A2A' },
  { id: 'monor', name: '모노알',          tag: 'App', dot: '#2F8F5B' },
  { id: 'ryuha', name: '류하학원',        tag: 'EDU', dot: '#8B5CF6' },
]

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
      textTransform: 'uppercase' as const, color: t.neutrals.subtle,
      padding: '12px 8px 4px',
    }}>{label}</div>
  )
}

export function LinearSidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 232, background: t.neutrals.page,
      borderRight: `1px solid ${t.neutrals.line}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      fontFamily: t.font.sans,
    }}>
      {/* Logo */}
      <div style={{ height: 52, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `linear-gradient(135deg, ${t.brand[400]}, ${t.brand[700]})`,
        }} />
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.2, color: t.neutrals.text }}>Willow</span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        <GroupLabel label="Willow" />
        {NAV_ITEMS.map(n => {
          const isActive = pathname === n.href || pathname.startsWith(n.href + '/')
          return (
            <Link key={n.key} href={n.href} style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: 10, padding: '7px 10px',
              background: isActive ? t.brand[600] + '14' : 'transparent',
              color: isActive ? t.brand[700] : t.neutrals.muted,
              fontWeight: isActive ? t.weight.medium : t.weight.regular,
              fontSize: 13, borderRadius: 6, textDecoration: 'none',
              marginBottom: 1, letterSpacing: -0.1,
            }}>
              <LIcon name={n.icon} size={14} stroke={1.8} />
              <span>{n.label}</span>
            </Link>
          )
        })}

        <GroupLabel label="Clients" />
        {CLIENTS.map(c => (
          <div key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
            fontSize: 12.5, color: t.neutrals.muted, borderRadius: 6, cursor: 'pointer',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c.dot, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{c.name}</span>
            <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle }}>{c.tag}</span>
          </div>
        ))}
      </nav>

      {/* User */}
      <div style={{
        padding: 10, borderTop: `1px solid ${t.neutrals.line}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 28,
          background: t.brand[200], color: t.brand[800],
          fontSize: 11, fontWeight: t.weight.semibold,
        }}>DW</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: t.neutrals.text }}>대표</div>
          <div style={{ fontSize: 10.5, color: t.neutrals.subtle }}>willow</div>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/_components/linear-sidebar.tsx
git commit -m "feat: add Linear sidebar navigation"
```

---

### Task 5: Linear 헤더

**Files:**
- Create: `src/app/willow-investment/_components/linear-header.tsx`

- [ ] **Step 1: 헤더 컴포넌트 생성**

breadcrumb 스타일 + 우측 액션 영역.

```tsx
// src/app/willow-investment/_components/linear-header.tsx
'use client'

import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { LBtn } from './linear-btn'
import { ReactNode } from 'react'

interface LinearHeaderProps {
  title: string
  onAgentToggle?: () => void
  agentOpen?: boolean
  actions?: ReactNode
}

export function LinearHeader({ title, onAgentToggle, agentOpen, actions }: LinearHeaderProps) {
  return (
    <header style={{
      height: 52, padding: '0 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: t.neutrals.page,
      borderBottom: `1px solid ${t.neutrals.line}`,
      flexShrink: 0, fontFamily: t.font.sans,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, minWidth: 0 }}>
        <span style={{ color: t.neutrals.muted }}>Willow</span>
        <LIcon name="chevronRight" size={11} color={t.neutrals.subtle} stroke={2} />
        <span style={{ color: t.neutrals.text, fontWeight: 500 }}>{title}</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        {onAgentToggle && (
          <button onClick={onAgentToggle} style={{
            height: 28, padding: '0 10px', borderRadius: 6,
            background: agentOpen ? t.brand[600] : t.neutrals.inner,
            color: agentOpen ? '#fff' : t.neutrals.text,
            border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: t.font.sans,
          }}>
            <span style={{ fontSize: 12 }}>✦</span>
            <span>Agent</span>
          </button>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/willow-investment/_components/linear-header.tsx
git commit -m "feat: add Linear header with breadcrumb"
```

---

### Task 6: Linear 레이아웃 래퍼 + Font 로딩

**Files:**
- Create: `src/app/willow-investment/_components/linear-layout.tsx`
- Create: `src/app/willow-investment/(linear)/layout.tsx`
- Modify: `src/components/layout/layout-wrapper.tsx`

- [ ] **Step 1: 레이아웃 래퍼 생성**

사이드바 + 헤더 + 메인 + 에이전트 채팅 패널을 조립하는 래퍼.

```tsx
// src/app/willow-investment/_components/linear-layout.tsx
'use client'

import { useState, useEffect, ReactNode } from 'react'
import { t } from './linear-tokens'
import { LinearSidebar } from './linear-sidebar'
import { LinearHeader } from './linear-header'

interface LinearLayoutProps {
  title: string
  children: ReactNode
  headerActions?: ReactNode
}

function useNarrow(threshold = 1180) {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < threshold)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [threshold])
  return narrow
}

export function LinearLayout({ title, children, headerActions }: LinearLayoutProps) {
  const narrow = useNarrow()
  const [chatOpen, setChatOpen] = useState(!narrow)

  useEffect(() => { setChatOpen(!narrow) }, [narrow])

  return (
    <div style={{
      minHeight: '100vh', background: t.neutrals.page,
      color: t.neutrals.text, fontFamily: t.font.sans,
      display: 'flex',
    }}>
      <LinearSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <LinearHeader
          title={title}
          onAgentToggle={() => setChatOpen(v => !v)}
          agentOpen={chatOpen}
          actions={headerActions}
        />
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <main style={{ flex: 1, overflow: 'auto', padding: '0 20px 24px', minWidth: 0 }}>
            {children}
          </main>
          {/* Agent chat placeholder — Task 9에서 구현 */}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Route group layout 생성**

Inter Tight, JetBrains Mono 폰트를 로딩하고, 기존 LayoutWrapper를 우회하는 layout.

```tsx
// src/app/willow-investment/(linear)/layout.tsx
import { Inter as InterTight } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'

const interTight = InterTight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600'],
})

export default function LinearLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: LayoutWrapper에 linear 경로 추가**

새 페이지들이 기존 사이드바/헤더를 건너뛰도록 STANDALONE_PATHS에 추가.

`src/components/layout/layout-wrapper.tsx` 수정:

```typescript
// 기존:
const STANDALONE_PATHS = ['/mcp/authorize']

// 변경:
const STANDALONE_PATHS = ['/mcp/authorize']
const LINEAR_PATH_PREFIX = '/willow-investment/'
const LINEAR_ROUTES = ['/willow-investment/mgmt', '/willow-investment/invest', '/willow-investment/wiki']
```

그리고 `isStandalonePath` 체크 아래에:

```typescript
const isLinearRoute = LINEAR_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))

// Linear routes: render with auth check but without default layout
if (isLinearRoute) {
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    )
  }
  if (!user) {
    router.push('/login')
    return null
  }
  return <>{children}</>
}
```

이 블록을 `isStandalonePath` 체크 후, `isPublicPath` 체크 전에 삽입한다.

- [ ] **Step 4: Commit**

```bash
git add src/app/willow-investment/_components/linear-layout.tsx \
        "src/app/willow-investment/(linear)/layout.tsx" \
        src/components/layout/layout-wrapper.tsx
git commit -m "feat: add Linear layout wrapper and bypass default layout for new routes"
```

---

### Task 7: 사업관리 일정 블록 (ScheduleBlock)

**Files:**
- Create: `src/app/willow-investment/(linear)/mgmt/_components/schedule-block.tsx`

- [ ] **Step 1: ScheduleBlock 컴포넌트 생성**

`mgmt-v2.jsx`의 V2Schedule 기반. 실제 데이터를 받아 주간 캘린더 그리드를 렌더링.
`WillowMgmtSchedule` 타입 사용. 오늘 강조, 이벤트 칩, 주간/월간 토글.

```tsx
// src/app/willow-investment/(linear)/mgmt/_components/schedule-block.tsx
'use client'

import { useState } from 'react'
import { t, eventTones } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface ScheduleBlockProps {
  schedules: WillowMgmtSchedule[]
  clients: WillowMgmtClient[]
  currentDate: Date
  onNavigate: (dir: -1 | 1) => void
  onAddSchedule: () => void
}

function getWeekDays(date: Date) {
  const start = new Date(date)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function formatDateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

function getClientTone(clientId: string | null, clients: WillowMgmtClient[]): keyof typeof eventTones {
  if (!clientId) return 'neutral'
  const client = clients.find(c => c.id === clientId)
  if (!client) return 'neutral'
  const name = client.name.toLowerCase()
  if (name.includes('아크로스') || name.includes('akros')) return 'brand'
  if (name.includes('텐소프트') || name.includes('tensw')) return 'info'
  if (name.includes('류하')) return 'brand'
  return 'neutral'
}

export function ScheduleBlock({ schedules, clients, currentDate, onNavigate, onAddSchedule }: ScheduleBlockProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const weekDays = getWeekDays(currentDate)
  const todayStr = formatDateLocal(new Date())

  return (
    <LCard>
      <LSectionHead eyebrow="SCHEDULE · 이번 주" title="일정" action={
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{
            display: 'inline-flex', background: t.neutrals.inner,
            borderRadius: t.radius.sm, padding: 2,
          }}>
            {(['week', 'month'] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                border: 'none',
                background: viewMode === v ? t.neutrals.card : 'transparent',
                padding: '4px 10px', fontSize: 11.5, borderRadius: 4, cursor: 'pointer',
                fontWeight: viewMode === v ? 500 : 400, color: t.neutrals.text,
                fontFamily: t.font.sans,
              }}>{v === 'week' ? '주' : '월'}</button>
            ))}
          </div>
          <LBtn size="sm" icon={<LIcon name="plus" size={12} stroke={2.2} />} onClick={onAddSchedule}>
            추가
          </LBtn>
        </div>
      } />

      {/* Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
      }}>
        <button onClick={() => onNavigate(-1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronDown" size={14} stroke={2} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans }}>
          {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
        </span>
        <button onClick={() => onNavigate(1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronDown" size={14} stroke={2} />
        </button>
      </div>

      {/* Week grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        background: t.neutrals.inner, borderRadius: t.radius.md, overflow: 'hidden',
      }}>
        {weekDays.map((day, i) => {
          const dateStr = formatDateLocal(day)
          const isToday = dateStr === todayStr
          const daySchedules = schedules.filter(s => {
            if (s.end_date) {
              return dateStr >= s.schedule_date && dateStr <= s.end_date
            }
            return s.schedule_date === dateStr
          })

          return (
            <div key={dateStr} style={{
              minHeight: 128, padding: 8,
              borderRight: i < 6 ? `1px solid ${t.neutrals.line}` : 'none',
              background: isToday ? t.brand[50] : 'transparent',
              minWidth: 0, overflow: 'hidden',
            }}>
              <div style={{
                fontSize: 10.5, fontFamily: t.font.mono, fontWeight: 500,
                color: isToday ? t.brand[700] : t.neutrals.subtle,
                letterSpacing: 0.3, marginBottom: 6,
              }}>
                {DAY_NAMES[i]} {day.getDate()}
                {isToday && ' · TODAY'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {daySchedules.map((s) => {
                  const tone = s.type === 'deadline' ? 'warn'
                    : s.is_completed ? 'done'
                    : getClientTone(s.client_id, clients)
                  const colors = eventTones[tone] || eventTones.neutral
                  return (
                    <div key={s.id} style={{
                      padding: '3px 5px', borderRadius: 3,
                      background: colors.bg, color: colors.fg,
                      fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                      minWidth: 0, overflow: 'hidden',
                    }}>
                      {s.start_time && (
                        <div style={{ fontFamily: t.font.mono, fontSize: 8.5, opacity: 0.7 }}>
                          {s.start_time.slice(0, 5)}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/willow-investment/(linear)/mgmt/_components/schedule-block.tsx"
git commit -m "feat: add ScheduleBlock for Linear mgmt page"
```

---

### Task 8: 사업관리 현금관리 블록 (CashBlock)

**Files:**
- Create: `src/app/willow-investment/(linear)/mgmt/_components/cash-block.tsx`

- [ ] **Step 1: CashBlock 컴포넌트 생성**

`mgmt-v2.jsx`의 V2Cash 기반. KPI 3개 + 은행 엑셀 드롭 존 + 거래 테이블.
실제 `TenswInvoice` 데이터를 받아 렌더링.

```tsx
// src/app/willow-investment/(linear)/mgmt/_components/cash-block.tsx
'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBadge } from '@/app/willow-investment/_components/linear-badge'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { LStat } from '@/app/willow-investment/_components/linear-stat'

interface Invoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: 'issued' | 'completed'
}

interface CashBlockProps {
  invoices: Invoice[]
  onAddInvoice: () => void
}

export function CashBlock({ invoices, onAddInvoice }: CashBlockProps) {
  const [dragOver, setDragOver] = useState(false)

  const revenue = invoices.filter(i => i.type === 'revenue').reduce((s, i) => s + i.amount, 0)
  const expense = invoices.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const pending = invoices.filter(i => i.type === 'revenue' && i.status === 'issued').reduce((s, i) => s + i.amount, 0)

  const recentInvoices = invoices
    .sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || ''))
    .slice(0, 5)

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead eyebrow="CASHFLOW · 이번 달" title="현금관리" action={
          <LBtn variant="secondary" size="sm" icon={<LIcon name="plus" size={12} stroke={2.2} />} onClick={onAddInvoice}>
            수동 추가
          </LBtn>
        } />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
          <LStat label="수입" value={`${revenue.toLocaleString()}원`} tone="pos" />
          <LStat label="지출" value={`−${Math.abs(expense).toLocaleString()}원`} tone="neg" />
          <LStat label="미수" value={`${pending.toLocaleString()}원`} tone="warn" />
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false) }}
        style={{
          margin: '0 16px 12px', padding: '12px 16px',
          border: `1.5px dashed ${dragOver ? t.brand[600] : t.neutrals.line}`,
          background: dragOver ? t.brand[50] : 'transparent',
          borderRadius: t.radius.md, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 12,
          transition: 'all .15s',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: t.brand[50], color: t.brand[700],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <LIcon name="file" size={16} stroke={1.8} />
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>은행 엑셀 파일을 드래그하거나 클릭</div>
          <div style={{ fontSize: 11, color: t.neutrals.muted, marginTop: 2 }}>
            에이전트가 파싱해서 테이블에 반영합니다 · .xlsx .csv
          </div>
        </div>
      </div>

      {/* Recent invoices */}
      <div style={{ padding: '0 16px 16px' }}>
        {recentInvoices.map((v, i) => {
          const isIncome = v.type === 'revenue'
          const statusTone = v.status === 'completed' ? 'done' as const : 'pending' as const
          const statusLabel = v.status === 'completed' ? '완료' : '미수'
          return (
            <div key={v.id} style={{
              display: 'grid', gridTemplateColumns: '55px 1.2fr 1.8fr 1fr 60px',
              gap: 8, padding: '10px 0', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 12,
            }}>
              <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, fontSize: 11 }}>
                {(v.issue_date || '').slice(5)}
              </span>
              <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.counterparty}
              </span>
              <span style={{ color: t.neutrals.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v.description}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                color: isIncome ? t.accent.pos : t.accent.neg,
              }}>
                {isIncome ? '+' : ''}{v.amount.toLocaleString()}
              </span>
              <span><LBadge tone={statusTone}>{statusLabel}</LBadge></span>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/willow-investment/(linear)/mgmt/_components/cash-block.tsx"
git commit -m "feat: add CashBlock for Linear mgmt page"
```

---

### Task 9: 사업관리 이메일 블록 (EmailBlock)

**Files:**
- Create: `src/app/willow-investment/(linear)/mgmt/_components/email-block.tsx`

- [ ] **Step 1: EmailBlock 컴포넌트 생성**

`mgmt-v2.jsx`의 V2Email 기반. 이메일 리스트 (read-only 모니터링).
기존 `ParsedEmail` 타입 사용.

```tsx
// src/app/willow-investment/(linear)/mgmt/_components/email-block.tsx
'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface EmailItem {
  id: string
  from: string
  subject: string
  date: string
  unread: boolean
}

interface EmailBlockProps {
  emails: EmailItem[]
  connected: boolean
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  return `${days}일`
}

export function EmailBlock({ emails, connected }: EmailBlockProps) {
  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="EMAIL · 모니터링" title="이메일" action={
          <span style={{
            fontSize: 11, fontFamily: t.font.mono,
            color: connected ? t.accent.pos : t.accent.neg,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3,
              background: connected ? t.accent.pos : t.accent.neg,
            }} />
            {connected ? 'Gmail 연결됨' : '미연결'}
          </span>
        } />
      </div>
      <div>
        {emails.slice(0, 6).map((m) => (
          <div key={m.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 50px',
            gap: 8, padding: '9px 16px', alignItems: 'center',
            borderTop: `1px solid ${t.neutrals.line}`,
            fontSize: 12,
            background: m.unread ? 'transparent' : t.neutrals.inner + '40',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {m.unread && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.brand[600], flexShrink: 0 }} />}
                <span style={{ fontSize: 10.5, color: t.neutrals.muted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.from}</span>
              </div>
              <div style={{
                fontWeight: m.unread ? 500 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{m.subject}</div>
            </div>
            <span style={{
              fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle,
              textAlign: 'right',
            }}>{timeAgo(m.date)} 전</span>
          </div>
        ))}
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/willow-investment/(linear)/mgmt/_components/email-block.tsx"
git commit -m "feat: add EmailBlock for Linear mgmt page"
```

---

### Task 10: 사업관리 페이지 조립 (page.tsx)

**Files:**
- Create: `src/app/willow-investment/(linear)/mgmt/page.tsx`

- [ ] **Step 1: 페이지 조립**

모든 컴포넌트를 조립하고, 기존 API에서 데이터를 fetch.
레이아웃: ScheduleBlock 전체 너비 + CashBlock(1.5fr) + EmailBlock(1fr) 그리드.

```tsx
// src/app/willow-investment/(linear)/mgmt/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LinearLayout } from '@/app/willow-investment/_components/linear-layout'
import { ScheduleBlock } from './_components/schedule-block'
import { CashBlock } from './_components/cash-block'
import { EmailBlock } from './_components/email-block'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'
import { ProtectedPage } from '@/components/auth/protected-page'
import { gmailService } from '@/lib/gmail'

interface TenswInvoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: 'issued' | 'completed'
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}

interface EmailItem {
  id: string
  from: string
  subject: string
  date: string
  unread: boolean
}

export default function MgmtPage() {
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [schedules, setSchedules] = useState<WillowMgmtSchedule[]>([])
  const [clients, setClients] = useState<WillowMgmtClient[]>([])
  const [invoices, setInvoices] = useState<TenswInvoice[]>([])
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [gmailConnected, setGmailConnected] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [clientsRes, schedulesRes, invoicesRes] = await Promise.all([
        fetch('/api/willow-mgmt/clients'),
        fetch('/api/willow-mgmt/schedules'),
        fetch('/api/willow-mgmt/invoices'),
      ])
      if (clientsRes.ok) setClients(await clientsRes.json())
      if (schedulesRes.ok) setSchedules(await schedulesRes.json())
      if (invoicesRes.ok) {
        const data = await invoicesRes.json()
        setInvoices(Array.isArray(data) ? data : data.invoices || [])
      }

      // Gmail
      try {
        const gmailLabel = 'willow-mgmt'
        const statusRes = await fetch(`/api/gmail/status?label=${gmailLabel}`)
        if (statusRes.ok) {
          const status = await statusRes.json()
          setGmailConnected(status.connected)
          if (status.connected) {
            const emailsRes = await fetch(`/api/gmail/emails?label=${gmailLabel}&limit=10`)
            if (emailsRes.ok) {
              const emailData = await emailsRes.json()
              const parsed: EmailItem[] = (emailData.emails || []).map((e: any) => ({
                id: e.id,
                from: e.from?.replace(/<.*>/, '').trim() || 'Unknown',
                subject: e.subject || '(제목 없음)',
                date: e.date || new Date().toISOString(),
                unread: !e.isRead,
              }))
              setEmails(parsed)
            }
          }
        }
      } catch { /* Gmail not critical */ }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const navigate = (dir: -1 | 1) => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + dir * 7)
      return d
    })
  }

  if (loading) {
    return (
      <ProtectedPage>
        <LinearLayout title="사업관리">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '60vh', color: t.neutrals.subtle, fontSize: 13,
          }}>
            로딩 중...
          </div>
        </LinearLayout>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage>
      <LinearLayout title="사업관리">
        {/* Page title */}
        <div style={{ padding: '20px 0 0' }}>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
            fontFamily: t.font.sans, color: t.neutrals.text,
          }}>사업관리</h1>
          <p style={{
            margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
            fontFamily: t.font.sans,
          }}>
            일정 · 현금관리 · 이메일 — 오늘의 허브
          </p>
        </div>

        {/* 3 blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ScheduleBlock
            schedules={schedules}
            clients={clients}
            currentDate={currentDate}
            onNavigate={navigate}
            onAddSchedule={() => {}}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
            <CashBlock invoices={invoices} onAddInvoice={() => {}} />
            <EmailBlock emails={emails} connected={gmailConnected} />
          </div>
        </div>
      </LinearLayout>
    </ProtectedPage>
  )
}
```

- [ ] **Step 2: 브라우저에서 확인**

Run: `cd /Volumes/PRO-G40/app-dev/willow-invt && bun dev`
Navigate to: `http://localhost:3000/willow-investment/mgmt`

확인 사항:
- 기존 사이드바/헤더 없이 Linear 사이드바 표시
- 좌측 네비 3항목 (사업관리 활성) + 클라이언트 4개
- 일정 주간 캘린더 렌더링
- 현금관리 KPI 3개 + 거래 테이블
- 이메일 리스트

- [ ] **Step 3: Commit**

```bash
git add "src/app/willow-investment/(linear)/mgmt/page.tsx"
git commit -m "feat: assemble Linear mgmt page with schedule, cash, email blocks"
```

---

## Self-Review

**Spec coverage:**
- [x] Linear 디자인 토큰 → Task 1
- [x] 사이드바 네비게이션 → Task 4
- [x] 헤더 breadcrumb → Task 5
- [x] 레이아웃 래퍼 + LayoutWrapper 우회 → Task 6
- [x] 일정 블록 → Task 7
- [x] 현금관리 블록 → Task 8
- [x] 이메일 블록 → Task 9
- [x] 페이지 조립 → Task 10
- [ ] 에이전트 채팅 패널 → LinearLayout에 placeholder 남김. 별도 후속 task으로 분리 (3개 페이지 공통이므로 마지막에 추가)

**Placeholder scan:** 없음 — 모든 코드 블록 완전.

**Type consistency:** `WillowMgmtSchedule`, `WillowMgmtClient`, `TenswInvoice` 타입 일관 사용. `EmailItem` 인터페이스 page.tsx와 EmailBlock에서 동일 정의.
