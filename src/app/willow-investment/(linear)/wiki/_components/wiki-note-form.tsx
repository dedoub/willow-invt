'use client'

import { useState, useRef } from 'react'
import { t, tonePalettes } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

type WikiSection = 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt'

interface WikiNoteFormProps {
  onSave: (data: { section: WikiSection; title: string; content: string; attachments?: { name: string; url: string; size: number; type: string }[] }) => Promise<void>
  onCancel: () => void
  initial?: {
    section: WikiSection
    title: string
    content: string
    attachments?: { name: string; url: string; size: number; type: string }[]
  }
  onDelete?: () => void
}

const SECTIONS: { value: WikiSection; label: string }[] = [
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
]

export function WikiNoteForm({ onSave, onCancel, initial, onDelete }: WikiNoteFormProps) {
  const [section, setSection] = useState<WikiSection>(initial?.section || 'willow-mgmt')
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [existingFiles, setExistingFiles] = useState(initial?.attachments || [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSave = (title.trim() || content.trim() || newFiles.length > 0 || existingFiles.length > 0) && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      let uploadedFiles: { name: string; url: string; size: number; type: string }[] = []
      if (newFiles.length > 0) {
        const formData = new FormData()
        newFiles.forEach(f => formData.append('files', f))
        const res = await fetch('/api/wiki/upload', { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          uploadedFiles = data.files || []
        }
      }
      const allAttachments = [...existingFiles, ...uploadedFiles]
      await onSave({
        section,
        title: title.trim(),
        content: content.trim(),
        attachments: allAttachments.length > 0 ? allAttachments : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  const removeExistingFile = (idx: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const removeNewFile = (idx: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', fontSize: 13, fontFamily: t.font.sans,
    background: t.neutrals.inner, borderRadius: t.radius.sm, border: 'none',
    color: t.neutrals.text, outline: 'none',
  }

  return (
    <div style={{
      background: t.neutrals.card, borderRadius: t.radius.md,
      padding: 14, display: 'flex', flexDirection: 'column',
      height: '100%', boxSizing: 'border-box',
    }}>
      {/* Section selector */}
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 10.5, color: t.neutrals.subtle, marginBottom: 4, fontFamily: t.font.mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          섹션
        </div>
        <div style={{ display: 'inline-flex', background: t.neutrals.inner, borderRadius: t.radius.sm, padding: 2 }}>
          {SECTIONS.map(s => (
            <button key={s.value} onClick={() => setSection(s.value)} style={{
              border: 'none', cursor: 'pointer', padding: '4px 10px', fontSize: 11,
              borderRadius: 4, fontFamily: t.font.sans,
              fontWeight: section === s.value ? t.weight.medium : t.weight.regular,
              background: section === s.value ? t.neutrals.card : 'transparent',
              color: t.neutrals.text,
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="제목"
          style={inputStyle}
        />
      </div>

      {/* Content — fills remaining space */}
      <div style={{ marginBottom: 8, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="내용을 입력하세요..."
          style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, flex: 1 }}
        />
      </div>

      {/* File attachments */}
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button onClick={() => fileRef.current?.click()} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: t.neutrals.inner, border: 'none', borderRadius: t.radius.sm,
            padding: '4px 8px', fontSize: 11, color: t.neutrals.muted,
            cursor: 'pointer', fontFamily: t.font.sans,
          }}>
            <LIcon name="paperclip" size={12} />
            파일 첨부
          </button>
          <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
          />
        </div>
        {existingFiles.map((f, i) => (
          <div key={`ex-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: t.neutrals.inner, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: t.neutrals.muted,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => removeExistingFile(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: t.neutrals.subtle, fontSize: 10,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
        {newFiles.map((f, i) => (
          <div key={`new-${i}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: tonePalettes.brand.bg, borderRadius: t.radius.sm,
            padding: '3px 8px', fontSize: 11, color: tonePalettes.brand.fg,
            marginRight: 4, marginBottom: 4,
          }}>
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button onClick={() => removeNewFile(i)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: tonePalettes.brand.fg, fontSize: 10,
            }}>
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', justifyContent: onDelete ? 'space-between' : 'flex-end',
        alignItems: 'center', gap: 8,
      }}>
        {onDelete && (
          <LBtn variant="danger" size="sm" onClick={onDelete}>삭제</LBtn>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <LBtn variant="secondary" size="sm" onClick={onCancel}>취소</LBtn>
          <LBtn size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
