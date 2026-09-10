'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LNotice } from '@/app/(dashboard)/_components/linear-notice'

/** 한 칸의 규격. 수집 원장마다 고칠 수 있는 칸이 달라 표로 넘긴다. */
export type EditField = {
  key: string
  label: string
  kind?: 'text' | 'number' | 'date' | 'time' | 'textarea' | 'chips'
  options?: { value: string; label: string }[]
  /** 한 줄을 통째로 쓴다 */
  full?: boolean
  required?: boolean
  placeholder?: string
}

interface Props {
  open: boolean
  title: string
  fields: EditField[]
  /** 처음 값 — 키는 fields의 key와 같다 */
  initial: Record<string, string>
  /** 이 줄이 어디서 온 기록인지 한 줄. 고친 값이 어떻게 다뤄지는지 알려준다. */
  note?: string
  onClose: () => void
  onSave: (values: Record<string, string>) => Promise<void>
}

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

/**
 * 수집 원장 한 줄 고치기 — 거래·일정 폼과 같은 카드 문법이고, 칸 목록만 바깥에서 받는다.
 * 세금계산서·고지·카드승인이 각자 폼을 따로 갖지 않게 한 곳으로 모았다(2026-09-10).
 */
export function RecordEditDialog({ open, title, fields, initial, note, onClose, onSave }: Props) {
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(initial)
    setError(null)
    // initial 은 매 렌더 새 객체라 open 이 바뀔 때만 되돌린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const ready = fields.every(f => !f.required || (form[f.key] ?? '').trim())

  const handleSave = async () => {
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const rows: EditField[][] = []
  for (const field of fields) {
    const last = rows[rows.length - 1]
    if (field.full || !last || last.length === 2 || last[0].full) rows.push([field])
    else last.push(field)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{
        position: 'relative', width: 460, maxWidth: '100%', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={title}
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
          {error && <LNotice tone="danger" text={error} />}

          {rows.map((row, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: row.length === 2 ? '1fr 1fr' : '1fr',
              gap: t.density.gapMd,
            }}>
              {row.map(field => (
                <div key={field.key} style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: `calc(${t.type.label}px * var(--fz, 1))`, color: t.neutrals.subtle,
                    fontFamily: t.font.sans, marginBottom: t.density.gapXs,
                  }}>
                    {field.label}
                    {field.required && <span style={{ color: t.neutrals.subtle, marginLeft: t.density.tableRowGap }}>*</span>}
                  </div>

                  {field.kind === 'chips' ? (
                    <LFilterChip
                      options={field.options ?? []}
                      value={form[field.key] ?? ''}
                      onChange={v => set(field.key, v)}
                      gap={t.density.gapXs}
                    />
                  ) : field.kind === 'textarea' ? (
                    <textarea
                      value={form[field.key] ?? ''}
                      onChange={e => set(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={2}
                      style={{
                        ...inputBase, resize: 'vertical' as const, lineHeight: 1.6,
                        padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`,
                      }}
                    />
                  ) : (
                    <input
                      type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'time' ? 'time' : 'text'}
                      value={form[field.key] ?? ''}
                      onChange={e => set(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      style={field.kind === 'number'
                        ? { ...inputBase, fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }
                        : inputBase}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}

          {note && (
            <div style={{
              fontSize: `calc(${t.type.helper}px * var(--fz, 1))`, color: t.neutrals.subtle, lineHeight: 1.4,
            }}>
              {note}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: t.density.gapSm,
          margin: `0 ${t.density.cardPad}px`, paddingBottom: t.density.cardPad,
        }}>
          <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
          <span data-primary-action="">
            <LBtn variant="brand" size="sm" onClick={handleSave} disabled={saving || !ready}>
              {saving ? '저장 중...' : '저장'}
            </LBtn>
          </span>
        </div>
      </LCard>
    </div>
  )
}
