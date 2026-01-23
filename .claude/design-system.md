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

> **참고:** `globals.css`의 base layer에서 모든 요소의 기본 border가 제거되어 있음
> ```css
> @layer base {
>   *, ::before, ::after {
>     border-color: var(--border);
>     border-width: 0;
>     border-style: solid;
>   }
> }
> ```

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

### 프로젝트 카드 (Tensoftworks 스타일)

```tsx
// 기본 프로젝트 카드 (Active/Managed)
<Card className="bg-slate-100 dark:bg-slate-800 h-full overflow-hidden">
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
          <Folder className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate">{project.name}</CardTitle>
          <CardDescription className="text-sm mt-0.5 line-clamp-1">{project.description}</CardDescription>
        </div>
      </div>
      <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(project.status)}`}>
        {project.status}
      </span>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3 overflow-hidden">
    {/* Stats Grid */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-amber-700 dark:text-amber-400">배정</div>
          <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{count}</div>
      </div>
      {/* 진행: bg-blue-50, 완료: bg-emerald-50, 진행률: bg-slate-200 */}
    </div>
  </CardContent>
</Card>

// POC 카드 (Amber 테마)
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
  <CardContent className="pt-0 space-y-2">
    <a href={project.link} className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900">
      <ExternalLink className="h-4 w-4" />
      <span>서비스 링크</span>
    </a>
    <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      <Users className="h-4 w-4" />
      <span>{project.members.join(', ')}</span>
    </div>
  </CardContent>
</Card>
```

### 2. 버튼 (Button)

> **Button 컴포넌트는 primary 색상이 아닌 slate 색상 사용**
> - default: `bg-slate-900 dark:bg-slate-600` (저장/확인 등 primary 액션)
> - outline: `bg-slate-200 dark:bg-slate-700` (취소)
> - destructive: `bg-red-600` (삭제)

```tsx
import { Button } from '@/components/ui/button'

// Variants
<Button variant="default">저장</Button>           {/* bg-slate-900 dark:bg-slate-600 */}
<Button variant="outline">취소</Button>           {/* bg-slate-200 dark:bg-slate-700 */}
<Button variant="destructive">삭제</Button>       {/* bg-red-600 */}
<Button variant="secondary">Secondary</Button>
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

// 독립적 로딩 상태 (여러 버튼 중 하나만 로딩)
// ❌ 잘못된 방법: string | null (모든 버튼이 동시에 로딩 표시)
const [isLoading, setIsLoading] = useState<string | null>(null)

// ✅ 올바른 방법: { id: string; type: string } | null
const [isLoading, setIsLoading] = useState<{ id: string; type: 'issued' | 'paid' } | null>(null)

// 사용 예시
const handleIssue = async (id: string) => {
  setIsLoading({ id, type: 'issued' })
  // ... API 호출
  setIsLoading(null)
}

// 버튼에서 조건부 로딩 표시
<Button
  onClick={() => handleIssue(item.id)}
  disabled={isLoading?.id === item.id && isLoading?.type === 'issued'}
>
  {isLoading?.id === item.id && isLoading?.type === 'issued' ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    '발행'
  )}
</Button>

// AI 특수 버튼
<Button className="bg-purple-600 hover:bg-purple-700 text-white">
  <Sparkles className="h-4 w-4 mr-2" />
  AI 분석
</Button>
```

### 체크박스 (Checkbox)

> **Checkbox도 Button과 동일하게 slate 색상 사용 (primary 아님)**

```tsx
import { Checkbox } from '@/components/ui/checkbox'

// 체크박스 색상:
// - 미체크: bg-slate-200 dark:bg-slate-600
// - 체크: bg-slate-900 dark:bg-slate-500
<Checkbox />

// 라벨과 함께 사용
<div className="flex items-center gap-2">
  <Checkbox id="terms" />
  <label htmlFor="terms" className="text-sm">약관에 동의합니다</label>
</div>
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

> **중요: Input/Textarea/Select 컴포넌트는 기본적으로 border가 없음**
> - 기본 배경: `bg-slate-100 dark:bg-slate-700`
> - 포커스 시: `bg-slate-50 dark:bg-slate-600`
> - 추가 border 클래스 사용 금지

