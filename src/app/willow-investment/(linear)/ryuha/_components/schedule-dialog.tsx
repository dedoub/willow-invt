'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSchedule, RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

interface ScheduleDialogProps {
  open: boolean
  schedule: RyuhaSchedule | null  // null = 추가 모드
  initialDate?: string
  subjects: RyuhaSubject[]
  textbooks: RyuhaTextbook[]
  chapters: RyuhaChapter[]
  onSave: (data: ScheduleFormData) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export interface ScheduleFormData {
  id?: string
  title: string
  description: string
  schedule_date: string
  end_date: string
  start_time: string
  end_time: string
  type: 'school' | 'academy' | 'homework' | 'etc'
  subject_id: string
  chapter_ids: string[]
  color: string
  email_reminder: boolean
  homework_items: { content: string; deadline: string }[]
}

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1']

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

export function ScheduleDialog({
  open, schedule, initialDate, subjects, textbooks, chapters,
  onSave, onDelete, onClose,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleFormData>({
    title: '', description: '', schedule_date: '', end_date: '',
    start_time: '', end_time: '', type: 'etc',
    subject_id: '', chapter_ids: [], color: '',
    email_reminder: false, homework_items: [],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (schedule) {
      setForm({
        id: schedule.id,
        title: schedule.title,
        description: schedule.description || '',
        schedule_date: schedule.schedule_date,
        end_date: schedule.end_date || '',
        start_time: schedule.start_time || '',
        end_time: schedule.end_time || '',
        type: schedule.type,
        subject_id: schedule.subject_id || '',
        chapter_ids: schedule.chapter_ids || [],
        color: schedule.color || '',
        email_reminder: schedule.email_reminder,
        homework_items: schedule.homework_items?.map(h => ({
          content: h.content, deadline: h.deadline,
        })) || [],
      })
    } else {
      setForm({
        title: '', description: '',
        schedule_date: initialDate || '',
        end_date: '', start_time: '', end_time: '',
        type: 'etc', subject_id: '', chapter_ids: [],
        color: '', email_reminder: false, homework_items: [],
      })
    }
  }, [open, schedule, initialDate])

  const handleSave = async () => {
    if (!form.title.trim() || !form.schedule_date) return
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!schedule?.id || !onDelete) return
    setSaving(true)
    try {
      await onDelete(schedule.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const filteredTextbooks = form.subject_id
    ? textbooks.filter(tb => tb.subject_id === form.subject_id)
    : textbooks

  const filteredChapters = chapters.filter(ch =>
    filteredTextbooks.some(tb => tb.id === ch.textbook_id)
  )

  const toggleChapter = (chId: string) => {
    setForm(f => ({
      ...f,
      chapter_ids: f.chapter_ids.includes(chId)
        ? f.chapter_ids.filter(id => id !== chId)
        : [...f.chapter_ids, chId],
    }))
  }

  if (!open) return null

  const isEdit = !!schedule

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 440, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: t.font.sans,
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              SCHEDULE
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {isEdit ? '일정 수정' : '일정 추가'}
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
        <div style={{
          padding: '0 20px 16px', overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Title */}
          <div>
            <Label required>제목</Label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="일정 제목을 입력하세요" style={inputBase} autoFocus />
          </div>

          {/* Type chips */}
          <div>
            <Label>유형</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {([
                { key: 'school', label: '학교' },
                { key: 'academy', label: '학원' },
                { key: 'homework', label: '과제' },
                { key: 'etc', label: '기타' },
              ] as const).map(({ key, label }) => (
                <ChipBtn key={key} active={form.type === key} onClick={() => setForm({ ...form, type: key })}>
                  {label}
                </ChipBtn>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label required>시작일</Label>
              <input type="date" value={form.schedule_date}
                onChange={e => setForm({ ...form, schedule_date: e.target.value })}
                style={inputBase} />
            </div>
            <div>
              <Label>종료일</Label>
              <input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                style={inputBase} />
            </div>
          </div>

          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>시작 시간</Label>
              <input type="time" value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
                style={inputBase} />
            </div>
            <div>
              <Label>종료 시간</Label>
              <input type="time" value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                style={inputBase} />
            </div>
          </div>

          {/* Subject chips */}
          <div>
            <Label>과목</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <ChipBtn active={!form.subject_id} onClick={() => setForm({ ...form, subject_id: '', chapter_ids: [] })}>
                전체
              </ChipBtn>
              {subjects.map(s => (
                <button key={s.id} onClick={() => setForm({ ...form, subject_id: s.id, chapter_ids: [] })}
                  style={{
                    border: 'none', cursor: 'pointer',
                    padding: '5px 12px', fontSize: 12, borderRadius: t.radius.pill,
                    fontFamily: t.font.sans, fontWeight: form.subject_id === s.id ? t.weight.medium : t.weight.regular,
                    background: form.subject_id === s.id ? `${s.color}25` : t.neutrals.inner,
                    color: form.subject_id === s.id ? s.color : t.neutrals.muted,
                    transition: 'all .12s',
                  }}>{s.name}</button>
              ))}
            </div>
          </div>

          {/* Chapters */}
          {filteredChapters.length > 0 && (
            <div>
              <Label>단원 연결</Label>
              <div style={{
                maxHeight: 120, overflow: 'auto', borderRadius: t.radius.sm,
                background: t.neutrals.inner, padding: 8,
              }}>
                {filteredTextbooks.map(tb => {
                  const tbChapters = filteredChapters.filter(ch => ch.textbook_id === tb.id)
                  if (tbChapters.length === 0) return null
                  return (
                    <div key={tb.id} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: t.weight.medium, color: t.neutrals.subtle, marginBottom: 2 }}>
                        {tb.name}
                      </div>
                      {tbChapters.map(ch => (
                        <label key={ch.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '3px 4px', cursor: 'pointer', fontSize: 12,
                        }}>
                          <input type="checkbox" checked={form.chapter_ids.includes(ch.id)}
                            onChange={() => toggleChapter(ch.id)} />
                          {ch.name}
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Color */}
          <div>
            <Label>색상</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setForm({ ...form, color: '' })}
                style={{
                  width: 22, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: t.neutrals.inner,
                  outline: !form.color ? `2px solid ${t.neutrals.muted}` : 'none',
                  outlineOffset: 2,
                }} />
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 22, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: c,
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }} />
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>설명</Label>
            <textarea value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="상세 내용 (선택)" rows={3}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }} />
          </div>

          {/* Email reminder */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: t.neutrals.text }}>
            <input type="checkbox" checked={form.email_reminder}
              onChange={e => setForm({ ...form, email_reminder: e.target.checked })} />
            이메일 리마인더
          </label>

          {/* Homework items */}
          {form.type === 'homework' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <Label>과제 항목</Label>
                <button onClick={() => setForm({
                  ...form,
                  homework_items: [...form.homework_items, { content: '', deadline: form.schedule_date }],
                })} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: t.brand[600], display: 'flex', alignItems: 'center', gap: 3,
                  fontFamily: t.font.sans,
                }}>
                  <LIcon name="plus" size={11} stroke={2} /> 추가
                </button>
              </div>
              {form.homework_items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center',
                }}>
                  <input value={item.content}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], content: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    placeholder="과제 내용" style={{ ...inputBase, flex: 1 }} />
                  <input type="date" value={item.deadline}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], deadline: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    style={{ ...inputBase, width: 140 }} />
                  <button onClick={() => {
                    setForm({ ...form, homework_items: form.homework_items.filter((_, i) => i !== idx) })
                  }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: t.accent.neg, padding: 2,
                  }}>
                    <LIcon name="x" size={13} stroke={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: isEdit ? 'space-between' : 'flex-end', alignItems: 'center', gap: 8,
        }}>
          {isEdit && onDelete && (
            <LBtn variant="danger" size="sm" onClick={handleDelete} disabled={saving}>삭제</LBtn>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
            <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: 5,
    }}>
      {children}{required && <span style={{ color: t.accent.neg, marginLeft: 2 }}>*</span>}
    </div>
  )
}

function ChipBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      border: 'none', cursor: 'pointer',
      padding: '5px 12px', fontSize: 12, borderRadius: t.radius.pill,
      fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
      background: active ? t.brand[100] : t.neutrals.inner,
      color: active ? t.brand[700] : t.neutrals.muted,
      transition: 'all .12s',
    }}>{children}</button>
  )
}
