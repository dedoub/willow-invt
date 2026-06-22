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

// path → { 그룹, 페이지 } — 상단바 breadcrumb 표시용
const PAGE_INFO: Record<string, { group: string; title: string }> = {
  '/mgmt':       { group: '윌로우인베스트먼트', title: '사업관리' },
  '/invest':     { group: '윌로우인베스트먼트', title: '주식투자' },
  '/realestate': { group: '윌로우인베스트먼트', title: '부동산리서치' },
  '/wiki':       { group: '윌로우인베스트먼트', title: '업무위키' },
  '/ryuha':      { group: '윌로우인베스트먼트', title: '류하일정' },
  '/akros':      { group: '프로젝트', title: '아크로스' },
  '/etc':        { group: '프로젝트', title: 'ETC' },
  '/tensw':      { group: '프로젝트', title: '텐소프트웍스' },
  '/monor':      { group: '프로젝트', title: 'MonoR Apps' },
  '/valuechain': { group: '프로젝트', title: 'ValueChain' },
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
  // localStorage에서 동기적으로 초기화 → 첫 렌더부터 올바른 상태(깜빡임 방지)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('linear-sidebar-open') !== '0'
  })
  // 첫 렌더에는 width 트랜지션을 끄고, 마운트 후 사용자 토글부터 애니메이션
  const [sidebarReady, setSidebarReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('linear-chat-open')
    setChatOpen(saved !== null ? saved === '1' : !narrow)
  }, [])

  useEffect(() => { setSidebarReady(true) }, [])

  useEffect(() => {
    localStorage.setItem('linear-sidebar-open', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  useEffect(() => {
    if (chatOpen === null) return
    localStorage.setItem('linear-chat-open', chatOpen ? '1' : '0')
  }, [chatOpen])
  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const info = PAGE_INFO[pathname] || { group: '윌로우인베스트먼트', title: '' }

  return (
    <div className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      <div style={{
        height: '100vh', background: t.neutrals.page,
        color: t.neutrals.text, fontFamily: t.font.sans,
        display: 'flex', overflow: 'hidden',
      }}>
        {/* Desktop sidebar */}
        {!mobile && <LinearSidebar collapsed={!sidebarOpen} animate={sidebarReady} />}
        {/* Mobile sidebar overlay */}
        {mobile && <LinearSidebar mobile open={menuOpen} onClose={() => setMenuOpen(false)} />}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <LinearHeader
            title={info.title}
            group={info.group}
            onAgentToggle={() => setChatOpen(v => !v)}
            agentOpen={!!chatOpen}
            mobile={mobile}
            onMenuToggle={() => setMenuOpen(v => !v)}
            onSidebarToggle={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
          />
          <main style={{ flex: 1, overflow: 'auto', padding: mobile ? '16px 12px 24px' : '16px 20px 24px' }}>
            {children}
          </main>
        </div>

        {!mobile && <LinearChatPanel open={!!chatOpen} onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  )
}
