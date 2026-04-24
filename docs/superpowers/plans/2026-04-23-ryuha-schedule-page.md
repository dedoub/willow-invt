# 류하일정 Linear 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `/others/ryuha-study` 페이지를 Linear 디자인 시스템으로 재구현하여 `/willow-investment/(linear)/ryuha`에 배치

**Architecture:** page.tsx에서 모든 데이터를 일괄 fetch하여 하위 블록 컴포넌트에 props로 전달. 각 블록은 LCard + LSectionHead 패턴. CRUD 후 onDataChanged 콜백으로 전체 리로드. 기존 API 엔드포인트(`/api/ryuha/*`) 그대로 사용.

**Tech Stack:** Next.js App Router, React inline styles (Linear tokens), 기존 Supabase API

---

## 파일 구조

```
src/app/willow-investment/(linear)/ryuha/
├── page.tsx                    # 메인 페이지 (데이터 fetch, 블록 조립)
└── _components/
    ├── calendar-block.tsx      # 주간/월간 캘린더 + 일정 카드
    ├── schedule-dialog.tsx     # 일정 추가/편집 다이얼로그
    ├── daily-memo.tsx          # 선택 날짜 메모 인라인 편집
    ├── textbook-block.tsx      # 교재/단원 관리 + 과목 필터
    ├── textbook-dialog.tsx     # 교재/단원/과목 추가/편집 다이얼로그
    ├── progress-block.tsx      # 진도 요약 (진행률 바, 경고)
    ├── notebook-block.tsx      # 류하 수첩 (2열 패널, wiki-list 패턴)
    └── growth-block.tsx        # 성장기록 (SVG 차트 + 테이블 + 다이얼로그)
```

**수정 파일:**
- `src/app/willow-investment/_components/linear-sidebar.tsx` — 류하 링크 변경
- `src/app/willow-investment/_components/linear-skeleton.tsx` — RyuhaSkeleton 추가
- `src/app/willow-investment/_components/linear-icons.tsx` — 필요 아이콘 추가

---

### Task 1: 사이드바 링크 + 스켈레톤 + 아이콘 + 빈 페이지

**Files:**
- Modify: `src/app/willow-investment/_components/linear-sidebar.tsx:12`
- Modify: `src/app/willow-investment/_components/linear-icons.tsx`
- Modify: `src/app/willow-investment/_components/linear-skeleton.tsx`
- Create: `src/app/willow-investment/(linear)/ryuha/page.tsx`

- [ ] **Step 1: 사이드바 링크 변경**

`linear-sidebar.tsx`의 NAV_ITEMS에서 류하 항목의 href를 변경:

```typescript
// 변경 전
{ key: 'ryuha',  href: '/others/ryuha-study',       label: '류하일정',  icon: 'calendar' },
// 변경 후
{ key: 'ryuha',  href: '/willow-investment/ryuha',   label: '류하일정',  icon: 'calendar' },
```

- [ ] **Step 2: 아이콘 추가**

`linear-icons.tsx`의 paths에 다음 아이콘 추가:

```typescript
bookOpen: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2V3zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7V3z',
clipboardList: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h4M12 16h4M8 12h.01M8 16h.01',
circle: 'M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0',
checkCircle: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z',
clock: 'M12 6v6l4 2M12 3a9 9 0 100 18 9 9 0 000-18z',
pin: 'M12 2l4 4-1 9-3 3-3-3-1-9 4-4z',
pencil: 'M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
graduationCap: 'M22 10v6M2 10l10-5 10 5-10 5-10-5z',
ruler: 'M3 5v14M21 5v14M12 5v14M7 5v6M17 5v6',
scale: 'M12 3v18M5 8l7-5 7 5M5 8l-2 8h14l-2-8M5 8h14',
```

- [ ] **Step 3: RyuhaSkeleton 추가**

`linear-skeleton.tsx`에 추가:

```typescript
/** 류하일정 skeleton: calendar + memo + 2-col (textbook + progress) + notebook + growth */
export function RyuhaSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Calendar */}
      <CardSkel pad={0}>
        <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
          <Bone w={70} h={8} />
          <Bone w={60} h={14} style={{ marginTop: 6 }} />
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Bone key={`h-${i}`} h={12} />
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <Bone key={`c-${i}`} h={60} r={t.radius.sm} />
            ))}
          </div>
        </div>
      </CardSkel>

      {/* Memo */}
      <CardSkel>
        <Bone w={80} h={8} />
        <Bone w={60} h={14} style={{ marginTop: 6 }} />
        <Bone h={48} style={{ marginTop: 10 }} r={t.radius.sm} />
      </CardSkel>

      {/* Textbook + Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
            <Bone w={80} h={8} />
            <Bone w={100} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} h={40} style={{ marginTop: 8 }} r={t.radius.sm} />
            ))}
          </div>
        </CardSkel>
        <CardSkel>
          <Bone w={80} h={8} />
          <Bone w={80} h={14} style={{ marginTop: 6 }} />
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} h={16} style={{ marginTop: 10 }} />
          ))}
        </CardSkel>
      </div>

      {/* Notebook */}
      <CardSkel pad={0}>
        <div style={{ display: 'flex', minHeight: 300 }}>
          <div style={{ width: '42%', minWidth: 220, borderRight: `1px solid ${t.neutrals.line}`, padding: 12 }}>
            <Bone h={30} r={t.radius.sm} />
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} h={36} style={{ marginTop: 8 }} />
            ))}
          </div>
          <div style={{ flex: 1, padding: 16 }}>
            <Bone w="50%" h={16} />
            <Bone h={12} style={{ marginTop: 12 }} />
            <Bone h={12} w="80%" style={{ marginTop: 6 }} />
          </div>
        </div>
      </CardSkel>

      {/* Growth */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CardSkel>
          <Bone w={80} h={8} />
          <Bone h={120} style={{ marginTop: 10 }} r={t.radius.sm} />
        </CardSkel>
        <CardSkel pad={0}>
          <div style={{ padding: t.density.cardPad }}>
            <Bone w={80} h={8} />
            <Bone w={60} h={14} style={{ marginTop: 6 }} />
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} h={18} style={{ marginTop: 6 }} />
            ))}
          </div>
        </CardSkel>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 빈 페이지 셸 생성**

`src/app/willow-investment/(linear)/ryuha/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { RyuhaSkeleton } from '@/app/willow-investment/_components/linear-skeleton'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter, RyuhaSchedule, RyuhaDailyMemo, RyuhaHomeworkItem, RyuhaBodyRecord } from '@/types/ryuha'

interface RyuhaNote {
  id: string
  title: string
  content: string
  category: string
  is_pinned: boolean
  attachments: { name: string; url: string }[] | null
  created_at: string
  updated_at: string
}

