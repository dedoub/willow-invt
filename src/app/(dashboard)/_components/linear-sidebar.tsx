'use client'

import { useState, ReactNode } from 'react'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { key: 'mgmt',       href: '/mgmt',       label: '사업관리',    icon: 'briefcase' },
  { key: 'wiki',       href: '/wiki',       label: '업무위키',    icon: 'book' },
  { key: 'invest',     href: '/invest',     label: '주식투자',     icon: 'trending' },
  { key: 'realestate', href: '/realestate', label: '부동산리서치', icon: 'building' },
  { key: 'ryuha',      href: '/ryuha',      label: '류하일정',    icon: 'calendar' },
]

const CLIENTS = [
  { id: 'akros', name: '아크로스',      tag: 'Indexing',  dot: '#3F93C6' },
  { id: 'etc',   name: 'ETC',           tag: 'ETF Platform', dot: '#1F4E79' },
  { id: 'tensw', name: '텐소프트웍스',  tag: 'Data & AI', dot: '#B88A2A' },
  { id: 'monor', name: 'MonoR Apps',    tag: 'Education', dot: '#2F8F5B' },
  { id: 'valuechain', name: 'ValueChain', tag: 'LLM Wiki', dot: '#7C5CD6' },
]

const CLIENT_HREF: Record<string, string | undefined> = {
  akros: '/akros', etc: '/etc', tensw: '/tensw', monor: '/monor', valuechain: '/valuechain',
}

const ADMIN_ITEMS = [
  { key: 'users', href: '/admin/users', label: '사용자 관리', icon: 'user' },
]

function GroupLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 'calc(10px * var(--fz, 1))', fontWeight: 600, letterSpacing: 0.8,
      textTransform: 'uppercase' as const, color: t.neutrals.subtle,
      padding: '12px 8px 4px',
    }}>{label}</div>
  )
}

// 접힌 rail에서 아이콘 호버 시 오른쪽에 뜨는 커스텀 툴팁
function RailTip({ label, sub, enabled, children }: {
  label: string; sub?: string; enabled: boolean; children: ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  if (!enabled) return <>{children}</>
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={e => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPos({ top: r.top + r.height / 2, left: r.right + 10 })
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: t.brand[800], color: '#fff',
          padding: '5px 9px', borderRadius: 7,
          fontSize: 'calc(11.5px * var(--fz, 1))', fontWeight: t.weight.medium,
          whiteSpace: 'nowrap', zIndex: 200, pointerEvents: 'none',
          fontFamily: t.font.sans, letterSpacing: -0.1,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
        }}>
          {/* 좌측 화살표 */}
          <span style={{
            position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%) rotate(45deg)',
            width: 8, height: 8, background: t.brand[800], borderRadius: 1,
          }} />
          <span>{label}</span>
          {sub && (
            <span style={{
              fontFamily: t.font.mono, fontSize: 'calc(9.5px * var(--fz, 1))',
              color: t.brand[200], fontWeight: t.weight.regular,
            }}>{sub}</span>
          )}
        </div>
      )}
    </div>
  )
}

interface LinearSidebarProps {
  mobile?: boolean
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  animate?: boolean
}

