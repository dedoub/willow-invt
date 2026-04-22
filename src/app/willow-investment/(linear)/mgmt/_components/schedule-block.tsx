'use client'

import { useState, useMemo } from 'react'
import { t, eventTones } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface ScheduleBlockProps {
  schedules: WillowMgmtSchedule[]
  clients: WillowMgmtClient[]
  onAddSchedule: (date: string) => void
  onToggleComplete: (id: string, completed: boolean) => void
  onSelectSchedule: (schedule: WillowMgmtSchedule) => void
}

function formatDateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

function getWeekDays(date: Date) {
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

function getClientTone(clientId: string | null, clients: WillowMgmtClient[]): keyof typeof eventTones {
  if (!clientId) return 'neutral'
  const client = clients.find(c => c.id === clientId)
  if (!client) return 'neutral'
  const name = client.name.toLowerCase()
  if (name.includes('아크로스') || name.includes('akros')) return 'brand'
  if (name.includes('텐소프트') || name.includes('tensw')) return 'info'
  if (name.includes('류하')) return 'brand'
  return 'neutral'
}

function getScheduleTone(s: WillowMgmtSchedule, clients: WillowMgmtClient[]) {
  const tone = s.type === 'deadline' ? 'warn'
    : s.is_completed ? 'done'
    : getClientTone(s.client_id, clients)
  return eventTones[tone] || eventTones.neutral
}

function matchesDate(s: WillowMgmtSchedule, dateStr: string) {
  if (s.end_date) return dateStr >= s.schedule_date && dateStr <= s.end_date
  return s.schedule_date === dateStr
}

function EventChip({ s, clients, compact, onToggle, onSelect }: {
  s: WillowMgmtSchedule; clients: WillowMgmtClient[]; compact?: boolean
  onToggle: (id: string, completed: boolean) => void
  onSelect: (schedule: WillowMgmtSchedule) => void
}) {
  const colors = getScheduleTone(s, clients)
  const done = s.is_completed
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
        onClick={(e) => { e.stopPropagation(); onToggle(s.id, !done) }}
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
      </div>
    </div>
  )
}

/** Day cell with hover + button */
function DayCell({
  day, dateStr, isToday, schedules, clients, onAdd, onToggle, onSelect, compact, dimmed, borderRight, minHeight,
}: {
  day: Date; dateStr: string; isToday: boolean
  schedules: WillowMgmtSchedule[]; clients: WillowMgmtClient[]
  onAdd: (date: string) => void
  onToggle: (id: string, completed: boolean) => void
  onSelect: (schedule: WillowMgmtSchedule) => void
  compact?: boolean; dimmed?: boolean
  borderRight: boolean; minHeight: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight, padding: compact ? 6 : 8, position: 'relative',
        borderRight: borderRight ? `1px solid ${t.neutrals.line}` : 'none',
        background: isToday ? t.brand[50] : 'transparent',
        opacity: dimmed ? 0.35 : 1,
        minWidth: 0, overflow: 'hidden',
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
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(dateStr) }}
            style={{
              width: 16, height: 16, borderRadius: 4, border: 'none',
              background: t.brand[100], color: t.brand[700],
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0,
            }}
          >
            <LIcon name="plus" size={10} stroke={2.5} />
          </button>
        )}
      </div>
      {/* Events */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 2 : 3 }}>
        {compact ? (
          <>
            {schedules.slice(0, 2).map(s => <EventChip key={s.id} s={s} clients={clients} compact onToggle={onToggle} onSelect={onSelect} />)}
            {schedules.length > 2 && (
              <div style={{ fontSize: 8.5, color: t.neutrals.muted, fontFamily: t.font.mono }}>
                +{schedules.length - 2}
              </div>
            )}
          </>
        ) : (
          schedules.map(s => <EventChip key={s.id} s={s} clients={clients} onToggle={onToggle} onSelect={onSelect} />)
        )}
      </div>
    </div>
  )
}

export function ScheduleBlock({ schedules, clients, onAddSchedule, onToggleComplete, onSelectSchedule }: ScheduleBlockProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [baseDate, setBaseDate] = useState(new Date())
  const todayStr = formatDateLocal(new Date())

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

  const eyebrow = viewMode === 'week' ? 'SCHEDULE · 주간' : 'SCHEDULE · 월간'
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
            <button key={v} onClick={() => setViewMode(v)} style={{
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
                schedules={schedules.filter(s => matchesDate(s, dateStr))}
                clients={clients} onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onSelectSchedule}
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
                    schedules={schedules.filter(s => matchesDate(s, dateStr))}
                    clients={clients} onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onSelectSchedule}
                    compact borderRight={di < 6} minHeight={72}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </LCard>
  )
}
