'use client'

import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { key: 'mgmt',   href: '/willow-investment/mgmt',   label: '사업관리',  icon: 'briefcase' },
  { key: 'invest', href: '/willow-investment/invest',  label: '투자관리',  icon: 'trending' },
  { key: 'wiki',   href: '/willow-investment/wiki',    label: '업무위키',  icon: 'book' },
  { key: 'ryuha',  href: '/willow-investment/ryuha',   label: '류하일정',  icon: 'calendar' },
]

const CLIENTS = [
  { id: 'akros', name: '아크로스',      tag: 'Indexing',  dot: '#3F93C6' },
  { id: 'etc',   name: 'ETC',           tag: 'ETF Platform', dot: '#1F4E79' },
  { id: 'tensw', name: '텐소프트웍스',  tag: 'Data & AI', dot: '#B88A2A' },
  { id: 'monor', name: 'MonoR Apps',    tag: 'Education', dot: '#2F8F5B' },
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

interface LinearSidebarProps {
  mobile?: boolean
  open?: boolean
  onClose?: () => void
}

export function LinearSidebar({ mobile, open, onClose }: LinearSidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const sidebar = (
    <aside style={{
      width: 232, background: t.neutrals.page,
      borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0,
      fontFamily: t.font.sans,
      height: mobile ? '100vh' : undefined,
    }}>
      {/* Logo */}
      <div style={{
        height: 52, padding: '0 14px', display: 'flex', alignItems: 'center',
        justifyContent: mobile ? 'space-between' : undefined,
        background: t.brand[800],
      }}>
        <img src="/willow-text.png" alt="willowinvt" style={{ height: 15 }} />
        {mobile && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: t.brand[200],
          }}>
            <LIcon name="x" size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '4px 8px', overflowY: 'auto' }}>
        <GroupLabel label="윌로우인베스트먼트" />
        {NAV_ITEMS.map(n => {
          const isActive = pathname === n.href || pathname.startsWith(n.href + '/')
          return (
            <Link key={n.key} href={n.href} onClick={onClose} style={{
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

        <GroupLabel label="프로젝트" />
        {CLIENTS.map(c => {
          const href = c.id === 'akros' ? '/willow-investment/akros'
            : c.id === 'etc' ? '/willow-investment/etc'
            : c.id === 'tensw' ? '/willow-investment/tensw'
            : c.id === 'monor' ? '/willow-investment/monor'
            : undefined
          const isActive = href ? (pathname === href || pathname.startsWith(href + '/')) : false
          const Wrapper = href ? Link : 'div' as any
          return (
            <Wrapper key={c.id} {...(href ? { href, onClick: onClose } : {})} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
              fontSize: 12.5, color: isActive ? t.brand[700] : t.neutrals.muted, borderRadius: 6,
              cursor: href ? 'pointer' : 'default',
              textDecoration: 'none',
              background: isActive ? t.brand[600] + '14' : 'transparent',
              fontWeight: isActive ? 500 : 400,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: c.dot, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle }}>{c.tag}</span>
            </Wrapper>
          )
        })}
      </nav>

      {/* User */}
      {user && (
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 28, flexShrink: 0,
            background: t.brand[200], color: t.brand[800],
            fontSize: 11, fontWeight: t.weight.semibold,
          }}>{user.name.slice(0, 2).toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: t.weight.medium, color: t.neutrals.text }}>{user.name}</div>
            <div style={{
              fontSize: 10.5, color: t.neutrals.subtle,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{user.email}</div>
          </div>
          <button onClick={logout} title="로그아웃" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, color: t.neutrals.subtle, flexShrink: 0,
          }}>
            <LIcon name="logOut" size={14} stroke={1.8} />
          </button>
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