export function LinearSidebar({ mobile, open, onClose, collapsed = false, animate = false }: LinearSidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const isAdmin = useIsAdmin()

  // 접힌 상태(아이콘 전용 rail)는 데스크톱에서만 사용
  const rail = collapsed && !mobile

  const navLink = (n: { key: string; href: string; label: string; icon: string }) => {
    const isActive = pathname === n.href || pathname.startsWith(n.href + '/')
    return (
      <RailTip key={n.key} label={n.label} enabled={rail}>
        <Link href={n.href} onClick={onClose} style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: rail ? 'center' : undefined,
          gap: 10, padding: rail ? '8px 0' : '7px 10px',
          background: isActive ? t.brand[600] + '14' : 'transparent',
          color: isActive ? t.brand[700] : t.neutrals.muted,
          fontWeight: isActive ? t.weight.medium : t.weight.regular,
          fontSize: 'calc(13px * var(--fz, 1))', borderRadius: 6, textDecoration: 'none',
          marginBottom: 1, letterSpacing: -0.1,
        }}>
          <LIcon name={n.icon} size={rail ? 18 : 14} stroke={1.8} />
          {!rail && <span>{n.label}</span>}
        </Link>
      </RailTip>
    )
  }

  const sidebar = (
    <aside style={{
      width: rail ? 56 : 232, background: t.neutrals.page,
      borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      fontFamily: t.font.sans,
      height: mobile ? '100vh' : undefined,
      transition: animate ? 'width 0.15s ease' : 'none',
    }}>
      {/* Logo */}
      <div style={{
        height: 52, padding: rail ? '0' : '0 14px', display: 'flex', alignItems: 'center',
        justifyContent: rail ? 'center' : (mobile ? 'space-between' : undefined),
        background: t.brand[800],
      }}>
        {rail ? (
          <img src="/leaf-icon.png" alt="willowinvt" style={{ height: 16, width: 16, objectFit: 'contain' }} />
        ) : (
          <img src="/willow-text.png" alt="willowinvt" style={{ height: 15 }} />
        )}
        {mobile && !rail && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: t.brand[200],
          }}>
            <LIcon name="x" size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto', overflowX: 'hidden' }}>
        {!rail && <GroupLabel label="윌로우인베스트먼트" />}
        {NAV_ITEMS.map(navLink)}

        {!rail && <GroupLabel label="프로젝트" />}
        {rail && <div style={{ height: 1, background: t.neutrals.line, margin: '8px 6px' }} />}
        {CLIENTS.map(c => {
          const href = CLIENT_HREF[c.id]
          const isActive = href ? (pathname === href || pathname.startsWith(href + '/')) : false
          const Wrapper = href ? Link : 'div' as any
          return (
            <RailTip key={c.id} label={c.name} sub={c.tag} enabled={rail}>
              <Wrapper {...(href ? { href, onClick: onClose } : {})} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                justifyContent: rail ? 'center' : undefined,
                padding: rail ? '8px 0' : '6px 10px',
                fontSize: 'calc(12.5px * var(--fz, 1))', color: isActive ? t.brand[700] : t.neutrals.muted, borderRadius: 6,
                cursor: href ? 'pointer' : 'default',
                textDecoration: 'none',
                background: isActive ? t.brand[600] + '14' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              }}>
                <span style={{ width: rail ? 9 : 7, height: rail ? 9 : 7, borderRadius: 2, background: c.dot, flexShrink: 0 }} />
                {!rail && <span style={{ flex: 1 }}>{c.name}</span>}
                {!rail && <span style={{ fontFamily: t.font.mono, fontSize: 'calc(10px * var(--fz, 1))', color: t.neutrals.subtle }}>{c.tag}</span>}
              </Wrapper>
            </RailTip>
          )
        })}

        {isAdmin && (
          <>
            {!rail && <GroupLabel label="관리자" />}
            {rail && <div style={{ height: 1, background: t.neutrals.line, margin: '8px 6px' }} />}
            {ADMIN_ITEMS.map(navLink)}
          </>
        )}
      </nav>

      {/* User */}
      {user && (
        <div style={{
          padding: rail ? '10px 0' : '10px 12px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', alignItems: 'center',
          justifyContent: rail ? 'center' : undefined, gap: 10,
        }}>
          <RailTip label={user.name} sub={user.email} enabled={rail}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 28, flexShrink: 0,
              background: t.brand[200], color: t.brand[800],
              fontSize: 'calc(11px * var(--fz, 1))', fontWeight: t.weight.semibold,
            }}>{user.name.slice(0, 2).toUpperCase()}</span>
          </RailTip>
          {!rail && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'calc(12.5px * var(--fz, 1))', fontWeight: t.weight.medium, color: t.neutrals.text }}>{user.name}</div>
                <div style={{
                  fontSize: 'calc(10.5px * var(--fz, 1))', color: t.neutrals.subtle,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{user.email}</div>
              </div>
              <button onClick={logout} title="로그아웃" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, color: t.neutrals.subtle, flexShrink: 0,
              }}>
                <LIcon name="logOut" size={14} stroke={1.8} />
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )

  // Desktop: render inline
  if (!mobile) return sidebar

  // Mobile: overlay
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div onClick={e => e.stopPropagation()}>
        {sidebar}
      </div>
    </div>
  )
}
