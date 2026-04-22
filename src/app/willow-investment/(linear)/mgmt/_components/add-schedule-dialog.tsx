'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule } from '@/types/willow-mgmt'

interface AddScheduleDialogProps {
  open: boolean
  defaultDate: string
  editingSchedule?: WillowMgmtSchedule | null
  onClose: () => void
  onSave: (data: ScheduleFormData) => Promise<void>
}

export interface ScheduleFormData {
  id?: string
  title: string
  schedule_date: string
  end_date: string
  start_time: string
  end_time: string
  type: 'meeting'
  category: string
  description: string
}

const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'willow-mgmt', label: '윌로우' },
  { key: 'tensw-mgmt', label: '텐소프트웍스' },
  { key: 'etf-etc', label: 'ETC' },
  { key: 'akros', label: '아크로스' },
  { key: 'other', label: '기타' },
]

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(date: string): ScheduleFormData {
  return { title: '', schedule_date: date, end_date: '', start_time: '', end_time: '', type: 'meeting', category: 'willow-mgmt', description: '' }
}

function fromSchedule(s: WillowMgmtSchedule): ScheduleFormData {
  return {
    id: s.id,
    title: s.title,
    schedule_date: s.schedule_date,
    end_date: s.end_date || '',
    start_time: s.start_time || '',
    end_time: s.end_time || '',
    type: 'meeting',
    category: s.category || 'willow-mgmt',
    description: s.description || '',
  }
}

export function AddScheduleDialog({ open, defaultDate, editingSchedule, onClose, onSave }: AddScheduleDialogProps) {
  const isEdit = !!editingSchedule
  const [form, setForm] = useState<ScheduleFormData>(emptyForm(defaultDate))
  const [saving, setSaving] = useState(false)

  // Sync form when dialog opens/changes
  useEffect(() => {
    if (!open) return
    if (editingSchedule) {
      setForm(fromSchedule(editingSchedule))
    } else {
      setForm(emptyForm(defaultDate))
    }
  }, [open, editingSchedule, defaultDate])

  if (!open) return null

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 440, maxHeight: '85vh',
        background: t.neutrals.card, borderRadius: t.radius.lg + 2,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
            <input
              value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="일정 제목을 입력하세요"
              style={inputBase} autoFocus
            />
          </div>

          {/* Category chips */}
          <div>
            <Label>유형</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CATEGORY_OPTIONS.map(c => (
                <ChipBtn key={c.key} active={form.category === c.key} onClick={() => set('category', c.key)}>
                  {c.label}
                </ChipBtn>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>시작일</Label>
              <input type="date" value={form.schedule_date} onChange={e => set('schedule_date', e.target.value)} style={inputBase} />
            </div>
            <div>
              <Label>종료일</Label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={inputBase} />
            </div>
          </div>

          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>시작 시간</Label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} style={inputBase} />
            </div>
            <div>
              <Label>종료 시간</Label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} style={inputBase} />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label>설명</Label>
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="상세 내용 (선택)"
              rows={3}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? '저장 중...' : '저장'}
          </LBtn>
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
