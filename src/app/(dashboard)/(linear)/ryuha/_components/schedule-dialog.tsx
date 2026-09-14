'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { RyuhaSchedule } from '@/types/ryuha'

interface ScheduleDialogProps {
  open: boolean
  schedule: RyuhaSchedule | null  // null = 추가 모드
  initialDate?: string
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
  type: 'school' | 'academy' | 'arts' | 'homework' | 'etc'
  color: string
  email_reminder: boolean
  homework_items: { content: string; deadline: string }[]
}

// 날짜·시간 칸은 테마의 input 규칙(text·search 만 잡는다)이 닿지 않아 여기서 직접 맞춘다.
const inputBase: React.CSSProperties = {
  width: '100%', padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, fontSize: `calc(${t.type.body}px * var(--fz, 1))`,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.card, color: t.neutrals.text,
  border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.md, outline: 'none',
  boxSizing: 'border-box',
}

export function ScheduleDialog({
  open, schedule, initialDate,
  onSave, onDelete, onClose,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleFormData>({
    title: '', description: '', schedule_date: '', end_date: '',
    start_time: '', end_time: '', type: 'etc',
    color: '',
    email_reminder: false, homework_items: [],
  })
  const [saving, setSaving] = useState(false)
  const [copyMode, setCopyMode] = useState(false)

  useEffect(() => {
    if (!open) {
      setCopyMode(false)
      return
    }
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
        type: 'etc',
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

  const handleCopy = () => {
    setForm(f => ({ ...f, id: undefined, title: f.title ? `${f.title} (복사)` : '' }))
    setCopyMode(true)
  }

  if (!open) return null

  const isEdit = !!schedule && !copyMode
  const headerLabel = isEdit ? '일정 수정' : copyMode ? '일정 복사' : '일정 추가'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      {/* 카드에서 열린 창이라 카드와 같은 껍데기를 쓴다 — 사업관리 일정 추가 창과 같은 축 */}
      <LCard pad={0} style={{
        position: 'relative', width: 440, maxWidth: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={headerLabel}
            action={
              <button onClick={onClose} title="닫기" style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
                display: 'flex', alignItems: 'center',
              }}>
                <LIcon name="x" size={14} stroke={2} />
              </button>
            }
            mb={0}
          />
        </div>

        {/* Body */}
        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`, overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
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
            <LFilterChip
              options={[
                { value: 'school', label: '학교' },
                { value: 'academy', label: '학원' },
                { value: 'arts', label: '예체능' },
                { value: 'homework', label: '과제' },
                { value: 'etc', label: '기타' },
              ] as const}
              value={form.type}
              onChange={key => setForm({ ...form, type: key })}
              gap={t.density.gapXs}
            />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
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

          {/* 색 고르기는 뺐다 — 일정 분류를 회색 명도로 읽게 바꾸면서(카드 문법)
              고른 색을 그리는 자리가 더 없다. 아무것도 칠하지 않는 고르개는 고장으로 읽힌다.
              form.color 는 빈 값으로 남아 저장되고, 컬럼과 에이전트 인자는 그대로 둔다. */}

          {/* Description */}
          <div>
            <Label>설명</Label>
            <textarea value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="상세 내용 (선택)" rows={3}
              style={{ ...inputBase, resize: 'vertical' as const, lineHeight: 1.5 }} />
          </div>

          {/* Email reminder */}
          <label style={{ display: 'flex', alignItems: 'center', gap: t.density.kpiGap, fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, cursor: 'pointer', color: t.neutrals.text }}>
            <input type="checkbox" checked={form.email_reminder}
              onChange={e => setForm({ ...form, email_reminder: e.target.checked })} />
            이메일 리마인더
          </label>

          {/* Homework items */}
          {form.type === 'homework' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: t.density.gapSm }}>
                <Label>과제 항목</Label>
                <LBtn size="sm" variant="ghost" icon={<LIcon name="plus" size={11} stroke={2} />}
                  onClick={() => setForm({
                    ...form,
                    homework_items: [...form.homework_items, { content: '', deadline: form.schedule_date }],
                  })}>
                  추가
                </LBtn>
              </div>
              {form.homework_items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: t.density.kpiGap, marginBottom: t.density.kpiGap, alignItems: 'center',
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
                  }} title="과제 삭제" style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: t.neutrals.muted, padding: t.density.tableRowGap,
                  }}>
                    <LIcon name="x" size={13} stroke={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer — 회색 띠 대신 선 한 겹. 삭제만 붉게, 저장만 강조색(테마가 정한다) */}
        <div data-card-foot="" style={{
          display: 'flex', alignItems: 'center', gap: t.density.gapSm,
          justifyContent: isEdit ? 'space-between' : 'flex-end',
          margin: `0 ${t.density.cardPad}px`, paddingTop: t.density.panelPadY,
          paddingBottom: t.density.cardPad,
        }}>
          {isEdit && onDelete && (
            <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>삭제</LBtn></span>
          )}
          <div style={{ display: 'flex', gap: t.density.gapSm }}>
            {isEdit && (
              <LBtn variant="ghost" size="sm" onClick={handleCopy} disabled={saving}>복사</LBtn>
            )}
            <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
            <span data-primary-action="">
              <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.title.trim()}>
                {saving ? '저장 중...' : '저장'}
              </LBtn>
            </span>
          </div>
        </div>
      </LCard>
    </div>
  )
}

/* ── Sub-components ── */

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{
      fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle,
      fontFamily: t.font.sans, marginBottom: t.density.gapXs,
    }}>
      {children}{required && <span style={{ color: t.neutrals.subtle, marginLeft: t.density.tableRowGap }}>*</span>}
    </div>
  )
}
