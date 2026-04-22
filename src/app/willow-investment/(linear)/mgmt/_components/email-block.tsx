'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { FullEmail } from './email-detail-dialog'

interface EmailBlockProps {
  emails: FullEmail[]
  connected: boolean
  onSelectEmail: (email: FullEmail) => void
  onSync: () => void
  onCompose: () => void
  isSyncing?: boolean
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

function ActionBtn({ icon, label, onClick, spinning, disabled }: {
  icon: string; label: string; onClick: () => void; spinning?: boolean; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || spinning}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', borderRadius: t.radius.sm,
        background: t.neutrals.inner, border: 'none',
        fontSize: 10, fontFamily: t.font.sans, fontWeight: 500,
        color: disabled ? t.neutrals.subtle : t.neutrals.muted,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <LIcon name={spinning ? 'loader' : icon} size={11} stroke={2}
        className={spinning ? 'spin' : undefined} />
      {label}
    </button>
  )
}

export function EmailBlock({
  emails, connected, onSelectEmail, onSync, onCompose, isSyncing,
}: EmailBlockProps) {
  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="EMAIL · WILLOW" title="이메일" action={
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

      {/* Action buttons */}
      {connected && (
        <div style={{
          padding: '0 16px 10px', display: 'flex', gap: 4, flexWrap: 'wrap',
        }}>
          <ActionBtn icon="refresh" label="동기화" onClick={onSync} spinning={isSyncing} />
          <div style={{ flex: 1 }} />
          <ActionBtn icon="send" label="이메일 작성" onClick={onCompose} />
        </div>
      )}

      {/* Email list */}
      <div>
        {emails.slice(0, 8).map((m) => (
          <div
            key={m.id}
            onClick={() => onSelectEmail(m)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 50px',
              gap: 8, padding: '9px 16px', alignItems: 'center',
              borderTop: `1px solid ${t.neutrals.line}`,
              fontSize: 12, cursor: 'pointer',
              background: m.unread ? 'transparent' : t.neutrals.inner + '40',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {m.unread && <span style={{ width: 5, height: 5, borderRadius: 3, background: t.brand[600], flexShrink: 0 }} />}
                {m.direction === 'outbound' && (
                  <span style={{
                    fontSize: 8.5, fontFamily: t.font.mono, fontWeight: 600,
                    padding: '0 4px', borderRadius: 2,
                    background: '#DAEEDD', color: '#1F5F3D',
                  }}>발신</span>
                )}
                <span style={{
                  fontSize: 10.5, color: t.neutrals.muted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {m.fromName || m.from.replace(/<.*>/, '').trim() || m.from}
                </span>
                {m.category && (
                  <span style={{
                    fontSize: 8.5, fontFamily: t.font.mono,
                    padding: '0 4px', borderRadius: 2,
                    background: t.neutrals.inner, color: t.neutrals.subtle,
                    flexShrink: 0,
                  }}>{m.category}</span>
                )}
              </div>
              <div style={{
                fontWeight: m.unread ? 500 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{m.subject || '(제목 없음)'}</div>
            </div>
            <span style={{
              fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle,
              textAlign: 'right',
            }}>{timeAgo(m.date)} 전</span>
          </div>
        ))}
        {emails.length === 0 && connected && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>이메일이 없습니다</div>
        )}
        {!connected && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>Gmail 연결이 필요합니다</div>
        )}
      </div>
    </LCard>
  )
}
