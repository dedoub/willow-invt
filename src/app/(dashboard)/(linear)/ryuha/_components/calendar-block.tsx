'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { RyuhaSchedule, RyuhaSubject, RyuhaDailyMemo } from '@/types/ryuha'

interface CalendarBlockProps {
  schedules: RyuhaSchedule[]
  subjects: RyuhaSubject[]
  selectedDate: string
  onSelectDate: (date: string) => void
  onAddSchedule: (date: string) => void
  onEditSchedule: (schedule: RyuhaSchedule) => void
  onToggleComplete: (schedule: RyuhaSchedule, date?: string) => void
  memos: RyuhaDailyMemo[]
  onSaveMemo: (date: string, content: string) => Promise<void>
}

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getWeekDays(date: Date): Date[] {
  const start = new Date(date)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function getMonthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  let startOffset = first.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days: Date[] = []
  for (let i = startOffset - 1; i >= 0; i--) days.push(new Date(year, month, -i))
  for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - startOffset - lastDay + 1))

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

function matchesDate(s: RyuhaSchedule, dateStr: string) {
  if (s.end_date) return dateStr >= s.schedule_date && dateStr <= s.end_date
  return s.schedule_date === dateStr
}

const CATEGORY_TONES: Record<string, { bg: string; fg: string }> = {
  school:   { bg: '#DBEAFE', fg: '#1E40AF' },   // 파랑
  academy:  { bg: '#FEF3C7', fg: '#92400E' },   // 주황/앰버
  homework: { bg: '#EDE9FE', fg: '#5B21B6' },   // 보라
  etc:      tonePalettes.neutral,                // 회색
}

const CATEGORY_FILTERS = [
  { key: 'all',      label: '전체' },
  { key: 'school',   label: '학교' },
  { key: 'academy',  label: '학원' },
  { key: 'homework', label: '과제' },
  { key: 'etc',      label: '기타' },
] as const

function getScheduleTone(s: RyuhaSchedule): { bg: string; fg: string } {
  return CATEGORY_TONES[s.type] || tonePalettes.neutral
}

function EventChip({ s, dateStr, compact, onToggle, onSelect }: {
  s: RyuhaSchedule; dateStr: string; compact?: boolean
  onToggle: (schedule: RyuhaSchedule, date?: string) => void
  onSelect: (schedule: RyuhaSchedule) => void
}) {
  const colors = getScheduleTone(s)
  const isMultiDay = !!s.end_date
  const done = isMultiDay
    ? (s.completed_dates || []).includes(dateStr)
    : s.is_completed

  return (
    <div style={{
      padding: compact ? '2px 4px' : '3px 5px', borderRadius: 3,
      background: colors.bg, color: colors.fg,
      fontSize: compact ? 9 : 10, fontWeight: 500, lineHeight: 1.3,
      minWidth: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'flex-start', gap: 4,
    }}>
      {/* Check circle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(s, dateStr) }}
        style={{
          flexShrink: 0, width: compact ? 10 : 12, height: compact ? 10 : 12,
          marginTop: compact ? 1 : 2,
          borderRadius: 999, border: `1.5px solid ${colors.fg}`,
          background: done ? colors.fg : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, opacity: done ? 1 : 0.5,
        }}
      >
        {done && (
          <svg width={compact ? 6 : 7} height={compact ? 6 : 7} viewBox="0 0 24 24" fill="none"
            stroke={colors.bg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </button>
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(s) }}
        style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
      >
        {!compact && s.start_time && (
          <div style={{ fontFamily: t.font.mono, fontSize: 8.5, opacity: 0.7 }}>
            {s.start_time.slice(0, 5)}
          </div>
        )}
        <div style={{
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.6 : 1,
        }}>
          {s.title}
        </div>
        {!compact && s.homework_items && s.homework_items.length > 0 && (
          <div style={{ fontSize: 8.5, opacity: 0.7 }}>
            과제 {s.homework_items.filter(h => h.is_completed).length}/{s.homework_items.length}
          </div>
        )}
      </div>
    </div>
  )
}

/** Memo chip in day cell */
function MemoChip({ content, compact, onClick }: {
  content: string; compact?: boolean; onClick: () => void
}) {
  const preview = content.length > (compact ? 8 : 20) ? content.slice(0, compact ? 8 : 20) + '…' : content
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        padding: compact ? '2px 4px' : '3px 5px', borderRadius: 3,
        background: tonePalettes.done.bg, color: tonePalettes.done.fg,
        fontSize: compact ? 9 : 10, fontWeight: 500, lineHeight: 1.3,
        minWidth: 0, overflow: 'hidden', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3,
      }}
    >
      <span style={{ flexShrink: 0, fontSize: compact ? 8 : 9 }}>memo</span>
      <span style={{
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: 0.8,
      }}>{preview}</span>
    </div>
  )
}

