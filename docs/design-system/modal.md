# 모달/다이얼로그 (Modal)

## Import

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
```

---

## 패딩 패턴 (필수)

```
컨테이너: p-6 (전체 패딩)
├── Header: pb-4 border-b
├── Body: py-4 -mx-6 px-6 (스크롤 시 좌우 유지)
└── Footer: pt-4 border-t
```

---

## 기본 Dialog 모달

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-h-[90vh] flex flex-col">
    <DialogHeader className="flex-shrink-0 pb-4 border-b">
      <DialogTitle>제목</DialogTitle>
      <DialogDescription>설명</DialogDescription>
    </DialogHeader>

    <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
      {/* 내용 */}
    </div>

    <DialogFooter className="flex-shrink-0 pt-4 border-t">
      <Button variant="outline" size="sm">취소</Button>
      <Button size="sm">저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## 생성 모달 Footer

```tsx
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <div />  {/* 좌측 비움 */}
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</DialogFooter>
```

---

## 수정 모달 Footer (삭제 버튼 포함)

```tsx
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <Button variant="destructive" size="sm">삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</DialogFooter>
```

---

## 폼 필드 Label

```tsx
// 기본 label
<label className="text-xs text-slate-500 mb-1 block">필드명</label>

// 필수 필드
<label className="text-xs text-slate-500 mb-1 block">필드명 *</label>
```

---

## 버튼 규칙

| 버튼 | Variant | Size |
|------|---------|------|
| 저장 | `default` | `sm` |
| 취소 | `outline` | `sm` |
| 삭제 | `destructive` | `sm` |

> **모든 모달 버튼: `size="sm"` 필수**

---

## 커스텀 모달 (div 기반)

```tsx
{isOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />

    <div className="relative bg-white dark:bg-slate-800 rounded-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <h2 className="text-lg font-semibold">제목</h2>
        <button onClick={() => setIsOpen(false)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
        {/* 내용 */}
      </div>

      {/* Footer */}
      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div />
        <div className="flex gap-2">
          <button className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 rounded-lg">취소</button>
          <button className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-600 text-white rounded-lg">저장</button>
        </div>
      </div>
    </div>
  </div>
)}
```

---

## X 닫기 버튼 (통일)

```tsx
<button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
  <X className="h-5 w-5" />
</button>
```

---

## 에러 메시지 (border 없음)

```tsx
{error && (
  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
    {error}
  </div>
)}
```

---

## 내부 계층 구분

```tsx
{/* 모달 기본 필드: bg-slate-100 */}
<input className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg" />

{/* 내부 카드 안 필드: bg-white */}
<div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
  <input className="w-full px-2 py-1.5 bg-white dark:bg-slate-600 rounded" />
</div>
```
