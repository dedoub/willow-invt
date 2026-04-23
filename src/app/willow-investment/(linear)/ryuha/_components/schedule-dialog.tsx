'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
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

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.sans,
    marginBottom: 4, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
    outline: 'none',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.neutrals.card, borderRadius: t.radius.lg,
        width: '100%', maxWidth: 480, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: t.font.sans,
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>
            {schedule ? '일정 수정' : '일정 추가'}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.neutrals.subtle, padding: 4,
          }}>
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="일정 제목" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>시작일 *</label>
              <input type="date" value={form.schedule_date}
                onChange={e => setForm({ ...form, schedule_date: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>종료일</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>시작시간</label>
              <input type="time" value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>종료시간</label>
              <input type="time" value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>유형</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { key: 'school', label: '학교' },
                { key: 'academy', label: '학원' },
                { key: 'homework', label: '과제' },
                { key: 'etc', label: '기타' },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setForm({ ...form, type: key })}
                  style={{
                    padding: '4px 12px', borderRadius: t.radius.pill,
                    border: 'none', cursor: 'pointer',
                    fontSize: 11, fontFamily: t.font.sans,
                    fontWeight: form.type === key ? t.weight.medium : t.weight.regular,
                    background: form.type === key ? t.brand[100] : t.neutrals.inner,
                    color: form.type === key ? t.brand[700] : t.neutrals.muted,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>과목</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setForm({ ...form, subject_id: '', chapter_ids: [] })}
                style={{
                  padding: '3px 8px', borderRadius: t.radius.pill,
                  border: 'none', fontSize: 11, cursor: 'pointer',
                  background: !form.subject_id ? t.brand[100] : t.neutrals.inner,
                  color: !form.subject_id ? t.brand[700] : t.neutrals.muted,
                }}>전체</button>
              {subjects.map(s => (
                <button key={s.id} onClick={() => setForm({ ...form, subject_id: s.id, chapter_ids: [] })}
                  style={{
                    padding: '3px 8px', borderRadius: t.radius.pill,
                    border: 'none', fontSize: 11, cursor: 'pointer',
                    background: form.subject_id === s.id ? `${s.color}25` : t.neutrals.inner,
                    color: form.subject_id === s.id ? s.color : t.neutrals.muted,
                  }}>{s.name}</button>
              ))}
            </div>
          </div>

          {filteredChapters.length > 0 && (
            <div>
              <label style={labelStyle}>단원 연결</label>
              <div style={{
                maxHeight: 120, overflow: 'auto', borderRadius: t.radius.sm,
                background: t.neutrals.inner, padding: 6,
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
                          padding: '2px 4px', cursor: 'pointer', fontSize: 11,
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

          <div>
            <label style={labelStyle}>색상</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setForm({ ...form, color: '' })}
                style={{
                  width: 20, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: t.neutrals.inner,
                  outline: !form.color ? `2px solid ${t.neutrals.muted}` : 'none',
                  outlineOffset: 2,
                }} />
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 20, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: c,
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }} />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>설명</label>
            <textarea value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="설명 (선택)" rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.email_reminder}
              onChange={e => setForm({ ...form, email_reminder: e.target.checked })} />
            이메일 리마인더
          </label>

          {/* Homework items */}
          {form.type === 'homework' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>과제 항목</label>
                <button onClick={() => setForm({
                  ...form,
                  homework_items: [...form.homework_items, { content: '', deadline: form.schedule_date }],
                })} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: t.brand[600], display: 'flex', alignItems: 'center', gap: 2,
                }}>
                  <LIcon name="plus" size={10} stroke={2} /> 추가
                </button>
              </div>
              {form.homework_items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center',
                }}>
                  <input value={item.content}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], content: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    placeholder="과제 내용" style={{ ...inputStyle, flex: 1 }} />
                  <input type="date" value={item.deadline}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], deadline: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    style={{ ...inputStyle, width: 130 }} />
                  <button onClick={() => {
                    setForm({ ...form, homework_items: form.homework_items.filter((_, i) => i !== idx) })
                  }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: t.accent.neg, padding: 2,
                  }}>
                    <LIcon name="x" size={12} stroke={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {schedule && onDelete ? (
            <button onClick={handleDelete} disabled={saving}
              style={{
                padding: '6px 12px', borderRadius: t.radius.sm,
                background: '#FEE2E2', border: 'none', fontSize: 12,
                color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
              }}>삭제</button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose} style={{
              padding: '6px 14px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none', fontSize: 12,
              color: t.neutrals.muted, cursor: 'pointer',
            }}>취소</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              style={{
                padding: '6px 14px', borderRadius: t.radius.sm,
                background: t.brand[600], border: 'none', fontSize: 12,
                color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                opacity: saving || !form.title.trim() ? 0.5 : 1,
              }}>
              {saving ? '저장중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