/** Day cell with hover + button */
function DayCell({
  day, dateStr, isToday, schedules, memo, onAdd, onToggle, onSelect, onMemoClick, onClickDate, compact, dimmed, borderRight, minHeight,
}: {
  day: Date; dateStr: string; isToday: boolean
  schedules: RyuhaSchedule[]
  memo?: string
  onAdd: (date: string) => void
  onToggle: (schedule: RyuhaSchedule, date?: string) => void
  onSelect: (schedule: RyuhaSchedule) => void
  onMemoClick: (date: string) => void
  onClickDate?: (date: string) => void
  compact?: boolean; dimmed?: boolean
  borderRight: boolean; minHeight: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClickDate?.(dateStr)}
      style={{
        minHeight, padding: compact ? 6 : 8, position: 'relative',
        borderRight: borderRight ? `1px solid ${t.neutrals.line}` : 'none',
        background: isToday ? t.brand[50] : 'transparent',
        opacity: dimmed ? 0.35 : 1,
        minWidth: 0, overflow: 'hidden',
        cursor: onClickDate ? 'pointer' : undefined,
      }}
    >
      {/* Date label */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: compact ? 3 : 6,
      }}>
        <span style={{
          fontSize: compact ? 10 : 10.5, fontFamily: t.font.mono, fontWeight: 500,
          color: isToday ? t.brand[700] : t.neutrals.subtle,
          letterSpacing: 0.3,
        }}>
          {day.getDate()}
          {!compact && isToday && ' · TODAY'}
        </span>
        {hovered && (
          <div style={{ display: 'flex', gap: 2 }}>
            {!memo && (
              <button
                onClick={(e) => { e.stopPropagation(); onMemoClick(dateStr) }}
                title="메모 추가"
                style={{
                  width: 16, height: 16, borderRadius: 4, border: 'none',
                  background: tonePalettes.done.bg, color: tonePalettes.done.fg,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, flexShrink: 0, fontSize: 9,
                }}
              >
                <LIcon name="file" size={9} stroke={2} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(dateStr) }}
              title="일정 추가"
              style={{
                width: 16, height: 16, borderRadius: 4, border: 'none',
                background: t.brand[100], color: t.brand[700],
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}
            >
              <LIcon name="plus" size={10} stroke={2.5} />
            </button>
          </div>
        )}
      </div>
      {/* Events + Memo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3 }}>
        {compact ? (
          <>
            {schedules.slice(0, 2).map(s => <EventChip key={s.id} s={s} dateStr={dateStr} compact onToggle={onToggle} onSelect={onSelect} />)}
            {memo && schedules.length < 2 && <MemoChip content={memo} compact onClick={() => onMemoClick(dateStr)} />}
            {(schedules.length > 2 || (memo && schedules.length >= 2)) && (
              <div style={{ fontSize: 8.5, color: t.neutrals.muted, fontFamily: t.font.mono }}>
                +{schedules.length - 2 + (memo && schedules.length >= 2 ? 1 : 0)}
              </div>
            )}
          </>
        ) : (
          <>
            {schedules.map(s => <EventChip key={s.id} s={s} dateStr={dateStr} onToggle={onToggle} onSelect={onSelect} />)}
            {memo && <MemoChip content={memo} onClick={() => onMemoClick(dateStr)} />}
          </>
        )}
      </div>
    </div>
  )
}

export function CalendarBlock({
  schedules, subjects, selectedDate, onSelectDate,
  onAddSchedule, onEditSchedule, onToggleComplete,
  memos, onSaveMemo,
}: CalendarBlockProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ryuha-calendar-view')
      if (saved === 'week' || saved === 'month') return saved
    }
    return 'week'
  })

  const updateViewMode = (mode: 'week' | 'month') => {
    setViewMode(mode)
    localStorage.setItem('ryuha-calendar-view', mode)
  }
  const [baseDate, setBaseDate] = useState(new Date())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [memoDialogDate, setMemoDialogDate] = useState<string | null>(null)
  const todayStr = formatDateLocal(new Date())

  const memoMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of memos) if (m.content?.trim()) map[m.memo_date] = m.content
    return map
  }, [memos])

  const filteredSchedules = useMemo(() => {
    if (categoryFilter === 'all') return schedules
    return schedules.filter(s => s.type === categoryFilter)
  }, [schedules, categoryFilter])

  const navigate = (dir: -1 | 1) => {
    setBaseDate(prev => {
      const d = new Date(prev)
      if (viewMode === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir)
      return d
    })
  }

  const weekDays = useMemo(() => getWeekDays(baseDate), [baseDate])
  const monthGrid = useMemo(() => getMonthGrid(baseDate.getFullYear(), baseDate.getMonth()), [baseDate])

  const eyebrow = viewMode === 'week' ? 'CALENDAR · 주간' : 'CALENDAR · 월간'
  const navLabel = viewMode === 'week'
    ? (() => {
        const w0 = weekDays[0], w6 = weekDays[6]
        if (w0.getMonth() === w6.getMonth()) return `${w0.getFullYear()}년 ${w0.getMonth() + 1}월`
        return `${w0.getMonth() + 1}월 — ${w6.getMonth() + 1}월`
      })()
    : `${baseDate.getFullYear()}년 ${baseDate.getMonth() + 1}월`

  return (
    <LCard>
      <LSectionHead eyebrow={eyebrow} title="일정" action={
        <div style={{
          display: 'inline-flex', background: t.neutrals.inner,
          borderRadius: t.radius.sm, padding: 2,
        }}>
          {(['week', 'month'] as const).map((v) => (
            <button key={v} onClick={() => updateViewMode(v)} style={{
              border: 'none',
              background: viewMode === v ? t.neutrals.card : 'transparent',
              padding: '4px 10px', fontSize: 11.5, borderRadius: 4, cursor: 'pointer',
              fontWeight: viewMode === v ? 500 : 400, color: t.neutrals.text,
              fontFamily: t.font.sans,
            }}>{v === 'week' ? '주' : '월'}</button>
          ))}
        </div>
      } />

      {/* Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronLeft" size={14} stroke={2} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans, minWidth: 100, textAlign: 'center' }}>
          {navLabel}
        </span>
        <button onClick={() => navigate(1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronRight" size={14} stroke={2} />
        </button>
      </div>

      {/* Category filter */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap',
      }}>
        {CATEGORY_FILTERS.map(({ key, label }) => {
          const active = categoryFilter === key
          const tone = key !== 'all' ? CATEGORY_TONES[key] : null
          return (
            <button key={key} onClick={() => setCategoryFilter(key)} style={{
              border: 'none', cursor: 'pointer',
              padding: '4px 10px', fontSize: 11, borderRadius: t.radius.pill,
              fontFamily: t.font.sans, fontWeight: active ? t.weight.medium : t.weight.regular,
              background: active ? (tone ? tone.bg : t.brand[100]) : t.neutrals.inner,
              color: active ? (tone ? tone.fg : t.brand[700]) : t.neutrals.muted,
              transition: 'all .12s',
            }}>{label}</button>
          )
        })}
      </div>

      {/* Day headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        background: t.neutrals.inner, borderRadius: `${t.radius.md}px ${t.radius.md}px 0 0`,
        borderBottom: `1px solid ${t.neutrals.line}`,
      }}>
        {DAY_NAMES.map((name, i) => (
          <div key={name} style={{
            padding: '6px 8px', fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
            color: i >= 5 ? t.neutrals.subtle : t.neutrals.muted,
            letterSpacing: 0.5, textAlign: 'center',
          }}>{name}</div>
        ))}
      </div>

      {viewMode === 'week' ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: t.neutrals.inner,
          borderRadius: `0 0 ${t.radius.md}px ${t.radius.md}px`,
          overflow: 'hidden',
        }}>
          {weekDays.map((day, i) => {
            const dateStr = formatDateLocal(day)
            return (
              <DayCell
                key={dateStr} day={day} dateStr={dateStr}
                isToday={dateStr === todayStr}
                schedules={filteredSchedules.filter(s => matchesDate(s, dateStr))}
                memo={memoMap[dateStr]}
                onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onEditSchedule}
                onMemoClick={setMemoDialogDate}
                onClickDate={onSelectDate}
                borderRight={i < 6} minHeight={128}
              />
            )
          })}
        </div>
      ) : (
        <div style={{
          background: t.neutrals.inner,
          borderRadius: `0 0 ${t.radius.md}px ${t.radius.md}px`,
          overflow: 'hidden',
        }}>
          {monthGrid.map((week, wi) => (
            <div key={wi} style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderTop: wi > 0 ? `1px solid ${t.neutrals.line}` : 'none',
            }}>
              {week.map((day, di) => {
                const dateStr = formatDateLocal(day)
                return (
                  <DayCell
                    key={dateStr} day={day} dateStr={dateStr}
                    isToday={dateStr === todayStr}
                    dimmed={day.getMonth() !== baseDate.getMonth()}
                    schedules={filteredSchedules.filter(s => matchesDate(s, dateStr))}
                    memo={memoMap[dateStr]}
                    onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onEditSchedule}
                    onMemoClick={setMemoDialogDate}
                    onClickDate={onSelectDate}
                    compact borderRight={di < 6} minHeight={72}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Memo Dialog ── */}
      <MemoDialog
        date={memoDialogDate}
        content={memoDialogDate ? memoMap[memoDialogDate] || '' : ''}
        onSave={onSaveMemo}
        onClose={() => setMemoDialogDate(null)}
      />
    </LCard>
  )
}

