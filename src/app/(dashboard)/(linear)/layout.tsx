'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Inter as InterTight } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LinearSidebar } from '@/app/(dashboard)/_components/linear-sidebar'
import { LinearHeader } from '@/app/(dashboard)/_components/linear-header'
import { LinearChatPanel } from '@/app/(dashboard)/_components/linear-chat-panel'

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

const PAGE_TITLES: Record<string, string> = {
  '/mgmt': '사업관리',
  '/invest': '투자관리',
  '/wiki': '업무위키',
  '/ryuha': '류하일정',
  '/tensw': '텐소프트웍스',
  '/monor': 'MonoR Apps',
}

const PAGE_SUBTITLES: Record<string, string> = {
  '/tensw': 'AI 서비스에 필요한 데이터 구축 및 관리 솔루션 — 연 매출 100억 목표',
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

export default function LinearRouteLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const narrow = useNarrow()
  const mobile = useIsMobile()
  const [chatOpen, setChatOpen] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('linear-chat-open')
    setChatOpen(saved !== null ? saved === '1' : !narrow)
  }, [])

  useEffect(() => {
    if (chatOpen === null) return
    localStorage.setItem('linear-chat-open', chatOpen ? '1' : '0')
  }, [chatOpen])
  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const title = PAGE_TITLES[pathname] || ''
  const subtitle = PAGE_SUBTITLES[pathname] || ''

  return (
    <div className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      <div style={{
        height: '100vh', background: t.neutrals.page,
        color: t.neutrals.text, fontFamily: t.font.sans,
        display: 'flex', overflow: 'hidden',
      }}>
        {/* Desktop sidebar */}
        {!mobile && <LinearSidebar />}
        {/* Mobile sidebar overlay */}
        {mobile && <LinearSidebar mobile open={menuOpen} onClose={() => setMenuOpen(false)} />}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <LinearHeader
            title={title}
            subtitle={subtitle}
            onAgentToggle={() => setChatOpen(v => !v)}
            agentOpen={!!chatOpen}
            mobile={mobile}
            onMenuToggle={() => setMenuOpen(v => !v)}
          />
          <main style={{ flex: 1, overflow: 'auto', padding: mobile ? '0 12px 24px' : '0 20px 24px' }}>
            {children}
          </main>
        </div>

        {!mobile && <LinearChatPanel open={!!chatOpen} onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  )
}
