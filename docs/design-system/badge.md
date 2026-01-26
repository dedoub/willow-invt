# 배지 (Badge)

## 배지 유형별 스타일

| 유형 | rounded 스타일 | 크기 |
|------|---------------|------|
| 상태 배지 | `rounded-full` | `text-sm px-2.5 py-1` |
| 우선순위 배지 | `rounded` | `text-xs px-2 py-0.5` |
| 활동 유형 배지 | `rounded-md` | `text-xs px-2 py-1` (아이콘 포함) |
| 필터 배지 | `rounded-full` | `text-xs px-3 py-1` |

---

## 상태 배지 (Status)

```tsx
<span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor(status)}`}>
  {status}
</span>
```

### 색상 헬퍼

```tsx
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'managed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}
```

---

## 우선순위 배지 (Priority)

```tsx
<span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(priority)}`}>
  {priority}
</span>
```

### 색상 헬퍼

```tsx
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}
```

---

## 활동 유형 배지 (Activity)

> 아이콘 포함

```tsx
<span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor(type)}`}>
  <Icon className="h-4 w-4" />
  {label}
</span>
```

### 색상 헬퍼

```tsx
const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    default: return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
  }
}
```

---

## 필터 배지 (Filter)

```tsx
<div className="flex flex-wrap gap-1 items-center mb-4">
  {items.map((item) => (
    <button
      key={item}
      onClick={() => setFilter(item)}
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
        filter === item
          ? 'bg-slate-900 text-white dark:bg-slate-600'
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
      )}
    >
      {item}
    </button>
  ))}
</div>
```

> **필터 배지와 컨텐츠 사이: `mb-4`**

---

## 카테고리 배지

```tsx
<span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(color)}`}>
  {label}
</span>
```

---

## 인보이스/마일스톤 상태

```tsx
// 인보이스 상태
const getInvoiceStatusColor = (status: string) => {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'sent': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'paid': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'overdue': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}
```

---

## 배지 정렬

```tsx
// 가나다순 정렬 (한글)
items.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
```
