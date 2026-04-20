'use client'

import { useState, useMemo } from 'react'
import { t, eventTones } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface ScheduleBlockProps {
  schedules: WillowMgmtSchedule[]
  clients: WillowMgmtClient[]
  onAddSchedule: () => void
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
  // Monday = 0
  let startOffset = first.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days: Date[] = []

  // Fill previous month days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push(d)
  }

  // Current month
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d))
  }

  // Fill next month days
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - startOffset - lastDay + 1)
    days.push(d)
  }

  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
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

function EventChip({ s, clients, compact }: { s: WillowMgmtSchedule; clients: WillowMgmtClient[]; compact?: boolean }) {
  const colors = getScheduleTone(s, clients)
  return (
    <div style={{
      padding: compact ? '2px 4px' : '3px 5px', borderRadius: 3,
      background: colors.bg, color: colors.fg,
      fontSize: compact ? 9 : 10, fontWeight: 500, lineHeight: 1.3,
      minWidth: 0, overflow: 'hidden',
    }}>
      {!compact && s.start_time && (
        <div style={{ fontFamily: t.font.mono, fontSize: 8.5, opacity: 0.7 }}>
          {s.start_time.slice(0, 5)}
        </div>
      )}
      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.title}
      </div>
    </div>
  )
}

export function ScheduleBlock({ schedules, clients, onAddSchedule }: ScheduleBlockProps) {
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
        <div style={{ display: 'flex', gap: 6 }}>
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
          <LBtn size="sm" icon={<LIcon name="plus" size={12} stroke={2.2} />} onClick={onAddSchedule}>
            추가
          </LBtn>
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
        /* Week grid */
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: t.neutrals.inner,
          borderRadius: `0 0 ${t.radius.md}px ${t.radius.md}px`,
          overflow: 'hidden',
        }}>
          {weekDays.map((day, i) => {
            const dateStr = formatDateLocal(day)
            const isToday = dateStr === todayStr
            const daySchedules = schedules.filter(s => matchesDate(s, dateStr))
            return (
              <div key={dateStr} style={{
                minHeight: 128, padding: 8,
                borderRight: i < 6 ? `1px solid ${t.neutrals.line}` : 'none',
                background: isToday ? t.brand[50] : 'transparent',
                minWidth: 0, overflow: 'hidden',
              }}>
                <div style={{
                  fontSize: 10.5, fontFamily: t.font.mono, fontWeight: 500,
                  color: isToday ? t.brand[700] : t.neutrals.subtle,
                  letterSpacing: 0.3, marginBottom: 6,
                }}>
                  {day.getDate()}
                  {isToday && ' · TODAY'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {daySchedules.map(s => <EventChip key={s.id} s={s} clients={clients} />)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Month grid */
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
                const isToday = dateStr === todayStr
                const isCurrentMonth = day.getMonth() === baseDate.getMonth()
                const daySchedules = schedules.filter(s => matchesDate(s, dateStr))
                return (
                  <div key={dateStr} style={{
                    minHeight: 72, padding: 6,
                    borderRight: di < 6 ? `1px solid ${t.neutrals.line}` : 'none',
                    background: isToday ? t.brand[50] : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.35,
                    minWidth: 0, overflow: 'hidden',
                  }}>
                    <div style={{
                      fontSize: 10, fontFamily: t.font.mono, fontWeight: 500,
                      color: isToday ? t.brand[700] : t.neutrals.subtle,
                      marginBottom: 3,
                    }}>
                      {day.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {daySchedules.slice(0, 2).map(s => <EventChip key={s.id} s={s} clients={clients} compact />)}
                      {daySchedules.length > 2 && (
                        <div style={{ fontSize: 8.5, color: t.neutrals.muted, fontFamily: t.font.mono }}>
                          +{daySchedules.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </LCard>
  )
}
