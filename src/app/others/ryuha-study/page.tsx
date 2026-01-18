'use client'

import { useState, useEffect, useCallback } from 'react'
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
  GraduationCap,
  Loader2,
  Pencil,
  Trash2,
  BookMarked,
  ListOrdered,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RyuhaSubject, RyuhaTextbook, RyuhaChapter, RyuhaSchedule } from '@/types/ryuha'
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

// Draggable Schedule Card Component
function DraggableScheduleCard({
  schedule,
  onToggleComplete,
  onEdit,
}: {
  schedule: RyuhaSchedule
  onToggleComplete: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderLeft: schedule.subject ? `3px solid ${schedule.subject.color}` : undefined,
        backgroundColor: !schedule.is_completed && schedule.subject?.color
          ? `${schedule.subject.color}20`
          : undefined,
      }
    : {
        borderLeft: schedule.subject ? `3px solid ${schedule.subject.color}` : undefined,
        backgroundColor: !schedule.is_completed && schedule.subject?.color
          ? `${schedule.subject.color}20`
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
          : !schedule.subject && 'bg-slate-300/50 dark:bg-slate-600/50'
      )}
    >
      <div className="flex items-start gap-1">
        <button
          className="mt-0.5 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onToggleComplete()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {schedule.is_completed ? (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : (
            <Circle className="h-3 w-3" />
          )}
        </button>
        <span
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {schedule.title}
        </span>
      </div>
      {schedule.start_time && (
        <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
          <Clock className="h-2.5 w-2.5" />
          {schedule.start_time.slice(0, 5)}
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
  const dateStr = day.toISOString().split('T')[0]
  const { isOver, setNodeRef } = useDroppable({
    id: `day-${dateStr}`,
    data: { date: day, dateStr },
  })

  return (
    <div className="min-h-[280px]">
      <div
        className={cn(
          'text-center py-1.5 rounded-t-lg font-medium text-xs',
          isToday ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-200 dark:bg-slate-700'
        )}
      >
        <div>{dayLabel}</div>
        <div className="text-base">{day.getDate()}</div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'border border-t-0 rounded-b-lg p-2 space-y-1 min-h-[240px] cursor-pointer transition-colors',
          isOver ? 'bg-slate-900/10 border-slate-900 dark:bg-white/10 dark:border-white' : 'hover:bg-muted/50'
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
  const dateStr = day?.toISOString().split('T')[0] || ''
  const { isOver, setNodeRef } = useDroppable({
    id: day ? `day-${dateStr}` : `empty-${Math.random()}`,
    data: { date: day, dateStr },
    disabled: !day,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[100px] border rounded p-1',
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
}: {
  schedule: RyuhaSchedule
  onEdit: () => void
  onToggleComplete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        backgroundColor: schedule.is_completed
          ? undefined
          : schedule.subject?.color
            ? `${schedule.subject.color}25`
            : undefined,
      }
    : {
        backgroundColor: schedule.is_completed
          ? undefined
          : schedule.subject?.color
            ? `${schedule.subject.color}25`
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
          : !schedule.subject?.color && 'bg-slate-200 dark:bg-slate-700'
      )}
    >
      <button
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete()
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {schedule.is_completed ? (
          <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
        ) : (
          <Circle className="h-2.5 w-2.5" />
        )}
      </button>
      <span
        className="truncate flex-1"
        onClick={(e) => {
          e.stopPropagation()
          if (!isDragging) {
            onEdit()
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
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
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [expandedTextbooks, setExpandedTextbooks] = useState<string[]>([])
  const [chaptersWithSchedules, setChaptersWithSchedules] = useState<Set<string>>(new Set())
  const [activeSchedule, setActiveSchedule] = useState<RyuhaSchedule | null>(null)

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

  // Form states
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    description: '',
    schedule_date: '',
    start_time: '',
    end_time: '',
    type: 'self_study' as 'homework' | 'self_study',
    subject_id: '',
    textbook_id: '',
    chapter_id: '',
    email_reminder: false,
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
      ])
      setLoading(false)
    }
    loadData()
  }, [fetchSubjects, fetchTextbooks, fetchChapters, fetchSchedules, fetchChaptersWithSchedules])

  // Save viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('ryuha-calendar-view', viewMode)
  }, [viewMode])

  // Save progressExpanded to localStorage
  useEffect(() => {
    localStorage.setItem('ryuha-progress-expanded', String(progressExpanded))
  }, [progressExpanded])

  // Date helpers
  const getWeekStart = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  }

  const formatDate = (date: Date) => date.toISOString().split('T')[0]

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
    return schedules.filter((s) => s.schedule_date === formatDate(date))
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
      setScheduleForm({
        title: schedule.title,
        description: schedule.description || '',
        schedule_date: schedule.schedule_date,
        start_time: schedule.start_time || '',
        end_time: schedule.end_time || '',
        type: schedule.type,
        subject_id: schedule.subject_id || '',
        textbook_id: chapter?.textbook_id || '',
        chapter_id: schedule.chapter_id || '',
        email_reminder: schedule.email_reminder,
      })
    } else {
      setEditingSchedule(null)
      setScheduleForm({
        title: '',
        description: '',
        schedule_date: date ? formatDate(date) : formatDate(new Date()),
        start_time: '',
        end_time: '',
        type: 'self_study',
        subject_id: '',
        textbook_id: '',
        chapter_id: '',
        email_reminder: false,
      })
    }
    setScheduleDialogOpen(true)
  }

  const saveSchedule = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        title: scheduleForm.title,
        description: scheduleForm.description || null,
        schedule_date: scheduleForm.schedule_date,
        start_time: scheduleForm.start_time || null,
        end_time: scheduleForm.end_time || null,
        type: scheduleForm.type,
        subject_id: scheduleForm.subject_id || null,
        chapter_id: scheduleForm.chapter_id || null,
        email_reminder: scheduleForm.email_reminder,
      }

      if (editingSchedule) {
        await fetch('/api/ryuha/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSchedule.id, ...payload }),
        })
      } else {
        await fetch('/api/ryuha/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      // Auto-update chapter to "in_progress" when schedule is created with chapter_id
      if (scheduleForm.chapter_id) {
        const chapter = chapters.find((c) => c.id === scheduleForm.chapter_id)
        if (chapter && chapter.status === 'pending') {
          await fetch('/api/ryuha/chapters', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: chapter.id, status: 'in_progress' }),
          })
          await fetchChapters()
        }
        // Update chaptersWithSchedules
        setChaptersWithSchedules((prev) => new Set([...prev, scheduleForm.chapter_id]))
      }

      setScheduleDialogOpen(false)
      await fetchSchedules()
    } finally {
      setSaving(false)
    }
  }

  const toggleScheduleComplete = async (schedule: RyuhaSchedule) => {
    await fetch('/api/ryuha/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: schedule.id, is_completed: !schedule.is_completed }),
    })
    fetchSchedules()
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
    const hasSchedules = chaptersWithSchedules.has(chapter.id)

    // Determine next status based on whether chapter has schedules
    let nextStatus: 'pending' | 'in_progress' | 'completed'
    if (hasSchedules) {
      // If has schedules: only toggle between in_progress and completed
      nextStatus = chapter.status === 'completed' ? 'in_progress' : 'completed'
    } else {
      // If no schedules: pending → in_progress → completed → pending
      nextStatus =
        chapter.status === 'pending'
          ? 'in_progress'
          : chapter.status === 'in_progress'
            ? 'completed'
            : 'pending'
    }

    // Check if trying to complete without review note completed
    if (nextStatus === 'completed' && !chapter.review_completed) {
      alert('리뷰노트를 먼저 완료해주세요.')
      return
    }

    const completed_at = nextStatus === 'completed' ? new Date().toISOString() : null

    await fetch('/api/ryuha/chapters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chapter.id, status: nextStatus, completed_at }),
    })
    fetchChapters()
  }

  const toggleReviewCompleted = async (chapter: RyuhaChapter) => {
    await fetch('/api/ryuha/chapters', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chapter.id, review_completed: !chapter.review_completed }),
    })
    fetchChapters()
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

  // Filtered data
  const filteredTextbooks = selectedSubject
    ? textbooks.filter((t) => t.subject_id === selectedSubject)
    : textbooks

  const getChaptersForTextbook = (textbookId: string) =>
    chapters
      .filter((c) => c.textbook_id === textbookId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Textbooks & Chapters Panel */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookMarked className="h-4 w-4" />
                  교재 & 진도
                </CardTitle>
                <button
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  onClick={() => openTextbookDialog()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
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
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 ml-1 opacity-30 hover:opacity-100"
                  onClick={() => openSubjectDialog()}
                  title="과목 관리"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
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
                                tooltip: '클릭해서 완료로 변경',
                                color: 'text-amber-600',
                                bgColor: 'bg-amber-100 dark:bg-amber-900/30',
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
                                >
                                  {chapter.status === 'completed' ? (
                                    <CheckCircle2 className={cn('h-3.5 w-3.5', config.color)} />
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
                                >
                                  <span className="relative flex items-center gap-0.5">
                                    <BookOpen className="h-3 w-3" />
                                    <span className="hidden sm:inline">리뷰노트</span>
                                    {chapter.review_completed && (
                                      <span className="absolute inset-0 flex items-center">
                                        <span className="w-full h-[1px] bg-current" />
                                      </span>
                                    )}
                                  </span>
                                </button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 opacity-30 hover:opacity-100"
                                  onClick={() => openChapterDialog(textbook.id, chapter)}
                                >
                                  <Pencil className="h-2.5 w-2.5" />
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
              className="pb-3 cursor-pointer"
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
            <CardHeader className="pb-3">
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
              <div className="flex items-center justify-center gap-2 mt-2">
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
            <CardContent className="p-4 pt-0">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {viewMode === 'week' ? (
                  <div className="grid grid-cols-7 gap-2">
                    {getWeekDays().map((day, idx) => (
                      <DroppableDay
                        key={day.toISOString()}
                        day={day}
                        isToday={day.toDateString() === new Date().toDateString()}
                        dayLabel={weekDays[idx]}
                        onClick={() => openScheduleDialog(day)}
                      >
                        {getSchedulesForDate(day).map((schedule) => (
                          <DraggableScheduleCard
                            key={schedule.id}
                            schedule={schedule}
                            onToggleComplete={() => toggleScheduleComplete(schedule)}
                            onEdit={() => openScheduleDialog(undefined, schedule)}
                          />
                        ))}
                      </DroppableDay>
                    ))}
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
                      {getMonthDays().map((day, idx) => (
                        <DroppableMonthDay
                          key={idx}
                          day={day}
                          isToday={day?.toDateString() === new Date().toDateString()}
                          onClick={() => day && openScheduleDialog(day)}
                        >
                          {day && (
                            <>
                              <div className="text-sm font-medium mb-1">{day.getDate()}</div>
                              <div className="space-y-0.5">
                                {getSchedulesForDate(day)
                                  .slice(0, 3)
                                  .map((schedule) => (
                                    <DraggableMonthScheduleCard
                                      key={schedule.id}
                                      schedule={schedule}
                                      onEdit={() => openScheduleDialog(undefined, schedule)}
                                      onToggleComplete={() => toggleScheduleComplete(schedule)}
                                    />
                                  ))}
                                {getSchedulesForDate(day).length > 3 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    +{getSchedulesForDate(day).length - 3}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </DroppableMonthDay>
                      ))}
                    </div>
                  </div>
                )}
                <DragOverlay>
                  {activeSchedule && (
                    <div
                      className={cn(
                        'text-xs p-1.5 rounded shadow-lg',
                        activeSchedule.is_completed
                          ? 'bg-muted line-through text-muted-foreground'
                          : !activeSchedule.subject && 'bg-slate-300/50 dark:bg-slate-600/50'
                      )}
                      style={{
                        borderLeft: activeSchedule.subject
                          ? `3px solid ${activeSchedule.subject.color}`
                          : undefined,
                        backgroundColor: !activeSchedule.is_completed && activeSchedule.subject?.color
                          ? `${activeSchedule.subject.color}20`
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
                  )}
                </DragOverlay>
              </DndContext>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSchedule ? '일정 수정' : '일정 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={scheduleForm.schedule_date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, schedule_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>유형</Label>
                <Select
                  value={scheduleForm.type}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, type: v as 'homework' | 'self_study' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self_study">자기학습</SelectItem>
                    <SelectItem value="homework">학원숙제</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작 시간</Label>
                <Input
                  type="time"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <Input
                  type="time"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                />
              </div>
            </div>

            {/* Subject → Textbook → Chapter cascade */}
            <div className="space-y-2">
              <Label>과목</Label>
              <Select
                value={scheduleForm.subject_id}
                onValueChange={(v) =>
                  setScheduleForm({ ...scheduleForm, subject_id: v, textbook_id: '', chapter_id: '' })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
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

            {scheduleForm.subject_id && (
              <div className="space-y-2">
                <Label>교재</Label>
                <Select
                  value={scheduleForm.textbook_id}
                  onValueChange={(v) =>
                    setScheduleForm({ ...scheduleForm, textbook_id: v, chapter_id: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {textbooks
                      .filter((t) => t.subject_id === scheduleForm.subject_id)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleForm.textbook_id && (
              <div className="space-y-2">
                <Label>챕터</Label>
                <Select
                  value={scheduleForm.chapter_id}
                  onValueChange={(v) => setScheduleForm({ ...scheduleForm, chapter_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {chapters
                      .filter((c) => c.textbook_id === scheduleForm.textbook_id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingSchedule ? (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteSchedule(editingSchedule.id)
                  setScheduleDialogOpen(false)
                }}
              >
                삭제
              </Button>
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
    </>
  )
}
