'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSchedule, RyuhaSubject } from '@/types/ryuha'

type ViewMode = 'week' | 'month'

interface CalendarBlockProps {
  schedules: RyuhaSchedule[]
  subjects: RyuhaSubject[]
  selectedDate: string
  onSelectDate: (date: string) => void
  onAddSchedule: (date: string) => void
  onEditSchedule: (schedule: RyuhaSchedule) => void
  onToggleComplete: (schedule: RyuhaSchedule, date?: string) => void
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d
}

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const start = addDays(firstDay, -startOffset)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(addDays(start, i))
  }
  return days
}

function getSchedulesForDate(schedules: RyuhaSchedule[], dateStr: string): RyuhaSchedule[] {
  return schedules.filter(s => {
    if (s.schedule_date === dateStr) return true
    if (s.end_date && s.schedule_date <= dateStr && s.end_date >= dateStr) return true
    return false
  })
}

function ScheduleCard({ schedule, dateStr, onEdit, onToggle }: {
  schedule: RyuhaSchedule
  dateStr: string
  onEdit: () => void
  onToggle: () => void
}) {
  const subjectColor = schedule.subject?.color
  const isMultiDay = !!schedule.end_date
  const isCompleted = isMultiDay
    ? (schedule.completed_dates || []).includes(dateStr)
    : schedule.is_completed

  return (
    <div
      onClick={onEdit}
      style={{
        padding: '4px 6px', borderRadius: t.radius.sm,
        borderLeft: subjectColor ? `3px solid ${subjectColor}` : `3px solid ${t.neutrals.subtle}`,
        background: isCompleted ? t.neutrals.inner : (subjectColor ? `${subjectColor}15` : t.neutrals.inner),
        cursor: 'pointer', fontSize: 11, lineHeight: 1.3,
        opacity: isCompleted ? 0.6 : 1,
        textDecoration: isCompleted ? 'line-through' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: 4 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, marginTop: 1, flexShrink: 0,
            color: isCompleted ? t.accent.pos : t.neutrals.subtle,
          }}
        >
          <LIcon name={isCompleted ? 'checkCircle' : 'circle'} size={12} stroke={2} />
        </button>
        <span style={{ flex: 1, fontWeight: t.weight.medium }}>{schedule.title}</span>
      </div>
      {(schedule.start_time || schedule.end_time) && (
        <div style={{ fontSize: 10, color: t.neutrals.subtle, marginTop: 2, paddingLeft: 16 }}>
          <LIcon name="clock" size={9} stroke={2} />
          {' '}{schedule.start_time?.slice(0, 5) || ''}{schedule.start_time && schedule.end_time ? ' - ' : ''}{schedule.end_time?.slice(0, 5) || ''}
        </div>
      )}
      {schedule.homework_items && schedule.homework_items.length > 0 && (
        <div style={{ fontSize: 10, color: t.accent.warn, marginTop: 2, paddingLeft: 16 }}>
          과제 {schedule.homework_items.filter(h => h.is_completed).length}/{schedule.homework_items.length}
        </div>
      )}
    </div>
  )
}

