'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

/* ── Shared dialog shell ── */
function DialogShell({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void
  children: React.ReactNode; footer: React.ReactNode
}) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.neutrals.card, borderRadius: t.radius.lg,
        width: '100%', maxWidth: 420, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', fontFamily: t.font.sans,
      }}>
        <div style={{
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.neutrals.subtle, padding: 4,
          }}><LIcon name="x" size={16} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {footer}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
  border: 'none', background: t.neutrals.inner,
  fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: t.radius.sm,
  background: t.neutrals.inner, border: 'none', fontSize: 12,
  color: t.neutrals.text, cursor: 'pointer', fontWeight: t.weight.regular,
}
const btnSecondary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: t.radius.sm,
  background: t.neutrals.inner, border: 'none', fontSize: 12,
  color: t.neutrals.muted, cursor: 'pointer', fontWeight: t.weight.regular,
}
const btnDanger: React.CSSProperties = {
  padding: '6px 12px', borderRadius: t.radius.sm,
  background: '#FEE2E2', border: 'none', fontSize: 12,
  color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.regular,
}

const SUBJECT_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#F97316', '#14B8A6']

/* ── Subject Dialog ── */
export interface SubjectDialogProps {
  open: boolean
  subjects: RyuhaSubject[]
  onSave: (data: { id?: string; name: string; color: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export function SubjectDialog({ open, subjects, onSave, onDelete, onClose }: SubjectDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(SUBJECT_COLORS[0])
  const [saving, setSaving] = useState(false)

  const startEdit = (s: RyuhaSubject) => { setEditingId(s.id); setName(s.name); setColor(s.color) }
  const startAdd = () => { setEditingId(null); setName(''); setColor(SUBJECT_COLORS[0]) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ id: editingId || undefined, name: name.trim(), color })
      startAdd()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try { await onDelete(id) } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title="과목 관리" onClose={onClose} footer={
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button onClick={onClose} style={btnSecondary}>닫기</button>
      </div>
    }>
      {/* Subject list */}
      {subjects.map(s => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: t.radius.sm,
          background: editingId === s.id ? t.neutrals.inner : 'transparent',
        }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12 }}>{s.name}</span>
          <button onClick={() => startEdit(s)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: t.neutrals.subtle, padding: 2,
          }}><LIcon name="pencil" size={11} stroke={2} /></button>
          <button onClick={() => handleDelete(s.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: t.accent.neg, padding: 2,
          }}><LIcon name="trash" size={11} stroke={2} /></button>
        </div>
      ))}

      {/* Add/Edit form */}
      <div style={{ borderTop: `1px solid ${t.neutrals.line}`, paddingTop: 12 }}>
        <label style={labelStyle}>{editingId ? '과목 수정' : '새 과목'}</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="과목명" style={{ ...inputStyle, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {SUBJECT_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 18, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
              background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2,
            }} />
          ))}
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {editingId ? '수정' : '추가'}
        </button>
        {editingId && (
          <button onClick={startAdd} style={{ ...btnSecondary, marginLeft: 6 }}>취소</button>
        )}
      </div>
    </DialogShell>
  )
}

/* ── Textbook Dialog ── */
export interface TextbookDialogProps {
  open: boolean
  textbook: RyuhaTextbook | null
  subjects: RyuhaSubject[]
  onSave: (data: { id?: string; subject_id: string; name: string; publisher: string; description: string }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export function TextbookDialog({ open, textbook, subjects, onSave, onDelete, onClose }: TextbookDialogProps) {
  const [subjectId, setSubjectId] = useState('')
  const [name, setName] = useState('')
  const [publisher, setPublisher] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (textbook) {
      setSubjectId(textbook.subject_id); setName(textbook.name)
      setPublisher(textbook.publisher || ''); setDescription(textbook.description || '')
    } else {
      setSubjectId(subjects[0]?.id || ''); setName(''); setPublisher(''); setDescription('')
    }
  }, [open, textbook, subjects])

  const handleSave = async () => {
    if (!name.trim() || !subjectId) return
    setSaving(true)
    try {
      await onSave({ id: textbook?.id, subject_id: subjectId, name: name.trim(), publisher, description })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title={textbook ? '교재 수정' : '교재 추가'} onClose={onClose} footer={
      <>
        {textbook && onDelete ? (
          <button onClick={() => { onDelete(textbook.id); onClose() }} style={btnDanger}>삭제</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>저장</button>
        </div>
      </>
    }>
      <div>
        <label style={labelStyle}>과목 *</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {subjects.map(s => (
            <button key={s.id} onClick={() => setSubjectId(s.id)} style={{
              padding: '3px 8px', borderRadius: t.radius.pill,
              border: 'none', fontSize: 11, cursor: 'pointer',
              background: subjectId === s.id ? `${s.color}25` : t.neutrals.inner,
              color: subjectId === s.id ? s.color : t.neutrals.muted,
            }}>{s.name}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={labelStyle}>교재명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="교재명" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>출판사</label>
        <input value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="출판사" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>설명</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="설명" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
    </DialogShell>
  )
}

/* ── Chapter Dialog ── */
export interface ChapterDialogProps {
  open: boolean
  chapter: RyuhaChapter | null
  textbookId: string
  onSave: (data: { id?: string; textbook_id: string; name: string; description: string; target_date: string }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export function ChapterDialog({ open, chapter, textbookId, onSave, onDelete, onClose }: ChapterDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (chapter) {
      setName(chapter.name); setDescription(chapter.description || '')
      setTargetDate(chapter.target_date || '')
    } else {
      setName(''); setDescription(''); setTargetDate('')
    }
  }, [open, chapter])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ id: chapter?.id, textbook_id: textbookId, name: name.trim(), description, target_date: targetDate })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title={chapter ? '단원 수정' : '단원 추가'} onClose={onClose} footer={
      <>
        {chapter && onDelete ? (
          <button onClick={() => { onDelete(chapter.id); onClose() }} style={btnDanger}>삭제</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>저장</button>
        </div>
      </>
    }>
      <div>
        <label style={labelStyle}>단원명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="단원명" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>목표일</label>
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>설명</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="설명" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
    </DialogShell>
  )
}