export default function RyuhaPage() {
  const mobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState<RyuhaSubject[]>([])
  const [textbooks, setTextbooks] = useState<RyuhaTextbook[]>([])
  const [chapters, setChapters] = useState<RyuhaChapter[]>([])
  const [schedules, setSchedules] = useState<RyuhaSchedule[]>([])
  const [memos, setMemos] = useState<RyuhaDailyMemo[]>([])
  const [notes, setNotes] = useState<RyuhaNote[]>([])
  const [bodyRecords, setBodyRecords] = useState<RyuhaBodyRecord[]>([])
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [subjectsRes, textbooksRes, chaptersRes, schedulesRes, memosRes, notesRes, bodyRes] = await Promise.all([
        fetch('/api/ryuha/subjects'),
        fetch('/api/ryuha/textbooks'),
        fetch('/api/ryuha/chapters'),
        fetch('/api/ryuha/schedules'),
        fetch('/api/ryuha/memos'),
        fetch('/api/ryuha/notes'),
        fetch('/api/ryuha/body-records?limit=50'),
      ])
      if (subjectsRes.ok) setSubjects(await subjectsRes.json())
      if (textbooksRes.ok) setTextbooks(await textbooksRes.json())
      if (chaptersRes.ok) setChapters(await chaptersRes.json())
      if (schedulesRes.ok) setSchedules(await schedulesRes.json())
      if (memosRes.ok) setMemos(await memosRes.json())
      if (notesRes.ok) setNotes(await notesRes.json())
      if (bodyRes.ok) setBodyRecords(await bodyRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <>
      <div style={{ padding: '20px 0 0' }}>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3,
          fontFamily: t.font.sans, color: t.neutrals.text,
        }}>류하일정</h1>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, color: t.neutrals.muted,
          fontFamily: t.font.sans,
        }}>일정 · 교재 · 수첩 · 성장기록</p>
      </div>

      {loading ? <RyuhaSkeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ padding: 20, textAlign: 'center', color: t.neutrals.subtle, fontSize: 13 }}>
            블록 컴포넌트가 여기에 들어갑니다
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 5: 브라우저에서 확인 후 커밋**

Run: 브라우저에서 `/willow-investment/ryuha` 접속, 사이드바 링크 동작 + 스켈레톤 표시 확인

```bash
git add src/app/willow-investment/_components/linear-sidebar.tsx \
        src/app/willow-investment/_components/linear-icons.tsx \
        src/app/willow-investment/_components/linear-skeleton.tsx \
        src/app/willow-investment/(linear)/ryuha/page.tsx
git commit -m "feat: scaffold ryuha Linear page with sidebar link and skeleton"
```

---

### Task 2: calendar-block.tsx — 주간/월간 캘린더

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/calendar-block.tsx`

이 컴포넌트는 가장 크고 복잡합니다. 주간 뷰와 월간 뷰 모두 구현합니다.

- [ ] **Step 1: 캘린더 블록 작성**

```typescript
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
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/calendar-block.tsx
git commit -m "feat: add calendar block with week/month views"
```

---

### Task 3: schedule-dialog.tsx — 일정 추가/편집 다이얼로그

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/schedule-dialog.tsx`

- [ ] **Step 1: 스케줄 다이얼로그 작성**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSchedule, RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

interface ScheduleDialogProps {
  open: boolean
  schedule: RyuhaSchedule | null  // null = 추가 모드
  initialDate?: string
  subjects: RyuhaSubject[]
  textbooks: RyuhaTextbook[]
  chapters: RyuhaChapter[]
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
  type: 'homework' | 'self_study'
  subject_id: string
  chapter_ids: string[]
  color: string
  email_reminder: boolean
  homework_items: { content: string; deadline: string }[]
}

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1']

