'use client'

import { useState, useEffect, ReactNode } from 'react'
import { t } from './linear-tokens'
import { LinearSidebar } from './linear-sidebar'
import { LinearHeader } from './linear-header'
import { LinearChatPanel } from './linear-chat-panel'

interface LinearLayoutProps {
  title: string
  children: ReactNode
  headerActions?: ReactNode
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

const CHAT_OPEN_KEY = 'linear-chat-open'

export function LinearLayout({ title, children, headerActions }: LinearLayoutProps) {
  const narrow = useNarrow()
  const [chatOpen, setChatOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(CHAT_OPEN_KEY)
    if (saved !== null) setChatOpen(saved === '1')
    else setChatOpen(!window.matchMedia('(max-width: 1180px)').matches)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(CHAT_OPEN_KEY, chatOpen ? '1' : '0')
  }, [chatOpen, mounted])

  return (
    <div style={{
      height: '100vh', background: t.neutrals.page,
      color: t.neutrals.text, fontFamily: t.font.sans,
      display: 'flex', overflow: 'hidden',
    }}>
      <LinearSidebar />

      {/* Main column: header + content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <LinearHeader
          title={title}
          onAgentToggle={() => setChatOpen(v => !v)}
          agentOpen={chatOpen}
          actions={headerActions}
        />
        <main style={{ flex: 1, overflow: 'auto', padding: '0 20px 24px' }}>
          {children}
        </main>
      </div>

      {/* Agent panel: full height from top to bottom */}
      <LinearChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