export function CalendarBlock({
  schedules, subjects, selectedDate, onSelectDate,
  onAddSchedule, onEditSchedule, onToggleComplete,
}: CalendarBlockProps) {
  const mobile = useIsMobile()
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [currentDate, setCurrentDate] = useState(() => new Date(selectedDate))

  const todayStr = useMemo(() => formatDateLocal(new Date()), [])

  // Week view data
  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  // Month view data
  const monthDays = useMemo(() => {
    return getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
  }, [currentDate])

  const navigate = (dir: number) => {
    const d = new Date(currentDate)
    if (viewMode === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCurrentDate(d)
  }

  const goToday = () => {
    setCurrentDate(new Date())
    onSelectDate(todayStr)
  }

  const headerLabel = viewMode === 'week'
    ? (() => {
        const start = weekDays[0]
        const end = weekDays[6]
        return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`
      })()
    : `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="CALENDAR" title="일정" action={
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={() => setViewMode(viewMode === 'week' ? 'month' : 'week')}
              style={{
                padding: '4px 10px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, border: 'none',
                fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
                color: t.neutrals.muted, cursor: 'pointer',
              }}
            >
              {viewMode === 'week' ? '월간' : '주간'}
            </button>
            <button
              onClick={() => onAddSchedule(selectedDate)}
              style={{
                padding: '4px 10px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, border: 'none',
                fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
                color: t.neutrals.muted, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <LIcon name="plus" size={11} stroke={2} /> 일정
            </button>
          </div>
        } />
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '0 16px 10px',
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronLeft" size={16} stroke={2} />
        </button>
        <span style={{
          fontSize: 13, fontWeight: t.weight.medium, color: t.neutrals.text,
          fontFamily: t.font.sans, minWidth: 200, textAlign: 'center',
        }}>
          {headerLabel}
        </span>
        <button onClick={() => navigate(1)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronRight" size={16} stroke={2} />
        </button>
        <button onClick={goToday} style={{
          padding: '3px 8px', borderRadius: t.radius.sm,
          background: t.neutrals.inner, border: 'none',
          fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted,
          cursor: 'pointer',
        }}>
          오늘
        </button>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <div style={{ padding: '0 10px 14px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? 'repeat(3, 1fr)' : 'repeat(7, 1fr)',
            gap: 4,
          }}>
            {weekDays.map((day, i) => {
              const dateStr = formatDateLocal(day)
              const daySchedules = getSchedulesForDate(schedules, dateStr)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const isSunday = day.getDay() === 0
              const isSaturday = day.getDay() === 6

              return (
                <div
                  key={dateStr}
                  onClick={() => onSelectDate(dateStr)}
                  style={{
                    borderRadius: t.radius.sm,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    outline: isSelected ? `2px solid ${t.brand[400]}` : 'none',
                    outlineOffset: -2,
                  }}
                >
                  {/* Day header */}
                  <div style={{
                    textAlign: 'center', padding: '4px 0',
                    background: isToday ? t.brand[600] : t.neutrals.inner,
                    color: isToday ? '#fff' : isSunday ? t.accent.neg : isSaturday ? t.brand[600] : t.neutrals.muted,
                    fontSize: 10, fontFamily: t.font.mono,
                  }}>
                    <div style={{ fontSize: 9 }}>{DAY_NAMES[day.getDay()]}</div>
                    <div style={{ fontWeight: t.weight.semibold, fontSize: 13 }}>{day.getDate()}</div>
                  </div>
                  {/* Schedule cards */}
                  <div style={{
                    minHeight: 80, padding: 3,
                    display: 'flex', flexDirection: 'column', gap: 3,
                    background: t.neutrals.card,
                  }}>
                    {daySchedules.map(s => (
                      <ScheduleCard
                        key={s.id}
                        schedule={s}
                        dateStr={dateStr}
                        onEdit={() => onEditSchedule(s)}
                        onToggle={() => onToggleComplete(s, dateStr)}
                      />
                    ))}
                    {daySchedules.length === 0 && (
                      <div
                        onClick={(e) => { e.stopPropagation(); onAddSchedule(dateStr) }}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: t.neutrals.line, fontSize: 16,
                        }}
                      >
                        +
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Month View */}
      {viewMode === 'month' && (
        <div style={{ padding: '0 10px 14px' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {DAY_NAMES.map((name, i) => (
              <div key={name} style={{
                textAlign: 'center', fontSize: 9, fontFamily: t.font.mono,
                color: i === 0 ? t.accent.neg : i === 6 ? t.brand[600] : t.neutrals.subtle,
                padding: '4px 0',
              }}>
                {name}
              </div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {monthDays.map((day) => {
              const dateStr = formatDateLocal(day)
              const isCurrentMonth = day.getMonth() === currentDate.getMonth()
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate
              const daySchedules = getSchedulesForDate(schedules, dateStr)

              return (
                <div
                  key={dateStr}
                  onClick={() => { onSelectDate(dateStr); setViewMode('week'); setCurrentDate(day) }}
                  style={{
                    minHeight: mobile ? 36 : 60, padding: 3,
                    borderRadius: t.radius.sm, cursor: 'pointer',
                    background: isToday ? `${t.brand[100]}` : isSelected ? `${t.brand[50]}` : t.neutrals.card,
                    opacity: isCurrentMonth ? 1 : 0.35,
                    outline: isSelected ? `2px solid ${t.brand[400]}` : 'none',
                    outlineOffset: -2,
                  }}
                >
                  <div style={{
                    fontSize: 10, fontFamily: t.font.mono,
                    fontWeight: isToday ? t.weight.semibold : t.weight.regular,
                    color: isToday ? t.brand[700] : t.neutrals.muted,
                    marginBottom: 2,
                  }}>
                    {day.getDate()}
                  </div>
                  {!mobile && daySchedules.slice(0, 3).map(s => (
                    <div key={s.id} style={{
                      fontSize: 9, padding: '1px 3px', borderRadius: 2,
                      marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      background: s.subject?.color ? `${s.subject.color}20` : t.neutrals.inner,
                      borderLeft: s.subject?.color ? `2px solid ${s.subject.color}` : undefined,
                      textDecoration: s.is_completed ? 'line-through' : 'none',
                      color: s.is_completed ? t.neutrals.subtle : t.neutrals.text,
                    }}>
                      {s.title}
                    </div>
                  ))}
                  {!mobile && daySchedules.length > 3 && (
                    <div style={{ fontSize: 9, color: t.neutrals.subtle }}>+{daySchedules.length - 3}</div>
                  )}
                  {mobile && daySchedules.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      {daySchedules.slice(0, 3).map(s => (
                        <span key={s.id} style={{
                          width: 5, height: 5, borderRadius: 3,
                          background: s.subject?.color || t.neutrals.subtle,
                        }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </LCard>
  )
}
