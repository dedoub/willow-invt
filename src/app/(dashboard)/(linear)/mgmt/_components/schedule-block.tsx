'use client'

import { useState, useMemo } from 'react'
import { t, readableOn, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { WillowMgmtSchedule } from '@/types/willow-mgmt'

interface ScheduleBlockProps {
  schedules: WillowMgmtSchedule[]
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

// 분류는 색조 대신 회색 명도로 나눈다 — 윌로우가 가장 진하고 기타가 가장 옅다
// (2026-09-10 카드 문법: 단색은 유지하되 분간은 되게).
const CATEGORY_TONES: Record<string, { bg: string; fg: string }> = {
  'willow-mgmt': { bg: '#D3D7DD', fg: '#1F242B' },
  'tensw-mgmt':  { bg: '#DCE0E5', fg: '#262C33' },
  'etf-etc':     { bg: '#E4E7EB', fg: '#2C323A' },
  'akros':       { bg: '#EAECEF', fg: '#343A42' },
  'other':       { bg: '#F5F6F8', fg: '#4B525A' },
}

const CATEGORY_LABELS: Record<string, string> = {
  'willow-mgmt': '윌로우',
  'tensw-mgmt':  '텐소프트웍스',
  'etf-etc':     'ETC',
  'akros':       '아크로스',
  'other':       '기타',
}

function getScheduleTone(s: WillowMgmtSchedule) {
  return CATEGORY_TONES[s.category] || CATEGORY_TONES.other
}

function matchesDate(s: WillowMgmtSchedule, dateStr: string) {
  if (s.end_date) return dateStr >= s.schedule_date && dateStr <= s.end_date
  return s.schedule_date === dateStr
}

function EventChip({ s, compact, onToggle, onSelect }: {
  s: WillowMgmtSchedule; compact?: boolean
  onToggle: (id: string, completed: boolean) => void
  onSelect: (schedule: WillowMgmtSchedule) => void
}) {
  const colors = getScheduleTone(s)
  const done = s.is_completed
  return (
    <div style={{
      padding: compact ? '2px 4px' : '3px 5px', borderRadius: 3,
      background: colors.bg, color: colors.fg,
      fontSize: `calc(${compact ? t.type.tableCell : t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium, lineHeight: 1.3,
      minWidth: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'flex-start', gap: t.density.gapXs,
    }}>
      {/* Check circle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(s.id, !done) }}
        style={{
          flexShrink: 0, width: compact ? 10 : 12, height: compact ? 10 : 12,
          marginTop: compact ? 1 : 2,
          // 선 대신 채움으로 상태 구분 — 미완료는 같은 색을 옅게, 완료는 진하게(2026-09-10 감사 반영).
          borderRadius: t.radius.pill, border: 'none',
          background: colors.fg,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, opacity: done ? 1 : 0.3,
        }}
      >
        {done && (
          <svg width={compact ? 6 : 7} height={compact ? 6 : 7} viewBox="0 0 24 24" fill="none"
            stroke={readableOn(colors.fg)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </button>
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(s) }}
        style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
      >
        {!compact && s.start_time && (
          <div style={{ fontFamily: t.font.mono, fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, opacity: 0.7 }}>
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
  day, dateStr, isToday, schedules, onAdd, onToggle, onSelect, onClickDate, compact, dotsOnly, dimmed, borderRight, minHeight, isSelected,
}: {
  day: Date; dateStr: string; isToday: boolean
  schedules: WillowMgmtSchedule[]
  onAdd: (date: string) => void
  onToggle: (id: string, completed: boolean) => void
  onSelect: (schedule: WillowMgmtSchedule) => void
  onClickDate?: (date: string) => void
  compact?: boolean; dotsOnly?: boolean; dimmed?: boolean
  isSelected?: boolean
  borderRight: boolean; minHeight: number
}) {
  const [hovered, setHovered] = useState(false)
  // 셀 안에서 그대로 펼친다 — 뜬 창을 띄우면 달력 위에 겹쳐 읽기가 끊긴다(CEO 2026-09-10)
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClickDate?.(dateStr)}
      style={{
        minHeight, padding: compact ? 6 : 8, position: 'relative',
        borderRight: borderRight ? `1px solid ${t.neutrals.line}` : 'none',
        background: isSelected ? '#EDEFF2' : isToday ? '#F5F6F8' : 'transparent',
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
          fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.medium,
          color: isToday ? t.chart.mono : t.neutrals.subtle,
          letterSpacing: 0.3,
        }}>
          {day.getDate()}
          {!compact && isToday && ' · TODAY'}
        </span>
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(dateStr) }}
            style={{
              width: 16, height: 16, borderRadius: t.radius.sm, border: 'none',
              background: 'transparent', color: t.neutrals.muted,
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
        {dotsOnly ? (
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: t.density.gapXs, marginTop: t.density.tableRowGap }}>
            {schedules.slice(0, 6).map(s => {
              const tone = getScheduleTone(s)
              return (
                <span key={s.id} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: tone.fg,
                }} />
              )
            })}
            {schedules.length > 6 && (
              <span style={{ fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono, lineHeight: '6px' }}>+{schedules.length - 6}</span>
            )}
          </div>
        ) : compact ? (
          <>
            {schedules.slice(0, expanded ? schedules.length : 2).map(s => (
              <EventChip key={s.id} s={s} compact onToggle={onToggle} onSelect={onSelect} />
            ))}
            {schedules.length > 2 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
                style={{
                  alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0,
                  fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono, cursor: 'pointer',
                }}
              >
                {expanded ? '접기' : `+${schedules.length - 2}`}
              </button>
            )}
          </>
        ) : (
          schedules.map(s => <EventChip key={s.id} s={s} onToggle={onToggle} onSelect={onSelect} />)
        )}
      </div>
    </div>
  )
}

// 활성 칩 색은 다른 카드와 같이 테마가 정한다 — 여기서 따로 주지 않는다.
const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'willow-mgmt', label: '윌로우' },
  { value: 'tensw-mgmt', label: '텐소프트웍스' },
  { value: 'etf-etc', label: 'ETC' },
  { value: 'akros', label: '아크로스' },
  { value: 'other', label: '기타' },
]

export function ScheduleBlock({ schedules, onAddSchedule, onToggleComplete, onSelectSchedule }: ScheduleBlockProps) {
  const mobile = useIsMobile()
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDateLocal(new Date()))
  const [viewMode, setViewMode] = useState<'week' | 'month'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('schedule-view-mode')
      if (saved === 'week' || saved === 'month') return saved
    }
    return 'week'
  })

  const updateViewMode = (mode: 'week' | 'month') => {
    setViewMode(mode)
    localStorage.setItem('schedule-view-mode', mode)
  }
  const [baseDate, setBaseDate] = useState(new Date())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const todayStr = formatDateLocal(new Date())

  const filteredSchedules = useMemo(() => {
    if (categoryFilter === 'all') return schedules
    return schedules.filter(s => s.category === categoryFilter)
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

  const navLabel = viewMode === 'week'
    ? (() => {
        const w0 = weekDays[0], w6 = weekDays[6]
        if (w0.getMonth() === w6.getMonth()) return `${w0.getFullYear()}년 ${w0.getMonth() + 1}월`
        return `${w0.getMonth() + 1}월 — ${w6.getMonth() + 1}월`
      })()
    : `${baseDate.getFullYear()}년 ${baseDate.getMonth() + 1}월`

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
        <div style={{ paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title="일정"
            tools={
              <LSegmented
                value={viewMode}
                onChange={updateViewMode}
                options={[
                  { value: 'week', label: '주' },
                  { value: 'month', label: '월' },
                ]}
              />
            }
            toolsInline
            mb={0}
          />
        </div>

      {/* 기간 — 카드 전체에 걸리는 조건이라 달력 위 가운데에 둔다 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: t.density.gapMd, padding: `${t.density.panelPadX}px 0`,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronLeft" size={14} stroke={2} />
        </button>
        <span style={{
          fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold,
          fontFamily: t.font.sans, minWidth: 104, textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          {navLabel}
        </span>
        <button onClick={() => navigate(1)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: t.density.gapXs, borderRadius: t.radius.sm, color: t.neutrals.muted,
        }}>
          <LIcon name="chevronRight" size={14} stroke={2} />
        </button>
      </div>

      {/* 분류 칩 — 다른 카드의 필터 줄과 같은 자리, 같은 모양 */}
      <div style={{ marginTop: t.density.gapSm }}>
        <LFilterChip options={CATEGORY_FILTERS} value={categoryFilter} onChange={setCategoryFilter} gap={t.density.gapXs} />
      </div>
      </div>

      <div style={{ padding: `0 ${t.density.cardPad}px ${t.density.cardPad}px` }}>
      {/* 요일 — 표 머리와 같은 문법. 회색 판 대신 아래 선 하나 */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        borderBottom: `1px solid ${t.neutrals.line}`,
      }}>
        {DAY_NAMES.map(name => (
          <div key={name} style={{
            padding: `${t.density.gapSm}px ${t.density.panelPadY}px`, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, fontFamily: t.font.mono, fontWeight: t.weight.semibold,
            color: name === '토' || name === '일' ? t.neutrals.subtle : t.neutrals.muted,
            letterSpacing: 0.5, textAlign: 'center',
          }}>{name}</div>
        ))}
      </div>

      {viewMode === 'week' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekDays.map((day, i) => {
            const dateStr = formatDateLocal(day)
            return (
              <DayCell
                key={dateStr} day={day} dateStr={dateStr}
                isToday={dateStr === todayStr}
                schedules={filteredSchedules.filter(s => matchesDate(s, dateStr))}
                onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onSelectSchedule}
                onClickDate={mobile ? setSelectedDate : undefined}
                compact={mobile} dotsOnly={mobile}
                isSelected={mobile && dateStr === selectedDate}
                borderRight={i < 6} minHeight={mobile ? 48 : 128}
              />
            )
          })}
        </div>
      ) : (
        <div>
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
                    onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onSelectSchedule}
                    onClickDate={mobile ? setSelectedDate : undefined}
                    compact dotsOnly={mobile}
                    isSelected={mobile && dateStr === selectedDate}
                    borderRight={di < 6} minHeight={mobile ? 38 : 72}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* 모바일 (주간·월간): 선택일의 일정 상세 시트 */}
      {mobile && (() => {
        const dayItems = filteredSchedules.filter(s => matchesDate(s, selectedDate))
        return (
          <div style={{
            marginTop: t.density.blockGap, paddingTop: t.density.blockGap,
            borderTop: `1px solid ${t.neutrals.line}`,
            display: 'flex', flexDirection: 'column', gap: t.density.kpiGap,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.semibold, color: t.neutrals.text }}>
                {selectedDate.slice(5).replace('-', '월 ')}일
                <span style={{ marginLeft: t.density.gapSm, fontSize: `calc(${t.type.tableCell}px * var(--fz, 1))`, color: t.neutrals.subtle, fontFamily: t.font.mono }}>
                  {dayItems.length}개 일정
                </span>
              </div>
              <LBtn size="sm" icon={<LIcon name="plus" size={11} stroke={2.5} />} onClick={() => onAddSchedule(selectedDate)}>일정 추가</LBtn>
            </div>
            {dayItems.length === 0 && (
              <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: `${t.density.gapSm}px 0` }}>일정이 없습니다.</div>
            )}
            {dayItems.map(s => (
              <EventChip key={s.id} s={s} onToggle={onToggleComplete} onSelect={onSelectSchedule} />
            ))}
          </div>
        )
      })()}
      </div>
    </LCard>
  )
}
