'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Inter as InterTight } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LinearSidebar } from '@/app/willow-investment/_components/linear-sidebar'
import { LinearHeader } from '@/app/willow-investment/_components/linear-header'
import { LinearChatPanel } from '@/app/willow-investment/_components/linear-chat-panel'

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
  '/willow-investment/mgmt': '사업관리',
  '/willow-investment/invest': '투자관리',
  '/willow-investment/wiki': '업무위키',
  '/willow-investment/ryuha': '류하일정',
  '/willow-investment/tensw': '텐소프트웍스',
  '/willow-investment/monor': 'MonoR Apps',
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
  const [chatOpen, setChatOpen] = useState(!narrow)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setChatOpen(!narrow) }, [narrow])
  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const title = PAGE_TITLES[pathname] || ''

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
            onAgentToggle={() => setChatOpen(v => !v)}
            agentOpen={chatOpen}
            mobile={mobile}
            onMenuToggle={() => setMenuOpen(v => !v)}
          />
          <main style={{ flex: 1, overflow: 'auto', padding: mobile ? '0 12px 24px' : '0 20px 24px' }}>
            {children}
          </main>
        </div>

        {!mobile && <LinearChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  )
}