```tsx
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

// 기본 Input (border 없음, 배경색으로 구분)
<div>
  <label className="text-xs text-slate-500 mb-1 block">라벨</label>
  <Input placeholder="텍스트를 입력하세요..." />
</div>

// Select (border 없음)
<div>
  <label className="text-xs text-slate-500 mb-1 block">상태</label>
  <Select value={status} onValueChange={setStatus}>
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="option1">옵션 1</SelectItem>
    </SelectContent>
  </Select>
</div>

// Textarea (border 없음)
<div>
  <label className="text-xs text-slate-500 mb-1 block">내용</label>
  <Textarea placeholder="내용을 입력하세요..." rows={3} />
</div>

// 검색 Input
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
  <Input placeholder="검색..." className="pl-10 h-9" />
</div>

// 금액 입력 (천단위 콤마 - 정수)
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

// 금액 입력 (천단위 콤마 - 소수점 허용)
// toLocaleString은 입력 중 소수점을 강제하므로 수동 포맷팅 필요
const [amount, setAmount] = useState('')
<Input
  value={(() => {
    if (!amount) return ''
    const parts = amount.split('.')
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
  })()}
  onChange={(e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '')
    // 소수점 중복 방지
    const parts = value.split('.')
    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : value
    setAmount(cleaned)
  }}
  placeholder="0.00"
  className="text-right"
/>
// 저장 시: parseFloat(amount) 또는 Number(amount)
```

### 인라인 폼 (위키 스타일)

> 카드 내에서 모달 대신 인라인으로 추가/수정하는 폼 패턴

**배경색 규칙:**
- 폼 컨테이너: `bg-white dark:bg-slate-700` (카드 배경과 구분)
- 입력 필드 (Input/Textarea): `bg-slate-100` (컴포넌트 기본값)
- 파일 첨부 영역: `bg-slate-100 dark:bg-slate-700`

```tsx
// 추가 폼 컨테이너
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  <div className="space-y-3">
    <div>
      <label className="text-xs text-slate-500 mb-1 block">제목</label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
    </div>
    <div>
      <label className="text-xs text-slate-500 mb-1 block">내용</label>
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
    </div>
    {/* 파일 첨부 영역 (라벨 필수!) */}
    <div>
      <label className="text-xs text-slate-500 mb-1 block">첨부 파일</label>
      <div className="rounded-lg p-2 text-center bg-slate-100 dark:bg-slate-700">
        <input type="file" id="file-input" multiple className="hidden" />
        <label htmlFor="file-input" className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700">
          <Paperclip className="h-3 w-3" />
          <span>파일 첨부</span>
        </label>
      </div>
    </div>
  </div>
  {/* Footer: border-t로 구분 */}
  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>

// 수정 폼 컨테이너 (삭제 버튼 좌측)
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  {/* ... 입력 필드들 ... */}
  <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
    <Button variant="destructive" size="sm">삭제</Button>
    <div className="flex gap-2">
      <Button variant="outline" size="sm">취소</Button>
      <Button size="sm">저장</Button>
    </div>
  </div>
</div>
```

**인라인 수정 상태 관리:**
```tsx
// 수정 중인 항목 ID 저장
const [editingItemId, setEditingItemId] = useState<string | null>(null)
const [editFormData, setEditFormData] = useState({
  title: '',
  content: '',
  amount: 0,
})

// 수정 시작
const startEdit = (item: Item) => {
  setEditingItemId(item.id)
  setEditFormData({
    title: item.title,
    content: item.content,
    amount: item.amount,
  })
}

// 수정 취소
const cancelEdit = () => {
  setEditingItemId(null)
  setEditFormData({ title: '', content: '', amount: 0 })
}

// 렌더링
{items.map((item) => (
  editingItemId === item.id ? (
    // 수정 폼 표시
    <div className="rounded-lg p-3 bg-white dark:bg-slate-700">
      {/* 입력 필드들 */}
      <div className="flex justify-between gap-2 mt-4 pt-3">
        <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>삭제</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cancelEdit}>취소</Button>
          <Button size="sm" onClick={() => handleSave(item.id)}>저장</Button>
        </div>
      </div>
    </div>
  ) : (
    // 읽기 전용 표시 (수정 버튼 포함)
    <div className="rounded-lg p-3 bg-white dark:bg-slate-700">
      <div className="flex items-start justify-between">
        <div>{item.title}</div>
        <button onClick={() => startEdit(item)} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600">
          <Pencil className="h-4 w-4 text-slate-500" />
        </button>
      </div>
    </div>
  )
))}
```

