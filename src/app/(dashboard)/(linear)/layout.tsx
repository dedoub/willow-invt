'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
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
  const zoomRef = useRef<HTMLDivElement>(null)

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

  // 모바일 확대는 transform: scale(globals.css .mobile-zoom)로 처리. transform은 레이아웃
  // 높이를 바꾸지 않아 하단이 잘리므로, 늘어난 시각 높이만큼 marginBottom으로 보정.
  useEffect(() => {
    const el = zoomRef.current
    if (!el) return
    const fix = () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches
      if (!isMobile) { el.style.marginBottom = ''; return }
      const visual = el.getBoundingClientRect().height
      const layout = el.offsetHeight
      el.style.marginBottom = `${Math.max(0, Math.round(visual - layout))}px`
    }
    fix()
    const ro = new ResizeObserver(fix)
    ro.observe(el)
    window.addEventListener('resize', fix)
    return () => { ro.disconnect(); window.removeEventListener('resize', fix) }
  }, [pathname])

  const info = PAGE_INFO[pathname] || { group: '윌로우인베스트먼트', title: '' }

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
            title={info.title}
            group={info.group}
            onAgentToggle={() => setChatOpen(v => !v)}
            agentOpen={!!chatOpen}
            mobile={mobile}
            onMenuToggle={() => setMenuOpen(v => !v)}
          />
          <main style={{ flex: 1, overflow: 'auto', padding: mobile ? '16px 12px 24px' : '16px 20px 24px' }}>
            <div ref={zoomRef} className="mobile-zoom">{children}</div>
          </main>
        </div>

        {!mobile && <LinearChatPanel open={!!chatOpen} onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  )
}
