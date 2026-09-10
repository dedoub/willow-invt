'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { WillowMgmtSchedule } from '@/types/willow-mgmt'
import type { ScheduleFormData } from '@/app/(dashboard)/(linear)/mgmt/_components/add-schedule-dialog'

interface Props {
  open: boolean
  defaultDate: string
  editingSchedule?: WillowMgmtSchedule | null
  onClose: () => void
  onSave: (data: ScheduleFormData) => Promise<void>
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
  { value: 'other', label: '기타' },
]

// 입력칸은 카드의 검색창과 같은 규격 — 흰 바탕에 선 한 겹, 컨트롤 글자
const inputBase: React.CSSProperties = {
  width: '100%', minHeight: t.density.controlHSm,
  padding: `0 ${t.density.panelPadX}px`,
  fontSize: `calc(${t.type.control}px * var(--fz, 1))`,
  fontFamily: t.font.sans, fontWeight: t.weight.regular,
  background: t.neutrals.card, color: t.neutrals.text,
  border: `1px solid ${t.neutrals.line}`, borderRadius: t.radius.sm, outline: 'none',
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

/**
 * 일정 추가·수정 — 상세 모달과 같이 섹션 카드를 그대로 띄운다.
 * 라벨은 지표 라벨과 같은 급, 입력칸은 카드 검색창과 같은 규격이다(2026-09-10).
 */
export function AddScheduleDialogNew({ open, defaultDate, editingSchedule, onClose, onSave }: Props) {
  const isEdit = !!editingSchedule
  const [form, setForm] = useState<ScheduleFormData>(emptyForm(defaultDate))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(editingSchedule ? fromSchedule(editingSchedule) : emptyForm(defaultDate))
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{
        position: 'relative', width: 440, maxWidth: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={isEdit ? '일정 수정' : '일정 추가'}
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

        <div style={{
          padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px`, overflowY: 'auto', flex: 1,
          display: 'flex', flexDirection: 'column', gap: t.density.blockGap,
        }}>
          <Field label="제목" required>
            <input
              value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="일정 제목을 입력하세요"
              style={inputBase} autoFocus
            />
          </Field>

          <Field label="유형">
            <LFilterChip options={CATEGORY_OPTIONS} value={form.category} onChange={v => set('category', v)} gap={t.density.gapXs} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
            <Field label="시작일">
              <input type="date" value={form.schedule_date} onChange={e => set('schedule_date', e.target.value)} style={inputBase} />
            </Field>
            <Field label="종료일">
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} style={inputBase} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: t.density.gapMd }}>
            <Field label="시작 시간">
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} style={inputBase} />
            </Field>
            <Field label="종료 시간">
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} style={inputBase} />
            </Field>
          </div>

          <Field label="설명">
            <textarea
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="상세 내용 (선택)"
              rows={3}
              style={{
                ...inputBase, resize: 'vertical' as const, lineHeight: 1.6,
                padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
              }}
            />
          </Field>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.gapSm,
          margin: `0 ${t.density.cardPad}px`, paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <span data-primary-action="">
            <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </span>
        </div>
      </LCard>
    </div>
  )
}

/** 라벨 위, 입력 아래 — 카드 지표와 같은 순서로 읽는다 */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle,
        fontFamily: t.font.sans, marginBottom: t.density.gapXs,
      }}>
        {label}{required && <span style={{ color: t.neutrals.subtle, marginLeft: t.density.tableRowGap }}>*</span>}
      </div>
      {children}
    </div>
  )
}
