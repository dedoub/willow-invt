# 색상 시스템

## 배경색 계층

| 계층 | Light Mode | Dark Mode |
|------|------------|-----------|
| 페이지 배경 | `bg-slate-50` | `dark:bg-slate-900` |
| 카드 배경 | `bg-slate-100` | `dark:bg-slate-800` |
| 내부 영역 | `bg-white` | `dark:bg-slate-700` |
| 폼 필드 | `bg-slate-100` | `dark:bg-slate-700` |
| 폼 필드 포커스 | `bg-slate-50` | `dark:bg-slate-600` |

---

## 상태 색상 (Status)

| 상태 | 색상 클래스 |
|------|------------|
| active | `bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400` |
| managed | `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400` |
| completed | `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400` |
| in_progress | `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400` |
| pending | `bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400` |
| closed | `bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400` |

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

## 우선순위 색상 (Priority)

| 우선순위 | 색상 클래스 |
|---------|------------|
| critical | `bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400` |
| high | `bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400` |
| medium | `bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400` |
| low | `bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400` |

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

## 활동 색상 (Activity)

| 활동 타입 | 색상 클래스 |
|----------|------------|
| created | `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400` |
| assigned | `bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400` |
| started | `bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400` |
| completed | `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400` |
| commit | `bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400` |
| analysis | `bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400` |
| doc_created | `bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400` |
| schedule_* | `bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400` |
| discarded | `bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400` |

```tsx
const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'started': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'commit': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    default: return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
  }
}
```

---

## 카테고리 색상

| 색상명 | 색상 클래스 |
|-------|------------|
| blue | `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400` |
| purple | `bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400` |
| green | `bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400` |
| amber | `bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400` |
| red | `bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400` |
| pink | `bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-400` |
| cyan | `bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400` |
| orange | `bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400` |

---

## 버튼/체크박스 색상

> Button, Checkbox는 **slate** 색상 사용 (primary 아님)

| 요소 | 색상 |
|------|------|
| Button default | `bg-slate-900 dark:bg-slate-600` |
| Button outline | `bg-slate-200 dark:bg-slate-700` |
| Button destructive | `bg-red-600` |
| Checkbox 미체크 | `bg-slate-200 dark:bg-slate-600` |
| Checkbox 체크 | `bg-slate-900 dark:bg-slate-500` |

---

## 통계 카드 색상

```tsx
// Amber (대기/배정)
bg-amber-50 dark:bg-amber-900/30
text-amber-600/700 dark:text-amber-400

// Blue (진행)
bg-blue-50 dark:bg-blue-900/30
text-blue-600/700 dark:text-blue-400

// Emerald (완료)
bg-emerald-50 dark:bg-emerald-900/30
text-emerald-600/700 dark:text-emerald-400

// Slate (기타)
bg-slate-200 dark:bg-slate-600
text-slate-500/700 dark:text-slate-300/400
```
