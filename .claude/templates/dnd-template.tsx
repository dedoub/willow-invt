/**
 * 드래그앤드롭 템플릿 모음 (@dnd-kit/core)
 *
 * 사용법:
 * 1. dnd-kit 설치: npm install @dnd-kit/core
 * 2. 필요한 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 기본 Draggable 컴포넌트
 * 2. Droppable 영역
 * 3. DndContext 설정
 * 4. 완료 상태 스타일
 * 5. 동적 색상 스타일
 */

'use client'

import { useState } from 'react'
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
import { cn } from '@/lib/utils'
import { Circle, CheckCircle2 } from 'lucide-react'

// ============================================
// 1. 타입 정의
// ============================================

interface DraggableItem {
  id: string
  title: string
  color?: string // hex color for border-left
  completed?: boolean
}

// ============================================
// 2. Draggable 컴포넌트
// ============================================

interface DraggableCardProps {
  item: DraggableItem
  onClick?: () => void
}

export function DraggableCard({ item, onClick }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  })

  // 동적 색상 스타일 (borderLeft)
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    borderLeft: item.color ? `3px solid ${item.color}` : undefined,
    backgroundColor: item.color ? `${item.color}20` : undefined, // 20 = 투명도
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
      <div className="flex items-center gap-1">
        {item.completed ? (
          <CheckCircle2 className="h-3 w-3 text-green-600" />
        ) : (
          <Circle className="h-3 w-3" />
        )}
        <span>{item.title}</span>
      </div>
    </div>
  )
}

// 간단한 드래그 아이템 (완료 상태 없음)
export function SimpleDraggableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none',
        'bg-slate-200 dark:bg-slate-700',
        isDragging && 'opacity-50'
      )}
    >
      {children}
    </div>
  )
}

// ============================================
// 3. Droppable 영역
// ============================================

interface DroppableZoneProps {
  id: string
  children: React.ReactNode
  className?: string
}

export function DroppableZone({ id, children, className }: DroppableZoneProps) {
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

// 캘린더 셀용 드롭 영역
export function CalendarDropZone({
  date,
  children,
}: {
  date: string
  children: React.ReactNode
}) {
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

// ============================================
// 4. DndContext 설정
// ============================================

// Sensor 설정 (8px 이동 후 드래그 시작)
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
}

// ============================================
// 5. 완료 상태 스타일
// ============================================

// 미완료 아이템
export function IncompleteItem({ title }: { title: string }) {
  return (
    <div className="text-xs p-1.5 rounded bg-slate-200 dark:bg-slate-700">
      <div className="flex items-center gap-1">
        <Circle className="h-3 w-3" />
        <span>{title}</span>
      </div>
    </div>
  )
}

// 완료 아이템
export function CompletedItem({ title }: { title: string }) {
  return (
    <div className="text-xs p-1.5 rounded bg-muted line-through text-muted-foreground">
      <div className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-green-600" />
        <span>{title}</span>
      </div>
    </div>
  )
}

// ============================================
// 6. 동적 색상 아이템 (borderLeft)
// ============================================

interface ColoredItemProps {
  title: string
  color: string // hex color
}

export function ColoredItem({ title, color }: ColoredItemProps) {
  return (
    <div
      className="text-xs p-1.5 rounded"
      style={{
        borderLeft: `3px solid ${color}`,
        backgroundColor: `${color}20`,
      }}
    >
      {title}
    </div>
  )
}

// 색상 팔레트
export const DND_COLORS = {
  indigo: '#6366f1',
  orange: '#f97316',
  emerald: '#10b981',
  blue: '#3b82f6',
  rose: '#f43f5e',
  amber: '#f59e0b',
}

// ============================================
// 7. 사용 예시 (전체 구현)
// ============================================

export function DndExampleUsage() {
  const [items, setItems] = useState<DraggableItem[]>([
    { id: '1', title: '작업 1', color: DND_COLORS.indigo },
    { id: '2', title: '작업 2', color: DND_COLORS.orange, completed: true },
    { id: '3', title: '작업 3', color: DND_COLORS.emerald },
  ])

  const sensors = useDndSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    // 드래그 완료 시 처리 로직
    console.log(`Item ${active.id} dropped on ${over.id}`)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-2 gap-4">
        <DroppableZone id="zone-1">
          <p className="text-xs text-muted-foreground mb-2">영역 1</p>
          <div className="space-y-1">
            {items.map((item) => (
              <DraggableCard key={item.id} item={item} />
            ))}
          </div>
        </DroppableZone>
        <DroppableZone id="zone-2">
          <p className="text-xs text-muted-foreground mb-2">영역 2 (드롭 대상)</p>
        </DroppableZone>
      </div>
    </DndContext>
  )
}

/*
============================================
실제 사용 예시
============================================

import {
  DndContext,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  DraggableCard,
  DroppableZone,
  useDndSensors,
  DND_COLORS,
} from '@/templates/dnd-template'

export function MyCalendarPage() {
  const sensors = useDndSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const itemId = active.id
    const targetDate = over.data.current?.date

    // 아이템 이동 처리
    moveItemToDate(itemId, targetDate)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-7 gap-2">
        {dates.map(date => (
          <CalendarDropZone key={date} date={date}>
            {getItemsForDate(date).map(item => (
              <DraggableCard key={item.id} item={item} />
            ))}
          </CalendarDropZone>
        ))}
      </div>
    </DndContext>
  )
}
*/
