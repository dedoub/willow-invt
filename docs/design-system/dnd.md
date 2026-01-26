# 드래그앤드롭 (Drag and Drop)

## Import

```tsx
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
```

---

## Draggable 컴포넌트

```tsx
export function DraggableCard({ item, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  })

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    borderLeft: item.color ? `3px solid ${item.color}` : undefined,
    backgroundColor: item.color ? `${item.color}20` : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        'text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none',
        !item.color && 'bg-slate-200 dark:bg-slate-700',
        isDragging && 'opacity-50',
        item.completed && 'bg-muted line-through text-muted-foreground'
      )}
    >
      {children}
    </div>
  )
}
```

---

## Droppable 영역

```tsx
export function DroppableZone({ id, children, className }) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[120px] p-2 rounded-lg transition-colors',
        'bg-white dark:bg-slate-800',
        isOver && 'bg-slate-100 dark:bg-slate-700',
        className
      )}
    >
      {children}
    </div>
  )
}
```

---

## 캘린더 드롭 영역

```tsx
export function CalendarDropZone({ date, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${date}`,
    data: { date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[120px] p-2 space-y-1 cursor-pointer',
        'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700',
        isOver && 'bg-slate-100 dark:bg-slate-700'
      )}
    >
      {children}
    </div>
  )
}
```

---

## Sensor 설정

```tsx
// 8px 이동 후 드래그 시작
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
}
```

---

## DndContext 사용

```tsx
export function MyComponent() {
  const sensors = useDndSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const itemId = active.id
    const targetId = over.id
    // 처리 로직
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <DroppableZone id="zone-1">
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} />
        ))}
      </DroppableZone>
    </DndContext>
  )
}
```

---

## 완료 상태 스타일

```tsx
// 미완료 아이템
<div className="text-xs p-1.5 rounded bg-slate-200 dark:bg-slate-700">
  <div className="flex items-center gap-1">
    <Circle className="h-3 w-3" />
    <span>{title}</span>
  </div>
</div>

// 완료 아이템
<div className="text-xs p-1.5 rounded bg-muted line-through text-muted-foreground">
  <div className="flex items-center gap-1">
    <CheckCircle2 className="h-3 w-3 text-green-600" />
    <span>{title}</span>
  </div>
</div>
```

---

## 동적 색상 아이템

```tsx
// borderLeft + 투명 배경
<div
  className="text-xs p-1.5 rounded"
  style={{
    borderLeft: `3px solid ${color}`,
    backgroundColor: `${color}20`,  // 20 = 투명도
  }}
>
  {title}
</div>
```

---

## 색상 팔레트

```tsx
export const DND_COLORS = {
  indigo: '#6366f1',
  orange: '#f97316',
  emerald: '#10b981',
  blue: '#3b82f6',
  rose: '#f43f5e',
  amber: '#f59e0b',
}
```

---

## 스타일 규칙

| 요소 | 클래스 |
|------|--------|
| 드래그 아이템 | `text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none` |
| 드래그 중 | `opacity-50` |
| 드롭 영역 | `min-h-[120px] p-2 rounded-lg` |
| 드롭 오버 | `bg-slate-100 dark:bg-slate-700` |