**첨부파일 목록 (삭제 가능):**
```tsx
<div className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
  <Paperclip className="h-3 w-3 text-slate-400" />
  <a href={att.url} target="_blank" className="flex-1 truncate text-blue-600 hover:underline">{att.name}</a>
  <button onClick={() => removeAttachment(idx)} className="text-slate-400 hover:text-red-500">
    <X className="h-3 w-3" />
  </button>
</div>
```

**업무 위키 첨부파일 표시 (파일명 전체 표시):**
```tsx
// ❌ 잘못된 방법: 파일명 자르기
<span className="max-w-[100px] truncate">{att.name}</span>

// ✅ 올바른 방법: 파일명 전체 표시 (줄바꿈 허용)
<span>{att.name}</span>

// 위키 첨부파일 목록 (읽기 전용)
<div className="flex flex-wrap gap-1.5">
  {attachments.map((att) => (
    <a
      key={att.id}
      href={att.url}
      target="_blank"
      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline bg-slate-50 dark:bg-slate-600 px-2 py-1 rounded"
    >
      <Paperclip className="h-3 w-3" />
      <span>{att.name}</span>  {/* truncate 없음 */}
    </a>
  ))}
</div>
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

> **중요**: 필터 뱃지와 아래 목록 사이에는 반드시 `mb-4` (16px) 간격을 유지합니다.

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
    case 'discarded': return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'doc_created': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
    case 'schedule_created':
    case 'schedule_updated':
    case 'schedule_completed': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'
    case 'commit': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    default: return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
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

### 패딩 패턴 (필수)

> **모달 패딩은 컨테이너에서 전체 적용, 섹션은 border와 상하 패딩만**

```
컨테이너: p-6 (전체 패딩)
├── Header: pb-4 border-b (하단 패딩 + border)
├── Body: py-4 -mx-6 px-6 (상하 패딩, 스크롤 시 좌우 패딩 유지)
└── Footer: pt-4 border-t (상단 패딩 + border)
```

**커스텀 모달 (div 기반):**
```tsx
<div className="... rounded-xl max-h-[90vh] flex flex-col overflow-hidden p-6">
  {/* Header */}
  <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
    <h2 className="text-lg font-semibold">제목</h2>
    <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
      <X className="h-5 w-5" />
    </button>
  </div>

  {/* Body - 스크롤 가능 */}
  <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
    {/* 내용 */}
  </div>

  {/* Footer */}
  <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
    {/* 버튼들 */}
  </div>
</div>
```

### 기본 구조 (Dialog 컴포넌트)

> DialogContent는 기본 패딩이 적용되어 있음

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader className="pb-4 border-b border-slate-200 dark:border-slate-700">
      <DialogTitle>제목</DialogTitle>
      <DialogDescription>설명</DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* 내용 */}
    </div>
    <DialogFooter className="pt-4 border-t border-slate-200 dark:border-slate-700">
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button onClick={handleSave}>저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 폼이 있는 모달

> **Input/Textarea/Select 컴포넌트는 기본적으로 border가 없음 (bg-slate-100으로 구분)**

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader className="pb-4 border-b border-slate-200 dark:border-slate-700">
      <DialogTitle>항목 추가</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-4">
      <div>
        <label className="text-xs text-slate-500 mb-1 block">제목 *</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">설명</label>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">상태</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="in_progress">진행중</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    {/* 생성 모드: 삭제 버튼 없음 */}
    <DialogFooter className="pt-4 border-t border-slate-200 dark:border-slate-700">
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button onClick={handleSave}>저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 수정 모달 (삭제 버튼 포함)

```tsx
<DialogFooter className="flex-row justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
  <Button variant="destructive" onClick={handleDelete}>삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
    <Button onClick={handleSave}>저장</Button>
  </div>
</DialogFooter>
```

### X 닫기 버튼 (DialogContent 기본 제공)

> DialogContent 컴포넌트에 기본 X 버튼이 포함되어 있음

```tsx
// dialog.tsx 기본 스타일
className="absolute top-4 right-4 rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
<XIcon className="h-5 w-5" />
```

### 모달 Footer 버튼 스타일 (통일)

> **모든 모달은 Button 컴포넌트 사용, 우측 정렬, 작은 사이즈 (`size="sm"`)**

**생성 모달 (삭제 버튼 없음):**
```tsx
// Dialog 모달
<DialogFooter className="pt-4 border-t border-slate-200 dark:border-slate-700">
  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
  <Button size="sm" onClick={handleSave}>저장</Button>
