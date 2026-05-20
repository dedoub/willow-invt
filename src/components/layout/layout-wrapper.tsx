'use client'

import { useAuth } from '@/lib/auth-context'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const PUBLIC_PATHS = ['/login', '/signup']
const STANDALONE_PATHS = ['/mcp/authorize']

interface LayoutWrapperProps {
  children: React.ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const isPublicPath = PUBLIC_PATHS.includes(pathname)
  const isStandalonePath = STANDALONE_PATHS.includes(pathname)

  useEffect(() => {
    if (!isLoading) {
      if (!user && !isPublicPath && !isStandalonePath) {
        router.push('/login')
      } else if (user && isPublicPath) {
        router.push('/')
      }
    }
  }, [user, isLoading, isPublicPath, isStandalonePath, router])

  if (isStandalonePath) return <>{children}</>

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  if (isPublicPath) return <>{children}</>

  if (!user) return null

  return <>{children}</>
}
