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
import { TenswMgmtClient, TenswMgmtProject, TenswMgmtMilestone, TenswMgmtSchedule, TenswMgmtDailyMemo, TenswMgmtTask } from '@/types/tensw-mgmt'
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

// Skeleton for Projects Panel
function ProjectsPanelSkeleton() {
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
        {/* Client filter skeleton */}
        <div className="flex flex-wrap gap-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded-full" />
          ))}
        </div>
        {/* Projects skeleton */}
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
function TenswManagementPageSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 order-2 lg:order-1">
        <ProjectsPanelSkeleton />
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
  schedule: TenswMgmtSchedule
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

  // Determine display color: client color takes priority, then custom color
  const displayColor = schedule.client?.color || schedule.color
  const clientColor = schedule.client?.color

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderLeft: clientColor ? `3px solid ${clientColor}` : undefined,
        backgroundColor: !schedule.is_completed && displayColor
          ? `${displayColor}20`
          : undefined,
      }
    : {
        borderLeft: clientColor ? `3px solid ${clientColor}` : undefined,
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
      {/* Display connected milestones */}
      {schedule.milestones && schedule.milestones.length > 0 && (
        <div className="text-[10px] mt-0.5 space-y-0.5">
          {schedule.milestones.map((ch) => (
            <div key={ch.id} className="flex items-start gap-1 text-blue-600 dark:text-blue-400">
              <BookOpen className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" />
              <span>{ch.project?.name && `${ch.project.name} > `}{ch.name}</span>
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
      {schedule.tasks && schedule.tasks.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {schedule.tasks.map((item, idx) => (
            <div key={item.id || idx} className={cn(
              'flex items-center gap-1 text-[10px]',
              item.is_completed ? 'text-green-600' : 'text-orange-600'
            )}>
              <ClipboardList className="h-2.5 w-2.5" />
              <span>
                태스크{schedule.tasks!.length > 1 ? ` ${idx + 1}` : ''}: {item.is_completed ? '완료' : item.deadline?.slice(5).replace('-', '/') || '-'}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Legacy single task field support */}
      {!schedule.tasks?.length && schedule.task_deadline && (
        <div className={cn(
          'flex items-center gap-1 mt-0.5 text-[10px]',
          schedule.task_completed ? 'text-green-600' : 'text-orange-600'
        )}>
          <ClipboardList className="h-2.5 w-2.5" />
          <span>
            태스크 {schedule.task_completed ? '완료' : `마감: ${schedule.task_deadline.slice(5).replace('-', '/')}`}
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
  schedule: TenswMgmtSchedule
  onEdit: () => void
  onToggleComplete: () => void
  isToggling?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: schedule.id,
    data: { schedule },
  })

  // Determine display color: client color takes priority, then custom color
  const displayColor = schedule.client?.color || schedule.color
  const clientColor = schedule.client?.color

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        borderLeft: clientColor ? `2px solid ${clientColor}` : undefined,
        backgroundColor: schedule.is_completed
          ? undefined
          : displayColor
            ? `${displayColor}25`
            : undefined,
      }
    : {
        borderLeft: clientColor ? `2px solid ${clientColor}` : undefined,
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
      {(schedule.tasks?.length ?? 0) > 0 && (
        <ClipboardList className={cn(
          'h-2.5 w-2.5 flex-shrink-0',
          schedule.tasks!.every(item => item.is_completed) ? 'text-green-600' : 'text-orange-600'
        )} />
      )}
      {/* Legacy single task field support */}
      {!schedule.tasks?.length && schedule.task_deadline && (
        <ClipboardList className={cn(
          'h-2.5 w-2.5 flex-shrink-0',
          schedule.task_completed ? 'text-green-600' : 'text-orange-600'
        )} />
      )}
      <span className="truncate flex-1">
        {schedule.title}
      </span>
    </div>
  )
}

export default function TenswManagementPage() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tensw-mgmt-calendar-view')
      return (saved === 'week' || saved === 'month') ? saved : 'week'
    }
    return 'week'
  })
  const [progressExpanded, setProgressExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tensw-mgmt-progress-expanded')
      return saved !== 'false'
    }
    return true
  })
  const [studyPlanExpanded, setStudyPlanExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tensw-mgmt-study-plan-expanded')
      return saved !== 'false'
    }
    return true
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const [clients, setClients] = useState<TenswMgmtClient[]>([])
  const [projects, setProjects] = useState<TenswMgmtProject[]>([])
  const [milestones, setMilestones] = useState<TenswMgmtMilestone[]>([])
  const [schedules, setSchedules] = useState<TenswMgmtSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tensw-mgmt-selected-client')
    }
    return null
  })
  const [expandedProjects, setExpandedProjects] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tensw-mgmt-expanded-projects')
      return saved ? JSON.parse(saved) : []
    }
    return []
  })
  const [milestonesWithSchedules, setMilestonesWithSchedules] = useState<Set<string>>(new Set())
  const [activeSchedule, setActiveSchedule] = useState<TenswMgmtSchedule | null>(null)
  const [memos, setMemos] = useState<Map<string, TenswMgmtDailyMemo>>(new Map())
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
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<TenswMgmtSchedule | null>(null)
  const [editingProject, setEditingProject] = useState<TenswMgmtProject | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<TenswMgmtMilestone | null>(null)
  const [editingClient, setEditingClient] = useState<TenswMgmtClient | null>(null)
  const [memoDialogOpen, setMemoDialogOpen] = useState(false)
  const [editingMemoDate, setEditingMemoDate] = useState<string>('')
  const [memoContent, setMemoContent] = useState('')

  // Form states
  interface TaskItemForm {
    id?: string
    content: string
    deadline: string | null
    is_completed?: boolean
  }
  interface MilestoneSelectionForm {
    client_id: string
    project_id: string
    milestone_id: string
  }
  const [scheduleForm, setScheduleForm] = useState({
    title: '',
    description: '',
    schedule_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    type: 'meeting' as 'task' | 'meeting' | 'deadline',
    color: '',
    client_id: '',
    project_id: '',
    milestone_id: '',
    selected_milestones: [] as MilestoneSelectionForm[],
    email_reminder: false,
    has_task: false,
    tasks: [] as TaskItemForm[],
  })

  const [projectForm, setProjectForm] = useState({
    client_id: '',
    name: '',
    description: '',
    status: 'active' as 'active' | 'completed' | 'on_hold' | 'cancelled',
  })

  const [milestoneForm, setMilestoneForm] = useState({
    project_id: '',
    name: '',
    description: '',
    target_date: '',
  })

  const [clientForm, setClientForm] = useState({
    name: '',
    color: '#6366f1',
  })

  // Fetch data
  const fetchClients = useCallback(async () => {
    const res = await fetch('/api/tensw-mgmt/clients')
    const data = await res.json()
    setClients(data)
  }, [])

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/tensw-mgmt/projects')
    const data = await res.json()
    setProjects(data)
  }, [])

  const fetchMilestones = useCallback(async () => {
    const res = await fetch('/api/tensw-mgmt/milestones')
    const data = await res.json()
    setMilestones(data)
  }, [])

  const fetchSchedules = useCallback(async () => {
    const { startDate, endDate } = getDateRange()
    const res = await fetch(`/api/tensw-mgmt/schedules?startDate=${startDate}&endDate=${endDate}`)
    const data = await res.json()
    setSchedules(data)
  }, [currentDate, viewMode])

  // Fetch all milestone IDs that have schedules (for status restriction)
  const fetchMilestonesWithSchedules = useCallback(async () => {
    const res = await fetch('/api/tensw-mgmt/schedules')
    const data: TenswMgmtSchedule[] = await res.json()
    const milestoneIds = new Set(
      data.filter((s) => s.milestone_id).map((s) => s.milestone_id!)
    )
    setMilestonesWithSchedules(milestoneIds)
  }, [])

  const fetchMemos = useCallback(async () => {
    try {
      const { startDate, endDate } = getDateRange()
      const res = await fetch(`/api/tensw-mgmt/memos?startDate=${startDate}&endDate=${endDate}`)
      const data = await res.json()
      const memoMap = new Map<string, TenswMgmtDailyMemo>()
      if (Array.isArray(data)) {
        data.forEach((memo: TenswMgmtDailyMemo) => memoMap.set(memo.memo_date, memo))
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
        fetchClients(),
        fetchProjects(),
        fetchMilestones(),
        fetchSchedules(),
        fetchMilestonesWithSchedules(),
        fetchMemos(),
      ])
      setLoading(false)
    }
    loadData()
  }, [fetchClients, fetchProjects, fetchMilestones, fetchSchedules, fetchMilestonesWithSchedules, fetchMemos])

  // Save viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('tensw-mgmt-calendar-view', viewMode)
  }, [viewMode])

  // Save progressExpanded to localStorage
  useEffect(() => {
    localStorage.setItem('tensw-mgmt-progress-expanded', String(progressExpanded))
  }, [progressExpanded])

  // Save selectedClient to localStorage
  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem('tensw-mgmt-selected-client', selectedClient)
    } else {
      localStorage.removeItem('tensw-mgmt-selected-client')
    }
  }, [selectedClient])

  // Save expandedProjects to localStorage
  useEffect(() => {
    localStorage.setItem('tensw-mgmt-expanded-projects', JSON.stringify(expandedProjects))
  }, [expandedProjects])

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
        // Exclude task type schedules (they are displayed separately)
        if (s.type === 'task') return false
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

  // Get task type schedules for a specific date (displayed at schedule_date)
  const getTaskTypeSchedulesForDate = (date: Date) => {
    const dateStr = formatDate(date)
    return schedules
      .filter((s) => s.type === 'task' && s.schedule_date === dateStr)
      .sort((a, b) => {
        if (!a.start_time && b.start_time) return -1
        if (a.start_time && !b.start_time) return 1
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        return 0
      })
  }

  // Get task deadline items for a specific date
  interface TaskForDate {
    schedule: TenswMgmtSchedule
    item?: TenswMgmtTask
    isLegacy: boolean
  }
  const getTaskForDate = (date: Date): TaskForDate[] => {
    const dateStr = formatDate(date)
    const result: TaskForDate[] = []

    for (const schedule of schedules) {
      // Check new tasks
      if (schedule.tasks?.length) {
        for (const item of schedule.tasks) {
          if (item.deadline === dateStr) {
            result.push({ schedule, item, isLegacy: false })
          }
        }
      }
      // Check legacy task_deadline
      else if (schedule.task_deadline === dateStr) {
        result.push({ schedule, isLegacy: true })
      }
    }

    return result
  }

  // Get key study plan milestones (overdue + upcoming within 7 days)
  const getKeyStudyPlanMilestones = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = formatDate(today)

    const sevenDaysLater = new Date(today)
    sevenDaysLater.setDate(today.getDate() + 7)
    const sevenDaysLaterStr = formatDate(sevenDaysLater)

    const overdueMilestones: TenswMgmtMilestone[] = []
    const upcomingByProject: Map<string, TenswMgmtMilestone[]> = new Map()

    for (const milestone of milestones) {
      if (!milestone.target_date || milestone.status === 'completed') continue

      const project = projects.find(t => t.id === milestone.project_id)
      if (!project) continue

      // Overdue: target_date < today
      if (milestone.target_date < todayStr) {
        overdueMilestones.push(milestone)
      }
      // Upcoming: today <= target_date <= today + 7 days
      else if (milestone.target_date >= todayStr && milestone.target_date <= sevenDaysLaterStr) {
        const existing = upcomingByProject.get(milestone.project_id) || []
        existing.push(milestone)
        upcomingByProject.set(milestone.project_id, existing)
      }
    }

    // Sort overdue by target_date (oldest first)
    overdueMilestones.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''))

    // For each project, get milestones with the closest target_date
    const upcomingMilestones: TenswMgmtMilestone[] = []
    for (const [, projectMilestones] of upcomingByProject) {
      // Sort by target_date
      projectMilestones.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''))
      // Get the closest target_date
      const closestDate = projectMilestones[0]?.target_date
      if (closestDate) {
        // Add all milestones with the same closest date
        upcomingMilestones.push(...projectMilestones.filter(ch => ch.target_date === closestDate))
      }
    }

    // Sort upcoming by target_date
    upcomingMilestones.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || ''))

    return { overdueMilestones, upcomingMilestones }
  }

  // Toggle project expansion
  const toggleProject = (id: string) => {
    setExpandedProjects((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  // Schedule CRUD
  const openScheduleDialog = (date?: Date, schedule?: TenswMgmtSchedule) => {
    if (schedule) {
      setEditingSchedule(schedule)
      const milestone = milestones.find((c) => c.id === schedule.milestone_id)
      // Convert tasks to form format, or use legacy fields
      const tasks: TaskItemForm[] = schedule.tasks?.length
        ? schedule.tasks.map(item => ({
            id: item.id,
            content: item.content,
            deadline: item.deadline,
            is_completed: item.is_completed,
          }))
        : (schedule.task_content || schedule.task_deadline)
          ? [{ content: schedule.task_content || '', deadline: schedule.task_deadline || '' }]
          : []

      // Build selected_milestones from milestone_ids or legacy milestone_id
      const milestoneIds = schedule.milestone_ids?.length > 0
        ? schedule.milestone_ids
        : schedule.milestone_id
          ? [schedule.milestone_id]
          : []
      const selectedMilestones: MilestoneSelectionForm[] = milestoneIds.map(cid => {
        const ch = milestones.find(c => c.id === cid)
        const tb = ch ? projects.find(t => t.id === ch.project_id) : undefined
        return {
          client_id: tb?.client_id || '',
          project_id: ch?.project_id || '',
          milestone_id: cid,
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
        client_id: schedule.client_id || '',
        project_id: milestone?.project_id || '',
        milestone_id: schedule.milestone_id || '',
        selected_milestones: selectedMilestones,
        email_reminder: schedule.email_reminder,
        has_task: tasks.length > 0,
        tasks: tasks,
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
        type: 'meeting',
        color: '',
        client_id: '',
        project_id: '',
        milestone_id: '',
        selected_milestones: [],
        email_reminder: false,
        has_task: false,
        tasks: [],
      })
    }
    setScheduleDialogOpen(true)
  }

  const saveSchedule = async () => {
    if (saving) return
    setSaving(true)
    try {
      // Get milestone_ids from selected_milestones (use milestone_id as fallback for legacy)
      const milestoneIds = scheduleForm.selected_milestones.length > 0
        ? scheduleForm.selected_milestones.map(sc => sc.milestone_id).filter(Boolean)
        : scheduleForm.milestone_id ? [scheduleForm.milestone_id] : []

      const payload = {
        title: scheduleForm.title,
        description: scheduleForm.description || null,
        schedule_date: scheduleForm.schedule_date,
        end_date: scheduleForm.end_date || null,
        start_time: scheduleForm.start_time || null,
        end_time: scheduleForm.end_time || null,
        type: scheduleForm.type,
        color: scheduleForm.client_id ? null : (scheduleForm.color || null),
        client_id: scheduleForm.client_id || null,
        milestone_id: milestoneIds[0] || null, // Keep first for backward compatibility
        milestone_ids: milestoneIds,
        email_reminder: scheduleForm.email_reminder,
        // Clear legacy fields since we're using tasks now
        task_content: null,
        task_deadline: null,
      }

      let scheduleId: string
      if (editingSchedule) {
        await fetch('/api/tensw-mgmt/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSchedule.id, ...payload }),
        })
        scheduleId = editingSchedule.id
      } else {
        const res = await fetch('/api/tensw-mgmt/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const newSchedule = await res.json()
        scheduleId = newSchedule.id
      }

      // Handle task items
      if (scheduleForm.has_task && scheduleForm.tasks.length > 0) {
        const existingIds = new Set(editingSchedule?.tasks?.map(h => h.id) || [])
        const formIds = new Set(scheduleForm.tasks.filter(h => h.id).map(h => h.id!))

        // Delete removed items
        for (const existingId of existingIds) {
          if (!formIds.has(existingId)) {
            await fetch(`/api/tensw-mgmt/tasks?id=${existingId}`, { method: 'DELETE' })
          }
        }

        // Create or update items
        for (let i = 0; i < scheduleForm.tasks.length; i++) {
          const item = scheduleForm.tasks[i]
          if (item.id && existingIds.has(item.id)) {
            // Update existing
            await fetch('/api/tensw-mgmt/tasks', {
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
            await fetch('/api/tensw-mgmt/tasks', {
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
      } else if (editingSchedule?.tasks?.length) {
        // If has_task is false but there were existing items, delete them all
        for (const item of editingSchedule.tasks) {
          await fetch(`/api/tensw-mgmt/tasks?id=${item.id}`, { method: 'DELETE' })
        }
      }

      // Auto-update milestones to "in_progress" when schedule is created with milestone_ids
      if (milestoneIds.length > 0) {
        for (const cid of milestoneIds) {
          const milestone = milestones.find((c) => c.id === cid)
          if (milestone && milestone.status === 'pending') {
            await fetch('/api/tensw-mgmt/milestones', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: milestone.id, status: 'in_progress' }),
            })
          }
        }
        await fetchMilestones()
        // Update milestonesWithSchedules
        setMilestonesWithSchedules((prev) => new Set([...prev, ...milestoneIds]))
      }

      setScheduleDialogOpen(false)
      await fetchSchedules()
    } finally {
      setSaving(false)
    }
  }

  const toggleScheduleComplete = async (schedule: TenswMgmtSchedule) => {
    if (togglingIds.has(schedule.id)) return
    setTogglingIds(prev => new Set(prev).add(schedule.id))
    try {
      await fetch('/api/tensw-mgmt/schedules', {
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

  const toggleTaskComplete = async (schedule: TenswMgmtSchedule) => {
    const hwId = `hw-${schedule.id}`
    if (togglingIds.has(hwId)) return
    setTogglingIds(prev => new Set(prev).add(hwId))
    try {
      await fetch('/api/tensw-mgmt/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, task_completed: !schedule.task_completed }),
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

  const toggleTaskItemComplete = async (item: TenswMgmtTask) => {
    const hwItemId = `hwi-${item.id}`
    if (togglingIds.has(hwItemId)) return
    setTogglingIds(prev => new Set(prev).add(hwItemId))
    try {
      await fetch('/api/tensw-mgmt/tasks', {
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
    await fetch(`/api/tensw-mgmt/schedules?id=${id}`, { method: 'DELETE' })
    await Promise.all([fetchSchedules(), fetchMilestonesWithSchedules()])
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
    await fetch('/api/tensw-mgmt/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: scheduleId, schedule_date: dropData.dateStr }),
    })
    fetchSchedules()
  }

  // Project CRUD
  const openProjectDialog = (project?: TenswMgmtProject) => {
    if (project) {
      setEditingProject(project)
      setProjectForm({
        client_id: project.client_id,
        name: project.name,
        description: project.description || '',
        status: project.status,
      })
    } else {
      setEditingProject(null)
      setProjectForm({
        client_id: selectedClient || clients[0]?.id || '',
        name: '',
        description: '',
        status: 'active',
      })
    }
    setProjectDialogOpen(true)
  }

  const saveProject = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (editingProject) {
        await fetch('/api/tensw-mgmt/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProject.id, ...projectForm }),
        })
      } else {
        await fetch('/api/tensw-mgmt/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(projectForm),
        })
      }
      setProjectDialogOpen(false)
      await fetchProjects()
    } finally {
      setSaving(false)
    }
  }

  const deleteProject = async (id: string) => {
    if (!confirm('프로젝트를 삭제하면 모든 마일스톤도 삭제됩니다. 삭제하시겠습니까?')) return
    await fetch(`/api/tensw-mgmt/projects?id=${id}`, { method: 'DELETE' })
    fetchProjects()
    fetchMilestones()
  }

  // Milestone CRUD
  const openMilestoneDialog = (projectId: string, milestone?: TenswMgmtMilestone) => {
    if (milestone) {
      setEditingMilestone(milestone)
      setMilestoneForm({
        project_id: milestone.project_id,
        name: milestone.name,
        description: milestone.description || '',
        target_date: milestone.target_date || '',
      })
    } else {
      setEditingMilestone(null)
      setMilestoneForm({
        project_id: projectId,
        name: '',
        description: '',
        target_date: '',
      })
    }
    setMilestoneDialogOpen(true)
  }

  const saveMilestone = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = {
        project_id: milestoneForm.project_id,
        name: milestoneForm.name,
        description: milestoneForm.description || null,
        target_date: milestoneForm.target_date || null,
      }

      if (editingMilestone) {
        const res = await fetch('/api/tensw-mgmt/milestones', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingMilestone.id, ...payload }),
        })
        if (!res.ok) throw new Error('Failed to update milestone')
      } else {
        const res = await fetch('/api/tensw-mgmt/milestones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Failed to create milestone')
      }
      setMilestoneDialogOpen(false)
      await Promise.all([fetchMilestones(), fetchProjects()])
    } catch (error) {
      console.error('Error saving milestone:', error)
      alert('마일스톤 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const toggleMilestoneStatus = async (milestone: TenswMgmtMilestone) => {
    const milestoneId = `milestone-${milestone.id}`
    if (togglingIds.has(milestoneId)) return

    const hasSchedules = milestonesWithSchedules.has(milestone.id)

    // Determine next status based on whether milestone has schedules
    // Flow: pending → in_progress → review_pending → completed
    let nextStatus: 'pending' | 'in_progress' | 'review_pending' | 'completed'
    if (hasSchedules) {
      // If has schedules: in_progress → review_pending → completed → in_progress
      if (milestone.status === 'in_progress') {
        nextStatus = 'review_pending'
      } else if (milestone.status === 'review_pending') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'in_progress'
      }
    } else {
      // If no schedules: pending → in_progress → review_pending → completed → pending
      if (milestone.status === 'pending') {
        nextStatus = 'in_progress'
      } else if (milestone.status === 'in_progress') {
        nextStatus = 'review_pending'
      } else if (milestone.status === 'review_pending') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'pending'
      }
    }

    // Check if trying to complete without review note completed
    if (nextStatus === 'completed' && !milestone.review_completed) {
      alert('리뷰노트를 먼저 완료해주세요.')
      return
    }

    setTogglingIds(prev => new Set(prev).add(milestoneId))
    try {
      const completed_at = nextStatus === 'completed' ? new Date().toISOString() : null

      await fetch('/api/tensw-mgmt/milestones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: milestone.id, status: nextStatus, completed_at }),
      })
      await fetchMilestones()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(milestoneId)
        return next
      })
    }
  }

  const toggleReviewCompleted = async (milestone: TenswMgmtMilestone) => {
    const reviewId = `review-${milestone.id}`
    if (togglingIds.has(reviewId)) return

    setTogglingIds(prev => new Set(prev).add(reviewId))
    try {
      await fetch('/api/tensw-mgmt/milestones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: milestone.id, review_completed: !milestone.review_completed }),
      })
      await fetchMilestones()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(reviewId)
        return next
      })
    }
  }

  const deleteMilestone = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/tensw-mgmt/milestones?id=${id}`, { method: 'DELETE' })
    fetchMilestones()
  }

  // Client CRUD
  const openClientDialog = (client?: TenswMgmtClient) => {
    if (client) {
      setEditingClient(client)
      setClientForm({
        name: client.name,
        color: client.color,
      })
    } else {
      setEditingClient(null)
      setClientForm({
        name: '',
        color: '#6366f1',
      })
    }
    setClientDialogOpen(true)
  }

  const saveClient = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (editingClient) {
        await fetch('/api/tensw-mgmt/clients', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingClient.id, ...clientForm }),
        })
        // 수정 후 목록 화면으로 돌아가기
        setEditingClient(null)
        setClientForm({ name: '', color: '#6366f1' })
      } else {
        await fetch('/api/tensw-mgmt/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientForm),
        })
        // 추가 후 폼 초기화 (모달 유지)
        setClientForm({ name: '', color: '#6366f1' })
      }
      await fetchClients()
    } finally {
      setSaving(false)
    }
  }

  const deleteClient = async (id: string) => {
    if (!confirm('클라이언트을 삭제하면 연결된 모든 프로젝트와 마일스톤도 삭제됩니다. 삭제하시겠습니까?')) return
    await fetch(`/api/tensw-mgmt/clients?id=${id}`, { method: 'DELETE' })
    // 편집 모드에서 삭제한 경우에만 다이얼로그 닫기
    if (editingClient?.id === id) {
      setClientDialogOpen(false)
    }
    fetchClients()
    fetchProjects()
    fetchMilestones()
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
      await fetch(`/api/tensw-mgmt/memos?date=${editingMemoDate}`, { method: 'DELETE' })
    } else {
      await fetch('/api/tensw-mgmt/memos', {
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

  // Filtered data (sorted by client name, then project name)
  const filteredProjects = (selectedClient
    ? projects.filter((t) => t.client_id === selectedClient)
    : projects
  ).sort((a, b) => {
    // Sort by client name first
    const clientA = a.client?.name || ''
    const clientB = b.client?.name || ''
    const clientCompare = clientA.localeCompare(clientB, 'ko')
    if (clientCompare !== 0) return clientCompare
    // Then by project name
    return a.name.localeCompare(b.name, 'ko')
  })

  const getMilestonesForProject = (projectId: string) =>
    milestones
      .filter((c) => c.project_id === projectId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  if (loading) {
    return <TenswManagementPageSkeleton />
  }

  return (
    <ProtectedPage pagePath="/tensoftworks/management">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects & Milestones Panel */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BookMarked className="h-4 w-4" />
                  클라이언트 및 프로젝트
                </CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openClientDialog()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    클라이언트 추가
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openProjectDialog()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    프로젝트 추가
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Client filter */}
              <div className="flex flex-wrap gap-1 items-center">
                <Badge
                  variant="outline"
                  className={cn(
                    'cursor-pointer',
                    selectedClient === null && 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:border-white dark:hover:bg-slate-100'
                  )}
                  onClick={() => setSelectedClient(null)}
                >
                  전체
                </Badge>
                {clients.map((client) => (
                  <Badge
                    key={client.id}
                    variant={selectedClient === client.id ? 'default' : 'outline'}
                    className="cursor-pointer"
                    style={{
                      backgroundColor:
                        selectedClient === client.id ? client.color : undefined,
                      borderColor: client.color,
                    }}
                    onClick={() => setSelectedClient(client.id)}
                  >
                    {client.name}
                  </Badge>
                ))}
              </div>

              {/* Projects list */}
              <div className="space-y-2">
                {filteredProjects.map((project) => {
                  const projectMilestones = getMilestonesForProject(project.id)
                  const completed = projectMilestones.filter((c) => c.status === 'completed').length
                  const total = projectMilestones.length
                  const isExpanded = expandedProjects.includes(project.id)

                  return (
                    <div
                      key={project.id}
                      className="rounded-lg overflow-hidden"
                      style={{ borderLeft: `3px solid ${project.client?.color || '#888'}` }}
                    >
                      {/* Project header */}
                      <div
                        className="p-2 cursor-pointer flex items-center justify-between transition-opacity hover:opacity-80"
                        style={{ backgroundColor: `${project.client?.color || '#888'}15` }}
                        onClick={() => toggleProject(project.id)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform flex-shrink-0',
                              !isExpanded && '-rotate-90'
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            {project.client && (
                              <div className="text-xs text-muted-foreground">{project.client.name}</div>
                            )}
                            <div className="flex items-baseline gap-2">
                              <span className="font-medium text-sm truncate">{project.name}</span>
                              {project.status !== 'active' && (
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
                                  project.status === 'completed' && 'bg-green-100 text-green-700',
                                  project.status === 'on_hold' && 'bg-yellow-100 text-yellow-700',
                                  project.status === 'cancelled' && 'bg-red-100 text-red-700'
                                )}>
                                  {project.status === 'completed' ? '완료' : project.status === 'on_hold' ? '보류' : '취소'}
                                </span>
                              )}
                            </div>
                            {project.description && (
                              <div className="text-xs text-muted-foreground truncate">{project.description}</div>
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
                              openProjectDialog(project)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Review notes pending milestones - always visible even when collapsed */}
                      {!isExpanded && (() => {
                        const reviewNotesPendingMilestones = projectMilestones.filter(c => c.status === 'review_pending')
                        if (reviewNotesPendingMilestones.length === 0) return null
                        return (
                          <div className="px-2 pb-2 space-y-1 bg-background border-t border-border/50">
                            {reviewNotesPendingMilestones.map((milestone) => (
                              <div
                                key={milestone.id}
                                className="flex items-center gap-2 p-1.5 rounded text-sm"
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleMilestoneStatus(milestone)
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/30 hover:opacity-80 transition-opacity"
                                  title={milestone.review_completed ? '클릭해서 완료로 변경' : '리뷰노트 완료 후 클릭해서 완료로 변경'}
                                  disabled={togglingIds.has(`milestone-${milestone.id}`)}
                                >
                                  {togglingIds.has(`milestone-${milestone.id}`) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : (
                                    <StickyNote className="h-3.5 w-3.5 text-purple-600" />
                                  )}
                                  <span className="text-purple-600">리뷰노트</span>
                                </button>
                                <span className="flex-1 truncate">{milestone.name}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleReviewCompleted(milestone)
                                  }}
                                  className={cn(
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-opacity',
                                    milestone.review_completed
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                                  )}
                                  title={milestone.review_completed ? '리뷰노트 완료됨' : '리뷰노트 미완료'}
                                  disabled={togglingIds.has(`review-${milestone.id}`)}
                                >
                                  {togglingIds.has(`review-${milestone.id}`) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : milestone.review_completed ? (
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

                      {/* Milestones */}
                      {isExpanded && (
                        <div className="p-2 space-y-1 bg-background">
                          {projectMilestones.map((milestone) => {
                            const hasSchedules = milestonesWithSchedules.has(milestone.id)
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
                              review_pending: {
                                label: '리뷰노트',
                                tooltip: milestone.review_completed
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
                            const config = statusConfig[milestone.status]

                            return (
                              <div
                                key={milestone.id}
                                className={cn(
                                  'flex items-center gap-2 p-1.5 rounded text-sm',
                                  milestone.status === 'completed' && 'bg-muted/50'
                                )}
                              >
                                <button
                                  onClick={() => toggleMilestoneStatus(milestone)}
                                  className={cn(
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                                    config.bgColor,
                                    'hover:opacity-80 transition-opacity'
                                  )}
                                  title={config.tooltip}
                                  disabled={togglingIds.has(`milestone-${milestone.id}`)}
                                >
                                  {togglingIds.has(`milestone-${milestone.id}`) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                  ) : milestone.status === 'completed' ? (
                                    <CheckCircle2 className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : milestone.status === 'review_pending' ? (
                                    <StickyNote className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : milestone.status === 'in_progress' ? (
                                    <Clock className={cn('h-3.5 w-3.5', config.color)} />
                                  ) : (
                                    <Circle className={cn('h-3.5 w-3.5', config.color)} />
                                  )}
                                  <span className={config.color}>{config.label}</span>
                                </button>
                                <span
                                  className={cn(
                                    'flex-1 truncate flex items-center gap-1',
                                    milestone.status === 'completed' &&
                                      'line-through text-muted-foreground'
                                  )}
                                >
                                  {milestone.name}
                                  {milestone.target_date && milestone.status !== 'completed' && (() => {
                                    const today = new Date()
                                    today.setHours(0, 0, 0, 0)
                                    const target = new Date(milestone.target_date)
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
                                      <span className={cn('text-xs flex-shrink-0', colorClass)} title={`목표: ${milestone.target_date}`}>
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
                                  onClick={() => toggleReviewCompleted(milestone)}
                                  className={cn(
                                    'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs',
                                    milestone.review_completed
                                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                  )}
                                  title={milestone.review_completed ? '리뷰노트 완료' : '리뷰노트 미완료'}
                                  disabled={togglingIds.has(`review-${milestone.id}`)}
                                >
                                  {togglingIds.has(`review-${milestone.id}`) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <span className="relative flex items-center gap-0.5">
                                      <BookOpen className="h-3 w-3" />
                                      <span className="hidden sm:inline">리뷰노트</span>
                                      {milestone.review_completed && (
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
                                  onClick={() => openMilestoneDialog(project.id, milestone)}
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
                            onClick={() => openMilestoneDialog(project.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            마일스톤 추가
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredProjects.length === 0 && (
                  <div className="text-center text-muted-foreground py-4 text-sm">
                    프로젝트가 없습니다
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
                {clients.map((client) => {
                  const clientProjects = projects.filter((t) => t.client_id === client.id)
                  const clientMilestones = milestones.filter((c) =>
                    clientProjects.some((t) => t.id === c.project_id)
                  )
                  const completed = clientMilestones.filter((c) => c.status === 'completed').length
                  const total = clientMilestones.length
                  const actualPercent = total > 0 ? Math.round((completed / total) * 100) : 0

                  // Calculate target progress (milestones that should be done by today based on target_date)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const shouldBeCompleted = clientMilestones.filter((c) => {
                    if (!c.target_date) return false
                    const target = new Date(c.target_date)
                    target.setHours(0, 0, 0, 0)
                    return target <= today
                  }).length
                  const targetPercent = total > 0 ? Math.round((shouldBeCompleted / total) * 100) : 0
                  const diff = actualPercent - targetPercent

                  return (
                    <div key={client.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{client.name}</span>
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
                              style={{ width: `${targetPercent}%`, backgroundColor: client.color }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{targetPercent}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-8">실제</span>
                          <div className="flex-1 h-1.5 bg-white dark:bg-slate-900 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${actualPercent}%`, backgroundColor: client.color }}
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
                  일정
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
                  <>
                    {/* Key Study Plan Section */}
                    {(() => {
                      const { overdueMilestones, upcomingMilestones } = getKeyStudyPlanMilestones()
                      if (overdueMilestones.length === 0 && upcomingMilestones.length === 0) return null

                      // Group milestones by project
                      const groupByProject = (milestoneList: TenswMgmtMilestone[]) => {
                        const grouped: Map<string, { project: TenswMgmtProject | undefined; milestones: TenswMgmtMilestone[] }> = new Map()
                        for (const milestone of milestoneList) {
                          const project = projects.find(t => t.id === milestone.project_id)
                          const existing = grouped.get(milestone.project_id)
                          if (existing) {
                            existing.milestones.push(milestone)
                          } else {
                            grouped.set(milestone.project_id, { project, milestones: [milestone] })
                          }
                        }
                        return Array.from(grouped.values())
                      }

                      const overdueByProject = groupByProject(overdueMilestones)
                      const upcomingByProject = groupByProject(upcomingMilestones)

                      return (
                        <div className="mb-3 p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                          <button
                            className="flex items-center justify-between w-full"
                            onClick={() => {
                              const newValue = !studyPlanExpanded
                              setStudyPlanExpanded(newValue)
                              localStorage.setItem('tensw-mgmt-study-plan-expanded', String(newValue))
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">오늘 기준 주요 프로젝트 일정</span>
                              <span className="text-xs text-blue-600 dark:text-blue-400">
                                ({overdueMilestones.length + upcomingMilestones.length})
                              </span>
                            </div>
                            <ChevronDown className={cn(
                              'h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform',
                              !studyPlanExpanded && '-rotate-90'
                            )} />
                          </button>
                          {studyPlanExpanded && (
                          <div className="space-y-2 mt-3">
                            {/* Overdue milestones grouped by project */}
                            {overdueByProject.map(({ project, milestones: tbMilestones }) => {
                              const client = clients.find(s => s.id === project?.client_id)
                              return (
                              <div key={`overdue-${project?.id}`} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
                                  {client?.name || '알 수 없음'} &gt; {project?.name || '알 수 없음'}
                                </span>
                                {tbMilestones.map((milestone) => {
                                  const daysOverdue = Math.floor((new Date().getTime() - new Date(milestone.target_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
                                  return (
                                    <div
                                      key={milestone.id}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 text-xs cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                                      onClick={() => openMilestoneDialog(milestone.project_id, milestone)}
                                    >
                                      <span className="text-red-600 dark:text-red-400">{milestone.name}</span>
                                      <span className="text-red-500 dark:text-red-400 text-[10px] font-medium">D+{daysOverdue}</span>
                                    </div>
                                  )
                                })}
                              </div>
                              )
                            })}
                            {/* Upcoming milestones grouped by project */}
                            {upcomingByProject.map(({ project, milestones: tbMilestones }) => {
                              const client = clients.find(s => s.id === project?.client_id)
                              return (
                              <div key={`upcoming-${project?.id}`} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
                                  {client?.name || '알 수 없음'} &gt; {project?.name || '알 수 없음'}
                                </span>
                                {tbMilestones.map((milestone) => {
                                  const daysUntil = Math.ceil((new Date(milestone.target_date + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24))
                                  return (
                                    <div
                                      key={milestone.id}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-xs cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                                      onClick={() => openMilestoneDialog(milestone.project_id, milestone)}
                                    >
                                      <span className="text-blue-600 dark:text-blue-400">{milestone.name}</span>
                                      <span className={cn(
                                        'text-[10px] font-medium',
                                        daysUntil === 0 ? 'text-orange-600 dark:text-orange-400' : 'text-blue-500 dark:text-blue-400'
                                      )}>
                                        {daysUntil === 0 ? 'D-Day' : `D-${daysUntil}`}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                              )
                            })}
                          </div>
                          )}
                        </div>
                      )
                    })()}
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
                          {/* Task deadline items - displayed first */}
                          {getTaskForDate(day).map((hw, hwIdx) => {
                            const isCompleted = hw.isLegacy ? hw.schedule.task_completed : hw.item?.is_completed
                            const toggleId = hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}`
                            const content = hw.isLegacy ? hw.schedule.task_content : hw.item?.content
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
                                          toggleTaskComplete(hw.schedule)
                                        } else if (hw.item) {
                                          toggleTaskItemComplete(hw.item)
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
                                      <span className="font-medium">태스크</span>
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
                          {/* Task type schedules - displayed with orange style */}
                          {getTaskTypeSchedulesForDate(day).map((schedule) => (
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
                                    <span className="font-medium">태스크</span>
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
                  </>
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
                                  {/* Task deadline items - displayed first */}
                                  {getTaskForDate(day).map((hw, hwIdx) => {
                                    const isCompleted = hw.isLegacy ? hw.schedule.task_completed : hw.item?.is_completed
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
                                                toggleTaskComplete(hw.schedule)
                                              } else if (hw.item) {
                                                toggleTaskItemComplete(hw.item)
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
                                  {/* Task type schedules - month view */}
                                  {getTaskTypeSchedulesForDate(day).map((schedule) => (
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
                    const displayColor = activeSchedule.client?.color || activeSchedule.color
                    const clientColor = activeSchedule.client?.color
                    return (
                      <div
                        className={cn(
                          'text-xs p-1.5 rounded shadow-lg',
                          activeSchedule.is_completed
                            ? 'bg-muted line-through text-muted-foreground'
                            : !displayColor && 'bg-slate-300/50 dark:bg-slate-600/50'
                        )}
                        style={{
                          borderLeft: clientColor
                            ? `3px solid ${clientColor}`
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
                id="is_task_type"
                checked={scheduleForm.type === 'task'}
                onCheckedChange={(checked) => {
                  setScheduleForm({
                    ...scheduleForm,
                    type: checked ? 'task' : 'meeting',
                  })
                }}
              />
              <Label htmlFor="is_task_type" className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-orange-600" />
                태스크 일정
              </Label>
              <span className="text-xs text-muted-foreground">(태스크처럼 표시됨)</span>
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
                <div className="flex gap-1">
                  <Select
                    value={scheduleForm.start_time ? scheduleForm.start_time.split(':')[0] : undefined}
                    onValueChange={(hour) => {
                      const currentMinute = scheduleForm.start_time ? scheduleForm.start_time.split(':')[1] : '00'
                      setScheduleForm({ ...scheduleForm, start_time: `${hour}:${currentMinute}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue placeholder="시" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((hour) => (
                        <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={scheduleForm.start_time ? scheduleForm.start_time.split(':')[1] : undefined}
                    onValueChange={(minute) => {
                      const currentHour = scheduleForm.start_time ? scheduleForm.start_time.split(':')[0] : '09'
                      setScheduleForm({ ...scheduleForm, start_time: `${currentHour}:${minute}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue placeholder="분" />
                    </SelectTrigger>
                    <SelectContent>
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((minute) => (
                        <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scheduleForm.start_time && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => setScheduleForm({ ...scheduleForm, start_time: '' })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>종료 시간</Label>
                <div className="flex gap-1">
                  <Select
                    value={scheduleForm.end_time ? scheduleForm.end_time.split(':')[0] : undefined}
                    onValueChange={(hour) => {
                      const currentMinute = scheduleForm.end_time ? scheduleForm.end_time.split(':')[1] : '00'
                      setScheduleForm({ ...scheduleForm, end_time: `${hour}:${currentMinute}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue placeholder="시" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((hour) => (
                        <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select
                    value={scheduleForm.end_time ? scheduleForm.end_time.split(':')[1] : undefined}
                    onValueChange={(minute) => {
                      const currentHour = scheduleForm.end_time ? scheduleForm.end_time.split(':')[0] : '10'
                      setScheduleForm({ ...scheduleForm, end_time: `${currentHour}:${minute}` })
                    }}
                  >
                    <SelectTrigger className="w-[70px]">
                      <SelectValue placeholder="분" />
                    </SelectTrigger>
                    <SelectContent>
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((minute) => (
                        <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scheduleForm.end_time && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => setScheduleForm({ ...scheduleForm, end_time: '' })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Multiple Milestone Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>클라이언트/프로젝트/마일스톤</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setScheduleForm({
                      ...scheduleForm,
                      selected_milestones: [
                        ...scheduleForm.selected_milestones,
                        { client_id: '', project_id: '', milestone_id: '' },
                      ],
                    })
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  추가
                </Button>
              </div>

              {/* Color picker - only when no milestones selected */}
              {scheduleForm.selected_milestones.length === 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">색상 (마일스톤 미선택 시)</Label>
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

              {/* Selected milestones list */}
              {scheduleForm.selected_milestones.map((selection, idx) => {
                const selectedMilestone = milestones.find(c => c.id === selection.milestone_id)
                const selectedProject = projects.find(t => t.id === selection.project_id)
                const selectedClient = clients.find(s => s.id === selection.client_id)

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
                            selected_milestones: scheduleForm.selected_milestones.filter((_, i) => i !== idx),
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Client */}
                      <Select
                        value={selection.client_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_milestones]
                          newSelections[idx] = { client_id: v, project_id: '', milestone_id: '' }
                          setScheduleForm({ ...scheduleForm, selected_milestones: newSelections })
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="클라이언트" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Project */}
                      <Select
                        value={selection.project_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_milestones]
                          newSelections[idx] = { ...newSelections[idx], project_id: v, milestone_id: '' }
                          setScheduleForm({ ...scheduleForm, selected_milestones: newSelections })
                        }}
                        disabled={!selection.client_id}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="프로젝트" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects
                            .filter((t) => t.client_id === selection.client_id)
                            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      {/* Milestone */}
                      <Select
                        value={selection.milestone_id}
                        onValueChange={(v) => {
                          const newSelections = [...scheduleForm.selected_milestones]
                          newSelections[idx] = { ...newSelections[idx], milestone_id: v }
                          setScheduleForm({ ...scheduleForm, selected_milestones: newSelections })
                        }}
                        disabled={!selection.project_id}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="마일스톤" />
                        </SelectTrigger>
                        <SelectContent>
                          {milestones
                            .filter((c) => c.project_id === selection.project_id)
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
                    {selectedMilestone && selectedProject && selectedClient && (
                      <div className="text-xs text-muted-foreground pt-1 border-t">
                        {selectedClient.name} → {selectedProject.name} → {selectedMilestone.name}
                      </div>
                    )}
                  </div>
                )
              })}

              {scheduleForm.selected_milestones.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  마일스톤를 추가하려면 위의 추가 버튼을 클릭하세요
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

            {/* Task section */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="has_task"
                    checked={scheduleForm.has_task}
                    onCheckedChange={(checked) => {
                      const hasTask = checked as boolean
                      setScheduleForm({
                        ...scheduleForm,
                        has_task: hasTask,
                        tasks: hasTask && scheduleForm.tasks.length === 0
                          ? [{ content: '', deadline: '' }]
                          : scheduleForm.tasks,
                      })
                    }}
                  />
                  <Label htmlFor="has_task" className="text-sm font-medium">
                    사전 태스크 있음
                  </Label>
                </div>
                {scheduleForm.has_task && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setScheduleForm({
                        ...scheduleForm,
                        tasks: [
                          ...scheduleForm.tasks,
                          { content: '', deadline: '' },
                        ],
                      })
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    태스크 추가
                  </Button>
                )}
              </div>
              {scheduleForm.has_task && scheduleForm.tasks.map((item, index) => (
                <div key={index} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">태스크 {index + 1}</span>
                    {scheduleForm.tasks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setScheduleForm({
                            ...scheduleForm,
                            tasks: scheduleForm.tasks.filter((_, i) => i !== index),
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
                      value={item.deadline || ''}
                      onChange={(e) => {
                        const newItems = [...scheduleForm.tasks]
                        newItems[index] = { ...item, deadline: e.target.value || null }
                        setScheduleForm({ ...scheduleForm, tasks: newItems })
                      }}
                      max={scheduleForm.schedule_date}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">태스크 내용</Label>
                    <Textarea
                      value={item.content}
                      onChange={(e) => {
                        const newItems = [...scheduleForm.tasks]
                        newItems[index] = { ...item, content: e.target.value }
                        setScheduleForm({ ...scheduleForm, tasks: newItems })
                      }}
                      placeholder="태스크 내용을 입력하세요"
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

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? '프로젝트 수정' : '프로젝트 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>클라이언트</Label>
              <Select
                value={projectForm.client_id}
                onValueChange={(v) => setProjectForm({ ...projectForm, client_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="클라이언트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>프로젝트명</Label>
              <Input
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                placeholder="예: 대시보드 개발"
              />
            </div>
            <div className="space-y-2">
              <Label>상태</Label>
              <Select
                value={projectForm.status}
                onValueChange={(value) => setProjectForm({ ...projectForm, status: value as 'active' | 'completed' | 'on_hold' | 'cancelled' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">진행중</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="on_hold">보류</SelectItem>
                  <SelectItem value="cancelled">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                placeholder="프로젝트에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            {editingProject && (
              <Button
                variant="destructive"
                onClick={() => {
                  deleteProject(editingProject.id)
                  setProjectDialogOpen(false)
                }}
              >
                삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={saveProject} disabled={!projectForm.name || !projectForm.client_id || saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMilestone ? '마일스톤 수정' : '마일스톤 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>마일스톤명</Label>
              <Input
                value={milestoneForm.name}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
                placeholder="예: 1장 다항식의 연산"
              />
            </div>
            <div className="space-y-2">
              <Label>목표 완료일</Label>
              <Input
                type="date"
                value={milestoneForm.target_date}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, target_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>설명</Label>
              <Textarea
                value={milestoneForm.description}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                placeholder="마일스톤에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {editingMilestone ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteMilestone(editingMilestone.id)
                    setMilestoneDialogOpen(false)
                  }}
                >
                  삭제
                </Button>
                {editingMilestone.status !== 'pending' && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await fetch('/api/tensw-mgmt/milestones', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            id: editingMilestone.id,
                            status: 'pending',
                            completed_at: null,
                            review_completed: false,
                          }),
                        })
                        await fetchMilestones()
                        setMilestoneDialogOpen(false)
                      } catch (error) {
                        console.error('Error resetting milestone status:', error)
                      }
                    }}
                  >
                    상태 초기화
                  </Button>
                )}
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMilestoneDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={saveMilestone} disabled={!milestoneForm.name || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingClient ? '클라이언트 수정' : '클라이언트 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Client list when adding */}
            {!editingClient && clients.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">등록된 클라이언트</Label>
                <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: client.color }}
                        />
                        <span className="text-sm">{client.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => openClientDialog(client)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteClient(client.id)}
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
              <Label>{editingClient ? '클라이언트명' : '새 클라이언트명'}</Label>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="예: 수학, 영어, 국어"
              />
            </div>
            <div className="space-y-2">
              <Label>색상</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={clientForm.color}
                  onChange={(e) => setClientForm({ ...clientForm, color: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border"
                />
                <div className="flex flex-wrap gap-1">
                  {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'].map((color) => (
                    <button
                      key={color}
                      className={cn(
                        'w-6 h-6 rounded-full border-2',
                        clientForm.color === color ? 'border-foreground' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setClientForm({ ...clientForm, color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            {editingClient && (
              <Button
                variant="destructive"
                onClick={() => deleteClient(editingClient.id)}
              >
                삭제
              </Button>
            )}
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>
              {editingClient ? '취소' : '닫기'}
            </Button>
            <Button onClick={saveClient} disabled={!clientForm.name || saving}>
              {saving ? '저장 중...' : editingClient ? '저장' : '추가'}
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
