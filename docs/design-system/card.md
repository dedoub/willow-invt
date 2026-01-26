# 카드 (Card)

## Import

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
```

---

## 기본 카드 구조

```tsx
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="pb-2">
    <CardTitle className="text-lg">카드 제목</CardTitle>
    <CardDescription className="text-sm mt-0.5">카드 설명</CardDescription>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">
    {/* 내용 */}
  </CardContent>
</Card>
```

### 필수 클래스

| 컴포넌트 | 클래스 |
|---------|--------|
| Card | `bg-slate-100 dark:bg-slate-800` |
| CardHeader | `pb-2` |
| CardContent | `pt-0 space-y-3` |
| CardTitle | `text-lg truncate` |
| CardDescription | `text-sm mt-0.5 line-clamp-1` |

---

## 아이콘 헤더 카드

```tsx
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
          <Folder className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate">{title}</CardTitle>
          <CardDescription className="text-sm mt-0.5 line-clamp-1">{description}</CardDescription>
        </div>
      </div>
      <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(status)}`}>
        {status}
      </span>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">
    {/* 내용 */}
  </CardContent>
</Card>
```

---

## 액션 버튼 헤더 카드

```tsx
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
    <div>
      <CardTitle className="text-lg">섹션 제목</CardTitle>
      <CardDescription className="text-sm mt-0.5">섹션 설명</CardDescription>
    </div>
    <div className="flex items-center gap-2">
      <button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">
    {/* 내용 */}
  </CardContent>
</Card>
```

---

## 통계 카드 (ETF/Akros 스타일)

```tsx
<Card className="bg-slate-100 dark:bg-slate-700">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">Total AUM</CardTitle>
    <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
      <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
    </div>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">12,345억원</div>
    <p className="text-xs text-muted-foreground">$9.2m</p>
  </CardContent>
</Card>
```

---

## 컬러 통계 그리드 (Tensoftworks)

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
  {/* Amber - 대기/배정 */}
  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
    <div className="flex items-center justify-between mb-1">
      <div className="text-sm text-amber-700 dark:text-amber-400">배정</div>
      <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </div>
    </div>
    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">5</div>
  </div>

  {/* Blue - 진행 */}
  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">...</div>

  {/* Emerald - 완료 */}
  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">...</div>

  {/* Slate - 기타 */}
  <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-600">...</div>
</div>
```

---

## POC 카드 (Amber 테마)

```tsx
<Card className="bg-amber-50 dark:bg-amber-900/20 h-full">
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2 flex-shrink-0">
          <Folder className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate">{project.name}</CardTitle>
          <CardDescription className="text-sm mt-0.5 line-clamp-1">{project.description}</CardDescription>
        </div>
      </div>
      <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
        POC
      </span>
    </div>
  </CardHeader>
</Card>
```

---

## 아이콘 래퍼

```tsx
// 기본
<div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2">
  <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
</div>

// 통계 카드용
<div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</div>

// 컬러 (페이지 헤더)
<div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
  <Icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
</div>
```

---

## 오버플로우 처리

```tsx
// flex 컨테이너 필수
<div className="flex items-center gap-2 min-w-0">
  <Icon className="h-4 w-4 flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>

// CardContent 오버플로우
<CardContent className="pt-0 space-y-3 overflow-hidden">
```
