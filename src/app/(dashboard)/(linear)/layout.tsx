'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Inter as InterTight } from 'next/font/google'
import { JetBrains_Mono } from 'next/font/google'
import { t, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LinearSidebar } from '@/app/(dashboard)/_components/linear-sidebar'
import { LinearHeader } from '@/app/(dashboard)/_components/linear-header'
import { MonorColsToggle, ValuechainColsToggle } from '@/app/(dashboard)/(linear)/monor/_components/cols-toggle'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'

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
  '/valuechain': { group: '프로젝트', title: 'LLM Wiki' },
}

export default function LinearRouteLayout({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const mobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)
  // localStorage에서 동기적으로 초기화 → 첫 렌더부터 올바른 상태(깜빡임 방지)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('linear-sidebar-open') !== '0'
  })
  // 첫 렌더에는 width 트랜지션을 끄고, 마운트 후 사용자 토글부터 애니메이션
  const [sidebarReady, setSidebarReady] = useState(false)

  useEffect(() => { setSidebarReady(true) }, [])

  // Windows/테슬라 등 국기 이모지 미지원 브라우저에 Twemoji 국기 폰트 주입 (지원 브라우저엔 no-op).
  // 폰트는 자체 호스팅(/fonts) — CDN 차단/불안정한 인카 브라우저(테슬라)에서도 동일 오리진으로 안정 로드.
  useEffect(() => { polyfillCountryFlagEmojis('Twemoji Country Flags', '/fonts/TwemojiCountryFlags.woff2') }, [])

  useEffect(() => {
    localStorage.setItem('linear-sidebar-open', sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const info = PAGE_INFO[pathname] || { group: '윌로우인베스트먼트', title: '' }

  return (
    <div className={`${interTight.variable} ${jetbrainsMono.variable}`}>
      {/* 키보드 포커스 링 (접근성) — 마우스 클릭엔 안 뜨고 키보드 탐색 시에만 */}
      <style dangerouslySetInnerHTML={{ __html: `
        :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #166A97;outline-offset:1px;}
        :where(a,button,input,select,textarea,[tabindex]):focus:not(:focus-visible){outline:none;}
      ` }} />
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
            mobile={mobile}
            onMenuToggle={() => setMenuOpen(v => !v)}
            onSidebarToggle={() => setSidebarOpen(v => !v)}
            sidebarOpen={sidebarOpen}
            actions={!mobile && pathname === '/monor' ? <MonorColsToggle />
              : !mobile && pathname === '/valuechain' ? <ValuechainColsToggle />
              : undefined}
          />
          <main style={{ flex: 1, overflow: 'auto', padding: mobile ? '16px 12px 24px' : '16px 20px 24px' }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
