'use client'

import { useRef, useState } from 'react'
import { t, tonePalettes, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
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
    fontSize: `calc(${t.type.label}px * var(--fz, 1))`,
    color: t.neutrals.subtle,
    marginBottom: t.density.gapSm,
    fontFamily: t.font.mono,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  }

  const panelStyle: React.CSSProperties = {
    background: t.neutrals.inner,
    borderRadius: t.radius.md,
    padding: t.density.blockGap,
  }

  const titleInputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${t.density.blockGap}px ${t.density.controlPadXMd}px`,
    // 모바일은 16px 미만이면 iOS가 포커스 시 자동 확대 → 16px로 고정
    fontSize: mobile ? '16px' : `calc(${t.type.sectionTitle}px * var(--fz, 1))`,
    fontFamily: t.font.sans,
    background: t.neutrals.card,
    borderRadius: t.radius.md,
    border: 'none',
    color: t.neutrals.text,
    outline: 'none',
  }

  return (
    <div style={{
      background: t.neutrals.card,
      borderRadius: t.radius.md,
      padding: mobile ? 12 : 16,
      display: 'flex',
      flexDirection: 'column',
      gap: mobile ? 10 : 12,
      height: 'auto',
      overflowY: 'visible',
      boxSizing: 'border-box',
    }}>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>섹션</div>
        <LSegmented options={SECTIONS} value={section} onChange={setSection} compact />
      </div>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>제목</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="제목 입력"
          style={titleInputStyle}
        />
      </div>

      <div style={{ ...panelStyle, flex: 1, display: 'flex', flexDirection: 'column', minHeight: mobile ? 300 : 220 }}>
        <div style={labelStyle}>본문</div>
        <div style={{ flex: 1, minHeight: mobile ? 260 : 180 }}>
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="내용 입력"
            minHeight={mobile ? '200px' : '280px'}
            className="h-full"
            // 모바일 16px은 iOS 포커스 자동확대 방지용 예외. 데스크톱은 본문 토큰(13px)과 맞춘다.
            editorClassName={mobile ? 'text-[16px] leading-7' : `text-[${t.type.body}px] leading-7`}
          />
        </div>
      </div>

      <div style={{ ...panelStyle, flexShrink: 0 }}>
        <div style={labelStyle}>첨부파일</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap, marginBottom: t.density.kpiGap, flexWrap: 'wrap' }}>
          <LBtn size="sm" variant="secondary" icon={<LIcon name="paperclip" size={12} />}
            onClick={() => fileRef.current?.click()}
            style={{ background: t.neutrals.card }}>
            파일 첨부
          </LBtn>
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
              gap: t.density.gapXs,
              background: t.neutrals.card,
              borderRadius: t.radius.sm,
              padding: `${t.density.gapSm}px ${t.density.panelPadX}px`,
              fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              color: t.neutrals.muted,
                        marginRight: t.density.gapXs,
              marginBottom: t.density.gapXs,
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
                fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
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
              gap: t.density.gapXs,
              background: tonePalettes.brand.bg,
              borderRadius: t.radius.sm,
              padding: `${t.density.gapSm}px ${t.density.panelPadX}px`,
              fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
              color: tonePalettes.brand.fg,
              marginRight: t.density.gapXs,
              marginBottom: t.density.gapXs,
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
                fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`,
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
        gap: t.density.kpiGap,
        paddingTop: t.density.tableRowGap,
      }}>
        {onDelete && (
          <LBtn variant="danger" size="sm" onClick={onDelete}>삭제</LBtn>
        )}
        <div style={{ display: 'flex', gap: t.density.gapSm }}>
          <LBtn variant="secondary" size="sm" onClick={onCancel}>취소</LBtn>
          <LBtn size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
        </div>
      </div>
    </div>
  )
}
