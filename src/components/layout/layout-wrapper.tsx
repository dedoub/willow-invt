'use client'

import { useAuth } from '@/lib/auth-context'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'

const PUBLIC_PATHS = ['/login', '/signup']

// 경로별 타이틀 매핑
const getPageTitle = (pathname: string): string | undefined => {
  const titleMap: Record<string, string> = {
    '/etf/etc': 'ETF/Indexing - ETC',
    '/etf/akros': 'ETF/Indexing - Akros',
  }
  return titleMap[pathname]
}

interface LayoutWrapperProps {
  children: React.ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isPublicPath = PUBLIC_PATHS.includes(pathname)
  const pageTitle = getPageTitle(pathname)

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
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={pageTitle} />
        <main className="flex-1 overflow-auto bg-muted/30 p-6">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  )
}
