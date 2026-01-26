# 접기/펼치기 (Collapsible)

## 기본 접기/펼치기 카드

```tsx
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CollapsibleCard({ title, description, children, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader
        className={cn('cursor-pointer pb-2', !expanded && '-mb-2')}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm mt-0.5">{description}</CardDescription>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        </div>
      </CardHeader>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}
```

---

## 아코디언 아이템

```tsx
export function AccordionItem({ title, count, children, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
      <div
        className="p-3 flex items-center justify-between cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={cn('h-4 w-4 transition-transform', !expanded && '-rotate-90')} />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {count !== undefined && <span className="text-xs text-muted-foreground">{count}개</span>}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-white dark:bg-slate-800">{children}</div>
      )}
    </div>
  )
}

// 아코디언 내용 아이템
export function AccordionContentItem({ children }) {
  return <div className="pl-6 text-sm text-slate-600 dark:text-slate-400">{children}</div>
}
```

---

## localStorage 저장 패턴

```tsx
export function PersistentCollapsibleCard({ title, storageKey, children, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // localStorage에서 초기값 읽기
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      setExpanded(saved === 'true')
    }
  }, [storageKey])

  // 상태 변경 시 localStorage에 저장
  const handleToggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    localStorage.setItem(storageKey, String(newExpanded))
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className={cn('cursor-pointer pb-2', !expanded && '-mb-2')} onClick={handleToggle}>
        {/* ... */}
      </CardHeader>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}
```

---

## 커스텀 훅

```tsx
export function useCollapsible(storageKey: string, defaultExpanded = true) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      setExpanded(saved === 'true')
    }
  }, [storageKey])

  const toggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    localStorage.setItem(storageKey, String(newExpanded))
  }

  return { expanded, toggle, setExpanded }
}
```

### 사용 예시

```tsx
const { expanded, toggle } = useCollapsible('my-section-expanded', true)

<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className={cn("cursor-pointer pb-2", !expanded && "-mb-2")} onClick={toggle}>
    <div className="flex items-center justify-between">
      <CardTitle className="text-lg">제목</CardTitle>
      <ChevronDown className={cn(
        "h-4 w-4 text-muted-foreground transition-transform",
        !expanded && "-rotate-90"
      )} />
    </div>
  </CardHeader>
  {expanded && <CardContent className="pt-0">내용</CardContent>}
</Card>
```

---

## 스타일 규칙

| 상태 | CardHeader 클래스 |
|------|------------------|
| 펼쳐진 상태 | `pb-2` |
| 접힌 상태 | `pb-2 -mb-2` |

| 요소 | 클래스 |
|------|--------|
| 쉐브론 아이콘 | `h-4 w-4 text-muted-foreground transition-transform` |
| 쉐브론 (접힌 상태) | `-rotate-90` |
| 카운트 배지 | `text-xs text-muted-foreground` |
