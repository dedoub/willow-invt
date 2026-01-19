'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Calendar,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  GraduationCap,
  Loader2,
  Pencil,
  Trash2,
  BookMarked,
  ListOrdered,
  Settings,
  Search,
  StickyNote,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter, RyuhaSchedule, RyuhaDailyMemo, RyuhaHomeworkItem } from '@/types/ryuha'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

type ViewMode = 'week' | 'month'

// Format date to YYYY-MM-DD in local timezone (KST)
const formatDateLocal = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Skeleton for Textbooks Panel
function TextbooksPanelSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800 animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 bg-slate-300 dark:bg-slate-600 rounded" />
          <div className="flex gap-2">
            <div className="h-7 w-20 bg-slate-300 dark:bg-slate-600 rounded-lg" />
            <div className="h-7 w-20 bg-slate-300 dark:bg-slate-600 rounded-lg" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Subject filter skeleton */}
        <div className="flex flex-wrap gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded-full" />
          ))}
        </div>
        {/* Textbooks skeleton */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 bg-slate-300 dark:bg-slate-600 rounded" />
                <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
              <div className="h-4 w-16 bg-slate-300 dark:bg-slate-600 rounded" />
            </div>
            <div className="px-3 pb-3 space-y-2">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="flex items-center gap-2 p-1.5">
                  <div className="h-5 w-14 bg-slate-300 dark:bg-slate-600 rounded" />
                  <div className="h-4 flex-1 bg-slate-300 dark:bg-slate-600 rounded" />
                  <div className="h-5 w-16 bg-slate-300 dark:bg-slate-600 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// Skeleton for Calendar Panel
function CalendarPanelSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800 animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-20 bg-slate-300 dark:bg-slate-600 rounded" />
          <div className="flex gap-2">
            <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded-lg" />
            <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded-lg" />
            <div className="h-7 w-20 bg-slate-300 dark:bg-slate-600 rounded-lg" />
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="h-7 w-7 bg-slate-300 dark:bg-slate-600 rounded" />
          <div className="h-5 w-32 bg-slate-300 dark:bg-slate-600 rounded" />
          <div className="h-7 w-7 bg-slate-300 dark:bg-slate-600 rounded" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 -mt-2">
        {/* Week view skeleton */}
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden">
              <div className="text-center py-2 bg-slate-200 dark:bg-slate-700">
                <div className="h-3 w-6 mx-auto bg-slate-300 dark:bg-slate-600 rounded mb-1" />
                <div className="h-5 w-5 mx-auto bg-slate-300 dark:bg-slate-600 rounded" />
              </div>
              <div className="bg-white dark:bg-slate-900 p-2 min-h-[120px] space-y-2">
                <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded" />
                {i % 2 === 0 && (
                  <>
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Full page skeleton
function RyuhaStudyPageSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 order-2 lg:order-1">
        <TextbooksPanelSkeleton />
      </div>
      <div className="lg:col-span-2 order-1 lg:order-2">
        <CalendarPanelSkeleton />
      </div>
    </div>
  )
}

// Draggable Schedule Card Component
function DraggableScheduleCard({
  schedule,
  onToggleComplete,
  onEdit,
  isToggling = false,
}: {
  schedule: RyuhaSchedule
  onToggleComplete: () => void
  onEdit: () => void
  isToggling?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  })
  const wasDraggingRef = useRef(false)

  // Track if we were dragging to prevent click after drag
  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true
    }
  }, [isDragging])

  // Determine display color: subject color takes priority, then custom color
  const displayColor = schedule.subject?.color || schedule.color
  const subjectColor = schedule.subject?.color

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderLeft: subjectColor ? `3px solid ${subjectColor}` : undefined,
        backgroundColor: !schedule.is_completed && displayColor
          ? `${displayColor}20`
          : undefined,
      }
    : {
        borderLeft: subjectColor ? `3px solid ${subjectColor}` : undefined,
        backgroundColor: !schedule.is_completed && displayColor
          ? `${displayColor}20`
          : undefined,
      }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none',
        isDragging && 'opacity-50',
        schedule.is_completed
          ? 'bg-muted line-through text-muted-foreground'
          : !displayColor && 'bg-slate-300/50 dark:bg-slate-600/50'
      )}
      onClick={(e) => {
        // 드래그 직후에는 클릭 이벤트 무시
        if (wasDraggingRef.current) {
          wasDraggingRef.current = false
          return
        }
        // 체크박스 클릭 시에는 편집 모달 열지 않음
        if ((e.target as HTMLElement).closest('button')) return
        e.stopPropagation()
        onEdit()
      }}
    >
      <div className="flex items-start gap-1">
        <button
          className="mt-0.5 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            if (!isToggling) onToggleComplete()
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={isToggling}
        >
          {isToggling ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : schedule.is_completed ? (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : (
            <Circle className="h-3 w-3" />
          )}
        </button>
        <span className="flex-1">
          {schedule.title}
        </span>
      </div>
      {schedule.description && (
        <div className="text-muted-foreground text-[10px] mt-0.5 line-clamp-3">
          {schedule.description}
        </div>
      )}
      {/* Display connected chapters */}
      {schedule.chapters && schedule.chapters.length > 0 && (
        <div className="text-[10px] mt-0.5 space-y-0.5">
          {schedule.chapters.map((ch) => (
            <div key={ch.id} className="flex items-start gap-1 text-blue-600 dark:text-blue-400">
              <BookOpen className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" />
              <span>{ch.textbook?.name && `${ch.textbook.name} > `}{ch.name}</span>
            </div>
          ))}
        </div>
      )}
      {schedule.end_date && (
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Calendar className="h-2.5 w-2.5" />
          {schedule.schedule_date.slice(5).replace('-', '/')} - {schedule.end_date.slice(5).replace('-', '/')}
        </div>
      )}
      {(schedule.start_time || schedule.end_time) && (
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          {schedule.start_time?.slice(0, 5) || ''}
          {schedule.start_time && schedule.end_time && ' - '}
          {schedule.end_time?.slice(0, 5) || ''}
        </div>
      )}
      {schedule.homework_items && schedule.homework_items.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {schedule.homework_items.map((item, idx) => (
            <div key={item.id || idx} className={cn(
              'flex items-center gap-1 text-[10px]',
              item.is_completed ? 'text-green-600' : 'text-orange-600'
            )}>
              <ClipboardList className="h-2.5 w-2.5" />
              <span>
                과제{schedule.homework_items!.length > 1 ? ` ${idx + 1}` : ''}: {item.is_completed ? '완료' : item.deadline.slice(5).replace('-', '/')}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Legacy single homework field support */}
      {!schedule.homework_items?.length && schedule.homework_deadline && (
        <div className={cn(
          'flex items-center gap-1 mt-0.5 text-[10px]',
          schedule.homework_completed ? 'text-green-600' : 'text-orange-600'
        )}>
          <ClipboardList className="h-2.5 w-2.5" />
          <span>
            과제 {schedule.homework_completed ? '완료' : `마감: ${schedule.homework_deadline.slice(5).replace('-', '/')}`}
          </span>
        </div>
      )}
    </div>
  )
}

// Droppable Day Cell Component
function DroppableDay({
  day,
  isToday,
  dayLabel,
  children,
  onClick,
}: {
  day: Date
  isToday: boolean
  dayLabel: string
  children: React.ReactNode
  onClick: () => void
}) {
  const dateStr = formatDateLocal(day)
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: day, dateStr },
  })

  return (
    <div className="min-h-[280px]">
      <div
        className={cn(
          'text-center py-1.5 rounded-t-lg font-medium text-xs cursor-pointer transition-colors',
          isToday
            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100'
            : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
        )}
        onClick={onClick}
      >
        <div>{dayLabel}</div>
        <div className="text-base">{day.getDate()}</div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'rounded-b-lg p-2 space-y-1 min-h-[120px] cursor-pointer transition-colors bg-white dark:bg-slate-900',
          isOver ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
        )}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  )
}

// Droppable Month Day Cell Component
function DroppableMonthDay({
  day,
  isToday,
  children,
  onClick,
}: {
  day: Date | null
  isToday: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  const dateStr = day ? formatDateLocal(day) : ''
  const { isOver, setNodeRef } = useDroppable({
    id: day ? `day-${dateStr}` : `empty-${Math.random()}`,
    data: { date: day, dateStr },
    disabled: !day,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[80px] border rounded p-1',
        day ? 'cursor-pointer' : 'bg-muted/20',
        day && !isOver && 'hover:bg-muted/50',
        isOver && 'bg-slate-900/10 border-slate-900 dark:bg-white/10 dark:border-white',
        isToday && 'border-slate-900 dark:border-white'
      )}
      onClick={() => day && onClick()}
    >
      {children}
    </div>
  )
}

