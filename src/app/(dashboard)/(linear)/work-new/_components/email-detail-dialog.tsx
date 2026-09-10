'use client'

import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { FigureGrid } from '@/app/(dashboard)/(linear)/mgmt/_components/figure-grid'
import { LBadge } from '@/app/(dashboard)/_components/linear-badge'
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* 껍데기·머리·항목 격자는 사업관리 상세와 같은 문법(2026-09-11) */}
      <LCard pad={0} style={{
        position: 'relative', width: 'min(600px, calc(100vw - 24px))', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* 닫기는 다른 상세 모달과 같은 자리 */}
        <button onClick={onClose} aria-label="닫기" title="닫기" style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted, display: 'flex',
        }}>
          <LIcon name="x" size={14} stroke={2} />
        </button>

        <div style={{ padding: `${t.density.cardPad}px 32px ${t.density.panelPadY}px ${t.density.cardPad}px` }}>
          <LSectionHead title={email.subject || '(제목 없음)'} mb={0} />
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.gapSm}px`, display: 'flex', gap: t.density.gapSm, flexWrap: 'wrap' }}>
          <LBadge palette={isInbound ? { bg: '#E4E7EB', fg: '#2C323A' } : { bg: '#C7CCD3', fg: '#171B21' }}>{isInbound ? '수신' : '발신'}</LBadge>
          {email.category && (
            <LBadge palette={{ bg: '#F5F6F8', fg: '#4B525A' }}>{email.category}</LBadge>
          )}
        </div>

        <div style={{ padding: `0 ${t.density.cardPad}px` }}>
          <FigureGrid cols={2} items={[
            { label: '보낸사람', value: email.fromName ? `${email.fromName} <${email.from}>` : email.from, wrap: true, span: 2 },
            { label: '받는사람', value: email.to, wrap: true },
            { label: '시간', value: formatDate(email.date), mono: true },
          ]} />
        </div>

        {/* Attachments */}
        {email.attachments && email.attachments.length > 0 && (
          <div style={{ padding: `${t.density.gapSm}px ${t.density.cardPad}px 0`, display: 'flex', flexWrap: 'wrap', gap: t.density.gapSm }}>
            {email.attachments.map((att, i) => (
              <a
                key={i}
                href={`/api/gmail/attachments/${email.id}/${att.attachmentId}?context=${email.gmailContext || 'willow'}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: t.density.gapSm, padding: `${t.density.gapXs}px ${t.density.panelPadX}px`,
                  borderRadius: t.radius.sm, background: 'transparent', border: `1px solid ${t.neutrals.line}`, textDecoration: 'none',
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
        <div style={{ overflowY: 'auto', minHeight: 0, padding: `0 ${t.density.cardPad}px` }}>
          <div style={{
            marginTop: t.density.blockGap, paddingTop: t.density.blockGap, borderTop: `1px solid ${t.neutrals.line}`,
            fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, lineHeight: 1.7, fontFamily: t.font.sans, color: t.neutrals.text,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {email.body || email.snippet || '(내용 없음)'}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={() => { onForward(email); onClose() }}>
            전달
          </LBtn>
          <LBtn variant="secondary" size="sm" onClick={() => { onReply(email); onClose() }}>
            답장
          </LBtn>
        </div>
      </LCard>
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
