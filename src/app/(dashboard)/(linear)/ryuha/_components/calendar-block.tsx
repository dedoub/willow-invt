'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, readableOn, useIsMobile } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LSegmented } from '@/app/(dashboard)/_components/linear-segmented'
import { LFilterChip } from '@/app/(dashboard)/_components/linear-filter-chip'
import { LBtn } from '@/app/(dashboard)/_components/linear-btn'
import { RyuhaSchedule, RyuhaDailyMemo } from '@/types/ryuha'

interface CalendarBlockProps {
  schedules: RyuhaSchedule[]
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

// 분류는 색조 대신 회색 명도로 나눈다 — 학교가 가장 진하고 기타가 가장 옅다.
// 사업관리 일정 카드와 같은 램프다(2026-09-10 카드 문법: 단색은 유지하되 분간은 되게).
// 강조색은 활성 칩·탭에만 쓴다.
const CATEGORY_TONES: Record<string, { bg: string; fg: string }> = {
  school:   { bg: '#D3D7DD', fg: '#1F242B' },
  academy:  { bg: '#DCE0E5', fg: '#262C33' },
  arts:     { bg: '#E4E7EB', fg: '#2C323A' },
  homework: { bg: '#EAECEF', fg: '#343A42' },
  etc:      { bg: '#F5F6F8', fg: '#4B525A' },
}

// 활성 칩 색은 다른 카드와 같이 테마가 정한다 — 여기서 따로 주지 않는다.
const CATEGORY_FILTERS = [
  { key: 'all',      label: '전체' },
  { key: 'school',   label: '학교' },
  { key: 'academy',  label: '학원' },
  { key: 'arts',     label: '예체능' },
  { key: 'homework', label: '과제' },
  { key: 'etc',      label: '기타' },
] as const

function getScheduleTone(s: RyuhaSchedule): { bg: string; fg: string } {
  return CATEGORY_TONES[s.type] || CATEGORY_TONES.etc
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
      fontSize: `calc(${compact ? t.type.tableCell : t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium, lineHeight: 1.3,
      minWidth: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'flex-start', gap: t.density.gapXs,
    }}>
      {/* Check circle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(s, dateStr) }}
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
        {!compact && s.homework_items && s.homework_items.length > 0 && (
          <div style={{ fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, opacity: 0.7 }}>
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
    // 메모는 일정이 아니다. 분류 램프의 한 칸을 빌려 쓰면 '기타 일정'으로 읽히므로
    // 판을 깔지 않고 연필 그림과 옅은 글자로만 구분한다.
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        padding: compact ? '2px 4px' : '3px 5px', borderRadius: 3,
        background: 'transparent', color: t.neutrals.muted,
        fontSize: `calc(${compact ? t.type.tableCell : t.type.tableBody}px * var(--fz, 1))`, fontWeight: t.weight.medium, lineHeight: 1.3,
        minWidth: 0, overflow: 'hidden', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: t.density.gapXs,
      }}
    >
      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
        <LIcon name="pencil" size={compact ? 8 : 10} stroke={2} />
      </span>
      <span style={{
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: 0.8,
      }}>{preview}</span>
    </div>
  )
}

/** Day cell with hover + button */
function DayCell({
  day, dateStr, isToday, schedules, memo, onAdd, onToggle, onSelect, onMemoClick, onClickDate, compact, dotsOnly, dimmed, borderRight, minHeight, isSelected,
}: {
  day: Date; dateStr: string; isToday: boolean
  schedules: RyuhaSchedule[]
  memo?: string
  onAdd: (date: string) => void
  onToggle: (schedule: RyuhaSchedule, date?: string) => void
  onSelect: (schedule: RyuhaSchedule) => void
  onMemoClick: (date: string) => void
  onClickDate?: (date: string) => void
  compact?: boolean; dotsOnly?: boolean; dimmed?: boolean
  isSelected?: boolean
  borderRight: boolean; minHeight: number
}) {
  const [hovered, setHovered] = useState(false)
  const [pop, setPop] = useState<{ left: number; top: number } | null>(null)
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
          <div style={{ display: 'flex', gap: t.density.tableRowGap }}>
            {!memo && (
              <button
                onClick={(e) => { e.stopPropagation(); onMemoClick(dateStr) }}
                title="메모 추가"
                style={{
                  width: 16, height: 16, borderRadius: t.radius.sm, border: 'none',
                  background: 'transparent', color: t.neutrals.muted,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, flexShrink: 0,
                }}
              >
                <LIcon name="file" size={9} stroke={2} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(dateStr) }}
              title="일정 추가"
              style={{
                width: 16, height: 16, borderRadius: t.radius.sm, border: 'none',
                background: 'transparent', color: t.neutrals.muted,
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
        {dotsOnly ? (
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: t.density.gapXs, marginTop: t.density.tableRowGap }}>
            {schedules.slice(0, 6).map(s => (
              <span key={s.id} style={{
                width: 6, height: 6, borderRadius: '50%',
                background: getScheduleTone(s).fg,
              }} />
            ))}
            {schedules.length > 6 && (
              <span style={{ fontSize: `calc(${t.type.chartLabel}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono, lineHeight: '6px' }}>+{schedules.length - 6}</span>
            )}
            {memo && <span style={{ width: 6, height: 6, borderRadius: 2, background: t.neutrals.subtle }} />}
          </div>
        ) : compact ? (
          <>
            {schedules.slice(0, 2).map(s => <EventChip key={s.id} s={s} dateStr={dateStr} compact onToggle={onToggle} onSelect={onSelect} />)}
            {memo && schedules.length < 2 && <MemoChip content={memo} compact onClick={() => onMemoClick(dateStr)} />}
            {(schedules.length > 2 || (memo && schedules.length >= 2)) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setPop({ left: Math.min(r.left, window.innerWidth - 252), top: r.bottom + 4 })
                }}
                style={{
                  alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0,
                  fontSize: `calc(${t.type.tableHead}px * var(--fz, 1))`, color: t.neutrals.muted, fontFamily: t.font.mono, cursor: 'pointer',
                }}
              >
                +{schedules.length - 2 + (memo && schedules.length >= 2 ? 1 : 0)}
              </button>
            )}
          </>
        ) : (
          <>
            {schedules.map(s => <EventChip key={s.id} s={s} dateStr={dateStr} onToggle={onToggle} onSelect={onSelect} />)}
            {memo && <MemoChip content={memo} onClick={() => onMemoClick(dateStr)} />}
          </>
        )}
      </div>
      {pop && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setPop(null) }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.04)' }} />
          <div onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', left: pop.left, top: pop.top, zIndex: 1001,
              width: 240, maxHeight: 340, overflowY: 'auto',
              background: t.neutrals.card, borderRadius: t.radius.md,
              border: `1px solid ${t.neutrals.line}`, padding: t.density.panelPadY,
              display: 'flex', flexDirection: 'column', gap: t.density.gapXs,
            }}>
            <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, fontWeight: t.weight.semibold, color: t.neutrals.text, marginBottom: t.density.tableRowGap }}>
              {dateStr.slice(5).replace('-', '월 ')}일
              <span style={{ marginLeft: t.density.gapXs, fontFamily: t.font.mono, fontWeight: t.weight.regular, color: t.neutrals.subtle }}>({schedules.length})</span>
            </div>
            {/* 팝오버(z 1001)는 셀 안에 있고 상세 다이얼로그(z 1000)는 페이지 레벨이라, 닫지 않으면 상세가 팝오버 뒤에 깔린다. */}
            {schedules.map(s => <EventChip key={s.id} s={s} dateStr={dateStr} onToggle={onToggle} onSelect={sch => { setPop(null); onSelect(sch) }} />)}
            {memo && <MemoChip content={memo} onClick={() => { setPop(null); onMemoClick(dateStr) }} />}
          </div>
        </>
      )}
    </div>
  )
}