export function ScheduleDialog({
  open, schedule, initialDate, subjects, textbooks, chapters,
  onSave, onDelete, onClose,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleFormData>({
    title: '', description: '', schedule_date: '', end_date: '',
    start_time: '', end_time: '', type: 'self_study',
    subject_id: '', chapter_ids: [], color: '',
    email_reminder: false, homework_items: [],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
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
        subject_id: schedule.subject_id || '',
        chapter_ids: schedule.chapter_ids || [],
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
        type: 'self_study', subject_id: '', chapter_ids: [],
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

  const filteredTextbooks = form.subject_id
    ? textbooks.filter(tb => tb.subject_id === form.subject_id)
    : textbooks

  const filteredChapters = chapters.filter(ch =>
    filteredTextbooks.some(tb => tb.id === ch.textbook_id)
  )

  const toggleChapter = (chId: string) => {
    setForm(f => ({
      ...f,
      chapter_ids: f.chapter_ids.includes(chId)
        ? f.chapter_ids.filter(id => id !== chId)
        : [...f.chapter_ids, chId],
    }))
  }

  if (!open) return null

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: t.neutrals.subtle, fontFamily: t.font.sans,
    marginBottom: 4, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
    outline: 'none',
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
        width: '100%', maxWidth: 480, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: t.font.sans,
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>
            {schedule ? '일정 수정' : '일정 추가'}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.neutrals.subtle, padding: 4,
          }}>
            <LIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="일정 제목" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>시작일 *</label>
              <input type="date" value={form.schedule_date}
                onChange={e => setForm({ ...form, schedule_date: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>종료일</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>시작시간</label>
              <input type="time" value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>종료시간</label>
              <input type="time" value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>유형</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['self_study', 'homework'] as const).map(tp => (
                <button key={tp} onClick={() => setForm({ ...form, type: tp })}
                  style={{
                    padding: '4px 12px', borderRadius: t.radius.pill,
                    border: 'none', cursor: 'pointer',
                    fontSize: 11, fontFamily: t.font.sans,
                    fontWeight: form.type === tp ? t.weight.medium : t.weight.regular,
                    background: form.type === tp ? t.brand[100] : t.neutrals.inner,
                    color: form.type === tp ? t.brand[700] : t.neutrals.muted,
                  }}
                >
                  {tp === 'self_study' ? '자율학습' : '숙제'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>과목</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setForm({ ...form, subject_id: '', chapter_ids: [] })}
                style={{
                  padding: '3px 8px', borderRadius: t.radius.pill,
                  border: 'none', fontSize: 11, cursor: 'pointer',
                  background: !form.subject_id ? t.brand[100] : t.neutrals.inner,
                  color: !form.subject_id ? t.brand[700] : t.neutrals.muted,
                }}>전체</button>
              {subjects.map(s => (
                <button key={s.id} onClick={() => setForm({ ...form, subject_id: s.id, chapter_ids: [] })}
                  style={{
                    padding: '3px 8px', borderRadius: t.radius.pill,
                    border: 'none', fontSize: 11, cursor: 'pointer',
                    background: form.subject_id === s.id ? `${s.color}25` : t.neutrals.inner,
                    color: form.subject_id === s.id ? s.color : t.neutrals.muted,
                  }}>{s.name}</button>
              ))}
            </div>
          </div>

          {filteredChapters.length > 0 && (
            <div>
              <label style={labelStyle}>단원 연결</label>
              <div style={{
                maxHeight: 120, overflow: 'auto', borderRadius: t.radius.sm,
                background: t.neutrals.inner, padding: 6,
              }}>
                {filteredTextbooks.map(tb => {
                  const tbChapters = filteredChapters.filter(ch => ch.textbook_id === tb.id)
                  if (tbChapters.length === 0) return null
                  return (
                    <div key={tb.id} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: t.weight.medium, color: t.neutrals.subtle, marginBottom: 2 }}>
                        {tb.name}
                      </div>
                      {tbChapters.map(ch => (
                        <label key={ch.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '2px 4px', cursor: 'pointer', fontSize: 11,
                        }}>
                          <input type="checkbox" checked={form.chapter_ids.includes(ch.id)}
                            onChange={() => toggleChapter(ch.id)} />
                          {ch.name}
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>색상</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setForm({ ...form, color: '' })}
                style={{
                  width: 20, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: t.neutrals.inner,
                  outline: !form.color ? `2px solid ${t.neutrals.muted}` : 'none',
                  outlineOffset: 2,
                }} />
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 20, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: c,
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }} />
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>설명</label>
            <textarea value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="설명 (선택)" rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.email_reminder}
              onChange={e => setForm({ ...form, email_reminder: e.target.checked })} />
            이메일 리마인더
          </label>

          {/* Homework items */}
          {form.type === 'homework' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>과제 항목</label>
                <button onClick={() => setForm({
                  ...form,
                  homework_items: [...form.homework_items, { content: '', deadline: form.schedule_date }],
                })} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: t.brand[600], display: 'flex', alignItems: 'center', gap: 2,
                }}>
                  <LIcon name="plus" size={10} stroke={2} /> 추가
                </button>
              </div>
              {form.homework_items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center',
                }}>
                  <input value={item.content}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], content: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    placeholder="과제 내용" style={{ ...inputStyle, flex: 1 }} />
                  <input type="date" value={item.deadline}
                    onChange={e => {
                      const items = [...form.homework_items]
                      items[idx] = { ...items[idx], deadline: e.target.value }
                      setForm({ ...form, homework_items: items })
                    }}
                    style={{ ...inputStyle, width: 130 }} />
                  <button onClick={() => {
                    setForm({ ...form, homework_items: form.homework_items.filter((_, i) => i !== idx) })
                  }} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: t.accent.neg, padding: 2,
                  }}>
                    <LIcon name="x" size={12} stroke={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {schedule && onDelete ? (
            <button onClick={handleDelete} disabled={saving}
              style={{
                padding: '6px 12px', borderRadius: t.radius.sm,
                background: '#FEE2E2', border: 'none', fontSize: 12,
                color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
              }}>삭제</button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onClose} style={{
              padding: '6px 14px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none', fontSize: 12,
              color: t.neutrals.muted, cursor: 'pointer',
            }}>취소</button>
            <button onClick={handleSave} disabled={saving || !form.title.trim()}
              style={{
                padding: '6px 14px', borderRadius: t.radius.sm,
                background: t.brand[600], border: 'none', fontSize: 12,
                color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                opacity: saving || !form.title.trim() ? 0.5 : 1,
              }}>
              {saving ? '저장중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/schedule-dialog.tsx
git commit -m "feat: add schedule dialog for ryuha calendar"
```

---

### Task 4: daily-memo.tsx — 선택 날짜 메모

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/daily-memo.tsx`

- [ ] **Step 1: 데일리 메모 작성**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { RyuhaDailyMemo } from '@/types/ryuha'

interface DailyMemoProps {
  memos: RyuhaDailyMemo[]
  selectedDate: string
  onSave: (date: string, content: string) => Promise<void>
}

export function DailyMemo({ memos, selectedDate, onSave }: DailyMemoProps) {
  const memo = memos.find(m => m.memo_date === selectedDate)
  const [content, setContent] = useState(memo?.content || '')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(memo?.content || '')

  useEffect(() => {
    const c = memo?.content || ''
    setContent(c)
    lastSaved.current = c
  }, [selectedDate, memo?.content])

  const save = async (text: string) => {
    if (text === lastSaved.current) return
    setSaving(true)
    try {
      await onSave(selectedDate, text)
      lastSaved.current = text
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (val: string) => {
    setContent(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => save(val), 1500)
  }

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    save(content)
  }

  const dateParts = selectedDate.split('-')
  const dateLabel = `${parseInt(dateParts[1])}월 ${parseInt(dateParts[2])}일`

  return (
    <LCard>
      <LSectionHead eyebrow="MEMO" title={`${dateLabel} 메모`} action={
        saving ? (
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.mono }}>저장중...</span>
        ) : content !== lastSaved.current ? (
          <button onClick={() => save(content)} style={{
            padding: '3px 8px', borderRadius: t.radius.sm,
            background: t.brand[100], border: 'none', fontSize: 10,
            color: t.brand[700], cursor: 'pointer', fontFamily: t.font.mono,
          }}>저장</button>
        ) : null
      } />
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="메모를 작성하세요..."
        rows={3}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: t.radius.sm,
          border: 'none', background: t.neutrals.inner,
          fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
          resize: 'vertical', outline: 'none', lineHeight: 1.5,
        }}
      />
    </LCard>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/daily-memo.tsx
git commit -m "feat: add daily memo component for ryuha"
```

---

### Task 5: textbook-block.tsx — 교재/단원 관리

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/textbook-block.tsx`

- [ ] **Step 1: 교재 블록 작성**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

interface TextbookBlockProps {
  subjects: RyuhaSubject[]
  textbooks: RyuhaTextbook[]
  chapters: RyuhaChapter[]
  onManageSubjects: () => void
  onAddTextbook: () => void
  onEditTextbook: (textbook: RyuhaTextbook) => void
  onAddChapter: (textbookId: string) => void
  onEditChapter: (chapter: RyuhaChapter) => void
  onToggleChapterStatus: (chapter: RyuhaChapter) => void
}

const STATUS_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  pending:                { label: '대기',     bg: '#EDEDEE', fg: '#2A2A2E' },
  in_progress:            { label: '진행중',   bg: '#DCE8F5', fg: '#1F4E79' },
  review_notes_pending:   { label: '리뷰대기', bg: '#FBEFD5', fg: '#8B5A12' },
  completed:              { label: '완료',     bg: '#DAEEDD', fg: '#1F5F3D' },
}

export function TextbookBlock({
  subjects, textbooks, chapters,
  onManageSubjects, onAddTextbook, onEditTextbook,
  onAddChapter, onEditChapter, onToggleChapterStatus,
}: TextbookBlockProps) {
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [expandedTextbooks, setExpandedTextbooks] = useState<Set<string>>(new Set())

  const filteredTextbooks = useMemo(() => {
    if (subjectFilter === 'all') return textbooks
    return textbooks.filter(tb => tb.subject_id === subjectFilter)
  }, [textbooks, subjectFilter])

  const getChaptersForTextbook = (textbookId: string) =>
    chapters.filter(ch => ch.textbook_id === textbookId).sort((a, b) => a.order_index - b.order_index)

  const toggleExpand = (id: string) => {
    setExpandedTextbooks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="TEXTBOOKS" title="교재 관리" action={
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onManageSubjects} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
              color: t.neutrals.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="settings" size={11} stroke={2} /> 과목
            </button>
            <button onClick={onAddTextbook} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, fontFamily: t.font.sans, fontWeight: t.weight.medium,
              color: t.neutrals.muted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="plus" size={11} stroke={2} /> 교재
            </button>
          </div>
        } />
      </div>

      {/* Subject filter */}
      {subjects.length > 0 && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setSubjectFilter('all')} style={{
            padding: '4px 10px', borderRadius: t.radius.pill,
            border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: t.font.sans,
            fontWeight: subjectFilter === 'all' ? t.weight.medium : t.weight.regular,
            background: subjectFilter === 'all' ? t.brand[100] : t.neutrals.inner,
            color: subjectFilter === 'all' ? t.brand[700] : t.neutrals.muted,
          }}>전체</button>
          {subjects.map(s => (
            <button key={s.id} onClick={() => setSubjectFilter(s.id)} style={{
              padding: '4px 10px', borderRadius: t.radius.pill,
              border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: t.font.sans,
              fontWeight: subjectFilter === s.id ? t.weight.medium : t.weight.regular,
              background: subjectFilter === s.id ? `${s.color}25` : t.neutrals.inner,
              color: subjectFilter === s.id ? s.color : t.neutrals.muted,
            }}>{s.name}</button>
          ))}
        </div>
      )}

      {/* Textbook list */}
      <div>
        {filteredTextbooks.map(tb => {
          const subject = subjects.find(s => s.id === tb.subject_id)
          const tbChapters = getChaptersForTextbook(tb.id)
          const completedCount = tbChapters.filter(ch => ch.status === 'completed').length
          const isExpanded = expandedTextbooks.has(tb.id)

          return (
            <div key={tb.id} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
              {/* Textbook header */}
              <div
                onClick={() => toggleExpand(tb.id)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderLeft: subject?.color ? `3px solid ${subject.color}` : undefined,
                }}
              >
                <LIcon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2}
                  color={t.neutrals.subtle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: t.weight.medium }}>{tb.name}</div>
                  {tb.publisher && (
                    <div style={{ fontSize: 10, color: t.neutrals.subtle }}>{tb.publisher}</div>
                  )}
                </div>
                <span style={{
                  fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle,
                }}>{completedCount}/{tbChapters.length}</span>
                <button onClick={(e) => { e.stopPropagation(); onEditTextbook(tb) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: t.neutrals.subtle, padding: 2,
                }}>
                  <LIcon name="pencil" size={11} stroke={2} />
                </button>
              </div>

              {/* Chapters */}
              {isExpanded && (
                <div style={{ paddingLeft: 28, paddingRight: 14, paddingBottom: 8 }}>
                  {tbChapters.map(ch => {
                    const status = STATUS_LABELS[ch.status] || STATUS_LABELS.pending
                    return (
                      <div key={ch.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '5px 6px', fontSize: 12,
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: t.weight.medium,
                          padding: '1px 6px', borderRadius: t.radius.sm,
                          background: status.bg, color: status.fg,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }} onClick={() => onToggleChapterStatus(ch)}>
                          {status.label}
                        </span>
                        <span style={{
                          flex: 1, cursor: 'pointer',
                          textDecoration: ch.status === 'completed' ? 'line-through' : 'none',
                          color: ch.status === 'completed' ? t.neutrals.subtle : t.neutrals.text,
                        }} onClick={() => onEditChapter(ch)}>
                          {ch.name}
                        </span>
                        {ch.target_date && (
                          <span style={{
                            fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle,
                          }}>{ch.target_date.slice(5)}</span>
                        )}
                      </div>
                    )
                  })}
                  <button onClick={() => onAddChapter(tb.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: t.neutrals.subtle, padding: '4px 6px',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <LIcon name="plus" size={10} stroke={2} /> 단원 추가
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {filteredTextbooks.length === 0 && (
          <div style={{
            padding: '20px 14px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>교재가 없습니다</div>
        )}
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/textbook-block.tsx
git commit -m "feat: add textbook block with subject filter and chapter management"
```

---

### Task 6: textbook-dialog.tsx — 교재/단원/과목 다이얼로그

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/textbook-dialog.tsx`

이 파일에 3개 다이얼로그를 모두 포함합니다: SubjectDialog, TextbookDialog, ChapterDialog.

- [ ] **Step 1: 통합 다이얼로그 작성**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter } from '@/types/ryuha'

/* ── Shared dialog shell ── */
function DialogShell({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void
  children: React.ReactNode; footer: React.ReactNode
}) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.neutrals.card, borderRadius: t.radius.lg,
        width: '100%', maxWidth: 420, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', fontFamily: t.font.sans,
      }}>
        <div style={{
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.neutrals.subtle, padding: 4,
          }}><LIcon name="x" size={16} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {footer}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
  border: 'none', background: t.neutrals.inner,
  fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: t.radius.sm,
  background: t.brand[600], border: 'none', fontSize: 12,
  color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
}
const btnSecondary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: t.radius.sm,
  background: t.neutrals.inner, border: 'none', fontSize: 12,
  color: t.neutrals.muted, cursor: 'pointer',
}
const btnDanger: React.CSSProperties = {
  padding: '6px 12px', borderRadius: t.radius.sm,
  background: '#FEE2E2', border: 'none', fontSize: 12,
  color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
}

const SUBJECT_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1', '#F97316', '#14B8A6']

/* ── Subject Dialog ── */
export interface SubjectDialogProps {
  open: boolean
  subjects: RyuhaSubject[]
  onSave: (data: { id?: string; name: string; color: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export function SubjectDialog({ open, subjects, onSave, onDelete, onClose }: SubjectDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(SUBJECT_COLORS[0])
  const [saving, setSaving] = useState(false)

  const startEdit = (s: RyuhaSubject) => { setEditingId(s.id); setName(s.name); setColor(s.color) }
  const startAdd = () => { setEditingId(null); setName(''); setColor(SUBJECT_COLORS[0]) }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ id: editingId || undefined, name: name.trim(), color })
      startAdd()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try { await onDelete(id) } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title="과목 관리" onClose={onClose} footer={
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button onClick={onClose} style={btnSecondary}>닫기</button>
      </div>
    }>
      {/* Subject list */}
      {subjects.map(s => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: t.radius.sm,
          background: editingId === s.id ? t.neutrals.inner : 'transparent',
        }}>
          <span style={{ width: 14, height: 14, borderRadius: 7, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12 }}>{s.name}</span>
          <button onClick={() => startEdit(s)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: t.neutrals.subtle, padding: 2,
          }}><LIcon name="pencil" size={11} stroke={2} /></button>
          <button onClick={() => handleDelete(s.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: t.accent.neg, padding: 2,
          }}><LIcon name="trash" size={11} stroke={2} /></button>
        </div>
      ))}

      {/* Add/Edit form */}
      <div style={{ borderTop: `1px solid ${t.neutrals.line}`, paddingTop: 12 }}>
        <label style={labelStyle}>{editingId ? '과목 수정' : '새 과목'}</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="과목명" style={{ ...inputStyle, marginBottom: 8 }} />
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {SUBJECT_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{
              width: 18, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
              background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2,
            }} />
          ))}
        </div>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>
          {editingId ? '수정' : '추가'}
        </button>
        {editingId && (
          <button onClick={startAdd} style={{ ...btnSecondary, marginLeft: 6 }}>취소</button>
        )}
      </div>
    </DialogShell>
  )
}