// Draggable Month Schedule Card Component
function DraggableMonthScheduleCard({
  schedule,
  onEdit,
  onToggleComplete,
  isToggling = false,
}: {
  schedule: RyuhaSchedule
  onEdit: () => void
  onToggleComplete: () => void
  isToggling?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  })

  // Determine display color: subject color takes priority, then custom color
  const displayColor = schedule.subject?.color || schedule.color
  const subjectColor = schedule.subject?.color

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        borderLeft: subjectColor ? `2px solid ${subjectColor}` : undefined,
        backgroundColor: schedule.is_completed
          ? undefined
          : displayColor
            ? `${displayColor}25`
            : undefined,
      }
    : {
        borderLeft: subjectColor ? `2px solid ${subjectColor}` : undefined,
        backgroundColor: schedule.is_completed
          ? undefined
          : displayColor
            ? `${displayColor}25`
            : undefined,
      }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'text-[10px] px-1 py-0.5 rounded cursor-grab active:cursor-grabbing touch-none flex items-center gap-0.5',
        isDragging && 'opacity-50',
        schedule.is_completed
          ? 'bg-muted text-muted-foreground line-through'
          : !displayColor && 'bg-slate-200 dark:bg-slate-700'
      )}
      onClick={(e) => {
        // 체크박스 클릭 시에는 편집 모달 열지 않음
        if ((e.target as HTMLElement).closest('button')) return
        e.stopPropagation()
        if (!isDragging) onEdit()
      }}
    >
      <button
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          if (!isToggling) onToggleComplete()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={isToggling}
      >
        {isToggling ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
        ) : schedule.is_completed ? (
          <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
        ) : (
          <Circle className="h-2.5 w-2.5" />
        )}
      </button>
      {schedule.end_date && (
        <Calendar className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground" />
      )}
      {(schedule.homework_items?.length ?? 0) > 0 && (
        <ClipboardList className={cn(
          'h-2.5 w-2.5 flex-shrink-0',
          schedule.homework_items!.every(item => item.is_completed) ? 'text-green-600' : 'text-orange-600'
        )} />
      )}
      {/* Legacy single homework field support */}
      {!schedule.homework_items?.length && schedule.homework_deadline && (
        <ClipboardList className={cn(
          'h-2.5 w-2.5 flex-shrink-0',
          schedule.homework_completed ? 'text-green-600' : 'text-orange-600'
        )} />
      )}
      <span className="truncate flex-1">
        {schedule.title}
      </span>
    </div>
  )
}

