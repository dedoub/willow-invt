# 버튼 (Button)

## Import

```tsx
import { Button } from '@/components/ui/button'
```

---

## 색상 규칙

> **Button은 slate 색상 사용 (primary 아님)**

| Variant | 색상 | 용도 |
|---------|------|------|
| `default` | `bg-slate-900 dark:bg-slate-600` | 저장, 확인 |
| `outline` | `bg-slate-200 dark:bg-slate-700` | 취소 |
| `destructive` | `bg-red-600` | 삭제 |
| `secondary` | - | 보조 액션 |
| `ghost` | - | 아이콘 버튼 |

---

## Variants

```tsx
<Button variant="default">저장</Button>
<Button variant="outline">취소</Button>
<Button variant="destructive">삭제</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
```

---

## Sizes

```tsx
<Button size="lg">Large</Button>
<Button size="default">Default</Button>
<Button size="sm">Small</Button>  {/* 모달/인라인 폼 필수 */}
<Button size="icon"><Plus className="h-4 w-4" /></Button>
```

> **모달/인라인 폼에서는 `size="sm"` 필수**

---

## 아이콘 포함 버튼

```tsx
<Button>
  <Plus className="h-4 w-4 mr-1" />
  추가
</Button>

<Button variant="destructive">
  <Trash2 className="h-4 w-4 mr-1" />
  삭제
</Button>
```

---

## 로딩 상태

```tsx
import { Loader2 } from 'lucide-react'

<Button disabled={isLoading}>
  {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
  {isLoading ? '처리 중...' : '저장'}
</Button>
```

### 독립적 로딩 상태

```tsx
// ✅ 여러 버튼 중 하나만 로딩
const [isLoading, setIsLoading] = useState<{ id: string; type: string } | null>(null)

<Button
  disabled={isLoading?.id === item.id && isLoading?.type === 'issued'}
>
  {isLoading?.id === item.id && isLoading?.type === 'issued' ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    '발행'
  )}
</Button>
```

---

## 카드 내 버튼

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

---

## AI 버튼 (Purple 테마)

```tsx
<Button className="bg-purple-600 hover:bg-purple-700 text-white">
  <Sparkles className="h-4 w-4 mr-2" />
  AI 분석
</Button>
```

---

## 버튼 그룹 (모달/인라인)

```tsx
// 생성 모드
<div className="flex gap-2">
  <Button variant="outline" size="sm">취소</Button>
  <Button size="sm">저장</Button>
</div>

// 수정 모드 (삭제 좌측)
<div className="flex justify-between">
  <Button variant="destructive" size="sm">삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>
```

---

## 아이콘 버튼 (수정)

```tsx
// 목록 아이템용 (opacity 패턴)
<Button size="icon" variant="ghost" className="h-5 w-5 opacity-30 hover:opacity-100">
  <Pencil className="h-2.5 w-2.5" />
</Button>

// 독립 버튼용
<button className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</button>
```

> **삭제 아이콘(Trash) 단독 사용 금지!**
