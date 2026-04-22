'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtClient } from '@/types/willow-mgmt'

interface AddScheduleDialogProps {
  open: boolean
  defaultDate: string
  clients: WillowMgmtClient[]
  onClose: () => void
  onSave: (data: ScheduleFormData) => Promise<void>
}

export interface ScheduleFormData {
  title: string
  schedule_date: string
  end_date: string
  start_time: string
  end_time: string
  type: 'meeting'
  client_id: string
  description: string
}

const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

export function AddScheduleDialog({ open, defaultDate, clients, onClose, onSave }: AddScheduleDialogProps) {
  const [form, setForm] = useState({
    title: '', schedule_date: defaultDate, end_date: '',
    start_time: '', end_time: '',
    type: 'meeting' as const,
    client_id: '', description: '',
  })
  const [saving, setSaving] = useState(false)

  // Reset when dialog opens with a new date
  const [lastDate, setLastDate] = useState(defaultDate)
  if (defaultDate !== lastDate) {
    setLastDate(defaultDate)
    setForm({ title: '', schedule_date: defaultDate, end_date: '', start_time: '', end_time: '', type: 'meeting' as const, client_id: '', description: '' })
  }

  if (!open) return null

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave(form)
      setForm({ title: '', schedule_date: defaultDate, end_date: '', start_time: '', end_time: '', type: 'meeting' as const, client_id: '', description: '' })
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
        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontFamily: t.font.mono, fontWeight: 600, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 2 }}>
              SCHEDULE
            </div>
            <div style={{ fontSize: 15, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              일정 추가
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

        {/* ── Body ── */}
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

          {/* Client chips */}
          {clients.length > 0 && (
            <div>
              <Label>클라이언트</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <ChipBtn active={!form.client_id} onClick={() => set('client_id', '')}>없음</ChipBtn>
                {clients.map(c => (
                  <ChipBtn key={c.id} active={form.client_id === c.id} onClick={() => set('client_id', c.id)}>
                    {c.name}
                  </ChipBtn>
                ))}
              </div>
            </div>
          )}

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

        {/* ── Footer ── */}
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