/* ── Textbook Dialog ── */
export interface TextbookDialogProps {
  open: boolean
  textbook: RyuhaTextbook | null
  subjects: RyuhaSubject[]
  onSave: (data: { id?: string; subject_id: string; name: string; publisher: string; description: string }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export function TextbookDialog({ open, textbook, subjects, onSave, onDelete, onClose }: TextbookDialogProps) {
  const [subjectId, setSubjectId] = useState('')
  const [name, setName] = useState('')
  const [publisher, setPublisher] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (textbook) {
      setSubjectId(textbook.subject_id); setName(textbook.name)
      setPublisher(textbook.publisher || ''); setDescription(textbook.description || '')
    } else {
      setSubjectId(subjects[0]?.id || ''); setName(''); setPublisher(''); setDescription('')
    }
  }, [open, textbook, subjects])

  const handleSave = async () => {
    if (!name.trim() || !subjectId) return
    setSaving(true)
    try {
      await onSave({ id: textbook?.id, subject_id: subjectId, name: name.trim(), publisher, description })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title={textbook ? '교재 수정' : '교재 추가'} onClose={onClose} footer={
      <>
        {textbook && onDelete ? (
          <button onClick={() => { onDelete(textbook.id); onClose() }} style={btnDanger}>삭제</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>저장</button>
        </div>
      </>
    }>
      <div>
        <label style={labelStyle}>과목 *</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {subjects.map(s => (
            <button key={s.id} onClick={() => setSubjectId(s.id)} style={{
              padding: '3px 8px', borderRadius: t.radius.pill,
              border: 'none', fontSize: 11, cursor: 'pointer',
              background: subjectId === s.id ? `${s.color}25` : t.neutrals.inner,
              color: subjectId === s.id ? s.color : t.neutrals.muted,
            }}>{s.name}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={labelStyle}>교재명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="교재명" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>출판사</label>
        <input value={publisher} onChange={e => setPublisher(e.target.value)} placeholder="출판사" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>설명</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="설명" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
    </DialogShell>
  )
}

/* ── Chapter Dialog ── */
export interface ChapterDialogProps {
  open: boolean
  chapter: RyuhaChapter | null
  textbookId: string
  onSave: (data: { id?: string; textbook_id: string; name: string; description: string; target_date: string }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onClose: () => void
}

export function ChapterDialog({ open, chapter, textbookId, onSave, onDelete, onClose }: ChapterDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (chapter) {
      setName(chapter.name); setDescription(chapter.description || '')
      setTargetDate(chapter.target_date || '')
    } else {
      setName(''); setDescription(''); setTargetDate('')
    }
  }, [open, chapter])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave({ id: chapter?.id, textbook_id: textbookId, name: name.trim(), description, target_date: targetDate })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <DialogShell open={open} title={chapter ? '단원 수정' : '단원 추가'} onClose={onClose} footer={
      <>
        {chapter && onDelete ? (
          <button onClick={() => { onDelete(chapter.id); onClose() }} style={btnDanger}>삭제</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={btnSecondary}>취소</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ ...btnPrimary, opacity: saving || !name.trim() ? 0.5 : 1 }}>저장</button>
        </div>
      </>
    }>
      <div>
        <label style={labelStyle}>단원명 *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="단원명" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>목표일</label>
        <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>설명</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="설명" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
    </DialogShell>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/textbook-dialog.tsx
git commit -m "feat: add subject, textbook, and chapter dialogs"
```

---

### Task 7: progress-block.tsx — 진도 요약

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/progress-block.tsx`

- [ ] **Step 1: 진도 블록 작성**

```typescript
'use client'

import { useMemo } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaSubject, RyuhaChapter } from '@/types/ryuha'

interface ProgressBlockProps {
  subjects: RyuhaSubject[]
  chapters: RyuhaChapter[]
}

export function ProgressBlock({ subjects, chapters }: ProgressBlockProps) {
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    return subjects.map(s => {
      const subjectChapters = chapters.filter(ch => {
        const tb = ch.textbook
        return tb && 'subject_id' in tb && tb.subject_id === s.id
      })
      const total = subjectChapters.length
      const completed = subjectChapters.filter(ch => ch.status === 'completed').length
      const overdue = subjectChapters.filter(ch =>
        ch.target_date && ch.target_date < today && ch.status !== 'completed'
      )
      const upcoming = subjectChapters.filter(ch =>
        ch.target_date && ch.target_date >= today && ch.target_date <= sevenDaysLater && ch.status !== 'completed'
      )
      return { subject: s, total, completed, pct: total > 0 ? completed / total * 100 : 0, overdue, upcoming }
    }).filter(s => s.total > 0)
  }, [subjects, chapters])

  const totalOverdue = stats.reduce((n, s) => n + s.overdue.length, 0)
  const totalUpcoming = stats.reduce((n, s) => n + s.upcoming.length, 0)

  return (
    <LCard>
      <LSectionHead eyebrow="PROGRESS" title="진도 현황" action={
        <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted }}>
          {stats.reduce((n, s) => n + s.completed, 0)}/{stats.reduce((n, s) => n + s.total, 0)}
        </span>
      } />

      {/* Subject progress bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stats.map(({ subject, total, completed, pct }) => (
          <div key={subject.id}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, fontWeight: t.weight.medium }}>{subject.name}</span>
              <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                {completed}/{total} ({Math.round(pct)}%)
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: t.neutrals.inner, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: `${pct}%`, background: subject.color,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(totalOverdue > 0 || totalUpcoming > 0) && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {totalOverdue > 0 && (
            <div style={{
              padding: '6px 10px', borderRadius: t.radius.sm,
              background: '#FEE2E2', fontSize: 11, color: t.accent.neg,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <LIcon name="clock" size={12} stroke={2} />
              지연 {totalOverdue}건
              <span style={{ color: t.accent.neg + '99', marginLeft: 4 }}>
                {stats.flatMap(s => s.overdue).slice(0, 3).map(ch => ch.name).join(', ')}
              </span>
            </div>
          )}
          {totalUpcoming > 0 && (
            <div style={{
              padding: '6px 10px', borderRadius: t.radius.sm,
              background: '#FBEFD5', fontSize: 11, color: '#8B5A12',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <LIcon name="calendar" size={12} stroke={2} />
              이번 주 마감 {totalUpcoming}건
              <span style={{ color: '#8B5A1280', marginLeft: 4 }}>
                {stats.flatMap(s => s.upcoming).slice(0, 3).map(ch => ch.name).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {stats.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: t.neutrals.subtle, padding: 16 }}>
          교재/단원을 추가하세요
        </div>
      )}
    </LCard>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/progress-block.tsx
git commit -m "feat: add progress block with subject stats and alerts"
```

---

### Task 8: notebook-block.tsx — 류하 수첩

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/notebook-block.tsx`

wiki-list.tsx와 동일한 2열 패널 패턴. 플레인 텍스트 + 파일 첨부.

- [ ] **Step 1: 수첩 블록 작성**

```typescript
'use client'

import { useState, useMemo } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

interface RyuhaNote {
  id: string
  title: string
  content: string
  category: string
  is_pinned: boolean
  attachments: { name: string; url: string }[] | null
  created_at: string
  updated_at: string
}

interface NotebookBlockProps {
  notes: RyuhaNote[]
  onCreate: (data: { title: string; content: string; attachments?: { name: string; url: string }[] }) => Promise<void>
  onUpdate: (id: string, data: Partial<{ title: string; content: string; is_pinned: boolean; attachments: { name: string; url: string }[] | null }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const PAGE_SIZE_KEY = 'ryuha-notebook-page-size'
const DEFAULT_PAGE_SIZE = 10
const ROW_H = 44
const FILTER_H = 52
const PAGI_H = 33

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 50 ? n : DEFAULT_PAGE_SIZE
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function NotebookBlock({ notes, onCreate, onUpdate, onDelete }: NotebookBlockProps) {
  const mobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  // Edit state
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editFiles, setEditFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.trim().toLowerCase()
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const selected = selectedId ? notes.find(n => n.id === selectedId) : null

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(50, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const startAdd = () => {
    setAdding(true); setEditing(true)
    setEditTitle(''); setEditContent(''); setEditFiles([])
    setSelectedId(null)
  }

  const startEdit = (note: RyuhaNote) => {
    setEditing(true)
    setEditTitle(note.title); setEditContent(note.content); setEditFiles([])
  }

  const cancelEdit = () => {
    setEditing(false); setAdding(false)
    setEditTitle(''); setEditContent(''); setEditFiles([])
  }

  const handleSave = async () => {
    if (!editTitle.trim() && !editContent.trim()) return
    setSaving(true)
    try {
      let attachments: { name: string; url: string }[] | undefined
      if (editFiles.length > 0) {
        attachments = []
        for (const file of editFiles) {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/wiki/upload', { method: 'POST', body: formData })
          if (res.ok) {
            const { url } = await res.json()
            attachments.push({ name: file.name, url })
          }
        }
      }
      if (adding) {
        await onCreate({ title: editTitle, content: editContent, attachments })
      } else if (selected) {
        const existing = selected.attachments || []
        await onUpdate(selected.id, {
          title: editTitle, content: editContent,
          attachments: attachments ? [...existing, ...attachments] : undefined,
        })
      }
      cancelEdit()
    } finally { setSaving(false) }
  }

  const containerH = FILTER_H + pageSize * ROW_H + 4 + PAGI_H

  // Mobile: show list or detail
  const showDetail = mobile && (selectedId || adding)

  return (
    <LCard pad={0}>
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead eyebrow="NOTEBOOK" title="류하 수첩" action={
          <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
            {notes.length}건
          </span>
        } />
      </div>

      <div style={{
        display: 'flex',
        flexDirection: mobile ? 'column' : 'row',
        height: mobile ? 'auto' : containerH,
        minHeight: 300,
      }}>
        {/* Left panel: list */}
        {!showDetail && (
          <div style={{
            width: mobile ? '100%' : '42%', minWidth: mobile ? undefined : 220,
            borderRight: mobile ? 'none' : `1px solid ${t.neutrals.line}`,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Search + Add */}
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <LIcon name="search" size={12} color={t.neutrals.subtle}
                  stroke={2} />
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
                  placeholder="검색..."
                  style={{
                    width: '100%', padding: '6px 8px 6px 26px', borderRadius: t.radius.sm,
                    border: 'none', background: t.neutrals.inner,
                    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
                  }} />
              </div>
              <button onClick={startAdd} style={{
                padding: '6px 10px', borderRadius: t.radius.sm,
                background: t.neutrals.inner, border: 'none',
                fontSize: 11, cursor: 'pointer', color: t.neutrals.muted,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <LIcon name="plus" size={11} stroke={2} /> 추가
              </button>
            </div>

            {/* Note list */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {paged.map(note => (
                <div key={note.id}
                  onClick={() => { setSelectedId(note.id); setEditing(false) }}
                  style={{
                    padding: '8px 12px', cursor: 'pointer',
                    borderTop: `1px solid ${t.neutrals.line}`,
                    background: selectedId === note.id ? t.neutrals.inner : 'transparent',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {note.is_pinned && <LIcon name="pin" size={10} color={t.accent.warn} stroke={2} />}
                    <span style={{
                      fontSize: 12, fontWeight: t.weight.medium,
                      flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{note.title || '(제목 없음)'}</span>
                    <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.subtle }}>
                      {fmtDate(note.updated_at)}
                    </span>
                  </div>
                  {note.content && (
                    <div style={{
                      fontSize: 11, color: t.neutrals.subtle, marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{note.content.slice(0, 60)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 12px', borderTop: `1px solid ${t.neutrals.line}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input value={pageSizeInput}
                  onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
                  onBlur={commitPageSize}
                  onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
                  style={{
                    width: 32, textAlign: 'center', border: 'none',
                    background: t.neutrals.inner, borderRadius: t.radius.sm,
                    fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted,
                    padding: '2px 0', outline: 'none',
                  }} />
                <span style={{ fontSize: 10, color: t.neutrals.subtle }}>개씩</span>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                    style={{
                      background: 'transparent', border: 'none',
                      cursor: page === 0 ? 'default' : 'pointer', padding: 4,
                      color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                    }}>
                    <LIcon name="chevronLeft" size={13} stroke={2} />
                  </button>
                  <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                    {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
                  </span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                    style={{
                      background: 'transparent', border: 'none',
                      cursor: page >= totalPages - 1 ? 'default' : 'pointer', padding: 4,
                      color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                    }}>
                    <LIcon name="chevronRight" size={13} stroke={2} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right panel: detail */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {showDetail && mobile && (
            <button onClick={() => { setSelectedId(null); setAdding(false); cancelEdit() }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: t.brand[600], padding: 0, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
              <LIcon name="chevronLeft" size={12} stroke={2} /> 목록으로
            </button>
          )}

          {(editing || adding) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                placeholder="제목"
                style={{
                  padding: '8px 10px', borderRadius: t.radius.sm,
                  border: 'none', background: t.neutrals.inner,
                  fontSize: 14, fontWeight: t.weight.medium,
                  fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
                }} />
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                placeholder="내용..."
                style={{
                  flex: 1, minHeight: 150, padding: '8px 10px', borderRadius: t.radius.sm,
                  border: 'none', background: t.neutrals.inner,
                  fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text,
                  outline: 'none', resize: 'vertical', lineHeight: 1.6,
                }} />
              {/* File attach */}
              <div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, cursor: 'pointer',
                  fontSize: 11, color: t.neutrals.muted,
                }}>
                  <LIcon name="paperclip" size={11} stroke={2} />
                  파일 첨부
                  <input type="file" multiple hidden
                    onChange={e => setEditFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                </label>
                {editFiles.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: t.neutrals.subtle }}>
                    {editFiles.map((f, i) => <span key={i} style={{ marginRight: 8 }}>{f.name}</span>)}
                  </div>
                )}
                {selected?.attachments && selected.attachments.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: t.neutrals.subtle }}>
                    기존: {selected.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer"
                        style={{ color: t.brand[600], marginRight: 8 }}>{a.name}</a>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button onClick={cancelEdit} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', fontSize: 12,
                  color: t.neutrals.muted, cursor: 'pointer',
                }}>취소</button>
                <button onClick={handleSave} disabled={saving}
                  style={{
                    padding: '6px 14px', borderRadius: t.radius.sm,
                    background: t.brand[600], border: 'none', fontSize: 12,
                    color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                    opacity: saving ? 0.5 : 1,
                  }}>{saving ? '저장중...' : '저장'}</button>
              </div>
            </div>
          ) : selected ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: t.weight.semibold }}>{selected.title || '(제목 없음)'}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onUpdate(selected.id, { is_pinned: !selected.is_pinned })}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: selected.is_pinned ? t.accent.warn : t.neutrals.subtle,
                    }}>
                    <LIcon name="pin" size={13} stroke={2} />
                  </button>
                  <button onClick={() => startEdit(selected)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: t.neutrals.subtle,
                    }}>
                    <LIcon name="pencil" size={13} stroke={2} />
                  </button>
                  <button onClick={() => { onDelete(selected.id); setSelectedId(null) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: t.accent.neg,
                    }}>
                    <LIcon name="trash" size={13} stroke={2} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 12 }}>
                {new Date(selected.updated_at).toLocaleDateString('ko-KR')}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.7, color: t.neutrals.text,
                whiteSpace: 'pre-wrap',
              }}>
                {selected.content}
              </div>
              {selected.attachments && selected.attachments.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selected.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"
                      style={{
                        fontSize: 11, color: t.brand[600],
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                      <LIcon name="paperclip" size={11} stroke={2} /> {a.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.neutrals.subtle, fontSize: 12,
            }}>
              노트를 선택하세요
            </div>
          )}
        </div>
      </div>
    </LCard>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/notebook-block.tsx
git commit -m "feat: add notebook block with 2-panel layout and file attach"
```

---

### Task 9: growth-block.tsx — 성장기록

**Files:**
- Create: `src/app/willow-investment/(linear)/ryuha/_components/growth-block.tsx`

커스텀 SVG 차트 + 기록 테이블 + 추가/편집 다이얼로그 all-in-one.

- [ ] **Step 1: 성장기록 블록 작성**

```typescript
'use client'

import { useState, useMemo, useEffect } from 'react'
import { t, useIsMobile } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'
import { RyuhaBodyRecord } from '@/types/ryuha'

interface GrowthBlockProps {
  records: RyuhaBodyRecord[]
  onSave: (data: { id?: string; record_date: string; height_cm: string; weight_kg: string; notes: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function SvgLineChart({ records }: { records: RyuhaBodyRecord[] }) {
  const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date)).slice(-12)
  if (sorted.length < 2) {
    return (
      <div style={{
        height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: t.neutrals.subtle, fontSize: 12,
      }}>데이터가 부족합니다 (2개 이상 필요)</div>
    )
  }

  const W = 300, H = 140, PX = 30, PY = 15
  const chartW = W - PX * 2, chartH = H - PY * 2

  const heights = sorted.map(r => r.height_cm).filter((v): v is number => v !== null)
  const weights = sorted.map(r => r.weight_kg).filter((v): v is number => v !== null)

  const hMin = heights.length > 0 ? Math.min(...heights) - 2 : 0
  const hMax = heights.length > 0 ? Math.max(...heights) + 2 : 1
  const wMin = weights.length > 0 ? Math.min(...weights) - 2 : 0
  const wMax = weights.length > 0 ? Math.max(...weights) + 2 : 1

  const xStep = chartW / (sorted.length - 1)

  const hPoints = sorted.map((r, i) => {
    if (r.height_cm === null) return null
    const x = PX + i * xStep
    const y = PY + chartH - ((r.height_cm - hMin) / (hMax - hMin)) * chartH
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  const wPoints = sorted.map((r, i) => {
    if (r.weight_kg === null) return null
    const x = PX + i * xStep
    const y = PY + chartH - ((r.weight_kg - wMin) / (wMax - wMin)) * chartH
    return `${x},${y}`
  }).filter(Boolean).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => (
        <line key={pct} x1={PX} x2={W - PX} y1={PY + chartH * (1 - pct)} y2={PY + chartH * (1 - pct)}
          stroke={t.neutrals.line} strokeWidth={0.5} />
      ))}
      {/* Height line */}
      {hPoints && <polyline points={hPoints} fill="none" stroke="#6366F1" strokeWidth={1.5} />}
      {/* Weight line */}
      {wPoints && <polyline points={wPoints} fill="none" stroke="#F97316" strokeWidth={1.5} />}
      {/* Dots */}
      {sorted.map((r, i) => {
        const x = PX + i * xStep
        return (
          <g key={i}>
            {r.height_cm !== null && (
              <circle cx={x} cy={PY + chartH - ((r.height_cm - hMin) / (hMax - hMin)) * chartH}
                r={2.5} fill="#6366F1" />
            )}
            {r.weight_kg !== null && (
              <circle cx={x} cy={PY + chartH - ((r.weight_kg - wMin) / (wMax - wMin)) * chartH}
                r={2.5} fill="#F97316" />
            )}
            <text x={x} y={H - 2} textAnchor="middle" fontSize={7} fill={t.neutrals.subtle}
              fontFamily={t.font.mono}>
              {r.record_date.slice(5)}
            </text>
          </g>
        )
      })}
      {/* Y axis labels */}
      <text x={PX - 4} y={PY + 4} textAnchor="end" fontSize={7} fill="#6366F1">{Math.round(hMax)}</text>
      <text x={PX - 4} y={PY + chartH + 4} textAnchor="end" fontSize={7} fill="#6366F1">{Math.round(hMin)}</text>
      <text x={W - PX + 4} y={PY + 4} textAnchor="start" fontSize={7} fill="#F97316">{Math.round(wMax)}</text>
      <text x={W - PX + 4} y={PY + chartH + 4} textAnchor="start" fontSize={7} fill="#F97316">{Math.round(wMin)}</text>
      {/* Legend */}
      <circle cx={PX} cy={6} r={3} fill="#6366F1" />
      <text x={PX + 6} y={9} fontSize={7} fill={t.neutrals.muted}>키(cm)</text>
      <circle cx={PX + 45} cy={6} r={3} fill="#F97316" />
      <text x={PX + 51} y={9} fontSize={7} fill={t.neutrals.muted}>몸무게(kg)</text>
    </svg>
  )
}

export function GrowthBlock({ records, onSave, onDelete }: GrowthBlockProps) {
  const mobile = useIsMobile()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<RyuhaBodyRecord | null>(null)
  const [form, setForm] = useState({ record_date: '', height_cm: '', weight_kg: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const sorted = useMemo(() =>
    [...records].sort((a, b) => b.record_date.localeCompare(a.record_date)),
    [records])

  const openDialog = (record?: RyuhaBodyRecord) => {
    if (record) {
      setEditRecord(record)
      setForm({
        record_date: record.record_date,
        height_cm: record.height_cm?.toString() || '',
        weight_kg: record.weight_kg?.toString() || '',
        notes: record.notes || '',
      })
    } else {
      setEditRecord(null)
      const today = new Date()
      setForm({
        record_date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        height_cm: '', weight_kg: '', notes: '',
      })
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ id: editRecord?.id, ...form })
      setDialogOpen(false)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!editRecord) return
    setSaving(true)
    try { await onDelete(editRecord.id); setDialogOpen(false) }
    finally { setSaving(false) }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: t.neutrals.subtle, marginBottom: 4, display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: t.radius.sm,
    border: 'none', background: t.neutrals.inner,
    fontSize: 12, fontFamily: t.font.sans, color: t.neutrals.text, outline: 'none',
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14 }}>
        {/* Chart */}
        <LCard>
          <LSectionHead eyebrow="GROWTH" title="성장기록" action={
            <button onClick={() => openDialog()} style={{
              padding: '4px 10px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, cursor: 'pointer', color: t.neutrals.muted,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <LIcon name="plus" size={11} stroke={2} /> 기록
            </button>
          } />
          <SvgLineChart records={records} />
        </LCard>

        {/* Table */}
        <LCard pad={0}>
          <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
            <LSectionHead eyebrow="RECORDS" title="측정 기록" action={
              <span style={{ fontSize: 11, fontFamily: t.font.mono, color: t.neutrals.muted }}>
                {records.length}건
              </span>
            } />
          </div>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '80px 60px 60px 1fr',
            gap: 8, padding: '6px 14px', fontSize: 10, fontWeight: t.weight.semibold,
            color: t.neutrals.subtle, fontFamily: t.font.mono, textTransform: 'uppercase' as const,
          }}>
            <span>날짜</span><span>키</span><span>몸무게</span><span>메모</span>
          </div>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {sorted.slice(0, 20).map(r => (
              <div key={r.id} onClick={() => openDialog(r)} style={{
                display: 'grid', gridTemplateColumns: '80px 60px 60px 1fr',
                gap: 8, padding: '7px 14px', alignItems: 'center',
                borderTop: `1px solid ${t.neutrals.line}`,
                fontSize: 12, cursor: 'pointer',
              }}>
                <span style={{ fontFamily: t.font.mono, fontSize: 11, color: t.neutrals.muted }}>
                  {r.record_date.slice(5)}
                </span>
                <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {r.height_cm ?? '-'}
                </span>
                <span style={{ fontFamily: t.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                  {r.weight_kg ?? '-'}
                </span>
                <span style={{ color: t.neutrals.subtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.notes || ''}
                </span>
              </div>
            ))}
          </div>
        </LCard>
      </div>

      {/* Dialog */}
      {dialogOpen && (
        <div onClick={() => setDialogOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: t.neutrals.card, borderRadius: t.radius.lg,
            width: '100%', maxWidth: 380, fontFamily: t.font.sans,
          }}>
            <div style={{
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', borderBottom: `1px solid ${t.neutrals.line}`,
            }}>
              <span style={{ fontSize: 15, fontWeight: t.weight.semibold }}>
                {editRecord ? '기록 수정' : '새 기록'}
              </span>
              <button onClick={() => setDialogOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: t.neutrals.subtle, padding: 4,
              }}><LIcon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>날짜 *</label>
                <input type="date" value={form.record_date}
                  onChange={e => setForm({ ...form, record_date: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>키 (cm)</label>
                  <input value={form.height_cm}
                    onChange={e => setForm({ ...form, height_cm: e.target.value })}
                    placeholder="예: 142.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>몸무게 (kg)</label>
                  <input value={form.weight_kg}
                    onChange={e => setForm({ ...form, weight_kg: e.target.value })}
                    placeholder="예: 38.2" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>메모</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="메모" style={inputStyle} />
              </div>
            </div>
            <div style={{
              padding: '12px 16px', borderTop: `1px solid ${t.neutrals.line}`,
              display: 'flex', justifyContent: 'space-between',
            }}>
              {editRecord ? (
                <button onClick={handleDelete} disabled={saving} style={{
                  padding: '6px 12px', borderRadius: t.radius.sm,
                  background: '#FEE2E2', border: 'none', fontSize: 12,
                  color: t.accent.neg, cursor: 'pointer', fontWeight: t.weight.medium,
                }}>삭제</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setDialogOpen(false)} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.neutrals.inner, border: 'none', fontSize: 12,
                  color: t.neutrals.muted, cursor: 'pointer',
                }}>취소</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '6px 14px', borderRadius: t.radius.sm,
                  background: t.brand[600], border: 'none', fontSize: 12,
                  color: '#fff', cursor: 'pointer', fontWeight: t.weight.medium,
                  opacity: saving ? 0.5 : 1,
                }}>{saving ? '저장중...' : '저장'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/_components/growth-block.tsx
git commit -m "feat: add growth block with SVG chart and records table"
```

---

### Task 10: page.tsx 조립 — 블록 통합 + CRUD 핸들러

**Files:**
- Modify: `src/app/willow-investment/(linear)/ryuha/page.tsx`

page.tsx에 모든 블록을 임포트하고, CRUD 핸들러(API 호출 + 리로드) 연결.

- [ ] **Step 1: page.tsx 전체 재작성**

기존 빈 페이지 셸을 완전히 교체합니다. page.tsx는 다음을 수행합니다:

1. 모든 데이터 일괄 fetch (subjects, textbooks, chapters, schedules, memos, notes, bodyRecords)
2. 각 블록에 데이터 + 콜백 props 전달
3. 일정/교재/단원/과목 CRUD API 호출 함수들
4. 다이얼로그 열기/닫기 상태 관리

이 파일은 기존 invest/page.tsx와 mgmt/page.tsx 패턴을 따릅니다. 데이터 로딩은 loadData 콜백에서, CRUD 후에는 loadData()를 다시 호출합니다.

주요 핸들러:
- `handleSaveSchedule` — POST/PUT `/api/ryuha/schedules` + homework items 연동
- `handleDeleteSchedule` — DELETE `/api/ryuha/schedules?id=`
- `handleToggleComplete` — PUT `/api/ryuha/schedules` (is_completed/completed_dates 토글) 또는 POST `/api/ryuha/schedules/toggle-date`
- `handleSaveMemo` — POST `/api/ryuha/memos` (upsert)
- `handleSaveSubject` — POST/PUT `/api/ryuha/subjects`
- `handleDeleteSubject` — DELETE `/api/ryuha/subjects?id=`
- `handleSaveTextbook` — POST/PUT `/api/ryuha/textbooks`
- `handleDeleteTextbook` — DELETE `/api/ryuha/textbooks?id=`
- `handleSaveChapter` — POST/PUT `/api/ryuha/chapters`
- `handleDeleteChapter` — DELETE `/api/ryuha/chapters?id=`
- `handleToggleChapterStatus` — PUT `/api/ryuha/chapters` (status cycle)
- `handleSaveNote` — POST/PUT `/api/ryuha/notes`
- `handleDeleteNote` — DELETE `/api/ryuha/notes?id=`
- `handleSaveBodyRecord` — POST `/api/ryuha/body-records`
- `handleDeleteBodyRecord` — DELETE `/api/ryuha/body-records?id=`

각 핸들러는 fetch → loadData() 패턴. 다이얼로그 상태: scheduleDialogOpen, editingSchedule, subjectDialogOpen, textbookDialogOpen, editingTextbook, chapterDialogOpen, editingChapter, chapterTextbookId.

page.tsx 코드는 300-400줄 정도. 이 태스크는 구현자가 기존 mgmt/page.tsx 패턴과 위 블록의 props interface를 보고 조립합니다.

- [ ] **Step 2: 브라우저에서 전체 기능 확인**

Run: `/willow-investment/ryuha` 접속
확인사항:
- 캘린더 주간/월간 전환
- 일정 추가/편집/삭제/완료토글
- 날짜 선택 → 메모 표시/저장
- 교재/단원 목록/추가/편집/삭제/상태변경
- 과목 관리
- 수첩 노트 CRUD/검색/핀/파일첨부
- 성장기록 차트/테이블/CRUD
- 모바일 반응형

- [ ] **Step 3: 커밋**

```bash
git add src/app/willow-investment/(linear)/ryuha/page.tsx
git commit -m "feat: assemble ryuha page with all blocks and CRUD handlers"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 캘린더 주간/월간 뷰 → Task 2
- [x] 드래그앤드롭 제거 → 설계에서 제외됨
- [x] 일정 CRUD 다이얼로그 → Task 3
- [x] 오늘의 메모 → Task 4
- [x] 교재/단원 관리 → Task 5
- [x] 과목/교재/단원 다이얼로그 → Task 6
- [x] 진도 요약 → Task 7
- [x] 류하 수첩 2열 패널 → Task 8
- [x] 성장기록 SVG 차트 → Task 9
- [x] 페이지 조립 + CRUD → Task 10
- [x] 사이드바 링크 변경 → Task 1
- [x] 스켈레톤 → Task 1
- [x] 모바일 대응 → 각 블록에 mobile 처리 포함

**2. Placeholder scan:** 없음

**3. Type consistency:**
- RyuhaNote interface → page.tsx와 notebook-block.tsx에서 동일 정의
- ScheduleFormData → schedule-dialog.tsx에서 export, page.tsx에서 import
- 모든 블록의 props interface → page.tsx에서 사용하는 콜백 시그니처와 일치
