'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useHasPageAccess } from '@/lib/auth-context'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface ProtectedPageProps {
  children: React.ReactNode
  pagePath?: string // Override the current path if needed
}

export function ProtectedPage({ children, pagePath }: ProtectedPageProps) {
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pagePath || pathname
  const { hasAccess, isLoading } = useHasPageAccess(currentPath)
  const { t } = useI18n()

  useEffect(() => {
    // Only redirect after loading is complete and access is denied
    if (!isLoading && !hasAccess) {
      // Small delay to show the access denied message before redirect
      const timer = setTimeout(() => {
        router.push('/')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isLoading, hasAccess, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">{t.common.accessDenied}</h2>
            <p className="text-muted-foreground mb-4">{t.common.noPageAccess}</p>
            <Button onClick={() => router.push('/')} variant="outline">
              {t.common.backToDashboard}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
