'use client'

import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

export interface FullEmail {
  id: string
  from: string
  fromName?: string
  to: string
  subject: string
  date: string
  body?: string
  snippet?: string
  direction?: 'inbound' | 'outbound'
  category?: string | null
  attachments?: Array<{ filename: string; mimeType: string; size: number; attachmentId: string }>
  unread?: boolean
  sourceLabel?: string        // WILLOW | TENSW | ETC | Akros
  gmailContext?: string       // willow | tensoftworks | default
}

interface EmailDetailDialogProps {
  email: FullEmail | null
  onClose: () => void
  onReply: (email: FullEmail) => void
  onForward: (email: FullEmail) => void
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function EmailDetailDialog({ email, onClose, onReply, onForward }: EmailDetailDialogProps) {
  if (!email) return null

  const isInbound = email.direction !== 'outbound'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 560, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6 }}>
                EMAIL
              </span>
              <span style={{
                padding: '1px 6px', borderRadius: t.radius.sm, fontSize: 9.5, fontWeight: t.weight.medium,
                background: isInbound ? '#DCE8F5' : '#DAEEDD',
                color: isInbound ? '#1F4E79' : '#1F5F3D',
              }}>
                {isInbound ? '수신' : '발신'}
              </span>
              {email.category && (
                <span style={{
                  padding: '1px 6px', borderRadius: t.radius.sm, fontSize: 9.5, fontWeight: t.weight.medium,
                  background: t.neutrals.inner, color: t.neutrals.muted,
                }}>
                  {email.category}
                </span>
              )}
            </div>
            <div style={{
              fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
            }}>
              {email.subject || '(제목 없음)'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Meta */}
        <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <MetaRow label="From" value={email.fromName ? `${email.fromName} <${email.from}>` : email.from} />
          <MetaRow label="To" value={email.to} />
          <MetaRow label="Date" value={formatDate(email.date)} />
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div style={{ padding: '0 20px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {email.attachments.map((att, i) => (
              <a
                key={i}
                href={`/api/gmail/attachments/${email.id}/${att.attachmentId}?context=${email.gmailContext || 'willow'}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                  borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none',
                  fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.sans,
                }}
              >
                <LIcon name="paperclip" size={11} stroke={1.8} color={t.neutrals.subtle} />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.filename}
                </span>
                <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                  {formatSize(att.size)}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 20px 16px',
        }}>
          <div style={{
            padding: '12px 14px', borderRadius: t.radius.md, background: t.neutrals.inner,
            fontSize: 12.5, lineHeight: 1.7, fontFamily: t.font.sans, color: t.neutrals.text,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto',
          }}>
            {email.body || email.snippet || '(내용 없음)'}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={() => { onForward(email); onClose() }}>
            전달
          </LBtn>
          <LBtn variant="secondary" size="sm" onClick={() => { onReply(email); onClose() }}>
            답장
          </LBtn>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
      <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.subtle, minWidth: 32, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}