</DialogFooter>

// 커스텀 모달 (div 기반)
<div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
  <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
  <Button size="sm" onClick={handleSave} disabled={isSaving}>
    {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
    저장
  </Button>
</div>
```

**수정 모달 (삭제 버튼 좌측):**
```tsx
// Dialog 모달
<DialogFooter className="flex-row justify-between sm:justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
  <Button variant="destructive" size="sm" onClick={handleDelete}>삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm" onClick={() => setOpen(false)}>취소</Button>
    <Button size="sm" onClick={handleSave}>저장</Button>
  </div>
</DialogFooter>

// 커스텀 모달 (div 기반)
<div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
  <Button variant="destructive" size="sm" onClick={handleDelete}>삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
    <Button size="sm" onClick={handleSave}>저장</Button>
  </div>
</div>
```

**버튼 색상 정리 (Button 컴포넌트 variants):**
| 버튼 유형 | Variant | 색상 |
|----------|---------|------|
| 저장/확인 | `default` | `bg-slate-900 dark:bg-slate-600` |
| 취소 | `outline` | `bg-slate-200 dark:bg-slate-700` |
| 삭제 | `destructive` | `bg-red-600` |

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

## 타이포그래피

| 용도 | 클래스 |
|------|--------|
| Stats 값 | `text-2xl font-bold` |
| 페이지 섹션 제목 | `text-xl font-bold` |
| CardTitle | `text-lg truncate` |
| 섹션 헤더, 라벨 | `text-sm font-medium` |
| 본문, 설명 | `text-sm` |
| 보조 정보 | `text-xs text-muted-foreground` |
| 매우 작은 (일정 상세) | `text-[10px]` |

---

## 스켈레톤 로딩

```tsx
// 기본 스켈레톤 (animate-pulse 필수)
<div className="animate-pulse">
  <div className="h-5 w-40 bg-slate-200 dark:bg-slate-600 rounded" />
</div>

// 아이콘 자리
<div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 w-9 h-9" />

// 배지 자리
<div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" />

// 컬러 스켈레톤 (Stats 카드)
<div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 animate-pulse">
  <div className="h-4 w-12 bg-amber-200 dark:bg-amber-800/50 rounded" />
  <div className="h-7 w-8 bg-amber-200 dark:bg-amber-800/50 rounded mt-2" />
</div>
```

---

## 섹션 헤더

```tsx
// 카드 내 섹션 구분
<div className="space-y-1.5">
  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
    <Icon className="h-4 w-4" />
    <span>{sectionTitle}</span>
  </div>
  {/* 섹션 내용 */}
</div>
```

---

## UI 패턴

### 로딩 스피너

```tsx
<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
```

### 빈 상태

```tsx
<div className="p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
  <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
  <p className="text-slate-500">데이터가 없습니다</p>
  <Button size="sm" className="mt-3">
    <Plus className="h-4 w-4 mr-1" />
    새로 만들기
  </Button>
</div>
```

### 확장/축소 아이템

```tsx
// 축소된 상태
<div className="p-3 rounded-lg bg-white dark:bg-slate-700 cursor-pointer">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium">제목</span>
    <ChevronDown className="h-4 w-4 text-slate-400" />
  </div>
</div>

// 확장된 상태
<div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
  <div className="flex items-center justify-between mb-2">
    <span className="text-sm font-medium">제목</span>
    <ChevronUp className="h-4 w-4 text-slate-400" />
  </div>
  <div className="text-sm text-slate-600">상세 내용...</div>
</div>
```

### 페이지네이션

> **아이콘 버튼 + 드롭다운 스타일 통일**

```tsx
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react'

// State 정의
const [currentPage, setCurrentPage] = useState(1)
const [perPage, setPerPage] = useState(5)
const totalPages = Math.ceil(items.length / perPage)

// 페이지네이션 UI
{items.length > 0 && (
  <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
    <div className="flex items-center gap-2">
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {items.length}개 중 {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, items.length)}
      </p>
      {/* 페이지당 개수 드롭다운 */}
      <div className="relative">
        <select
          value={perPage}
          onChange={(e) => {
            setPerPage(Number(e.target.value))
            setCurrentPage(1)
          }}
          className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <option value={5}>5개</option>
          <option value={10}>10개</option>
          <option value={25}>25개</option>
          <option value={50}>50개</option>
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
      </div>
    </div>
    {/* 페이지 네비게이션 */}
    {totalPages > 1 && (
      <div className="flex items-center gap-0.5">
        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 py-1 text-xs font-medium">{currentPage}/{totalPages}</span>
        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    )}
  </div>
)}
```

**스타일 요약:**
| 요소 | 스타일 |
|------|--------|
| 컨테이너 | `flex items-center justify-between gap-2 pt-4 border-t mt-4` |
| 좌측 (정보+드롭다운) | `flex items-center gap-2` |
| 카운트 텍스트 | `text-xs text-muted-foreground whitespace-nowrap` |
| 드롭다운 wrapper | `relative` |
| 드롭다운 select | `text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors` |
| 드롭다운 아이콘 | `absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground` |
| 네비게이션 컨테이너 | `flex items-center gap-0.5` |
| 네비게이션 버튼 | `h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors` |
| 페이지 표시 | `px-2 py-1 text-xs font-medium` |

---

## 접기/펼치기 (Collapsible)

```tsx
const [expanded, setExpanded] = useState(true)

