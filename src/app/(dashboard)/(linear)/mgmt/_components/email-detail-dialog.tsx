'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'

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
        <div style={{ padding: `${t.density.cardPad}px ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: t.density.gapSm, marginBottom: t.density.gapXs }}>
              <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold, color: t.neutrals.subtle, letterSpacing: 0.6 }}>
                EMAIL
              </span>
              <span style={{
                padding: `1px ${t.density.gapSm}px`, borderRadius: t.radius.sm, fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, fontWeight: t.weight.medium,
                background: isInbound ? '#DCE8F5' : '#DAEEDD',
                color: isInbound ? '#1F4E79' : '#1F5F3D',
              }}>
                {isInbound ? '수신' : '발신'}
              </span>
              {email.category && (
                <span style={{
                  padding: `1px ${t.density.gapSm}px`, borderRadius: t.radius.sm, fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, fontWeight: t.weight.medium,
                  background: t.neutrals.inner, color: t.neutrals.muted,
                }}>
                  {email.category}
                </span>
              )}
            </div>
            <div style={{
              fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontFamily: t.font.sans,
              color: t.neutrals.text, lineHeight: 1.35,
            }}>
              {email.subject || '(제목 없음)'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: t.density.controlHSm, borderRadius: t.radius.sm, flexShrink: 0,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Meta */}
        <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', flexDirection: 'column', gap: t.density.gapXs }}>
          <MetaRow label="From" value={email.fromName ? `${email.fromName} <${email.from}>` : email.from} />
          <MetaRow label="To" value={email.to} />
          <MetaRow label="Date" value={formatDate(email.date)} />
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div style={{ padding: `0 ${t.density.pagePadX}px ${t.density.panelPadX}px`, display: 'flex', flexWrap: 'wrap', gap: t.density.gapSm }}>
            {email.attachments.map((att, i) => (
              <a
                key={i}
                href={`/api/gmail/attachments/${email.id}/${att.attachmentId}?context=${email.gmailContext || 'willow'}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: t.density.gapSm, padding: `${t.density.gapXs}px ${t.density.panelPadX}px`,
                  borderRadius: t.radius.sm, background: t.neutrals.inner, textDecoration: 'none',
                  fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.sans,
                }}
              >
                <LIcon name="paperclip" size={11} stroke={1.8} color={t.neutrals.subtle} />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.filename}
                </span>
                <span style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                  {formatSize(att.size)}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: `0 ${t.density.pagePadX}px ${t.density.cardPad}px`,
        }}>
          <div style={{
            padding: `${t.density.blockGap}px ${t.density.controlPadXMd}px`, borderRadius: t.radius.md, background: t.neutrals.inner,
            fontSize: `calc(${t.type.body}px * var(--fz, 1))`, lineHeight: 1.7, fontFamily: t.font.sans, color: t.neutrals.text,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto',
          }}>
            {email.body || email.snippet || '(내용 없음)'}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: `${t.density.blockGap}px ${t.density.pagePadX}px`, background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', gap: t.density.kpiGap,
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: t.density.kpiGap, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))` }}>
      <span style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, minWidth: 32, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ color: t.neutrals.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}
