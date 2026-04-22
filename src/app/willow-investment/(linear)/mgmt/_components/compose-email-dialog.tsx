'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { FullEmail } from './email-detail-dialog'

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeEmailDialogProps {
  open: boolean
  mode: ComposeMode
  originalEmail?: FullEmail | null
  gmailContext?: string
  onClose: () => void
  onSent: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function buildSubject(mode: ComposeMode, orig?: FullEmail | null) {
  if (!orig) return ''
  const s = orig.subject || ''
  if (mode === 'reply' || mode === 'replyAll') return s.startsWith('Re:') ? s : `Re: ${s}`
  if (mode === 'forward') return s.startsWith('Fwd:') ? s : `Fwd: ${s}`
  return ''
}

function buildTo(mode: ComposeMode, orig?: FullEmail | null) {
  if (!orig) return ''
  if (mode === 'reply' || mode === 'replyAll') return orig.from || ''
  return ''
}

function buildBody(mode: ComposeMode, orig?: FullEmail | null) {
  if (!orig) return ''
  const header = `\n\n--- Original Message ---\nFrom: ${orig.from}\nDate: ${orig.date}\nSubject: ${orig.subject}\n\n`
  return header + (orig.body || orig.snippet || '')
}

export function ComposeEmailDialog({ open, mode, originalEmail, gmailContext, onClose, onSent }: ComposeEmailDialogProps) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setTo(buildTo(mode, originalEmail))
    setCc('')
    setSubject(buildSubject(mode, originalEmail))
    setBody(mode === 'new' ? '' : buildBody(mode, originalEmail))
    setFiles([])
  }, [open, mode, originalEmail])

  if (!open) return null

  const title = mode === 'reply' ? '답장' : mode === 'replyAll' ? '전체 답장' : mode === 'forward' ? '전달' : '새 이메일'

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) return
    setSending(true)
    try {
      const form = new FormData()
      form.append('to', to)
      form.append('subject', subject)
      form.append('body', body)
      if (cc) form.append('cc', cc)
      for (const f of files) form.append('attachments', f)

      const ctx = gmailContext || originalEmail?.gmailContext || 'willow'
      const res = await fetch(`/api/gmail/send?context=${ctx}`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Send failed')
      onSent()
      onClose()
    } catch (err) {
      console.error('Send error:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <div style={{
        position: 'relative', width: 520, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 }}>
              COMPOSE
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {title}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '0 20px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Label required>받는 사람</Label>
            <input value={to} onChange={e => setTo(e.target.value)} placeholder="email@example.com" style={inputStyle} autoFocus />
          </div>
          <div>
            <Label>참조 (CC)</Label>
            <input value={cc} onChange={e => setCc(e.target.value)} placeholder="선택" style={inputStyle} />
          </div>
          <div>
            <Label required>제목</Label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="제목" style={inputStyle} />
          </div>
          <div>
            <Label>본문</Label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              rows={8}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontFamily: t.font.mono, fontSize: 12 }}
            />
          </div>

          {/* File attach */}
          <div>
            <Label>첨부파일</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {files.map((f, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                  borderRadius: t.radius.sm, background: t.neutrals.inner, fontSize: 11, color: t.neutrals.muted,
                }}>
                  <LIcon name="file" size={10} stroke={1.8} color={t.neutrals.subtle} />
                  <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: t.neutrals.subtle,
                    display: 'flex', alignItems: 'center',
                  }}>
                    <LIcon name="x" size={9} stroke={2.5} />
                  </button>
                </span>
              ))}
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                borderRadius: t.radius.sm, background: t.neutrals.inner, fontSize: 11,
                color: t.neutrals.subtle, cursor: 'pointer',
              }}>
                <LIcon name="plus" size={10} stroke={2} />
                파일 추가
                <input type="file" multiple style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', background: t.neutrals.inner, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSend} disabled={sending || !to.trim() || !subject.trim()}>
            {sending ? '전송 중...' : '전송'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle, fontFamily: t.font.sans, marginBottom: 5 }}>
      {children}{required && <span style={{ color: t.accent.neg, marginLeft: 2 }}>*</span>}
    </div>
  )
}
