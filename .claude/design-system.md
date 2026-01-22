# Willow Dashboard 디자인 시스템

## 제1 원칙 (최우선)

> **테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다**

### 금지 패턴
```
❌ border border-gray-200
❌ shadow-md / shadow-lg
❌ ring-1 ring-gray-200
❌ outline outline-gray-200
```

### 올바른 패턴
```
✅ 페이지 배경: bg-muted/30 (layout-wrapper에서 적용)
✅ 카드 배경: bg-slate-100 dark:bg-slate-800
✅ 내부 영역: bg-white dark:bg-slate-700 또는 bg-slate-200 dark:bg-slate-700
✅ 상태별 색상: bg-{color}-50/100 dark:bg-{color}-900/30
```

---

## 컴포넌트 사용 규칙

### 1. 카드 (Card)

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

// 기본 구조
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate">{title}</CardTitle>
          <CardDescription className="text-sm mt-0.5 line-clamp-1">{description}</CardDescription>
        </div>
      </div>
      <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 {statusColor}">
        {status}
      </span>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">
    {/* 내용 */}
  </CardContent>
</Card>
```

**필수 클래스:**
- `CardHeader`: `pb-2`
- `CardContent`: `pt-0 space-y-3`
- `CardTitle`: `text-lg truncate`
- `CardDescription`: `text-sm mt-0.5 line-clamp-1`

### 2. 버튼 (Button)

```tsx
import { Button } from '@/components/ui/button'

// Variants
<Button variant="default">Primary 액션</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">취소</Button>
<Button variant="destructive">삭제</Button>
<Button variant="ghost">Ghost</Button>

// Sizes
<Button size="default">기본</Button>
<Button size="sm">작게</Button>
<Button size="lg">크게</Button>
<Button size="icon"><Plus className="h-4 w-4" /></Button>

// 로딩 상태
<Button disabled>
  <Loader2 className="h-4 w-4 animate-spin mr-2" />
  처리 중...
</Button>

// AI 특수 버튼
<Button className="bg-purple-600 hover:bg-purple-700 text-white">
  <Sparkles className="h-4 w-4 mr-2" />
  AI 분석
</Button>
```

**카드 내 버튼 패턴:**
```tsx
// 새로고침 버튼
<button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
</button>

// 외부 링크 버튼
<button className="flex items-center justify-center gap-2 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer">
  External Link
  <ExternalLink className="h-4 w-4" />
</button>
```

### 3. 입력 폼

```tsx
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// 기본 Input (border 없음, 배경색으로 구분)
<div>
  <Label className="mb-2 block">라벨</Label>
  <Input placeholder="텍스트를 입력하세요..." />
</div>

// 검색 Input
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
  <Input placeholder="검색..." className="pl-10 h-9" />
</div>

// 금액 입력 (천단위 콤마)
const [amount, setAmount] = useState('')
<Input
  value={amount}
  onChange={(e) => {
    const value = e.target.value.replace(/[^\d]/g, '')
    setAmount(value ? parseInt(value).toLocaleString() : '')
  }}
  placeholder="0"
  className="text-right"
/>
// 저장 시: parseInt(amount.replace(/,/g, ''), 10)
```

### 4. 배지/상태 (Badges)

**상태 배지 (rounded-full):**
```tsx
<span className="text-sm px-2.5 py-1 rounded-full {getStatusColor(status)}">
  {status}
</span>
```

**우선순위 배지:**
```tsx
<span className="px-2 py-0.5 rounded text-xs font-medium {getPriorityColor(priority)}">
  {priority}
</span>
```

**활동 유형 배지 (아이콘 포함):**
```tsx
<span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium {getActivityColor(type)}">
  <Icon className="h-4 w-4" />{label}
</span>
```

**필터 뱃지 (탭 스타일):**
```tsx
<div className="flex flex-wrap gap-1 mb-4">
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

---

## 색상 헬퍼 함수

