# 페이지네이션 (Pagination)

## Import

```tsx
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react'
```

---

## 스타일 클래스

| 요소 | 클래스 |
|------|--------|
| 컨테이너 | `flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4` |
| 좌측 (정보+드롭다운) | `flex items-center gap-2` |
| 카운트 텍스트 | `text-xs text-muted-foreground whitespace-nowrap` |
| 드롭다운 wrapper | `relative` |
| 드롭다운 select | `text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors` |
| 드롭다운 아이콘 | `absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground` |
| 네비게이션 컨테이너 | `flex items-center gap-0.5` |
| 네비게이션 버튼 | `h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors` |
| 페이지 표시 | `px-2 py-1 text-xs font-medium` |

---

## 기본 페이지네이션

```tsx
const [currentPage, setCurrentPage] = useState(1)
const [perPage, setPerPage] = useState(5)
const totalPages = Math.ceil(items.length / perPage)

{items.length > 0 && (
  <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
    <div className="flex items-center gap-2">
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {items.length}개 중 {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, items.length)}
      </p>
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

---

## 데이터 슬라이싱

```tsx
const paginatedItems = items.slice(
  (currentPage - 1) * perPage,
  currentPage * perPage
)
```

---

## 재사용 컴포넌트

```tsx
interface PaginationProps {
  totalItems: number
  currentPage: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
  perPageOptions?: number[]
}

// 사용
<Pagination
  totalItems={items.length}
  currentPage={page}
  perPage={perPage}
  onPageChange={setPage}
  onPerPageChange={setPerPage}
/>
```
