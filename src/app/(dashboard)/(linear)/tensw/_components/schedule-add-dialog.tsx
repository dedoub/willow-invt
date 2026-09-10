'use client'

import { useState, useEffect } from 'react'
import { t, readableOn } from '@/app/(dashboard)/_components/linear-tokens'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { TenswMgmtSchedule, TenswMgmtClient } from '@/types/tensw-mgmt'
import { getScheduleCategory, SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_LABEL, type ScheduleCategory } from '@/lib/tensw-mgmt/schedule-category'

interface ScheduleAddDialogProps {
  open: boolean
  defaultDate: string
  editingSchedule?: TenswMgmtSchedule | null
  clients: TenswMgmtClient[]
  onClose: () => void
  onSave: (data: TenswScheduleFormData) => Promise<void>
  onClientCreated?: () => void
}

export interface TenswScheduleFormData {
  id?: string
  title: string
  schedule_date: string
  end_date: string
  start_time: string
  end_time: string
  type: 'task' | 'meeting' | 'deadline'
  category: ScheduleCategory
  client_id: string
  description: string
}

const TYPE_OPTIONS: { key: 'task' | 'meeting' | 'deadline'; label: string }[] = [
  { key: 'task',     label: '업무' },
  { key: 'meeting',  label: '회의' },
  { key: 'deadline', label: '마감' },
]

const inputBase: React.CSSProperties = {
  width: '100%', padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.inner, color: t.neutrals.text,
  border: 'none', borderRadius: t.radius.sm, outline: 'none',
  boxSizing: 'border-box',
}

function emptyForm(date: string): TenswScheduleFormData {
  return {
    title: '', schedule_date: date, end_date: '',
    start_time: '', end_time: '',
    type: 'task', category: 'other', client_id: '', description: '',
  }
}

function fromSchedule(s: TenswMgmtSchedule): TenswScheduleFormData {
  return {
    id: s.id,
    title: s.title,
    schedule_date: s.schedule_date,
    end_date: s.end_date || '',
    start_time: s.start_time || '',
    end_time: s.end_time || '',
    type: s.type,
    category: getScheduleCategory(s),
    client_id: s.client_id || '',
    description: s.description || '',
  }
}

const CLIENT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

