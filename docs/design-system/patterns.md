# 공통 UI 패턴

## 로딩 스피너

```tsx
import { Loader2 } from 'lucide-react'

// 기본 로딩 스피너
<div className="flex items-center justify-center p-4">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>

// 페이지 전체 로딩
<div className="flex items-center justify-center min-h-[400px]">
  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
</div>
```

---

## 빈 상태 (Empty State)

```tsx
// 기본 빈 상태
<div className="p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
  <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
  <p className="text-slate-500">데이터가 없습니다</p>
  <Button size="sm" className="mt-3">
    <Plus className="h-4 w-4 mr-1" />
    새로 만들기
  </Button>
</div>

// 컴팩트 빈 상태
<div className="p-4 rounded-lg bg-white dark:bg-slate-700 text-center">
  <p className="text-sm text-slate-500">항목이 없습니다</p>
</div>
```

---

## 확장/축소 아이템

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

---

## 섹션 헤더

```tsx
<div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
  <Icon className="h-4 w-4" />
  <span>{sectionTitle}</span>
</div>
```

---

## 인라인 추가 폼

```tsx
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
  </div>
  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>
```

---

## 인라인 수정 폼 (삭제 버튼 포함)

```tsx
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

---

## 인라인 수정 상태 관리

```tsx
const [editingId, setEditingId] = useState<string | null>(null)
const [editForm, setEditForm] = useState({ title: '', content: '' })

const startEdit = (item: Item) => {
  setEditingId(item.id)
  setEditForm({ title: item.title, content: item.content })
}

const cancelEdit = () => {
  setEditingId(null)
  setEditForm({ title: '', content: '' })
}

// 렌더링
{items.map((item) => (
  editingId === item.id ? (
    // 수정 폼
    <div>...</div>
  ) : (
    // 읽기 전용 + 수정 버튼
    <div>
      <button onClick={() => startEdit(item)}>
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
))}
```

---

## 첨부파일 목록 (삭제 가능)

```tsx
<div className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
  <Paperclip className="h-3 w-3 text-slate-400" />
  <a href={att.url} target="_blank" className="flex-1 truncate text-blue-600 hover:underline">
    {att.name}
  </a>
  <button onClick={() => removeAttachment(idx)} className="text-slate-400 hover:text-red-500">
    <X className="h-3 w-3" />
  </button>
</div>
```

---

## 첨부파일 목록 (읽기 전용)

```tsx
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
        <CardTitle>제목</CardTitle>
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
```

---

## 날짜 라벨 규칙

> 날짜 앞에는 반드시 무슨 날짜인지 라벨 표시

```tsx
// ❌ 라벨 없음
<span>{formatDate(date)}</span>

// ✅ 라벨 포함
<span>발행일: {formatDate(date)}</span>
<span>입금일: {formatDate(date)}</span>
```

---

## 오버플로우 처리 (필수)

### flex 컨테이너

```tsx
<div className="flex items-center gap-2 min-w-0">
  <Icon className="h-4 w-4 flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>
```

### CardContent 오버플로우

```tsx
<CardContent className="pt-0 space-y-3 overflow-hidden">
```

### 멀티라인 제한

```tsx
<p className="line-clamp-2">여러 줄 텍스트...</p>
<p className="line-clamp-3">더 많은 줄 텍스트...</p>
```

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
