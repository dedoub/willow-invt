# 입력 필드 (Input)

## Import

```tsx
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
```

---

## 스타일 규칙

> **Input/Textarea/Select는 border 없음, 배경색으로 구분**

| 상태 | 색상 |
|------|------|
| 기본 | `bg-slate-100 dark:bg-slate-700` |
| 포커스 | `bg-slate-50 dark:bg-slate-600` |

---

## 기본 Input

```tsx
<div>
  <label className="text-xs text-slate-500 mb-1 block">이름 *</label>
  <Input placeholder="이름을 입력하세요" />
</div>
```

---

## Textarea

```tsx
<div>
  <label className="text-xs text-slate-500 mb-1 block">설명</label>
  <Textarea placeholder="설명을 입력하세요..." rows={3} />
</div>
```

---

## 검색 Input

```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
  <Input placeholder="검색..." className="pl-10 h-9" />
</div>
```

---

## Select

```tsx
<div>
  <label className="text-xs text-slate-500 mb-1 block">상태</label>
  <Select value={status} onValueChange={setStatus}>
    <SelectTrigger>
      <SelectValue placeholder="상태 선택" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="pending">대기</SelectItem>
      <SelectItem value="in_progress">진행중</SelectItem>
      <SelectItem value="completed">완료</SelectItem>
    </SelectContent>
  </Select>
</div>
```

---

## 금액 입력 (천단위 콤마)

### 정수만

```tsx
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

// 저장 시
parseInt(amount.replace(/,/g, ''), 10)
```

### 소수점 허용

```tsx
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
    const parts = value.split('.')
    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : value
    setAmount(cleaned)
  }}
  placeholder="0.00"
  className="text-right"
/>
```

---

## Checkbox

```tsx
import { Checkbox } from '@/components/ui/checkbox'

// 기본 사용
<Checkbox />

// 라벨과 함께
<div className="flex items-center gap-2">
  <Checkbox id="terms" />
  <label htmlFor="terms" className="text-sm">약관에 동의합니다</label>
</div>
```

> Checkbox도 **slate** 색상 사용 (미체크: slate-200, 체크: slate-900)

---

## 파일 첨부 영역

```tsx
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
```