```tsx
// 프로젝트 상태
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'managed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'closed': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'poc': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 우선순위
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 활동 유형
const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'started': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'discarded': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'doc_created': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
    case 'schedule': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'
    case 'commit': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 카테고리 색상
const getCategoryColor = (color: string) => {
  switch (color) {
    case 'blue': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'purple': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'green': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'amber': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'red': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'pink': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-400'
    case 'cyan': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'orange': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  }
}
```

---

## 레이아웃 패턴

### 페이지 구조

```tsx
// 페이지 헤더
<div className="flex items-center gap-3 mb-6">
  <div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
    <BookOpen className="h-6 w-6 text-purple-600 dark:text-purple-400" />
  </div>
  <div>
    <h1 className="text-2xl font-bold">페이지 제목</h1>
    <p className="text-sm text-muted-foreground">페이지 설명</p>
  </div>
</div>

// 페이지 본문
<div className="space-y-8">
  {/* 섹션들 */}
</div>
```

### 반응형 카드 헤더 (버튼 포함)

```tsx
<CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
  <div>
    <CardTitle className="text-lg">제목</CardTitle>
    <CardDescription className="text-sm mt-0.5">설명</CardDescription>
  </div>
  <div className="flex items-center gap-2">
    {/* 버튼들 */}
  </div>
</CardHeader>
```

### 통계 카드 그리드

```tsx
// ETF/Akros 스타일 (Slate 통일)
<div className="grid gap-4 md:grid-cols-3">
  <Card className="bg-slate-100 dark:bg-slate-700">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">Title</CardTitle>
      <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
        <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <p className="text-xs text-muted-foreground">{subText}</p>
    </CardContent>
  </Card>
</div>

// Tensoftworks 스타일 (컬러 분리)
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
    <div className="flex items-center justify-between mb-1">
      <div className="text-sm text-amber-700 dark:text-amber-400">라벨</div>
      <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
        <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </div>
    </div>
    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{value}</div>
  </div>
</div>
```

---

## 테이블

```tsx
<div className="overflow-x-auto">
  <table className="w-full min-w-max">
    <thead>
      <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
        <th className="py-2 px-3 font-medium first:rounded-l-lg last:rounded-r-lg">Column</th>
      </tr>
    </thead>
    <tbody>
      {/* 홀수 행 */}
      <tr className="whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50">
        <td className="py-3 px-3">{value}</td>
      </tr>
      {/* 짝수 행 */}
      <tr className="whitespace-nowrap bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50">
        <td className="py-3 px-3">{value}</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## 다이얼로그/모달

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>제목</DialogTitle>
      <DialogDescription>설명</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      {/* 내용 */}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button onClick={handleSave}>저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 간격 시스템

| 용도 | 클래스 |
|------|--------|
| 섹션 간 | `space-y-8` 또는 `mb-8` |
| 카드 간 | `space-y-6` 또는 `gap-6` |
| 요소 간 | `space-y-4` 또는 `gap-4` |
| 작은 간격 | `space-y-2` 또는 `gap-2` |
| 최소 간격 | `gap-1` |

---

## 아이콘 래퍼

```tsx
// 기본 아이콘 래퍼
<div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2">
  <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
</div>

// 통계 카드 아이콘 래퍼
<div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</div>

// 컬러 아이콘 래퍼
<div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
  <Icon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
</div>
```

---

## 사용 가능한 UI 컴포넌트

`@/components/ui/` 경로에서 import:

- `Button` - 버튼
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` - 카드
- `Input` - 입력
- `Textarea` - 텍스트영역
- `Label` - 라벨
- `Checkbox` - 체크박스
- `Badge` - 배지
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` - 다이얼로그
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` - 탭
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` - 셀렉트
- `Separator` - 구분선
- `Avatar`, `AvatarImage`, `AvatarFallback` - 아바타
- `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` - 드롭다운

---

## 참고

- 전체 UI 가이드: `/src/app/admin/ui-guide/page.tsx`
- Lucide 아이콘: `lucide-react`에서 import