export function ScheduleAddDialog({
  open, defaultDate, editingSchedule, clients, onClose, onSave, onClientCreated,
}: ScheduleAddDialogProps) {
  const isEdit = !!editingSchedule
  const [form, setForm] = useState<TenswScheduleFormData>(emptyForm(defaultDate))
  const [saving, setSaving] = useState(false)
  const [addingClient, setAddingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientColor, setNewClientColor] = useState(CLIENT_COLORS[0])
  const [savingClient, setSavingClient] = useState(false)

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

  const handleAddClient = async () => {
    if (!newClientName.trim()) return
    setSavingClient(true)
    try {
      const res = await fetch('/api/tensw-mgmt/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName.trim(), color: newClientColor, icon: 'briefcase', order_index: clients.length }),
      })
      if (res.ok) {
        const created = await res.json()
        set('client_id', created.id ?? '')
        setAddingClient(false)
        setNewClientName('')
        onClientCreated?.()
      }
    } finally {
      setSavingClient(false)
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
          padding: `${t.density.cardPad}px ${t.density.pagePadX}px ${t.density.blockGap}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold, color: t.neutrals.subtle, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: t.density.tableRowGap }}>
              SCHEDULE
            </div>
            <div style={{ fontSize: `calc(${t.type.sectionTitle}px * var(--fz, 1))`, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {isEdit ? '일정 수정' : '일정 추가'}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: t.density.controlHSm, borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.neutrals.muted,
          }}>
            <LIcon name="x" size={14} stroke={2} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: `0 ${t.density.pagePadX}px ${t.density.cardPad}px`, overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: t.density.gapLg,
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

          {/* Type chips */}
          <div>
            <Label>업무 유형</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: t.density.gapSm }}>
              {TYPE_OPTIONS.map(t_ => (
                <ChipBtn
                  key={t_.key}
                  active={form.type === t_.key}
                  onClick={() => set('type', t_.key)}
                >
                  {t_.label}
                </ChipBtn>
              ))}
            </div>
          </div>

          {/* Category chips */}
          <div>
            <Label>일정 분류</Label>
            <LFilterChip
              options={SCHEDULE_CATEGORIES.map(c => ({ value: c, label: SCHEDULE_CATEGORY_LABEL[c] }))}
              value={form.category}
              onChange={c => set('category', c)}
            />
          </div>

          {/* Client chips */}
          <div>
            <Label>클라이언트</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: t.density.gapSm, alignItems: 'center' }}>
              {/* No client option */}
              <ChipBtn
                active={form.client_id === ''}
                onClick={() => set('client_id', '')}
              >
                없음
              </ChipBtn>
              {clients.map(client => (
                <ChipBtn
                  key={client.id}
                  active={form.client_id === client.id}
                  onClick={() => set('client_id', client.id)}
                  activeStyle={{
                    background: client.color + '20',
                    color: client.color,
                  }}
                >
                  {client.name}
                </ChipBtn>
              ))}
              {/* Add client button */}
              <button
                onClick={() => setAddingClient(true)}
                style={{
                  width: 24, height: 24, borderRadius: t.radius.pill,
                  background: t.neutrals.inner, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: t.neutrals.muted, flexShrink: 0,
                }}
                title="클라이언트 추가"
              >
                <LIcon name="plus" size={11} stroke={2.5} />
              </button>
            </div>
            {/* Inline add client form */}
            {addingClient && (
              <div style={{
                marginTop: t.density.kpiGap, padding: t.density.panelPadX, borderRadius: t.radius.md,
                background: t.neutrals.inner,
                display: 'flex', flexDirection: 'column', gap: t.density.kpiGap,
              }}>
                <input
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="클라이언트명"
                  style={{ ...inputBase, background: t.neutrals.card }}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleAddClient() }}
                />
                <div style={{ display: 'flex', gap: t.density.gapXs }}>
                  {CLIENT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewClientColor(c)}
                      style={{
                        width: 20, height: 20, borderRadius: t.radius.pill,
                        background: c, border: 'none', cursor: 'pointer', padding: 0,
                        // 선택 표시는 outline 대신 안쪽 체크(색 위에서 읽히는 흑/백)
                        color: readableOn(c), fontSize: `calc(${t.type.control}px * var(--fz, 1))`, lineHeight: 1,
                        transform: newClientColor === c ? 'scale(1.15)' : undefined,
                      }}
                    >{newClientColor === c ? '✓' : ''}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: t.density.gapSm, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setAddingClient(false); setNewClientName('') }}
                    style={{
                      padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, borderRadius: t.radius.sm,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: t.neutrals.muted, fontFamily: t.font.sans,
                    }}
                  >취소</button>
                  <button
                    onClick={handleAddClient}
                    disabled={savingClient || !newClientName.trim()}
                    style={{
                      padding: `${t.density.gapXs}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.control}px * var(--fz, 1))`, borderRadius: t.radius.sm,
                      background: t.brand[600], border: 'none', cursor: 'pointer',
                      color: '#fff', fontFamily: t.font.sans, fontWeight: t.weight.regular,
                      opacity: !newClientName.trim() ? 0.5 : 1,
                    }}
                  >{savingClient ? '...' : '추가'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
          padding: `${t.density.blockGap}px ${t.density.pagePadX}px`, background: t.neutrals.inner,
          display: 'flex', justifyContent: 'flex-end', gap: t.density.kpiGap,
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
      fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.medium, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: t.density.gapSm,
    }}>
      {children}{required && <span style={{ color: t.accent.neg, marginLeft: t.density.tableRowGap }}>*</span>}
    </div>
  )
}

function ChipBtn({
  children, active, onClick, activeStyle,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  activeStyle?: React.CSSProperties
}) {
  return (
    <button onClick={onClick} style={{
      border: 'none', cursor: 'pointer',
      padding: `${t.density.gapSm}px ${t.density.blockGap}px`, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, borderRadius: t.radius.pill,
      fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
      background: active ? (activeStyle?.background ?? t.brand[100]) : t.neutrals.inner,
      color: active ? (activeStyle?.color ?? t.brand[700]) : t.neutrals.muted,
      transition: 'all .12s',
    }}>{children}</button>
  )
}