<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader
    className={cn("cursor-pointer", !expanded && "-mb-2")}
    onClick={() => setExpanded(!expanded)}
  >
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-lg">제목</CardTitle>
        <CardDescription>설명</CardDescription>
      </div>
      <ChevronDown className={cn(
        "h-4 w-4 text-muted-foreground transition-transform",
        !expanded && "-rotate-90"
      )} />
    </div>
  </CardHeader>
  {expanded && (
    <CardContent className="pt-0">...</CardContent>
  )}
</Card>

// localStorage 저장
useEffect(() => {
  localStorage.setItem('section-expanded', String(expanded))
}, [expanded])
```

---

## 캘린더 셀

```tsx
// 주간 뷰 셀 (border 없이 배경색으로 구분)
<div className="min-h-[280px]">
  {/* 헤더 - 오늘 */}
  <div className={cn(
    "text-center py-1.5 rounded-t-lg font-medium text-xs cursor-pointer transition-colors",
    isToday
      ? "bg-slate-700 text-white dark:bg-white dark:text-slate-700"
      : "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300"
  )}>
    <div>{dayLabel}</div>
    <div className="text-base">{day.getDate()}</div>
  </div>
  {/* 콘텐츠 */}
  <div className={cn(
    "rounded-b-lg p-2 space-y-1 min-h-[120px] cursor-pointer",
    "bg-white dark:bg-slate-800 hover:bg-slate-50",
    isOver && "bg-slate-100 dark:bg-slate-700"
  )}>
    {children}
  </div>
</div>

// 월간 뷰 셀
<div className={cn(
  "min-h-[80px] rounded p-1 cursor-pointer",
  "bg-white dark:bg-slate-800 hover:bg-slate-50",
  isToday && "bg-slate-200 dark:bg-slate-600",
  isOver && "bg-slate-300 dark:bg-slate-500"
)}>
  {children}
</div>
```

---

## 차트 (recharts)

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// 차트 컨테이너 (h-48 권장)
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
    </LineChart>
  </ResponsiveContainer>
</div>

// 차트 색상 팔레트
// #6366f1 (indigo), #f97316 (orange), #10b981 (emerald), #3b82f6 (blue)
```

---

## 드래그앤드롭 (dnd-kit)

```tsx
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'

// Sensor 설정 (8px 이동 후 드래그 시작)
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
)

// Draggable 아이템
<div
  ref={setNodeRef}
  style={{
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    borderLeft: item.color ? `3px solid ${item.color}` : undefined,  // 동적 색상
  }}
  className={cn(
    "text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none",
    isDragging && "opacity-50",
    item.completed && "bg-muted line-through text-muted-foreground"
  )}
>
  {item.title}
</div>

// Droppable 영역
<div
  ref={setNodeRef}
  className={cn("min-h-[120px] p-2", isOver && "bg-slate-100 dark:bg-slate-800")}
>
  {children}
</div>
```

---

## 수정/삭제 버튼 규칙

### 중요: 삭제 버튼 규칙
- **삭제 아이콘(Trash) 단독 사용 금지**
- **삭제는 수정 모달/인라인 내에서만 가능**
- **삭제 버튼 위치: 모달 좌측 하단**