/* ── Memo Dialog ─────────────────────────────────────────── */
function MemoDialog({ date, content: initialContent, onSave, onClose }: {
  date: string | null
  content: string
  onSave: (date: string, content: string) => Promise<void>
  onClose: () => void
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (date) setContent(initialContent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  if (!date) return null

  const dp = date.split('-')
  const dateLabel = `${parseInt(dp[1])}월 ${parseInt(dp[2])}일`

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(date, content.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await onSave(date, '')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
    resize: 'vertical', outline: 'none', lineHeight: 1.6,
    boxSizing: 'border-box',
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
        width: '100%', maxWidth: 440, padding: 20,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14,
        }}>
          <h3 style={{
            margin: 0, fontSize: 14, fontWeight: 600,
            color: t.neutrals.text, fontFamily: t.font.sans,
          }}>
            {dateLabel} 메모
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: t.radius.sm,
            color: t.neutrals.subtle,
          }}>
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Content */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="메모를 작성하세요..."
          rows={6}
          style={inputStyle}
          autoFocus
        />

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: initialContent ? 'space-between' : 'flex-end',
          alignItems: 'center', gap: 8, marginTop: 14,
        }}>
          {initialContent && (
            <button onClick={handleDelete} disabled={saving} style={{
              padding: '5px 12px', borderRadius: t.radius.sm,
              background: '#FEE2E2', border: 'none', fontSize: 12,
              color: '#DC2626', cursor: 'pointer', fontFamily: t.font.sans,
              fontWeight: t.weight.regular, opacity: saving ? 0.5 : 1,
            }}>삭제</button>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose} style={{
              padding: '5px 12px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none', fontSize: 12,
              color: t.neutrals.muted, cursor: 'pointer', fontFamily: t.font.sans,
              fontWeight: t.weight.regular,
            }}>취소</button>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '5px 12px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none', fontSize: 12,
              color: t.neutrals.text, cursor: 'pointer', fontFamily: t.font.sans,
              fontWeight: t.weight.regular, opacity: saving ? 0.5 : 1,
            }}>{saving ? '저장중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
