'use client'

import { useState } from 'react'
import { t, eventTones } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LBtn } from '@/app/willow-investment/_components/linear-btn'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { WillowMgmtSchedule, WillowMgmtClient } from '@/types/willow-mgmt'

interface ScheduleBlockProps {
  schedules: WillowMgmtSchedule[]
  clients: WillowMgmtClient[]
  currentDate: Date
  onNavigate: (dir: -1 | 1) => void
  onAddSchedule: () => void
}

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

function formatDateLocal(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

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

export function ScheduleBlock({ schedules, clients, currentDate, onNavigate, onAddSchedule }: ScheduleBlockProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const weekDays = getWeekDays(currentDate)
  const todayStr = formatDateLocal(new Date())

  return (
    <LCard>
      <LSectionHead eyebrow="SCHEDULE · 이번 주" title="일정" action={
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
        <button onClick={() => onNavigate(-1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronDown" size={14} stroke={2} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, fontFamily: t.font.sans }}>
          {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
        </span>
        <button onClick={() => onNavigate(1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 4, borderRadius: 4, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronDown" size={14} stroke={2} />
        </button>
      </div>

      {/* Week grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        background: t.neutrals.inner, borderRadius: t.radius.md, overflow: 'hidden',
      }}>
        {weekDays.map((day, i) => {
          const dateStr = formatDateLocal(day)
          const isToday = dateStr === todayStr
          const daySchedules = schedules.filter(s => {
            if (s.end_date) {
              return dateStr >= s.schedule_date && dateStr <= s.end_date
            }
            return s.schedule_date === dateStr
          })

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
                {DAY_NAMES[i]} {day.getDate()}
                {isToday && ' · TODAY'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {daySchedules.map((s) => {
                  const tone = s.type === 'deadline' ? 'warn'
                    : s.is_completed ? 'done'
                    : getClientTone(s.client_id, clients)
                  const colors = eventTones[tone] || eventTones.neutral
                  return (
                    <div key={s.id} style={{
                      padding: '3px 5px', borderRadius: 3,
                      background: colors.bg, color: colors.fg,
                      fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                      minWidth: 0, overflow: 'hidden',
                    }}>
                      {s.start_time && (
                        <div style={{ fontFamily: t.font.mono, fontSize: 8.5, opacity: 0.7 }}>
                          {s.start_time.slice(0, 5)}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.title}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </LCard>
  )
}
