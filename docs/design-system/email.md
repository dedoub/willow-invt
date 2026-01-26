# 이메일 커뮤니케이션 (Email)

## 구성 요소

1. 검색창 (필터 배지 위)
2. 카테고리 필터 배지 (rounded-full)
3. 이메일 목록 (카테고리 배지는 제목 위)
4. 페이지네이션
5. AI 분석 패널 또는 이메일 상세
6. Gmail 미연결 상태
7. 새 이메일 작성 모달

---

## 검색창

```tsx
<div className="mb-4">
  <div className="relative">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="이메일 검색..."
      className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
    />
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
    {value && (
      <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2">
        <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
      </button>
    )}
  </div>
  {value && resultCount !== undefined && (
    <p className="text-xs text-muted-foreground mt-1">{resultCount}개 검색됨</p>
  )}
</div>
```

---

## 카테고리 필터 배지

```tsx
<div className="flex gap-1 mb-4 flex-wrap">
  <button
    className={cn(
      'px-3 py-1 text-xs font-medium rounded-full transition-colors',
      filter === 'all'
        ? 'bg-slate-900 text-white dark:bg-slate-600'
        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
    )}
  >
    전체
  </button>
  {categories.map((category) => (
    <button
      key={category}
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
        filter === category
          ? `${color.button} text-white`
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
      )}
    >
      {category}
    </button>
  ))}
</div>
```

---

## 카테고리 색상

```tsx
const CATEGORY_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400', button: 'bg-blue-600' },
  { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-400', button: 'bg-purple-600' },
  { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-400', button: 'bg-green-600' },
  { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400', button: 'bg-amber-600' },
  { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-700 dark:text-pink-400', button: 'bg-pink-600' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-400', button: 'bg-cyan-600' },
  { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-400', button: 'bg-orange-600' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-400', button: 'bg-indigo-600' },
]
```

---

## 이메일 목록 아이템

```tsx
<div
  className={cn(
    'rounded-lg bg-white dark:bg-slate-700 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600',
    isSelected && 'ring-2 ring-blue-500'
  )}
>
  <div className="flex items-start gap-3">
    <Mail className={cn('h-5 w-5 mt-0.5', direction === 'outbound' ? 'text-blue-500' : 'text-slate-400')} />
    <div className="min-w-0 flex-1">
      {/* 카테고리 배지 (제목 위) */}
      <div className="flex flex-wrap gap-1 mb-1">
        {categories.map((cat) => (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
            {cat}
          </span>
        ))}
      </div>
      <p className="font-medium text-sm truncate">{subject}</p>
      <div className="text-xs text-muted-foreground mt-0.5">
        <p>보낸사람: {from}</p>
        <p>받는사람: {to}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{direction} · {date}</p>
      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{body}</p>
    </div>
  </div>
</div>
```

---

## Gmail 미연결 상태

```tsx
<div className="text-center py-8">
  <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
  <p className="text-muted-foreground mb-4">Gmail 계정을 연결하여 이메일을 확인하세요.</p>
  <button className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600">
    <Mail className="h-4 w-4" />
    Gmail 연결
  </button>
</div>
```

---

## 이메일 빈 상태

```tsx
<div className="text-center py-8 text-muted-foreground">
  {isSyncing ? (
    <div className="flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      이메일 동기화 중...
    </div>
  ) : (
    '이메일이 없습니다.'
  )}
</div>
```

---

## 새 이메일 작성 모달

### 구조

```
Container: p-6
├── Header: pb-4 border-b
├── Body: py-4 px-1 -mx-1 overflow-y-auto
└── Footer: pt-4 border-t
```

### Input 스타일

```tsx
<input className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" />
```

### Button 스타일

```tsx
// 취소
<button className="rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
  취소
</button>

// 보내기
<button className="rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500">
  <Send className="h-4 w-4" />
  보내기
</button>
```

### Error 스타일

```tsx
<div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
  {error}
</div>
```

---

## 날짜 포맷

```tsx
function formatEmailDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '어제'
  } else if (diffDays < 7) {
    return `${diffDays}일 전`
  } else {
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }
}
```

---

## 페이지네이션 옵션

```tsx
<select className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">
  <option value={5}>5개</option>
  <option value={10}>10개</option>
  <option value={25}>25개</option>
  <option value={50}>50개</option>
  <option value={100}>100개</option>
</select>
```