```tsx
// 테이블/카드에서: 수정 아이콘만 표시
<button
  onClick={() => openEditModal(item)}
  className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
>
  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</button>

// 수정 모달 DialogFooter (삭제 버튼 좌측)
<DialogFooter className="flex-row justify-between sm:justify-between">
  <Button variant="destructive" onClick={handleDelete}>
    <Trash2 className="h-4 w-4 mr-1" />삭제
  </Button>
  <div className="flex gap-2">
    <Button variant="outline">취소</Button>
    <Button>저장</Button>
  </div>
</DialogFooter>
```

### 아이콘 버튼 스타일

**1. 목록 아이템용 (마일스톤, 챕터 등) - opacity 패턴:**

> 목록 내 수정 아이콘은 기본적으로 옅게 표시하고 호버 시 진하게

```tsx
<Button
  size="icon"
  variant="ghost"
  className="h-5 w-5 opacity-30 hover:opacity-100"
  onClick={() => openEditModal(item)}
>
  <Pencil className="h-2.5 w-2.5" />
</Button>
```

**2. 독립 버튼용 (클라이언트 섹션 등) - 명시적 색상:**

```tsx
<button
  className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
  onClick={() => openEditModal(item)}
>
  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</button>
```

**공통 규칙:**
- 비활성화: `disabled:opacity-30 disabled:cursor-not-allowed`

---

## 숫자 포맷

```tsx
// 천 단위 콤마 (필수!)
const formatted = value.toLocaleString()
// 1234567 → "1,234,567"

// 소수점 포함
const withDecimals = value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

// 통화 포맷
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(value)

// 큰 숫자 축약
function formatLargeNumber(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value.toLocaleString()}`
}

// 파일 크기
function formatFileSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
```

---

## 그리드 패턴 (자주 사용)

| 용도 | 클래스 |
|------|--------|
| Stats 카드 (ETF) | `grid gap-4 md:grid-cols-3` |
| Stats Grid (Tensoftworks) | `grid grid-cols-2 sm:grid-cols-4 gap-2` |
| 프로젝트 카드 리스트 (Active/Managed) | `grid sm:grid-cols-1 lg:grid-cols-2 gap-4` |
| POC 카드 리스트 | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |
| Management 페이지 (1:2) | `grid grid-cols-1 lg:grid-cols-3 gap-6` |
| 카드 내 2컬럼 | `grid grid-cols-1 sm:grid-cols-2 gap-3` |

---

## 오버플로우 처리 (필수)

```tsx
// flex 컨테이너 필수
<div className="flex items-center gap-2 min-w-0">
  <Icon className="h-4 w-4 flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>

// CardContent 오버플로우
<CardContent className="pt-0 space-y-3 overflow-hidden">

// 멀티라인 제한
<p className="line-clamp-2">여러 줄 텍스트...</p>
```

---

## 스크롤 모달 (헤더/푸터 고정)

```tsx
<DialogContent className="max-h-[90vh] flex flex-col">
  <DialogHeader className="flex-shrink-0 pb-4 border-b">
    <DialogTitle>제목</DialogTitle>
  </DialogHeader>

  {/* 스크롤 영역 */}
  <div className="overflow-y-auto flex-1 py-4 space-y-4">
    {/* 내용 */}
  </div>

  <DialogFooter className="flex-shrink-0 pt-4 border-t">
    <Button variant="outline">취소</Button>
    <Button>저장</Button>
  </DialogFooter>
</DialogContent>
```

---

## 이메일 커뮤니케이션 섹션

Gmail 연동 이메일 목록 및 AI 분석 패널 구조입니다.

### 섹션 레이아웃

```tsx
<CardContent>
  <div className="flex flex-col lg:flex-row gap-6 items-start">
    {/* 좌측: 이메일 목록 (1/2) */}
    <div className="w-full lg:w-1/2">
      {/* 검색창 */}
      {/* 필터 배지 */}
      {/* 이메일 목록 */}
      {/* 페이지네이션 */}
    </div>

    {/* 우측: AI 분석 또는 이메일 상세 (1/2) */}
    <div className="w-full lg:w-1/2">
      {/* AI 분석 패널 또는 선택된 이메일 상세 */}
    </div>
  </div>