export function CalendarBlock({
  schedules, selectedDate, onSelectDate,
  onAddSchedule, onEditSchedule, onToggleComplete,
  memos, onSaveMemo,
}: CalendarBlockProps) {
  const mobile = useIsMobile()
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

  const navLabel = viewMode === 'week'
    ? (() => {
        const w0 = weekDays[0], w6 = weekDays[6]
        if (w0.getMonth() === w6.getMonth()) return `${w0.getFullYear()}년 ${w0.getMonth() + 1}월`
        return `${w0.getMonth() + 1}월 — ${w6.getMonth() + 1}월`
      })()
    : `${baseDate.getFullYear()}년 ${baseDate.getMonth() + 1}월`

  return (
    // 카드는 빈 껍데기로 두고 안에서 구역마다 여백을 준다 — 사업관리 일정 카드와 같은 축.
    // 푸터·구분선이 카드 벽이 아니라 글자 줄에 맞으려면 카드가 pad 0 이어야 한다.
    <>
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
        <LFilterChip
          options={CATEGORY_FILTERS.map(({ key, label }) => ({ value: key, label }))}
          value={categoryFilter}
          onChange={setCategoryFilter}
          gap={t.density.gapXs}
        />
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
                memo={memoMap[dateStr]}
                onAdd={onAddSchedule} onToggle={onToggleComplete} onSelect={onEditSchedule}
                onMemoClick={setMemoDialogDate}
                onClickDate={onSelectDate}
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
                const isSelected = dateStr === selectedDate
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
                    compact dotsOnly={mobile} borderRight={di < 6}
                    minHeight={mobile ? 38 : 72}
                    isSelected={mobile && isSelected}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* 모바일 (주간·월간): 선택일의 일정/메모 상세 시트 */}
      {mobile && (() => {
        const dayItems = filteredSchedules.filter(s => matchesDate(s, selectedDate))
        const dayMemo = memoMap[selectedDate]
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
            {dayItems.length === 0 && !dayMemo && (
              <div style={{ fontSize: `calc(${t.type.control}px * var(--fz, 1))`, color: t.neutrals.subtle, padding: `${t.density.gapSm}px 0` }}>일정이 없습니다.</div>
            )}
            {dayItems.map(s => (
              <EventChip key={s.id} s={s} dateStr={selectedDate} onToggle={onToggleComplete} onSelect={onEditSchedule} />
            ))}
            {dayMemo && <MemoChip content={dayMemo} onClick={() => setMemoDialogDate(selectedDate)} />}
            {!dayMemo && (
              <LBtn size="sm" variant="ghost" icon={<LIcon name="pencil" size={11} stroke={2} />}
                onClick={() => setMemoDialogDate(selectedDate)}
                style={{ alignSelf: 'flex-start' }}>메모 작성</LBtn>
            )}
          </div>
        )
      })()}

      </div>
    </LCard>

    {/* ── Memo Dialog ──
        카드 밖 형제로 둔다. 카드 안에 두면 테마가 '카드 안 카드'로 보고 테두리를 지우고,
        document.body 로 옮기면 이번엔 테마 밖으로 나가 옛 문법으로 돌아간다.
        자리는 fixed 라 흐름에서 빠져 있어 카드 사이 간격을 벌리지 않는다. */}
    <MemoDialog
      date={memoDialogDate}
      content={memoDialogDate ? memoMap[memoDialogDate] || '' : ''}
      onSave={onSaveMemo}
      onClose={() => setMemoDialogDate(null)}
    />
    </>
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
    width: '100%', padding: `${t.density.panelPadY}px ${t.density.panelPadX}px`, borderRadius: t.radius.sm,
    border: `1px solid ${t.neutrals.line}`, background: t.neutrals.card,
    fontSize: `calc(${t.type.tableBody}px * var(--fz, 1))`, fontFamily: t.font.sans, color: t.neutrals.text,
    resize: 'vertical', outline: 'none', lineHeight: 1.6,
    boxSizing: 'border-box',
  }

  // 카드에서 열린 창이라 카드와 같은 껍데기를 쓴다 — 사업관리 상세 모달과 같은 축.
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: t.density.pagePadX,
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,0.18)', backdropFilter: 'blur(3px)' }} />

      <LCard pad={0} style={{ position: 'relative', width: 440, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ padding: t.density.cardPad, paddingBottom: t.density.panelPadY }}>
          <LSectionHead
            title={`${dateLabel} 메모`}
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

        <div style={{ padding: `0 ${t.density.cardPad}px` }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="메모를 작성하세요..."
            rows={6}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div data-card-foot="" style={{
          display: 'flex', alignItems: 'center', justifyContent: initialContent ? 'space-between' : 'flex-end',
          gap: t.density.gapSm,
          margin: `${t.density.gapMd}px ${t.density.cardPad}px 0`, paddingTop: t.density.panelPadY,
          paddingBottom: t.density.cardPad,
        }}>
          {initialContent && (
            <span data-danger-action=""><LBtn variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>삭제</LBtn></span>
          )}
          <div style={{ display: 'flex', gap: t.density.gapSm }}>
            <LBtn variant="ghost" size="sm" onClick={onClose}>취소</LBtn>
            <span data-primary-action=""><LBtn variant="secondary" size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장중...' : '저장'}</LBtn></span>
          </div>
        </div>
      </LCard>
    </div>
  )
}
