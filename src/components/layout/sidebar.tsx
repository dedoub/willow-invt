'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useIsAdmin, useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n'
import {
  LayoutDashboard,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Smartphone,
  Building2,
  MoreHorizontal,
  X,
  BookOpen,
} from 'lucide-react'

interface MenuItem {
  title: string
  href: string
}

interface MenuSection {
  title: string
  icon: React.ReactNode
  items: MenuItem[]
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const isAdmin = useIsAdmin()
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useI18n()
  const [expandedSections, setExpandedSections] = useState<string[]>(['willowInvest', 'etfIndexing', 'monoRApps', 'tenSoftworks', 'others'])

  // Check if user has access to a specific page
  const hasPageAccess = (pagePath: string) => {
    if (!user) return false
    if (user.role === 'admin' || user.permissions.includes('*')) return true
    return user.permissions.includes(pagePath)
  }

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionKey)
        ? prev.filter(k => k !== sectionKey)
        : [...prev, sectionKey]
    )
  }

  const menuSections: (MenuSection & { key: string })[] = [
    {
      key: 'willowInvest',
      title: t.sidebar.willowInvest,
      icon: <Image src="/leaf-icon.png" alt="" width={20} height={20} className="h-5 w-5 brightness-0 invert opacity-70" />,
      items: [
        { title: t.sidebar.willowManagement, href: '/willow-investment/management' },
      ],
    },
    {
      key: 'tenSoftworks',
      title: t.sidebar.tenSoftworks,
      icon: <Image src="/tensw-icon-white.png" alt="" width={20} height={20} className="h-5 w-5 opacity-70" />,
      items: [
        { title: t.sidebar.tenswProjects, href: '/tensoftworks/projects' },
        { title: t.sidebar.tenswManagement, href: '/tensoftworks/management' },
      ],
    },
    {
      key: 'etfIndexing',
      title: t.sidebar.etfIndexing,
      icon: <Image src="/akros-icon.png" alt="" width={20} height={20} className="h-5 w-5 brightness-0 invert opacity-70" />,
      items: [
        { title: t.sidebar.etc, href: '/etf/etc' },
        { title: t.sidebar.akros, href: '/etf/akros' },
      ],
    },
    {
      key: 'monoRApps',
      title: t.sidebar.monoRApps,
      icon: <Image src="/ReviewNotes logo-10.svg" alt="" width={20} height={20} className="h-5 w-5 brightness-0 invert opacity-70" />,
      items: [
        { title: t.sidebar.voiceCards, href: '/monor/voicecards' },
        { title: t.sidebar.reviewNotes, href: '/monor/reviewnotes' },
      ],
    },
    {
      key: 'others',
      title: t.sidebar.others,
      icon: <MoreHorizontal className="h-5 w-5" />,
      items: [
        { title: t.sidebar.ryuhaStudy, href: '/others/ryuha-study' },
      ],
    },
  ]

  const adminItems = [
    {
      title: t.sidebar.users,
      href: '/admin/users',
      icon: <Users className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      title: t.sidebar.uiGuide,
      href: '/admin/ui-guide',
      icon: <BookOpen className="h-5 w-5" />,
      adminOnly: true,
    },
  ]

  return (
    <aside
      className={cn(
        'flex flex-col bg-slate-950 text-white transition-all duration-300 overflow-hidden',
        // Desktop: normal sidebar
        'hidden md:flex',
        collapsed ? 'md:w-16' : 'md:w-64',
        // Mobile: fixed overlay when open
        mobileOpen && 'fixed inset-y-0 left-0 z-50 flex w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center px-4 overflow-hidden",
        collapsed ? "md:justify-center" : "justify-between"
      )}>
        {!collapsed ? (
          <Link href="/" onClick={onMobileClose}>
            <Image src="/willow-text.png" alt="Willow Investments" width={120} height={22} priority />
          </Link>
        ) : (
          <Link href="/" onClick={onMobileClose}>
            <Image src="/leaf-icon.png" alt="Willow" width={28} height={28} priority />
          </Link>
        )}
        {/* Desktop collapse button */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:block rounded p-1.5 hover:bg-slate-800"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="md:hidden rounded p-1.5 hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Collapsed toggle button (desktop only) */}
      {collapsed && (
        <div className="hidden md:flex justify-center p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-1.5 hover:bg-slate-800"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto sidebar-nav">
        {/* Dashboard */}
        <Link
          href="/"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname === '/'
              ? 'bg-brand-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white',
            collapsed && 'justify-center'
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          {!collapsed && <span>{t.sidebar.dashboard}</span>}
        </Link>

        {/* Menu Sections */}
        {menuSections.map((section) => {
          // Filter items based on user permissions
          const accessibleItems = section.items.filter(item => hasPageAccess(item.href))

          // Don't render section if no accessible items
          if (accessibleItems.length === 0) return null

          return (
            <div key={section.key} className="mt-2">
              {collapsed ? (
                <div className="flex justify-center py-2">
                  {section.icon}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection(section.key)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {section.icon}
                      <span>{section.title}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        expandedSections.includes(section.key) && 'rotate-180'
                      )}
                    />
                  </button>
                  {expandedSections.includes(section.key) && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-slate-700 pl-4">
                      {accessibleItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                            pathname === item.href
                              ? 'bg-brand-600 text-white'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          )}
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

        {/* Admin section */}
        {isAdmin && (
          <div className="pt-4 mt-4">
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-slate-400">
                Admin
              </p>
            )}
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  pathname === item.href
                    ? 'bg-brand-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                  collapsed && 'justify-center'
                )}
              >
                {item.icon}
                {!collapsed && <span>{item.title}</span>}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4">
          <p className="text-xs text-slate-500">{t.sidebar.version}</p>
        </div>
      )}
    </aside>
  )
}