</CardContent>
```

### 검색창 (필터 배지 위)

```tsx
<div className="mb-4">
  <div className="relative">
    <input
      type="text"
      value={emailSearch}
      onChange={(e) => setEmailSearch(e.target.value)}
      placeholder="검색..."
      className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
    />
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
    {emailSearch && (
      <button onClick={() => setEmailSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
  {emailSearch && (
    <p className="text-xs text-muted-foreground mt-1">
      {filteredEmails.length}개 검색됨
    </p>
  )}
</div>
```

### 필터 배지 (카테고리)

```tsx
<div className="flex gap-1 mb-4 flex-wrap">
  <button
    onClick={() => setEmailFilter('all')}
    className={cn(
      'px-3 py-1 text-xs font-medium rounded-full transition-colors',
      emailFilter === 'all'
        ? 'bg-slate-900 text-white dark:bg-slate-600'
        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
    )}
  >
    전체
  </button>
  {availableCategories.map((category) => {
    const color = getCategoryColor(category, availableCategories)
    return (
      <button
        key={category}
        onClick={() => setEmailFilter(category)}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
          emailFilter === category
            ? `${color.button} text-white`
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
        )}
      >
        {category}
      </button>
    )
  })}
</div>
```

### 이메일 목록 아이템

```tsx
<div className="space-y-2">
  {paginatedEmails.map((email) => (
    <div
      key={email.id}
      className={`rounded-lg bg-white dark:bg-slate-700 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 ${
        selectedEmail?.id === email.id ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={() => setSelectedEmail(email)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Mail className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
            email.direction === 'outbound' ? 'text-blue-500' : 'text-slate-400'
          }`} />
          <div className="min-w-0 flex-1">
            {/* 카테고리 배지 (제목 위) */}
            {email.category && (
              <div className="flex flex-wrap gap-1 mb-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(email.category).bg} ${getCategoryColor(email.category).text}`}>
                  {email.category}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{email.subject || '(제목 없음)'}</p>
              {email.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              <p className="truncate"><span className="text-slate-400">보낸사람:</span> {email.fromName || email.from}</p>
              <p className="truncate"><span className="text-slate-400">받는사람:</span> {email.to}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {email.direction === 'outbound' ? '발신' : '수신'} · {formatEmailDate(email.date)}
            </p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {email.body?.replace(/\n+/g, ' ').trim() || '(내용 없음)'}
            </p>
          </div>
        </div>
      </div>
    </div>
  ))}
</div>
```

### 페이지네이션

> 이메일 섹션 페이지네이션은 상단 "UI 패턴 > 페이지네이션" 섹션 참조

### AI 분석 배지 (카테고리)

```tsx
<span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
  {category}
</span>
```

### 카테고리 색상 헬퍼

```tsx
// 동적 카테고리 색상 (순환)
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

function getCategoryColor(category: string, allCategories: string[]) {
  const index = allCategories.indexOf(category)
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}
```

### 새 이메일 작성 모달 (ComposeEmailModal)

> DialogContent 대신 커스텀 모달 사용 (전체 화면 오버레이)

**모달 구조:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 max-h-[90vh] flex flex-col overflow-hidden p-6">
    {/* Header: pb-4 border-b (테두리가 양 끝까지 확장) */}
    <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
        <X className="h-5 w-5" />
      </button>
    </div>

    {/* Body: py-4 px-1 -mx-1 (스크롤바 처리) */}
    <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1 -mx-1">
      {/* 에러 메시지 (border 없음) */}
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* 입력 필드 (border 없음, 배경색으로 구분) */}
      <div>
        <label className="text-xs text-slate-500 mb-1 block">받는 사람 *</label>
        <input className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">참조 (CC)</label>
        <input className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" />
      </div>

      {/* 첨부파일 영역 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500">첨부파일</label>
          <label className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 cursor-pointer">
            <Plus className="h-4 w-4" />파일 추가
          </label>
        </div>
        {/* 첨부파일 목록 */}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700 px-3 py-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-sm truncate">{file.name}</span>
          <button className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      </div>
    </div>

    {/* Footer: pt-4 border-t (테두리가 양 끝까지 확장) */}
    <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
      <div className="flex gap-2">
        {/* Cancel 버튼: border 대신 배경색 */}
        <button className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">
          취소
        </button>
        {/* Send 버튼 */}
        <button className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50">
          <Send className="h-4 w-4" />보내기
        </button>
      </div>
    </div>
  </div>
</div>
```

**스타일 요약:**
| 요소 | 스타일 |
|------|--------|
| Container | `p-6` (전체 패딩, 테두리가 양 끝까지 확장되도록) |
| Header | `pb-4 border-b` |
| Body | `py-4 px-1 -mx-1` (스크롤바 처리) |
| Footer | `pt-4 border-t` |
| Close (X) 버튼 | `rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700` |
| Input | `bg-slate-100 dark:bg-slate-700` (border 없음) |
| Label | `text-xs text-slate-500 mb-1 block` |
| Error | `bg-red-50 dark:bg-red-900/20` (border 없음) |
| Cancel | `bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600` |
| Send | `bg-slate-900 dark:bg-slate-600 hover:bg-slate-800 dark:hover:bg-slate-500` |

> **모달/패널 Close 버튼 통일 규칙:**
> - 모든 모달/패널의 X 버튼은 동일한 스타일 사용
> - 스타일: `rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700`
> - 아이콘 크기: `h-5 w-5` (모든 경우 동일)
> - 절대 위치(absolute) 사용 시에도 동일한 스타일 적용
>
> ```tsx
> // 표준 모달 닫기 버튼
> <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
>   <X className="h-5 w-5" />
> </button>
>
> // 절대 위치 사용 시
> <button onClick={onClose} className="absolute top-4 right-4 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
>   <X className="h-5 w-5" />
> </button>
> ```

### 이메일 작성 초기 데이터 (CC 포함)

```tsx
// ComposeInitialData 타입
interface ComposeInitialData {
  to: string
  cc?: string  // 참조 (선택)
  subject: string
  body: string
}

// 이메일 작성 시 초기 데이터 설정
const [composeInitialData, setComposeInitialData] = useState<ComposeInitialData | null>(null)

// 특정 수신자에게 기본 CC 설정 예시
const handleSendEmail = (recipientType: 'etc' | 'bank', invoice: Invoice) => {
  setComposeInitialData({
    to: recipientType === 'etc' ? 'etc@example.com' : 'bank@example.com',
    cc: recipientType === 'etc' ? 'accounting@example.com' : '',  // ETC에만 CC 설정
    subject: `Invoice #${invoice.invoice_no}`,
    body: generateEmailBody(invoice),
  })
  setShowComposeModal(true)
}
```

### 이메일 상태 라벨

```tsx
// 발송 상태 라벨 (명확한 구분)
<p className="text-xs text-muted-foreground">
  ETC 이메일: {invoice.sent_to_etc_at ? formatDate(invoice.sent_to_etc_at) : '미발송'}
</p>
<p className="text-xs text-muted-foreground">
  은행 이메일: {invoice.sent_to_bank_at ? formatDate(invoice.sent_to_bank_at) : '미발송'}
</p>
```

---

---

## 인보이스/목록 아이템 표시

### 목록 아이템 우선순위

> 인보이스 번호보다 **내용(항목)**이 더 중요합니다

```tsx
// ❌ 인보이스 번호 우선
<p className="font-medium text-sm">{invoice.invoice_no}</p>
<p className="text-xs text-muted-foreground">{invoice.invoice_date}</p>

// ✅ 항목(내용) 우선, 인보이스 번호는 상세에서
<p className="font-medium text-sm">
  {invoice.items[0]?.description || invoice.invoice_no}
</p>
<p className="text-xs text-muted-foreground">
  발행일: {formatDate(invoice.invoice_date)} · ${invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
</p>
```

### 날짜 라벨

> 날짜 앞에는 반드시 무슨 날짜인지 라벨 표시

```tsx
// ❌ 라벨 없음
<span>{formatDate(date)}</span>

// ✅ 라벨 포함
<span>발행일: {formatDate(date)}</span>
<span>입금일: {formatDate(date)}</span>
```

### 금액 표시 (소수점)

```tsx
// 정수만 표시
value.toLocaleString()  // 1234567 → "1,234,567"

// 소수점 2자리까지 표시 (인보이스 등)
value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})  // 1234.5 → "1,234.50"

// 달러 표시
`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
```

### 펼침 섹션 조건부 표시

> 내용이 있을 때만 표시, 없으면 생략

```tsx
// 항목이 여러 개일 때만 표시
{invoice.items.length > 1 && (
  <div>
    <p className="text-xs text-slate-500 mb-1">항목</p>
    {invoice.items.map((item) => (
      <div key={item.id} className="text-sm">{item.description}</div>
    ))}
  </div>
)}

// 메모가 있을 때만 표시
{invoice.notes && (
  <div>
    <p className="text-xs text-slate-500 mb-1">메모</p>
    <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
  </div>
)}
```

---

## 참고

- 전체 UI 가이드: `/src/app/admin/ui-guide/page.tsx`
- Lucide 아이콘: `lucide-react`에서 import
