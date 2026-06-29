'use client'

import { useRef, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { TiptapEditor, htmlToPlainText, plainTextToHtml, sanitizeEditorHtml } from '@/components/ui/tiptap-editor'

type WikiSection = 'memo' | 'akros' | 'etf-etc' | 'willow-mgmt' | 'tensw-mgmt' | 'invest-mgmt'

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
  { value: 'invest-mgmt', label: '투자관리' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
]

export function WikiNoteForm({ onSave, onCancel, initial, onDelete }: WikiNoteFormProps) {
  const mobile = useIsMobile()
  const [section, setSection] = useState<WikiSection>(initial?.section || 'willow-mgmt')
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(() => plainTextToHtml(initial?.content || ''))
  const [existingFiles, setExistingFiles] = useState(initial?.attachments || [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const contentText = htmlToPlainText(content).trim()
  const canSave = (title.trim() || contentText || newFiles.length > 0 || existingFiles.length > 0) && !saving

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
      const normalizedContent = sanitizeEditorHtml(content)
      const finalContent = htmlToPlainText(normalizedContent).trim() ? normalizedContent : ''

      await onSave({
        section,
        title: title.trim(),
        content: finalContent,
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

  const labelStyle: React.CSSProperties = {
    fontSize: 'calc(10.5px * var(--fz, 1))',
    color: t.neutrals.subtle,
    marginBottom: 6,
    fontFamily: t.font.mono,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  }

  const panelStyle: React.CSSProperties = {
    background: t.neutrals.inner,
    borderRadius: t.radius.md,
    padding: 12,
    boxShadow: `inset 0 0 0 1px ${t.neutrals.line}`,
  }

  const titleInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    // 모바일은 16px 미만이면 iOS가 포커스 시 자동 확대 → 16px로 고정
    fontSize: mobile ? '16px' : 'calc(15px * var(--fz, 1))',
    fontFamily: t.font.sans,
    background: t.neutrals.card,
    borderRadius: t.radius.md,
    border: 'none',
    color: t.neutrals.text,
    outline: 'none',
    boxShadow: `inset 0 0 0 1px ${t.neutrals.line}`,
  }

  return (
    <div style={{
      background: t.neutrals.card,
      borderRadius: t.radius.md,
      padding: mobile ? 12 : 16,
      display: 'flex',
      flexDirection: 'column',
      gap: mobile ? 10 : 12,
      height: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.brand[600], fontFamily: t.font.mono, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Wiki Note
        </div>
        <div style={{ fontSize: 'calc(13px * var(--fz, 1))', color: t.neutrals.muted, lineHeight: 1.5 }}>
          제목, 본문, 첨부파일을 한 화면에서 정리해둘 수 있어요.
        </div>
      </div>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>섹션</div>
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
          {SECTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => setSection(s.value)}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '7px 12px',
                fontSize: 'calc(12px * var(--fz, 1))',
                borderRadius: 999,
                fontFamily: t.font.sans,
                fontWeight: section === s.value ? t.weight.medium : t.weight.regular,
                background: section === s.value ? t.neutrals.card : 'transparent',
                color: section === s.value ? t.neutrals.text : t.neutrals.muted,
                boxShadow: section === s.value ? `0 0 0 1px ${t.neutrals.line}` : 'none',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>제목</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="노트 제목을 먼저 적어두세요"
          style={titleInputStyle}
        />
      </div>

      <div style={{ ...panelStyle, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <div style={labelStyle}>본문</div>
          <div style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.muted }}>
            굵게, 제목, 목록까지 바로 쓸 수 있어요
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="핵심 내용, 맥락, 다음 액션까지 편하게 적어두세요..."
            minHeight={mobile ? '200px' : '280px'}
            className="h-full"
            editorClassName={mobile ? 'text-[16px] leading-7' : 'text-[14px] leading-7'}
          />
        </div>
      </div>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>첨부파일</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: t.neutrals.card,
              border: 'none',
              borderRadius: t.radius.sm,
              boxShadow: `inset 0 0 0 1px ${t.neutrals.line}`,
              padding: '7px 10px',
              fontSize: 'calc(12px * var(--fz, 1))',
              color: t.neutrals.muted,
              cursor: 'pointer',
              fontFamily: t.font.sans,
            }}
          >
            <LIcon name="paperclip" size={12} />
            파일 첨부
          </button>
          <span style={{ fontSize: 'calc(11px * var(--fz, 1))', color: t.neutrals.subtle }}>
            계약서, PDF, 이미지 같은 참고자료를 함께 남길 수 있어요
          </span>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = e.target.files
              if (files) {
                setNewFiles(prev => [...prev, ...Array.from(files)])
              }
            }}
          />
        </div>

        {existingFiles.map((f, i) => (
          <div
            key={`ex-${i}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: t.neutrals.card,
              borderRadius: t.radius.sm,
              padding: '5px 9px',
              fontSize: 'calc(11px * var(--fz, 1))',
              color: t.neutrals.muted,
              boxShadow: `inset 0 0 0 1px ${t.neutrals.line}`,
              marginRight: 4,
              marginBottom: 4,
            }}
          >
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button
              onClick={() => removeExistingFile(i)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: t.neutrals.subtle,
                fontSize: 'calc(10px * var(--fz, 1))',
              }}
            >
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}

        {newFiles.map((f, i) => (
          <div
            key={`new-${i}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: tonePalettes.brand.bg,
              borderRadius: t.radius.sm,
              padding: '5px 9px',
              fontSize: 'calc(11px * var(--fz, 1))',
              color: tonePalettes.brand.fg,
              marginRight: 4,
              marginBottom: 4,
            }}
          >
            <LIcon name="file" size={11} />
            <span>{f.name}</span>
            <button
              onClick={() => removeNewFile(i)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: tonePalettes.brand.fg,
                fontSize: 'calc(10px * var(--fz, 1))',
              }}
            >
              <LIcon name="x" size={10} />
            </button>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: onDelete ? 'space-between' : 'flex-end',
        alignItems: 'center',
        gap: 8,
        paddingTop: 2,
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