export default function RyuhaStudyPage() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ryuha-calendar-view')
      return (saved === 'week' || saved === 'month') ? saved : 'week'
    }
    return 'week'
  })
  const [progressExpanded, setProgressExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ryuha-progress-expanded')
      return saved !== 'false'
    }
    return true
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const [subjects, setSubjects] = useState<RyuhaSubject[]>([])
  const [textbooks, setTextbooks] = useState<RyuhaTextbook[]>([])
  const [chapters, setChapters] = useState<RyuhaChapter[]>([])
  const [schedules, setSchedules] = useState<RyuhaSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ryuha-selected-subject')
    }
    return null
  })
  const [expandedTextbooks, setExpandedTextbooks] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ryuha-expanded-textbooks')
      return saved ? JSON.parse(saved) : []
    }
    return []
  })
  const [chaptersWithSchedules, setChaptersWithSchedules] = useState<Set<string>>(new Set())
  const [activeSchedule, setActiveSchedule] = useState<RyuhaSchedule | null>(null)
  const [memos, setMemos] = useState<Map<string, RyuhaDailyMemo>>(new Map())
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Dialog states
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [textbookDialogOpen, setTextbookDialogOpen] = useState(false)
  const [chapterDialogOpen, setChapterDialogOpen] = useState(false)
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<RyuhaSchedule | null>(null)
  const [editingTextbook, setEditingTextbook] = useState<RyuhaTextbook | null>(null)
  const [editingChapter, setEditingChapter] = useState<RyuhaChapter | null>(null)
  const [editingSubject, setEditingSubject] = useState<RyuhaSubject | null>(null)
  const [memoDialogOpen, setMemoDialogOpen] = useState(false)
  const [editingMemoDate, setEditingMemoDate] = useState<string>('')
  const [memoContent, setMemoContent] = useState('')

  // Form states
  interface HomeworkItemForm {
    id?: string
    content: string
    deadline: string
    is_completed?: boolean
  }
  interface ChapterSelectionForm {
    subject_id: string
    textbook_id: string
    chapter_id: string
  }
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    description: '',
    schedule_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    type: 'self_study' as 'homework' | 'self_study',
    color: '',
    subject_id: '',
    textbook_id: '',
    chapter_id: '',
    selected_chapters: [] as ChapterSelectionForm[],
    email_reminder: false,
    has_homework: false,
    homework_items: [] as HomeworkItemForm[],
  })

  const [textbookForm, setTextbookForm] = useState({
    subject_id: '',
    name: '',
    publisher: '',
    description: '',
  })

  const [chapterForm, setChapterForm] = useState({
    textbook_id: '',
    name: '',
    description: '',
    target_date: '',
  })

  const [subjectForm, setSubjectForm] = useState({
    name: '',
    color: '#6366f1',
  })

  // Fetch data
  const fetchSubjects = useCallback(async () => {
    const res = await fetch('/api/ryuha/subjects')
    const data = await res.json()
    setSubjects(data)
  }, [])

  const fetchTextbooks = useCallback(async () => {
    const res = await fetch('/api/ryuha/textbooks')
    const data = await res.json()
    setTextbooks(data)
  }, [])

  const fetchChapters = useCallback(async () => {
    const res = await fetch('/api/ryuha/chapters')
    const data = await res.json()
    setChapters(data)
  }, [])

  const fetchSchedules = useCallback(async () => {
    const { startDate, endDate } = getDateRange()
    const res = await fetch(`/api/ryuha/schedules?startDate=${startDate}&endDate=${endDate}`)
    const data = await res.json()
    setSchedules(data)
  }, [currentDate, viewMode])

  // Fetch all chapter IDs that have schedules (for status restriction)
  const fetchChaptersWithSchedules = useCallback(async () => {
    const res = await fetch('/api/ryuha/schedules')
    const data: RyuhaSchedule[] = await res.json()
    const chapterIds = new Set(
      data.filter((s) => s.chapter_id).map((s) => s.chapter_id!)
    )
    setChaptersWithSchedules(chapterIds)
  }, [])

  const fetchMemos = useCallback(async () => {
    try {
      const { startDate, endDate } = getDateRange()
      const res = await fetch(`/api/ryuha/memos?startDate=${startDate}&endDate=${endDate}`)
      const data = await res.json()
      const memoMap = new Map<string, RyuhaDailyMemo>()
      if (Array.isArray(data)) {
        data.forEach((memo: RyuhaDailyMemo) => memoMap.set(memo.memo_date, memo))
      }
      setMemos(memoMap)
    } catch (error) {
      console.error('Error fetching memos:', error)
    }
  }, [currentDate, viewMode])

  const getDateRange = () => {
    if (viewMode === 'week') {
      const start = getWeekStart(currentDate)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { startDate: formatDate(start), endDate: formatDate(end) }
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      return { startDate: formatDate(start), endDate: formatDate(end) }
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchSubjects(),
        fetchTextbooks(),
        fetchChapters(),
        fetchSchedules(),
        fetchChaptersWithSchedules(),
        fetchMemos(),
      ])
      setLoading(false)
    }
    loadData()
  }, [fetchSubjects, fetchTextbooks, fetchChapters, fetchSchedules, fetchChaptersWithSchedules, fetchMemos])

  // Save viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('ryuha-calendar-view', viewMode)
  }, [viewMode])

  // Save progressExpanded to localStorage
  useEffect(() => {
    localStorage.setItem('ryuha-progress-expanded', String(progressExpanded))
  }, [progressExpanded])

  // Save selectedSubject to localStorage
  useEffect(() => {
    if (selectedSubject) {
      localStorage.setItem('ryuha-selected-subject', selectedSubject)
    } else {
      localStorage.removeItem('ryuha-selected-subject')
    }
  }, [selectedSubject])

  // Save expandedTextbooks to localStorage
  useEffect(() => {
    localStorage.setItem('ryuha-expanded-textbooks', JSON.stringify(expandedTextbooks))
  }, [expandedTextbooks])

  // Date helpers
  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  }

  const formatDate = formatDateLocal

  const getWeekDays = () => {
    const start = getWeekStart(currentDate)
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      return day
    })
  }

  const getMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (Date | null)[] = []
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i))
    return days
  }

  const navigate = (direction: number) => {
    const newDate = new Date(currentDate)
    if (viewMode === 'week') newDate.setDate(newDate.getDate() + direction * 7)
    else newDate.setMonth(newDate.getMonth() + direction)
    setCurrentDate(newDate)
  }

  const getSchedulesForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return schedules
      .filter((s) => {
        // Exclude homework type schedules (they are displayed separately)
        if (s.type === 'homework') return false
        // Single-day schedule
        if (!s.end_date) {
          return s.schedule_date === dateStr
        }
        // Multi-day schedule: check if date is within range
        return dateStr >= s.schedule_date && dateStr <= s.end_date
      })
      .sort((a, b) => {
        // Items without start_time come first
        if (!a.start_time && b.start_time) return -1
        if (a.start_time && !b.start_time) return 1
        // Then sort by start_time
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        return 0
      })
  }

  // Get homework type schedules for a specific date (displayed at schedule_date)
  const getHomeworkTypeSchedulesForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return schedules
      .filter((s) => s.type === 'homework' && s.schedule_date === dateStr)
      .sort((a, b) => {
        if (!a.start_time && b.start_time) return -1
        if (a.start_time && !b.start_time) return 1
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        return 0
      })
  }

  // Get homework deadline items for a specific date
  interface HomeworkForDate {
    schedule: RyuhaSchedule
    item?: RyuhaHomeworkItem
    isLegacy: boolean
  }
  const getHomeworkForDate = (date: Date): HomeworkForDate[] => {
    const dateStr = formatDate(date)
    const result: HomeworkForDate[] = []

    for (const schedule of schedules) {
      // Check new homework_items
      if (schedule.homework_items?.length) {
        for (const item of schedule.homework_items) {
          if (item.deadline === dateStr) {
            result.push({ schedule, item, isLegacy: false })
          }
        }
      }
      // Check legacy homework_deadline
      else if (schedule.homework_deadline === dateStr) {
        result.push({ schedule, isLegacy: true })
      }
    }

    return result
  }

  // Toggle textbook expansion
  const toggleTextbook = (id: string) => {
    setExpandedTextbooks((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  // Schedule CRUD
  const openScheduleDialog = (date?: Date, schedule?: RyuhaSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule)
      const chapter = chapters.find((c) => c.id === schedule.chapter_id)
      // Convert homework_items to form format, or use legacy fields
      const homeworkItems: HomeworkItemForm[] = schedule.homework_items?.length
        ? schedule.homework_items.map(item => ({
            id: item.id,
            content: item.content,
            deadline: item.deadline,
            is_completed: item.is_completed,
          }))
        : (schedule.homework_content || schedule.homework_deadline)
          ? [{ content: schedule.homework_content || '', deadline: schedule.homework_deadline || '' }]
          : []

      // Build selected_chapters from chapter_ids or legacy chapter_id
      const chapterIds = schedule.chapter_ids?.length > 0
        ? schedule.chapter_ids
        : schedule.chapter_id
          ? [schedule.chapter_id]
          : []
      const selectedChapters: ChapterSelectionForm[] = chapterIds.map(cid => {
        const ch = chapters.find(c => c.id === cid)
        const tb = ch ? textbooks.find(t => t.id === ch.textbook_id) : undefined
        return {
          subject_id: tb?.subject_id || '',
          textbook_id: ch?.textbook_id || '',
          chapter_id: cid,
        }
      })

      setScheduleForm({
        title: schedule.title,
        description: schedule.description || '',
        schedule_date: schedule.schedule_date,
        end_date: schedule.end_date || '',
        start_time: schedule.start_time || '',
        end_time: schedule.end_time || '',
        type: schedule.type,
        color: schedule.color || '',
        subject_id: schedule.subject_id || '',
        textbook_id: chapter?.textbook_id || '',
        chapter_id: schedule.chapter_id || '',
        selected_chapters: selectedChapters,
        email_reminder: schedule.email_reminder,
        has_homework: homeworkItems.length > 0,
        homework_items: homeworkItems,
      })
    } else {
      setEditingSchedule(null)
      setScheduleForm({
        title: '',
        description: '',
        schedule_date: date ? formatDate(date) : formatDate(new Date()),
        end_date: '',
        start_time: '',
        end_time: '',
        type: 'self_study',
        color: '',
        subject_id: '',
        textbook_id: '',
        chapter_id: '',
        selected_chapters: [],
        email_reminder: false,
        has_homework: false,
        homework_items: [],
      })
    }
    setScheduleDialogOpen(true)
  }

  const saveSchedule = async () => {
    if (saving) return
    setSaving(true)
    try {
      // Get chapter_ids from selected_chapters (use chapter_id as fallback for legacy)
      const chapterIds = scheduleForm.selected_chapters.length > 0
        ? scheduleForm.selected_chapters.map(sc => sc.chapter_id).filter(Boolean)
        : scheduleForm.chapter_id ? [scheduleForm.chapter_id] : []

      const payload = {
        title: scheduleForm.title,
        description: scheduleForm.description || null,
        schedule_date: scheduleForm.schedule_date,
        end_date: scheduleForm.end_date || null,
        start_time: scheduleForm.start_time || null,
        end_time: scheduleForm.end_time || null,
        type: scheduleForm.type,
        color: scheduleForm.subject_id ? null : (scheduleForm.color || null),
        subject_id: scheduleForm.subject_id || null,
        chapter_id: chapterIds[0] || null, // Keep first for backward compatibility
        chapter_ids: chapterIds,
        email_reminder: scheduleForm.email_reminder,
        // Clear legacy fields since we're using homework_items now
        homework_content: null,
        homework_deadline: null,
      }

      let scheduleId: string
      if (editingSchedule) {
        await fetch('/api/ryuha/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSchedule.id, ...payload }),
        })
        scheduleId = editingSchedule.id
      } else {
        const res = await fetch('/api/ryuha/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const newSchedule = await res.json()
        scheduleId = newSchedule.id
      }

      // Handle homework items
      if (scheduleForm.has_homework && scheduleForm.homework_items.length > 0) {
        const existingIds = new Set(editingSchedule?.homework_items?.map(h => h.id) || [])
        const formIds = new Set(scheduleForm.homework_items.filter(h => h.id).map(h => h.id!))

        // Delete removed items
        for (const existingId of existingIds) {
          if (!formIds.has(existingId)) {
            await fetch(`/api/ryuha/homework-items?id=${existingId}`, { method: 'DELETE' })
          }
        }

        // Create or update items
        for (let i = 0; i < scheduleForm.homework_items.length; i++) {
          const item = scheduleForm.homework_items[i]
          if (item.id && existingIds.has(item.id)) {
            // Update existing
            await fetch('/api/ryuha/homework-items', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: item.id,
                content: item.content,
                deadline: item.deadline,
                order_index: i,
              }),
            })
          } else {
            // Create new
            await fetch('/api/ryuha/homework-items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                schedule_id: scheduleId,
                content: item.content,
                deadline: item.deadline,
                order_index: i,
              }),
            })
          }
        }
      } else if (editingSchedule?.homework_items?.length) {
        // If has_homework is false but there were existing items, delete them all
        for (const item of editingSchedule.homework_items) {
          await fetch(`/api/ryuha/homework-items?id=${item.id}`, { method: 'DELETE' })
        }
      }

      // Auto-update chapters to "in_progress" when schedule is created with chapter_ids
      if (chapterIds.length > 0) {
        for (const cid of chapterIds) {
          const chapter = chapters.find((c) => c.id === cid)
          if (chapter && chapter.status === 'pending') {
            await fetch('/api/ryuha/chapters', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: chapter.id, status: 'in_progress' }),
            })
          }
        }
        await fetchChapters()
        // Update chaptersWithSchedules
        setChaptersWithSchedules((prev) => new Set([...prev, ...chapterIds]))
      }

      setScheduleDialogOpen(false)
      await fetchSchedules()
    } finally {
      setSaving(false)
    }
  }

  const toggleScheduleComplete = async (schedule: RyuhaSchedule) => {
    if (togglingIds.has(schedule.id)) return
    setTogglingIds(prev => new Set(prev).add(schedule.id))
    try {
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, is_completed: !schedule.is_completed }),
      })
      await fetchSchedules()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(schedule.id)
        return next
      })
    }
  }

  const toggleHomeworkComplete = async (schedule: RyuhaSchedule) => {
    const hwId = `hw-${schedule.id}`
    if (togglingIds.has(hwId)) return
    setTogglingIds(prev => new Set(prev).add(hwId))
    try {
      await fetch('/api/ryuha/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, homework_completed: !schedule.homework_completed }),
      })
      await fetchSchedules()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(hwId)
        return next
      })
    }
  }

  const toggleHomeworkItemComplete = async (item: RyuhaHomeworkItem) => {
    const hwItemId = `hwi-${item.id}`
    if (togglingIds.has(hwItemId)) return
    setTogglingIds(prev => new Set(prev).add(hwItemId))
    try {
      await fetch('/api/ryuha/homework-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          is_completed: !item.is_completed,
          completed_at: !item.is_completed ? new Date().toISOString() : null,
        }),
      })
      await fetchSchedules()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(hwItemId)
        return next
      })
    }
  }

  const deleteSchedule = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/schedules?id=${id}`, { method: 'DELETE' })
    await Promise.all([fetchSchedules(), fetchChaptersWithSchedules()])
  }

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const schedule = schedules.find((s) => s.id === active.id)
    if (schedule) {
      setActiveSchedule(schedule)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveSchedule(null)

    if (!over) return

    const scheduleId = active.id as string
    const dropData = over.data.current as { dateStr: string } | undefined

    if (!dropData?.dateStr) return

    const schedule = schedules.find((s) => s.id === scheduleId)
    if (!schedule || schedule.schedule_date === dropData.dateStr) return

    // Update schedule date
    await fetch('/api/ryuha/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: scheduleId, schedule_date: dropData.dateStr }),
    })
    fetchSchedules()
  }

  // Textbook CRUD
  const openTextbookDialog = (textbook?: RyuhaTextbook) => {
    if (textbook) {
      setEditingTextbook(textbook)
      setTextbookForm({
        subject_id: textbook.subject_id,
        name: textbook.name,
        publisher: textbook.publisher || '',
        description: textbook.description || '',
      })
    } else {
      setEditingTextbook(null)
      setTextbookForm({
        subject_id: selectedSubject || subjects[0]?.id || '',
        name: '',
        publisher: '',
        description: '',
      })
    }
    setTextbookDialogOpen(true)
  }

  const saveTextbook = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (editingTextbook) {
        await fetch('/api/ryuha/textbooks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTextbook.id, ...textbookForm }),
        })
      } else {
        await fetch('/api/ryuha/textbooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(textbookForm),
        })
      }
      setTextbookDialogOpen(false)
      await fetchTextbooks()
    } finally {
      setSaving(false)
    }
  }

  const deleteTextbook = async (id: string) => {
    if (!confirm('교재를 삭제하면 모든 챕터도 삭제됩니다. 삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/textbooks?id=${id}`, { method: 'DELETE' })
    fetchTextbooks()
    fetchChapters()
  }

  // Chapter CRUD
  const openChapterDialog = (textbookId: string, chapter?: RyuhaChapter) => {
    if (chapter) {
      setEditingChapter(chapter)
      setChapterForm({
        textbook_id: chapter.textbook_id,
        name: chapter.name,
        description: chapter.description || '',
        target_date: chapter.target_date || '',
      })
    } else {
      setEditingChapter(null)
      setChapterForm({
        textbook_id: textbookId,
        name: '',
        description: '',
        target_date: '',
      })
    }
    setChapterDialogOpen(true)
  }

  const saveChapter = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        textbook_id: chapterForm.textbook_id,
        name: chapterForm.name,
        description: chapterForm.description || null,
        target_date: chapterForm.target_date || null,
      }

      if (editingChapter) {
        const res = await fetch('/api/ryuha/chapters', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingChapter.id, ...payload }),
        })
        if (!res.ok) throw new Error('Failed to update chapter')
      } else {
        const res = await fetch('/api/ryuha/chapters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to create chapter')
      }
      setChapterDialogOpen(false)
      await Promise.all([fetchChapters(), fetchTextbooks()])
    } catch (error) {
      console.error('Error saving chapter:', error)
      alert('챕터 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggleChapterStatus = async (chapter: RyuhaChapter) => {
    const chapterId = `chapter-${chapter.id}`
    if (togglingIds.has(chapterId)) return

    const hasSchedules = chaptersWithSchedules.has(chapter.id)

    // Determine next status based on whether chapter has schedules
    // Flow: pending → in_progress → review_notes_pending → completed
    let nextStatus: 'pending' | 'in_progress' | 'review_notes_pending' | 'completed'
    if (hasSchedules) {
      // If has schedules: in_progress → review_notes_pending → completed → in_progress
      if (chapter.status === 'in_progress') {
        nextStatus = 'review_notes_pending'
      } else if (chapter.status === 'review_notes_pending') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'in_progress'
      }
    } else {
      // If no schedules: pending → in_progress → review_notes_pending → completed → pending
      if (chapter.status === 'pending') {
        nextStatus = 'in_progress'
      } else if (chapter.status === 'in_progress') {
        nextStatus = 'review_notes_pending'
      } else if (chapter.status === 'review_notes_pending') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'pending'
      }
    }

    // Check if trying to complete without review note completed
    if (nextStatus === 'completed' && !chapter.review_completed) {
      alert('리뷰노트를 먼저 완료해주세요.')
      return
    }

    setTogglingIds(prev => new Set(prev).add(chapterId))
    try {
      const completed_at = nextStatus === 'completed' ? new Date().toISOString() : null

      await fetch('/api/ryuha/chapters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chapter.id, status: nextStatus, completed_at }),
      })
      await fetchChapters()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(chapterId)
        return next
      })
    }
  }

  const toggleReviewCompleted = async (chapter: RyuhaChapter) => {
    const reviewId = `review-${chapter.id}`
    if (togglingIds.has(reviewId)) return

    setTogglingIds(prev => new Set(prev).add(reviewId))
    try {
      await fetch('/api/ryuha/chapters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chapter.id, review_completed: !chapter.review_completed }),
      })
      await fetchChapters()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(reviewId)
        return next
      })
    }
  }

  const deleteChapter = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/chapters?id=${id}`, { method: 'DELETE' })
    fetchChapters()
  }

  // Subject CRUD
  const openSubjectDialog = (subject?: RyuhaSubject) => {
    if (subject) {
      setEditingSubject(subject)
      setSubjectForm({
        name: subject.name,
        color: subject.color,
      })
    } else {
      setEditingSubject(null)
      setSubjectForm({
        name: '',
        color: '#6366f1',
      })
    }
    setSubjectDialogOpen(true)
  }

  const saveSubject = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (editingSubject) {
        await fetch('/api/ryuha/subjects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSubject.id, ...subjectForm }),
        })
        // 수정 후 목록 화면으로 돌아가기
        setEditingSubject(null)
        setSubjectForm({ name: '', color: '#6366f1' })
      } else {
        await fetch('/api/ryuha/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subjectForm),
        })
        // 추가 후 폼 초기화 (모달 유지)
        setSubjectForm({ name: '', color: '#6366f1' })
      }
      await fetchSubjects()
    } finally {
      setSaving(false)
    }
  }

  const deleteSubject = async (id: string) => {
    if (!confirm('과목을 삭제하면 연결된 모든 교재와 챕터도 삭제됩니다. 삭제하시겠습니까?')) return
    await fetch(`/api/ryuha/subjects?id=${id}`, { method: 'DELETE' })
    // 편집 모드에서 삭제한 경우에만 다이얼로그 닫기
    if (editingSubject?.id === id) {
      setSubjectDialogOpen(false)
    }
    fetchSubjects()
    fetchTextbooks()
    fetchChapters()
  }

  // Memo CRUD
  const openMemoDialog = (date: Date) => {
    const dateStr = formatDate(date)
    const existingMemo = memos.get(dateStr)
    setEditingMemoDate(dateStr)
    setMemoContent(existingMemo?.content || '')
    setMemoDialogOpen(true)
  }

  const saveMemo = async () => {
    if (saving || !editingMemoDate) return

    // If content is empty, delete the memo
    if (!memoContent.trim()) {
      await fetch(`/api/ryuha/memos?date=${editingMemoDate}`, { method: 'DELETE' })
    } else {
      await fetch('/api/ryuha/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo_date: editingMemoDate, content: memoContent.trim() }),
      })
    }

    setMemoDialogOpen(false)
    await fetchMemos()
  }

  const getMemoForDate = (date: Date) => {
    return memos.get(formatDate(date))
  }

  // Filtered data (sorted by subject name, then textbook name)
  const filteredTextbooks = (selectedSubject
    ? textbooks.filter((t) => t.subject_id === selectedSubject)
    : textbooks
  ).sort((a, b) => {
    // Sort by subject name first
    const subjectA = a.subject?.name || ''
    const subjectB = b.subject?.name || ''
    const subjectCompare = subjectA.localeCompare(subjectB, 'ko')
    if (subjectCompare !== 0) return subjectCompare
    // Then by textbook name
    return a.name.localeCompare(b.name, 'ko')
  })

  const getChaptersForTextbook = (textbookId: string) =>
    chapters
      .filter((c) => c.textbook_id === textbookId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  if (loading) {
    return <RyuhaStudyPageSkeleton />
  }

  return (
    <ProtectedPage pagePath="/others/ryuha-study">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Textbooks & Chapters Panel */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookMarked className="h-4 w-4" />
                  과목 및 교재
                </CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openSubjectDialog()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    과목 추가
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openTextbookDialog()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    교재 추가
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Subject filter */}
              <div className="flex flex-wrap gap-1 items-center">
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer',
                    selectedSubject === null && 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:border-white dark:hover:bg-slate-100'
                  )}
                  onClick={() => setSelectedSubject(null)}
                >
                  전체
                </Badge>
                {subjects.map((subject) => (
                  <Badge
                    key={subject.id}
                    variant={selectedSubject === subject.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                    style={{
                      backgroundColor:
                        selectedSubject === subject.id ? subject.color : undefined,
                      borderColor: subject.color,
                    }}
                    onClick={() => setSelectedSubject(subject.id)}
                  >
                    {subject.name}
                  </Badge>
                ))}
              </div>

              {/* Textbooks list */}
              <div className="space-y-2">
                {filteredTextbooks.map((textbook) => {
                  const textbookChapters = getChaptersForTextbook(textbook.id)
                  const completed = textbookChapters.filter((c) => c.status === 'completed').length
                  const total = textbookChapters.length
                  const isExpanded = expandedTextbooks.includes(textbook.id)

                  return (
                    <div
                      key={textbook.id}
                      className="rounded-lg overflow-hidden"
                      style={{ borderLeft: `3px solid ${textbook.subject?.color || '#888'}` }}
                    >
                      {/* Textbook header */}
                      <div
                        className="p-2 cursor-pointer flex items-center justify-between transition-opacity hover:opacity-80"
                        style={{ backgroundColor: `${textbook.subject?.color || '#888'}15` }}
                        onClick={() => toggleTextbook(textbook.id)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform flex-shrink-0',
                              !isExpanded && '-rotate-90'
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            {textbook.subject && (
                              <div className="text-xs text-muted-foreground">{textbook.subject.name}</div>
                            )}
                            <div className="flex items-baseline gap-2">
                              <span className="font-medium text-sm truncate">{textbook.name}</span>
                              {textbook.publisher && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">{textbook.publisher}</span>
                              )}
                            </div>
                            {textbook.description && (
                              <div className="text-xs text-muted-foreground truncate">{textbook.description}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {completed}/{total}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-30 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              openTextbookDialog(textbook)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Review notes pending chapters - always visible even when collapsed */}
                      {!isExpanded && (() => {
                        const reviewNotesPendingChapters = textbookChapters.filter(c => c.status === 'review_notes_pending')
                        if (reviewNotesPendingChapters.length === 0) return null
                        return (
                          <div className="px-2 pb-2 space-y-1 bg-background border-t border-border/50">
                            {reviewNotesPendingChapters.map((chapter) => (
                              <div
                                key={chapter.id}
                                className="flex items-center gap-2 p-1.5 rounded text-sm"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleChapterStatus(chapter)
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/30 hover:opacity-80 transition-opacity"
                                  title={chapter.review_completed ? '클릭해서 완료로 변경' : '리뷰노트 완료 후 클릭해서 완료로 변경'}
                                  disabled={togglingIds.has(`chapter-${chapter.id}`)}
                                >
                                  {togglingIds.has(`chapter-${chapter.id}`) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : (
                                    <StickyNote className="h-3.5 w-3.5 text-purple-600" />
                                  )}
                                  <span className="text-purple-600">리뷰노트</span>
                                </button>
                                <span className="flex-1 truncate">{chapter.name}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleReviewCompleted(chapter)
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-opacity',
                                    chapter.review_completed
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                  )}
                                  title={chapter.review_completed ? '리뷰노트 완료됨' : '리뷰노트 미완료'}
                                  disabled={togglingIds.has(`review-${chapter.id}`)}
                                >
                                  {togglingIds.has(`review-${chapter.id}`) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : chapter.review_completed ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <Circle className="h-3 w-3" />
                                  )}
                                  <span className="text-xs">리뷰노트</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Chapters */}
                      {isExpanded && (
                        <div className="p-2 space-y-1 bg-background">
                          {textbookChapters.map((chapter) => {
                            const hasSchedules = chaptersWithSchedules.has(chapter.id)
                            const statusConfig = {
                              pending: {
                                label: '대기',
                                tooltip: '클릭해서 진행중으로 변경',
                                color: 'text-muted-foreground',
                                bgColor: 'bg-muted/50',
                              },
                              in_progress: {
                                label: '진행중',
                                tooltip: '클릭해서 리뷰노트 등록으로 변경',
                                color: 'text-amber-600',
                                bgColor: 'bg-amber-100 dark:bg-amber-900/30',
                              },
                              review_notes_pending: {
                                label: '리뷰노트',
                                tooltip: chapter.review_completed
                                  ? '클릭해서 완료로 변경'
                                  : '리뷰노트 완료 후 클릭해서 완료로 변경',
                                color: 'text-purple-600',
                                bgColor: 'bg-purple-100 dark:bg-purple-900/30',
                              },
                              completed: {
                                label: '완료',
                                tooltip: hasSchedules
                                  ? '클릭해서 진행중으로 변경'
                                  : '클릭해서 대기로 변경',
                                color: 'text-green-600',
                                bgColor: 'bg-green-100 dark:bg-green-900/30',
                              },
                            }
                            const config = statusConfig[chapter.status]

                            return (
                              <div
                                key={chapter.id}
                                className={cn(
                                  'flex items-center gap-2 p-1.5 rounded text-sm',
                                  chapter.status === 'completed' && 'bg-muted/50'
                                )}
                              >
                                <button
                                  onClick={() => toggleChapterStatus(chapter)}
                                  className={cn(
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                                    config.bgColor,
                                    'hover:opacity-80 transition-opacity'
                                  )}
                                  title={config.tooltip}
                                  disabled={togglingIds.has(`chapter-${chapter.id}`)}
                                >
                                  {togglingIds.has(`chapter-${chapter.id}`) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : chapter.status === 'completed' ? (
                                    <CheckCircle2 className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : chapter.status === 'review_notes_pending' ? (
                                    <StickyNote className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : chapter.status === 'in_progress' ? (
                                    <Clock className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : (
                                    <Circle className={cn('h-3.5 w-3.5', config.color)} />
                                  )}
                                  <span className={config.color}>{config.label}</span>
                                </button>
                                <span
                                  className={cn(
                                    'flex-1 truncate flex items-center gap-1',
                                    chapter.status === 'completed' &&
                                      'line-through text-muted-foreground'
                                  )}
                                >
                                  {chapter.name}
                                  {chapter.target_date && chapter.status !== 'completed' && (() => {
                                    const today = new Date()
                                    today.setHours(0, 0, 0, 0)
                                    const target = new Date(chapter.target_date)
                                    target.setHours(0, 0, 0, 0)
                                    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

                                    let colorClass = 'text-muted-foreground'
                                    if (diffDays < 0) colorClass = 'text-red-500'
                                    else if (diffDays === 0) colorClass = 'text-red-500'
                                    else if (diffDays <= 3) colorClass = 'text-orange-500'

                                    const label = diffDays < 0
                                      ? `D+${Math.abs(diffDays)}`
                                      : diffDays === 0
                                        ? 'D-Day'
                                        : `D-${diffDays}`

                                    return (
                                      <span className={cn('text-xs flex-shrink-0', colorClass)} title={`목표: ${chapter.target_date}`}>
                                        {label}
                                      </span>
                                    )
                                  })()}
                                  {hasSchedules && (
                                    <span title="일정 있음">
                                      <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => toggleReviewCompleted(chapter)}
                                  className={cn(
                                    'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs',
                                    chapter.review_completed
                                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                  )}
                                  title={chapter.review_completed ? '리뷰노트 완료' : '리뷰노트 미완료'}
                                  disabled={togglingIds.has(`review-${chapter.id}`)}
                                >
                                  {togglingIds.has(`review-${chapter.id}`) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <span className="relative flex items-center gap-0.5">
                                      <BookOpen className="h-3 w-3" />
                                      <span className="hidden sm:inline">리뷰노트</span>
                                      {chapter.review_completed && (
                                        <span className="absolute inset-0 flex items-center">
                                          <span className="w-full h-[1px] bg-current" />
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 opacity-30 hover:opacity-100"
                                  onClick={() => openChapterDialog(textbook.id, chapter)}
                                >
                                  <Search className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            )
                          })}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-xs"
                            onClick={() => openChapterDialog(textbook.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            챕터 추가
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredTextbooks.length === 0 && (
                  <div className="text-center text-muted-foreground py-4 text-sm">
                    교재가 없습니다
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Progress Summary + Calendar */}
        <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
          {/* Progress Summary */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader
              className={cn("cursor-pointer", progressExpanded ? "pb-3" : "-mb-2")}
              onClick={() => setProgressExpanded(!progressExpanded)}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GraduationCap className="h-4 w-4" />
                  진행 현황
                </CardTitle>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    !progressExpanded && '-rotate-90'
                  )}
                />
              </div>
            </CardHeader>
            {progressExpanded && <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {subjects.map((subject) => {
                  const subjectTextbooks = textbooks.filter((t) => t.subject_id === subject.id)
                  const subjectChapters = chapters.filter((c) =>
                    subjectTextbooks.some((t) => t.id === c.textbook_id)
                  )
                  const completed = subjectChapters.filter((c) => c.status === 'completed').length
                  const total = subjectChapters.length
                  const actualPercent = total > 0 ? Math.round((completed / total) * 100) : 0

                  // Calculate target progress (chapters that should be done by today based on target_date)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const shouldBeCompleted = subjectChapters.filter((c) => {
                    if (!c.target_date) return false
                    const target = new Date(c.target_date)
                    target.setHours(0, 0, 0, 0)
                    return target <= today
                  }).length
                  const targetPercent = total > 0 ? Math.round((shouldBeCompleted / total) * 100) : 0
                  const diff = actualPercent - targetPercent

                  return (
                    <div key={subject.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{subject.name}</span>
                          {total > 0 && (
                            <span
                              className={cn(
                                'text-xs font-medium',
                                diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'
                              )}
                            >
                              {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : '±0%'}
                            </span>
                          )}
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {completed}/{total}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-8">목표</span>
                          <div className="flex-1 h-1.5 bg-white dark:bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all opacity-40"
                              style={{ width: `${targetPercent}%`, backgroundColor: subject.color }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{targetPercent}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-8">실제</span>
                          <div className="flex-1 h-1.5 bg-white dark:bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${actualPercent}%`, backgroundColor: subject.color }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{actualPercent}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>}
          </Card>

          {/* Calendar */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  학습 일정
                </CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      viewMode === 'week'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                    onClick={() => setViewMode('week')}
                  >
                    주간
                  </button>
                  <button
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                      viewMode === 'month'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                    onClick={() => setViewMode('month')}
                  >
                    월간
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openScheduleDialog()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    일정 추가
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <button
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
                  onClick={() => navigate(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium">
                  {viewMode === 'week'
                    ? `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월 ${Math.ceil(currentDate.getDate() / 7)}주`
                    : `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`}
                </span>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
                  onClick={() => navigate(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 -mt-2">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {viewMode === 'week' ? (
                  <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                    {getWeekDays().map((day, idx) => {
                      const memo = getMemoForDate(day)
                      return (
                        <DroppableDay
                          key={day.toISOString()}
                          day={day}
                          isToday={day.toDateString() === new Date().toDateString()}
                          dayLabel={weekDays[idx]}
                          onClick={() => openScheduleDialog(day)}
                        >
                          {/* Memo section */}
                          <div
                            className={cn(
                              'mb-1 p-1 rounded text-[10px] cursor-pointer transition-colors',
                              memo
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                            )}
                            onClick={(e) => {
                              e.stopPropagation()
                              openMemoDialog(day)
                            }}
                          >
                            <div className="flex items-start gap-1">
                              <StickyNote className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                              {memo ? (
                                <span className="whitespace-pre-wrap">{memo.content}</span>
                              ) : (
                                <span className="opacity-50">메모</span>
                              )}
                            </div>
                          </div>
                          {/* Homework deadline items - displayed first */}
                          {getHomeworkForDate(day).map((hw, hwIdx) => {
                            const isCompleted = hw.isLegacy ? hw.schedule.homework_completed : hw.item?.is_completed
                            const toggleId = hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}`
                            const content = hw.isLegacy ? hw.schedule.homework_content : hw.item?.content
                            return (
                              <div
                                key={hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}-${hwIdx}`}
                                className={cn(
                                  'text-xs p-1.5 rounded border-l-2 border-orange-500 cursor-pointer',
                                  isCompleted
                                    ? 'bg-muted line-through text-muted-foreground'
                                    : 'bg-orange-100 dark:bg-orange-900/30'
                                )}
                                onClick={(e) => {
                                  if ((e.target as HTMLElement).closest('button')) return
                                  e.stopPropagation()
                                  openScheduleDialog(undefined, hw.schedule)
                                }}
                              >
                                <div className="flex items-start gap-1">
                                  <button
                                    className="mt-0.5 flex-shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (!togglingIds.has(toggleId)) {
                                        if (hw.isLegacy) {
                                          toggleHomeworkComplete(hw.schedule)
                                        } else if (hw.item) {
                                          toggleHomeworkItemComplete(hw.item)
                                        }
                                      }
                                    }}
                                    disabled={togglingIds.has(toggleId)}
                                  >
                                    {togglingIds.has(toggleId) ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    ) : isCompleted ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Circle className="h-3 w-3 text-orange-600" />
                                    )}
                                  </button>
                                  <span className="flex-1">
                                    <div className="flex items-center gap-1 text-orange-700 dark:text-orange-300">
                                      <ClipboardList className="h-2.5 w-2.5" />
                                      <span className="font-medium">과제</span>
                                    </div>
                                    <div className="text-muted-foreground">{hw.schedule.title}</div>
                                    {content && (
                                      <div className="text-muted-foreground mt-0.5 text-[10px] line-clamp-2">
                                        {content}
                                      </div>
                                    )}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                          {/* Homework type schedules - displayed with orange style */}
                          {getHomeworkTypeSchedulesForDate(day).map((schedule) => (
                            <div
                              key={schedule.id}
                              className={cn(
                                'text-xs p-1.5 rounded border-l-2 border-orange-500 cursor-pointer',
                                schedule.is_completed
                                  ? 'bg-muted line-through text-muted-foreground'
                                  : 'bg-orange-100 dark:bg-orange-900/30'
                              )}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('button')) return
                                e.stopPropagation()
                                openScheduleDialog(undefined, schedule)
                              }}
                            >
                              <div className="flex items-start gap-1">
                                <button
                                  className="mt-0.5 flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!togglingIds.has(schedule.id)) {
                                      toggleScheduleComplete(schedule)
                                    }
                                  }}
                                  disabled={togglingIds.has(schedule.id)}
                                >
                                  {togglingIds.has(schedule.id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                  ) : schedule.is_completed ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Circle className="h-3 w-3 text-orange-600" />
                                  )}
                                </button>
                                <span className="flex-1">
                                  <div className="flex items-center gap-1 text-orange-700 dark:text-orange-300">
                                    <ClipboardList className="h-2.5 w-2.5" />
                                    <span className="font-medium">과제</span>
                                  </div>
                                  <div className="text-muted-foreground">{schedule.title}</div>
                                  {schedule.description && (
                                    <div className="text-muted-foreground mt-0.5 text-[10px] line-clamp-2">
                                      {schedule.description}
                                    </div>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                          {getSchedulesForDate(day).map((schedule) => (
                            <DraggableScheduleCard
                              key={schedule.id}
                              schedule={schedule}
                              onToggleComplete={() => toggleScheduleComplete(schedule)}
                              onEdit={() => openScheduleDialog(undefined, schedule)}
                              isToggling={togglingIds.has(schedule.id)}
                            />
                          ))}
                        </DroppableDay>
                      )
                    })}
                  </div>
                ) : (
                <div>
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {weekDays.map((day) => (
                        <div key={day} className="text-center text-sm font-medium py-2">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {getMonthDays().map((day, idx) => {
                        const memo = day ? getMemoForDate(day) : null
                        return (
                          <DroppableMonthDay
                            key={idx}
                            day={day}
                            isToday={day?.toDateString() === new Date().toDateString()}
                            onClick={() => day && openScheduleDialog(day)}
                          >
                            {day && (
                              <>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium">{day.getDate()}</span>
                                  <button
                                    className={cn(
                                      'p-0.5 rounded transition-colors',
                                      memo
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-muted-foreground/30 hover:text-muted-foreground'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openMemoDialog(day)
                                    }}
                                    title={memo ? memo.content : '메모 추가'}
                                  >
                                    <StickyNote className="h-3 w-3" />
                                  </button>
                                </div>
                                <div className="space-y-0.5">
                                  {/* Homework deadline items - displayed first */}
                                  {getHomeworkForDate(day).map((hw, hwIdx) => {
                                    const isCompleted = hw.isLegacy ? hw.schedule.homework_completed : hw.item?.is_completed
                                    const toggleId = hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}`
                                    return (
                                      <div
                                        key={hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}-${hwIdx}`}
                                        className={cn(
                                          'text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5 border-l-2 border-orange-500 cursor-pointer',
                                          isCompleted
                                            ? 'bg-muted text-muted-foreground line-through'
                                            : 'bg-orange-100 dark:bg-orange-900/30'
                                        )}
                                        onClick={(e) => {
                                          if ((e.target as HTMLElement).closest('button')) return
                                          e.stopPropagation()
                                          openScheduleDialog(undefined, hw.schedule)
                                        }}
                                      >
                                        <button
                                          className="flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (!togglingIds.has(toggleId)) {
                                              if (hw.isLegacy) {
                                                toggleHomeworkComplete(hw.schedule)
                                              } else if (hw.item) {
                                                toggleHomeworkItemComplete(hw.item)
                                              }
                                            }
                                          }}
                                          disabled={togglingIds.has(toggleId)}
                                        >
                                          {togglingIds.has(toggleId) ? (
                                            <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                                          ) : isCompleted ? (
                                            <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                                          ) : (
                                            <Circle className="h-2.5 w-2.5 text-orange-600" />
                                          )}
                                        </button>
                                        <ClipboardList className="h-2.5 w-2.5 text-orange-600 flex-shrink-0" />
                                        <span className="truncate flex-1">
                                          {hw.schedule.title}
                                        </span>
                                      </div>
                                    )
                                  })}
                                  {/* Homework type schedules - month view */}
                                  {getHomeworkTypeSchedulesForDate(day).map((schedule) => (
                                    <div
                                      key={schedule.id}
                                      className={cn(
                                        'text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5 border-l-2 border-orange-500 cursor-pointer',
                                        schedule.is_completed
                                          ? 'bg-muted text-muted-foreground line-through'
                                          : 'bg-orange-100 dark:bg-orange-900/30'
                                      )}
                                      onClick={(e) => {
                                        if ((e.target as HTMLElement).closest('button')) return
                                        e.stopPropagation()
                                        openScheduleDialog(undefined, schedule)
                                      }}
                                    >
                                      <button
                                        className="flex-shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (!togglingIds.has(schedule.id)) {
                                            toggleScheduleComplete(schedule)
                                          }
                                        }}
                                        disabled={togglingIds.has(schedule.id)}
                                      >
                                        {togglingIds.has(schedule.id) ? (
                                          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                                        ) : schedule.is_completed ? (
                                          <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                                        ) : (
                                          <Circle className="h-2.5 w-2.5 text-orange-600" />
                                        )}
                                      </button>
                                      <ClipboardList className="h-2.5 w-2.5 text-orange-600 flex-shrink-0" />
                                      <span className="truncate flex-1">
                                        {schedule.title}
                                      </span>
                                    </div>
                                  ))}
                                  {getSchedulesForDate(day).map((schedule) => (
                                    <DraggableMonthScheduleCard
                                      key={schedule.id}
                                      schedule={schedule}
                                      onEdit={() => openScheduleDialog(undefined, schedule)}
                                      onToggleComplete={() => toggleScheduleComplete(schedule)}
                                      isToggling={togglingIds.has(schedule.id)}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                          </DroppableMonthDay>
                        )
                      })}
                    </div>
                  </div>
                )}
                <DragOverlay>
                  {activeSchedule && (() => {
                    const displayColor = activeSchedule.subject?.color || activeSchedule.color
                    const subjectColor = activeSchedule.subject?.color
                    return (
                      <div
                        className={cn(
                          'text-xs p-1.5 rounded shadow-lg',
                          activeSchedule.is_completed
                            ? 'bg-muted line-through text-muted-foreground'
                            : !displayColor && 'bg-slate-300/50 dark:bg-slate-600/50'
                        )}
                        style={{
                          borderLeft: subjectColor
                            ? `3px solid ${subjectColor}`
                            : undefined,
                          backgroundColor: !activeSchedule.is_completed && displayColor
                            ? `${displayColor}20`
                            : undefined,
                        }}
                      >
                        <div className="flex items-center gap-1">
                          {activeSchedule.is_completed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <Circle className="h-3 w-3" />
                          )}
                          <span>{activeSchedule.title}</span>
                        </div>
                      </div>
                    )
                  })()}
                </DragOverlay>
              </DndContext>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingSchedule ? '일정 수정' : '일정 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {/* Schedule type toggle */}
            <div className="flex items-center space-x-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <Checkbox
                id="is_homework_type"
                checked={scheduleForm.type === 'homework'}
                onCheckedChange={(checked) => {
                  setScheduleForm({
                    ...scheduleForm,
                    type: checked ? 'homework' : 'self_study',
                  })
                }}
              />
              <Label htmlFor="is_homework_type" className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-orange-600" />
                과제 일정
              </Label>
              <span className="text-xs text-muted-foreground">(과제처럼 표시됨)</span>
            </div>

            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={scheduleForm.title}
                onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                placeholder="일정 제목"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={scheduleForm.schedule_date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, schedule_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={scheduleForm.end_date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, end_date: e.target.value })
                  }
                  min={scheduleForm.schedule_date}
                  placeholder="없음"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <Input
                  type="time"
                  step="300"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <Input
                  type="time"
                  step="300"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                />
              </div>
            </div>

            {/* Multiple Chapter Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>과목/교재/챕터</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setScheduleForm({
                      ...scheduleForm,
                      selected_chapters: [
                        ...scheduleForm.selected_chapters,
                        { subject_id: '', textbook_id: '', chapter_id: '' },
                      ],
                    })
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  추가
                </Button>
              </div>

              {/* Color picker - only when no chapters selected */}
              {scheduleForm.selected_chapters.length === 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">색상 (챕터 미선택 시)</Label>
                  <div className="flex flex-wrap gap-2">
                    {['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'].map((color) => (
                      <button
                        key={color || 'none'}
                        type="button"
                        className={cn(
                          'w-6 h-6 rounded-full border-2 transition-all',
                          scheduleForm.color === color
                            ? 'border-slate-900 dark:border-white scale-110'
                            : 'border-transparent hover:scale-105',
                          !color && 'bg-slate-200 dark:bg-slate-700'
                        )}
                        style={color ? { backgroundColor: color } : undefined}
                        onClick={() => setScheduleForm({ ...scheduleForm, color })}
                        title={color || '없음'}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Selected chapters list */}
              {scheduleForm.selected_chapters.map((selection, idx) => {
                const selectedChapter = chapters.find(c => c.id === selection.chapter_id)
                const selectedTextbook = textbooks.find(t => t.id === selection.textbook_id)
                const selectedSubject = subjects.find(s => s.id === selection.subject_id)

                return (
                  <div key={idx} className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setScheduleForm({
                            ...scheduleForm,
                            selected_chapters: scheduleForm.selected_chapters.filter((_, i) => i !== idx),
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Subject */}
                      <Select
                        value={selection.subject_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_chapters]
                          newSelections[idx] = { subject_id: v, textbook_id: '', chapter_id: '' }
                          setScheduleForm({ ...scheduleForm, selected_chapters: newSelections })
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="과목" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Textbook */}
                      <Select
                        value={selection.textbook_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_chapters]
                          newSelections[idx] = { ...newSelections[idx], textbook_id: v, chapter_id: '' }
                          setScheduleForm({ ...scheduleForm, selected_chapters: newSelections })
                        }}
                        disabled={!selection.subject_id}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="교재" />
                        </SelectTrigger>
                        <SelectContent>
                          {textbooks
                            .filter((t) => t.subject_id === selection.subject_id)
                            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      {/* Chapter */}
                      <Select
                        value={selection.chapter_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_chapters]
                          newSelections[idx] = { ...newSelections[idx], chapter_id: v }
                          setScheduleForm({ ...scheduleForm, selected_chapters: newSelections })
                        }}
                        disabled={!selection.textbook_id}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="챕터" />
                        </SelectTrigger>
                        <SelectContent>
                          {chapters
                            .filter((c) => c.textbook_id === selection.textbook_id)
                            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Summary when complete */}
                    {selectedChapter && selectedTextbook && selectedSubject && (
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        {selectedSubject.name} → {selectedTextbook.name} → {selectedChapter.name}
                      </div>
                    )}
                  </div>
                )
              })}

              {scheduleForm.selected_chapters.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  챕터를 추가하려면 위의 추가 버튼을 클릭하세요
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={scheduleForm.description}
                onChange={(e) => setScheduleForm({ ...scheduleForm, description: e.target.value })}
                placeholder="상세 내용"
                rows={2}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="email_reminder"
                checked={scheduleForm.email_reminder}
                onCheckedChange={(checked) =>
                  setScheduleForm({ ...scheduleForm, email_reminder: checked as boolean })
                }
              />
              <Label htmlFor="email_reminder" className="text-sm">
                이메일 알림 받기
              </Label>
            </div>

            {/* Homework section */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="has_homework"
                    checked={scheduleForm.has_homework}
                    onCheckedChange={(checked) => {
                      const hasHomework = checked as boolean
                      setScheduleForm({
                        ...scheduleForm,
                        has_homework: hasHomework,
                        homework_items: hasHomework && scheduleForm.homework_items.length === 0
                          ? [{ content: '', deadline: '' }]
                          : scheduleForm.homework_items,
                      })
                    }}
                  />
                  <Label htmlFor="has_homework" className="text-sm font-medium">
                    사전 과제 있음
                  </Label>
                </div>
                {scheduleForm.has_homework && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setScheduleForm({
                        ...scheduleForm,
                        homework_items: [
                          ...scheduleForm.homework_items,
                          { content: '', deadline: '' },
                        ],
                      })
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    과제 추가
                  </Button>
                )}
              </div>
              {scheduleForm.has_homework && scheduleForm.homework_items.map((item, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">과제 {index + 1}</span>
                    {scheduleForm.homework_items.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setScheduleForm({
                            ...scheduleForm,
                            homework_items: scheduleForm.homework_items.filter((_, i) => i !== index),
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">마감일</Label>
                    <Input
                      type="date"
                      value={item.deadline}
                      onChange={(e) => {
                        const newItems = [...scheduleForm.homework_items]
                        newItems[index] = { ...item, deadline: e.target.value }
                        setScheduleForm({ ...scheduleForm, homework_items: newItems })
                      }}
                      max={scheduleForm.schedule_date}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">과제 내용</Label>
                    <Textarea
                      value={item.content}
                      onChange={(e) => {
                        const newItems = [...scheduleForm.homework_items]
                        newItems[index] = { ...item, content: e.target.value }
                        setScheduleForm({ ...scheduleForm, homework_items: newItems })
                      }}
                      placeholder="과제 내용을 입력하세요"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0">
            {editingSchedule ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteSchedule(editingSchedule.id)
                    setScheduleDialogOpen(false)
                  }}
                >
                  삭제
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Clear editingSchedule and dates to create a copy
                    setEditingSchedule(null)
                    setScheduleForm((prev) => ({
                      ...prev,
                      schedule_date: '',
                      end_date: '',
                    }))
                  }}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  복사
                </Button>
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={saveSchedule} disabled={!scheduleForm.title || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Textbook Dialog */}
      <Dialog open={textbookDialogOpen} onOpenChange={setTextbookDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTextbook ? '교재 수정' : '교재 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>과목</Label>
              <Select
                value={textbookForm.subject_id}
                onValueChange={(v) => setTextbookForm({ ...textbookForm, subject_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="과목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>교재명</Label>
              <Input
                value={textbookForm.name}
                onChange={(e) => setTextbookForm({ ...textbookForm, name: e.target.value })}
                placeholder="예: 수학의 정석 (상)"
              />
            </div>
            <div className="space-y-2">
              <Label>출판사</Label>
              <Input
                value={textbookForm.publisher}
                onChange={(e) => setTextbookForm({ ...textbookForm, publisher: e.target.value })}
                placeholder="예: 성지출판"
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={textbookForm.description}
                onChange={(e) => setTextbookForm({ ...textbookForm, description: e.target.value })}
                placeholder="교재에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            {editingTextbook && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteTextbook(editingTextbook.id)
                  setTextbookDialogOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setTextbookDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={saveTextbook} disabled={!textbookForm.name || !textbookForm.subject_id || saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chapter Dialog */}
      <Dialog open={chapterDialogOpen} onOpenChange={setChapterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingChapter ? '챕터 수정' : '챕터 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>챕터명</Label>
              <Input
                value={chapterForm.name}
                onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value })}
                placeholder="예: 1장 다항식의 연산"
              />
            </div>
            <div className="space-y-2">
              <Label>목표 완료일</Label>
              <Input
                type="date"
                value={chapterForm.target_date}
                onChange={(e) => setChapterForm({ ...chapterForm, target_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={chapterForm.description}
                onChange={(e) => setChapterForm({ ...chapterForm, description: e.target.value })}
                placeholder="챕터에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingChapter ? (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteChapter(editingChapter.id)
                  setChapterDialogOpen(false)
                }}
              >
                삭제
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setChapterDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={saveChapter} disabled={!chapterForm.name || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subject Dialog */}
      <Dialog open={subjectDialogOpen} onOpenChange={setSubjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubject ? '과목 수정' : '과목 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Subject list when adding */}
            {!editingSubject && subjects.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">등록된 과목</Label>
                <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                  {subjects.map((subject) => (
                    <div
                      key={subject.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        <span className="text-sm">{subject.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => openSubjectDialog(subject)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteSubject(subject.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{editingSubject ? '과목명' : '새 과목명'}</Label>
              <Input
                value={subjectForm.name}
                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                placeholder="예: 수학, 영어, 국어"
              />
            </div>
            <div className="space-y-2">
              <Label>색상</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={subjectForm.color}
                  onChange={(e) => setSubjectForm({ ...subjectForm, color: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border"
                />
                <div className="flex flex-wrap gap-1">
                  {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'].map((color) => (
                    <button
                      key={color}
                      className={cn(
                        'w-6 h-6 rounded-full border-2',
                        subjectForm.color === color ? 'border-foreground' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setSubjectForm({ ...subjectForm, color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            {editingSubject && (
              <Button
                variant="destructive"
                onClick={() => deleteSubject(editingSubject.id)}
              >
                삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setSubjectDialogOpen(false)}>
              {editingSubject ? '취소' : '닫기'}
            </Button>
            <Button onClick={saveSubject} disabled={!subjectForm.name || saving}>
              {saving ? '저장 중...' : editingSubject ? '저장' : '추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Memo Dialog */}
      <Dialog open={memoDialogOpen} onOpenChange={setMemoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              {editingMemoDate && `${editingMemoDate.slice(5).replace('-', '/')} 메모`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              placeholder="이 날짜에 대한 메모를 입력하세요..."
              rows={4}
              className="resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemoDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={saveMemo}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedPage>
  )
}
