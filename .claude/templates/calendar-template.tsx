/**
 * 캘린더 셀 템플릿 모음
 *
 * 사용법:
 * 필요한 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 주간 뷰 셀
 * 2. 월간 뷰 셀
 * 3. 일정 아이템
 */

import { cn } from '@/lib/utils'

// ============================================
// 1. 주간 뷰 셀 (Week View Cell)
// ============================================

interface WeekDayCellProps {
  dayLabel: string // 월, 화, 수, ...
  date: number // 1-31
  isToday?: boolean
  isEmpty?: boolean
  isOver?: boolean // 드래그 오버 상태
  onClick?: () => void
  children?: React.ReactNode
}

// 주간 뷰 셀 (min-h-[280px])
export function WeekDayCell({
  dayLabel,
  date,
  isToday = false,
  isEmpty = false,
  isOver = false,
  onClick,
  children,
}: WeekDayCellProps) {
  return (
    <div className="min-h-[280px]">
      {/* 헤더 */}
      <div
        className={cn(
          'text-center py-1.5 rounded-t-lg font-medium text-xs cursor-pointer transition-colors',
          isToday
            ? 'bg-slate-700 text-white dark:bg-white dark:text-slate-700 hover:bg-slate-600 dark:hover:bg-slate-100'
            : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
        )}
        onClick={onClick}
      >
        <div>{dayLabel}</div>
        <div className="text-base">{date}</div>
      </div>
      {/* 콘텐츠 */}
      <div
        className={cn(
          'rounded-b-lg p-2 space-y-1 min-h-[230px] cursor-pointer transition-colors',
          'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700',
          isOver && 'bg-slate-100 dark:bg-slate-700'
        )}
        onClick={onClick}
      >
        {isEmpty ? (
          <p className="text-xs text-muted-foreground text-center mt-4">일정 없음</p>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// 주간 뷰 일정 아이템
export function WeekEventItem({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'today' | 'warning' | 'success'
}) {
  const variantClasses = {
    default: 'bg-slate-200 dark:bg-slate-700',
    today: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
    warning: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
    success: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
  }

  return (
    <div className={cn('text-xs p-1.5 rounded truncate', variantClasses[variant])}>{children}</div>
  )
}

// ============================================
// 2. 월간 뷰 셀 (Month View Cell)
// ============================================

interface MonthDayCellProps {
  date?: number // undefined면 빈 셀
  isToday?: boolean
  isOver?: boolean
  onClick?: () => void
  children?: React.ReactNode
}

// 월간 뷰 셀 (min-h-[80px])
export function MonthDayCell({
  date,
  isToday = false,
  isOver = false,
  onClick,
  children,
}: MonthDayCellProps) {
  return (
    <div
      className={cn(
        'min-h-[80px] rounded p-1 cursor-pointer transition-colors',
        !date && 'bg-slate-100 dark:bg-slate-700',
        date && !isToday && !isOver && 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700',
        isToday && !isOver && 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500',
        isOver && 'bg-slate-300 dark:bg-slate-500'
      )}
      onClick={onClick}
    >
      {date ? (
        <>
          <div className={cn('text-xs', isToday ? 'font-bold' : 'text-muted-foreground')}>
            {date}
          </div>
          {children}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">-</div>
      )}
    </div>
  )
}

// 월간 뷰 일정 아이템
export function MonthEventItem({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'today' | 'warning' | 'success'
}) {
  const variantClasses = {
    default: 'bg-slate-200 dark:bg-slate-700',
    today: 'bg-blue-200 dark:bg-blue-900/50',
    warning: 'bg-amber-200 dark:bg-amber-900/50',
    success: 'bg-emerald-200 dark:bg-emerald-900/50',
  }

  return (
    <div className={cn('text-[10px] px-1 py-0.5 rounded truncate mt-1', variantClasses[variant])}>
      {children}
    </div>
  )
}

// ============================================
// 3. 주간 뷰 그리드 예시
// ============================================

export function WeekViewGridExample() {
  return (
    <div className="grid grid-cols-7 gap-2">
      <WeekDayCell dayLabel="월" date={15}>
        <WeekEventItem>일정 1</WeekEventItem>
      </WeekDayCell>
      <WeekDayCell dayLabel="화" date={16} isToday>
        <WeekEventItem variant="today">오늘 일정</WeekEventItem>
      </WeekDayCell>
      <WeekDayCell dayLabel="수" date={17} isEmpty />
      <WeekDayCell dayLabel="목" date={18}>
        <WeekEventItem>회의</WeekEventItem>
        <WeekEventItem variant="warning">마감</WeekEventItem>
      </WeekDayCell>
      <WeekDayCell dayLabel="금" date={19}>
        <WeekEventItem variant="success">완료</WeekEventItem>
      </WeekDayCell>
      <WeekDayCell dayLabel="토" date={20} isEmpty />
      <WeekDayCell dayLabel="일" date={21} isEmpty />
    </div>
  )
}

// ============================================
// 4. 월간 뷰 그리드 예시
// ============================================

export function MonthViewGridExample() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {/* 빈 셀들 (이전 달) */}
      <MonthDayCell />
      <MonthDayCell />
      {/* 1일부터 시작 */}
      <MonthDayCell date={1}>
        <MonthEventItem>일정</MonthEventItem>
      </MonthDayCell>
      <MonthDayCell date={2} isToday>
        <MonthEventItem variant="today">오늘</MonthEventItem>
      </MonthDayCell>
      <MonthDayCell date={3} isOver>
        {/* 드롭 영역 상태 */}
      </MonthDayCell>
      <MonthDayCell date={4} />
      <MonthDayCell date={5} />
    </div>
  )
}

// ============================================
// 5. 헤더 (요일 표시)
// ============================================

export function WeekHeader() {
  const days = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="grid grid-cols-7 gap-2 mb-2">
      {days.map((day, index) => (
        <div
          key={day}
          className={cn(
            'text-center text-xs font-medium py-1',
            index === 0 && 'text-red-500', // 일요일
            index === 6 && 'text-blue-500' // 토요일
          )}
        >
          {day}
        </div>
      ))}
    </div>
  )
}
