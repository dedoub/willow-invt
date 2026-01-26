# 캘린더 (Calendar)

## 주간 뷰 (Week View)

### 셀 구조

```tsx
<div className="min-h-[280px]">
  {/* 헤더 */}
  <div
    className={cn(
      'text-center py-1.5 rounded-t-lg font-medium text-xs cursor-pointer transition-colors',
      isToday
        ? 'bg-slate-700 text-white dark:bg-white dark:text-slate-700 hover:bg-slate-600 dark:hover:bg-slate-100'
        : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
    )}
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
  >
    {children}
  </div>
</div>
```

---

## 월간 뷰 (Month View)

### 셀 구조

```tsx
<div
  className={cn(
    'min-h-[80px] rounded p-1 cursor-pointer transition-colors',
    !date && 'bg-slate-100 dark:bg-slate-700',
    date && !isToday && !isOver && 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700',
    isToday && !isOver && 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500',
    isOver && 'bg-slate-300 dark:bg-slate-500'
  )}
>
  <div className={cn('text-xs', isToday ? 'font-bold' : 'text-muted-foreground')}>
    {date}
  </div>
  {children}
</div>
```

---

## 일정 아이템

### 주간 뷰

```tsx
const variantClasses = {
  default: 'bg-slate-200 dark:bg-slate-700',
  today: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
  warning: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
  success: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400',
}

<div className={cn('text-xs p-1.5 rounded truncate', variantClasses[variant])}>
  {children}
</div>
```

### 월간 뷰

```tsx
const variantClasses = {
  default: 'bg-slate-200 dark:bg-slate-700',
  today: 'bg-blue-200 dark:bg-blue-900/50',
  warning: 'bg-amber-200 dark:bg-amber-900/50',
  success: 'bg-emerald-200 dark:bg-emerald-900/50',
}

<div className={cn('text-[10px] px-1 py-0.5 rounded truncate mt-1', variantClasses[variant])}>
  {children}
</div>
```

---

## 요일 헤더

```tsx
const days = ['일', '월', '화', '수', '목', '금', '토']

<div className="grid grid-cols-7 gap-2 mb-2">
  {days.map((day, index) => (
    <div
      key={day}
      className={cn(
        'text-center text-xs font-medium py-1',
        index === 0 && 'text-red-500',   // 일요일
        index === 6 && 'text-blue-500'   // 토요일
      )}
    >
      {day}
    </div>
  ))}
</div>
```

---

## 그리드 레이아웃

```tsx
// 주간 뷰
<div className="grid grid-cols-7 gap-2">
  {/* 셀들 */}
</div>

// 월간 뷰
<div className="grid grid-cols-7 gap-1">
  {/* 셀들 */}
</div>
```

---

## 크기 규칙

| 뷰 | 셀 높이 | 콘텐츠 영역 |
|----|--------|------------|
| 주간 | `min-h-[280px]` | `min-h-[230px]` |
| 월간 | `min-h-[80px]` | - |

---

## 상태별 스타일

| 상태 | Light Mode | Dark Mode |
|------|------------|-----------|
| 기본 | `bg-white` | `dark:bg-slate-800` |
| 오늘 | `bg-slate-200` | `dark:bg-slate-600` |
| 드래그 오버 | `bg-slate-100` | `dark:bg-slate-700` |
| 빈 셀 | `bg-slate-100` | `dark:bg-slate-700` |
