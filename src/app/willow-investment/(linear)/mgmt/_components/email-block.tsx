'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'

interface EmailItem {
  id: string
  from: string
  subject: string
  date: string
  unread: boolean
}

interface EmailBlockProps {
  emails: EmailItem[]
  connected: boolean
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}분`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간`
  const days = Math.floor(hours / 24)
  return `${days}일`
}

export function EmailBlock({ emails, connected }: EmailBlockProps) {
  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="EMAIL · 모니터링" title="이메일" action={
          <span style={{
            fontSize: 11, fontFamily: t.font.mono,
            color: connected ? t.accent.pos : t.accent.neg,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 3,
              background: connected ? t.accent.pos : t.accent.neg,
            }} />
            {connected ? 'Gmail 연결됨' : '미연결'}
          </span>
        } />
      </div>
      <div>
        {emails.slice(0, 6).map((m) => (
          <div key={m.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 50px',
            gap: 8, padding: '9px 16px', alignItems: 'center',
            borderTop: `1px solid ${t.neutrals.line}`,
            fontSize: 12,
            background: m.unread ? 'transparent' : t.neutrals.inner + '40',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {m.unread && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.brand[600], flexShrink: 0 }} />}
                <span style={{ fontSize: 10.5, color: t.neutrals.muted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.from}</span>
              </div>
              <div style={{
                fontWeight: m.unread ? 500 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{m.subject}</div>
            </div>
            <span style={{
              fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle,
              textAlign: 'right',
            }}>{timeAgo(m.date)} 전</span>
          </div>
        ))}
      </div>
    </LCard>
  )
}
