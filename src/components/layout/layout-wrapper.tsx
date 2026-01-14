'use client'

import { useAuth } from '@/lib/auth-context'
import { useI18n } from '@/lib/i18n/context'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

const PUBLIC_PATHS = ['/login', '/signup']

interface LayoutWrapperProps {
  children: React.ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const { user, isLoading } = useAuth()
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isPublicPath = PUBLIC_PATHS.includes(pathname)

  // 경로별 타이틀 매핑 (번역 적용)
  const getPageTitle = (path: string): string | undefined => {
    const titleMap: Record<string, string> = {
      '/etf/etc': t.pageTitles.etcPage,
      '/etf/akros': t.pageTitles.akrosPage,
      '/tensoftworks/active': t.pageTitles.tenswActive,
      '/tensoftworks/managed': t.pageTitles.tenswManaged,
      '/tensoftworks/poc': t.pageTitles.tenswPoc,
      '/tensoftworks/closed': t.pageTitles.tenswClosed,
    }
    return titleMap[path]
  }
  const pageTitle = getPageTitle(pathname)

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!isLoading) {
      if (!user && !isPublicPath) {
        router.push('/login')
      } else if (user && isPublicPath) {
        router.push('/')
      }
    }
  }, [user, isLoading, isPublicPath, router])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  // Public pages (login, signup)
  if (isPublicPath) {
    return <>{children}</>
  }

  // Not authenticated
  if (!user) {
    return null
  }

  // Authenticated - show full layout
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={pageTitle} onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)} />
        <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  )
}
