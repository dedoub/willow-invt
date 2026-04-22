'use client'

import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { key: 'mgmt',   href: '/willow-investment/mgmt',   label: '사업관리',  icon: 'briefcase' },
  { key: 'invest', href: '/willow-investment/invest',  label: '투자관리',  icon: 'trending' },
  { key: 'wiki',   href: '/willow-investment/wiki',    label: '업무위키',  icon: 'book' },
  { key: 'ryuha',  href: '/others/ryuha-study',       label: '류하일정',  icon: 'calendar' },
]

const CLIENTS = [
  { id: 'akros', name: '아크로스자산운용', tag: 'ETF', dot: '#3F93C6' },
  { id: 'tensw', name: '텐소프트웍스',    tag: 'SI',  dot: '#B88A2A' },
  { id: 'monor', name: '모노알',          tag: 'App', dot: '#2F8F5B' },
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
        <GroupLabel label="윌로우인베스트먼트" />
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
