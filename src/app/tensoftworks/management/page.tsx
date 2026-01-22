'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { gmailService, ParsedEmail, EmailSyncStatus, OverallAnalysisResult, SavedTodo, SavedAnalysis } from '@/lib/gmail'
// Simplified invoice type for tensoftworks management
interface TenswInvoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string
  status: 'issued' | 'completed'
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}
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
  ChevronUp,
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
  Receipt,
  Download,
  Send,
  Check,
  Ban,
  AlertCircle,
  FileText,
  Building,
  X,
  Mail,
  RefreshCw,
  Sparkles,
  Paperclip,
  Reply,
  ReplyAll,
  Forward,
  CheckCircle,
  List,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ListTodo,
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

  // i18n
  const { t, language } = useI18n()
  const locale = language === 'ko' ? 'ko-KR' : 'en-US'

  // Invoice states (simplified)
  const INVOICES_PER_PAGE = 5
  const [invoices, setInvoices] = useState<TenswInvoice[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [invoicePage, setInvoicePage] = useState(1)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<TenswInvoice | null>(null)
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<'all' | 'revenue' | 'expense' | 'asset' | 'liability'>('all')
  const [invoiceViewMode, setInvoiceViewMode] = useState<'list' | 'summary'>('list')
  const [invoiceSummaryPeriod, setInvoiceSummaryPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [expandedSummaryPeriod, setExpandedSummaryPeriod] = useState<string | null>(null)

  // Invoice form states (simplified)
  const [invoiceFormType, setInvoiceFormType] = useState<'revenue' | 'expense' | 'asset' | 'liability'>('revenue')
  const [invoiceFormCounterparty, setInvoiceFormCounterparty] = useState('')
  const [invoiceFormDescription, setInvoiceFormDescription] = useState('')
  const [invoiceFormAmount, setInvoiceFormAmount] = useState('')
  const [invoiceFormDate, setInvoiceFormDate] = useState(new Date().toISOString().split('T')[0])
  const [invoiceFormNotes, setInvoiceFormNotes] = useState('')
  const [invoiceFormAccountNumber, setInvoiceFormAccountNumber] = useState('')
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false)
  const [invoiceFormFiles, setInvoiceFormFiles] = useState<File[]>([])
  const [isUploadingInvoiceFiles, setIsUploadingInvoiceFiles] = useState(false)

  // Invoice status styles
  const INVOICE_STATUS_STYLES = {
    issued: { bg: 'bg-amber-100', text: 'text-amber-700', label: '발행됨' },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '완료' },
  }

  // Wiki states
  interface WikiAttachment {
    name: string
    url: string
    size: number
    type: string
  }
  interface WikiNote {
    id: string
    user_id: string
    section: string
    title: string
    content: string
    category: string | null
    is_pinned: boolean
    attachments: WikiAttachment[] | null
    created_at: string
    updated_at: string
  }
  const WIKI_PER_PAGE = 5
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [isLoadingWiki, setIsLoadingWiki] = useState(true)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNote, setEditingNote] = useState<WikiNote | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteFiles, setNewNoteFiles] = useState<File[]>([])
  const [isDraggingWiki, setIsDraggingWiki] = useState(false)
  const [isUploadingWiki, setIsUploadingWiki] = useState(false)
  const [wikiSearch, setWikiSearch] = useState('')
  const [wikiPage, setWikiPage] = useState(1)

  // Gmail states
  const [emails, setEmails] = useState<ParsedEmail[]>([])
  const [selectedEmail, setSelectedEmail] = useState<ParsedEmail | null>(null)
  const [syncStatus, setSyncStatus] = useState<EmailSyncStatus>({
    lastSyncAt: null,
    totalEmails: 0,
    newEmailsCount: 0,
    isConnected: false,
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [showGmailSettings, setShowGmailSettings] = useState(false)
  const [gmailLabel, setGmailLabel] = useState('TENSW')
  const [labelInput, setLabelInput] = useState('TENSW')
  const [isConnecting, setIsConnecting] = useState(false)

  // Email compose states
  interface ComposeEmailData {
    to: string
    cc: string
    bcc: string
    subject: string
    body: string
  }
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'replyAll' | 'forward'>('new')
  const [composeOriginalEmail, setComposeOriginalEmail] = useState<ParsedEmail | null>(null)
  const [composeInitialData, setComposeInitialData] = useState<Partial<ComposeEmailData> | undefined>(undefined)
  const [composeInitialAttachments, setComposeInitialAttachments] = useState<File[] | undefined>(undefined)
  const [pendingInvoiceSend, setPendingInvoiceSend] = useState<{ invoiceId: string; recipientType: 'etc' | 'bank' } | null>(null)

  // AI analysis states
  const [aiAnalysis, setAiAnalysis] = useState<OverallAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAiAnalysis, setShowAiAnalysis] = useState(false)
  const [savedTodos, setSavedTodos] = useState<SavedTodo[]>([])
  const [togglingTodoIdsEmail, setTogglingTodoIdsEmail] = useState<Set<string>>(new Set())
  const [savedAnalysis, setSavedAnalysis] = useState<SavedAnalysis | null>(null)
  const [categorySlideIndex, setCategorySlideIndex] = useState(0)
  const [isDraggingCarousel, setIsDraggingCarousel] = useState(false)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)

  // AI context settings
  const [aiContextText, setAiContextText] = useState('')
  const [aiContextEnabled, setAiContextEnabled] = useState(true)
  const [isSavingAiContext, setIsSavingAiContext] = useState(false)
  const [showAiContextSettings, setShowAiContextSettings] = useState(false)

  // Email filtering/pagination
  const [emailFilter, setEmailFilter] = useState<string>('all')
  const [emailSearch, setEmailSearch] = useState('')
  const [emailPage, setEmailPage] = useState(1)
  const [emailsPerPage, setEmailsPerPage] = useState(5)
  const [relatedEmailIds, setRelatedEmailIds] = useState<string[]>([])

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

  // ====== Invoice Functions (Simplified) ======
  const loadInvoices = useCallback(async () => {
    setIsLoadingInvoices(true)
    try {
      const params = new URLSearchParams()
      if (invoiceTypeFilter !== 'all') {
        params.set('type', invoiceTypeFilter)
      }
      const res = await fetch(`/api/tensw-mgmt/invoices?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
      }
    } catch (error) {
      console.error('Failed to load invoices:', error)
    } finally {
      setIsLoadingInvoices(false)
    }
  }, [invoiceTypeFilter])

  const resetInvoiceForm = () => {
    setInvoiceFormType('revenue')
    setInvoiceFormCounterparty('')
    setInvoiceFormDescription('')
    setInvoiceFormAmount('')
    setInvoiceFormDate(new Date().toISOString().split('T')[0])
    setInvoiceFormNotes('')
    setInvoiceFormAccountNumber('')
    setInvoiceFormFiles([])
    setEditingInvoice(null)
  }

  const openNewInvoiceModal = () => {
    resetInvoiceForm()
    setIsInvoiceModalOpen(true)
  }

  const openEditInvoiceModal = (invoice: TenswInvoice) => {
    setEditingInvoice(invoice)
    setInvoiceFormType(invoice.type)
    setInvoiceFormCounterparty(invoice.counterparty)
    setInvoiceFormDescription(invoice.description || '')
    setInvoiceFormAmount(String(invoice.amount))
    setInvoiceFormDate(invoice.issue_date)
    setInvoiceFormNotes(invoice.notes || '')
    setInvoiceFormAccountNumber(invoice.account_number || '')
    setInvoiceFormFiles([])
    setIsInvoiceModalOpen(true)
  }

  const formatKRW = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
  }

  const handleSaveInvoice = async () => {
    if (!invoiceFormCounterparty.trim()) {
      alert('거래처를 입력해주세요.')
      return
    }
    if (!invoiceFormDate) {
      alert('발행일을 입력해주세요.')
      return
    }
    const amount = parseInt(invoiceFormAmount.replace(/,/g, ''), 10)
    if (isNaN(amount) || amount <= 0) {
      alert('금액을 올바르게 입력해주세요.')
      return
    }

    setIsSavingInvoice(true)
    try {
      // Upload files first if any
      let attachments: Array<{ name: string; url: string; size: number; type: string }> = editingInvoice?.attachments || []

      if (invoiceFormFiles.length > 0) {
        setIsUploadingInvoiceFiles(true)
        const formData = new FormData()
        invoiceFormFiles.forEach(file => formData.append('files', file))
        formData.append('folder', 'invoices')

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          const newAttachments = uploadData.files.map((f: { name: string; url: string; size: number; type: string }) => ({
            name: f.name,
            url: f.url,
            size: f.size,
            type: f.type,
          }))
          attachments = [...attachments, ...newAttachments]
        } else {
          alert('파일 업로드에 실패했습니다.')
          setIsUploadingInvoiceFiles(false)
          setIsSavingInvoice(false)
          return
        }
        setIsUploadingInvoiceFiles(false)
      }

      const payload = {
        id: editingInvoice?.id,
        type: invoiceFormType,
        counterparty: invoiceFormCounterparty.trim(),
        description: invoiceFormDescription.trim() || null,
        amount,
        issue_date: invoiceFormDate,
        status: editingInvoice?.status || 'issued',
        attachments,
        notes: invoiceFormNotes.trim() || null,
        account_number: invoiceFormAccountNumber.trim() || null,
      }

      const res = await fetch('/api/tensw-mgmt/invoices', {
        method: editingInvoice ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsInvoiceModalOpen(false)
        resetInvoiceForm()
        await loadInvoices()
      } else {
        alert('저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to save invoice:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setIsSavingInvoice(false)
    }
  }

  const handleToggleInvoiceStatus = async (invoice: TenswInvoice) => {
    const newStatus = invoice.status === 'issued' ? 'completed' : 'issued'
    try {
      const res = await fetch('/api/tensw-mgmt/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, status: newStatus }),
      })
      if (res.ok) {
        await loadInvoices()
      }
    } catch (error) {
      console.error('Failed to update invoice status:', error)
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/tensw-mgmt/invoices?id=${invoiceId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadInvoices()
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error)
    }
  }

  const handleRemoveInvoiceAttachment = (index: number) => {
    if (!editingInvoice) return
    const newAttachments = [...editingInvoice.attachments]
    newAttachments.splice(index, 1)
    setEditingInvoice({ ...editingInvoice, attachments: newAttachments })
  }

  // ====== Wiki Functions ======
  const loadWikiNotes = useCallback(async () => {
    setIsLoadingWiki(true)
    try {
      const res = await fetch('/api/wiki?section=tensw-mgmt')
      if (res.ok) {
        const data = await res.json()
        setWikiNotes(data)
      }
    } catch (error) {
      console.error('Failed to load wiki notes:', error)
    } finally {
      setIsLoadingWiki(false)
    }
  }, [])

  const handleAddNote = async () => {
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return

    try {
      setIsUploadingWiki(true)
      let attachments: WikiAttachment[] | null = null

      if (newNoteFiles.length > 0) {
        const formData = new FormData()
        newNoteFiles.forEach(file => formData.append('files', file))

        const uploadRes = await fetch('/api/wiki/upload', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          attachments = uploadData.files
        }
      }

      const res = await fetch('/api/wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'tensw-mgmt',
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
          attachments,
        }),
      })
      if (res.ok) {
        setNewNoteTitle('')
        setNewNoteContent('')
        setNewNoteFiles([])
        setIsAddingNote(false)
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to add wiki note:', error)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleUpdateNote = async () => {
    if (!editingNote || !newNoteTitle.trim() || !newNoteContent.trim()) return

    try {
      setIsUploadingWiki(true)
      let attachments = editingNote.attachments

      if (newNoteFiles.length > 0) {
        const formData = new FormData()
        newNoteFiles.forEach(file => formData.append('files', file))

        const uploadRes = await fetch('/api/wiki/upload', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          attachments = [...(attachments || []), ...uploadData.files]
        }
      }

      const res = await fetch(`/api/wiki/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
          attachments,
        }),
      })
      if (res.ok) {
        setNewNoteTitle('')
        setNewNoteContent('')
        setNewNoteFiles([])
        setEditingNote(null)
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to update wiki note:', error)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm(t.wiki.deleteConfirm)) return

    try {
      const res = await fetch(`/api/wiki/${noteId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to delete wiki note:', error)
    }
  }

  const startEditNote = (note: WikiNote) => {
    setEditingNote(note)
    setNewNoteTitle(note.title)
    setNewNoteContent(note.content)
    setNewNoteFiles([])
    setIsAddingNote(false)
  }

  const handleWikiFilesDrop = (files: FileList) => {
    setNewNoteFiles(prev => [...prev, ...Array.from(files)])
  }

  const filteredWikiNotes = wikiNotes.filter(note => {
    if (!wikiSearch) return true
    const search = wikiSearch.toLowerCase()
    return note.title.toLowerCase().includes(search) || note.content.toLowerCase().includes(search)
  })

  const totalWikiPages = Math.ceil(filteredWikiNotes.length / WIKI_PER_PAGE)
  const paginatedWikiNotes = filteredWikiNotes.slice(
    (wikiPage - 1) * WIKI_PER_PAGE,
    wikiPage * WIKI_PER_PAGE
  )

  // ====== Gmail Functions ======
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (minutes < 1) return t.time.justNow
    if (minutes < 60) return t.time.minutesAgo.replace('{minutes}', String(minutes))
    if (hours < 24) return t.time.hoursAgo.replace('{hours}', String(hours))
    return t.time.daysAgo.replace('{days}', String(days))
  }

  const checkGmailStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/gmail/status?context=tensoftworks`)
      if (res.ok) {
        const data = await res.json()
        setSyncStatus({
          isConnected: data.isConnected,
          lastSyncAt: data.lastSyncAt,
          totalEmails: data.totalEmails || 0,
          newEmailsCount: data.newEmailsCount || 0,
        })
      }
    } catch (error) {
      console.error('Failed to check Gmail status:', error)
    }
  }, [])

  const syncEmails = useCallback(async () => {
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/gmail/emails?context=tensoftworks&label=${gmailLabel}`)
      if (res.ok) {
        const data = await res.json()
        setEmails(data.emails || [])
        await checkGmailStatus()
      }
    } catch (error) {
      console.error('Failed to sync emails:', error)
    } finally {
      setIsSyncing(false)
    }
  }, [gmailLabel, checkGmailStatus])

  const handleGmailConnect = async () => {
    setIsConnecting(true)
    try {
      const res = await fetch(`/api/gmail/auth?context=tensoftworks`)
      if (res.ok) {
        const data = await res.json()
        if (data.authUrl) {
          window.location.href = data.authUrl
        }
      }
    } catch (error) {
      console.error('Failed to get auth URL:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleGmailDisconnect = async () => {
    if (!confirm(t.gmail.disconnectConfirm)) return

    try {
      await fetch(`/api/gmail/disconnect?context=tensoftworks`, { method: 'POST' })
      setSyncStatus({ lastSyncAt: null, totalEmails: 0, newEmailsCount: 0, isConnected: false })
      setEmails([])
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error)
    }
  }

  const handleLabelSave = () => {
    setGmailLabel(labelInput)
    localStorage.setItem('tensw-mgmt-gmail-label', labelInput)
  }

  const handleSaveAiContext = async () => {
    setIsSavingAiContext(true)
    try {
      await fetch('/api/gmail/context-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: gmailLabel,
          context_text: aiContextText,
          enabled: aiContextEnabled,
        }),
      })
    } catch (error) {
      console.error('Failed to save AI context:', error)
    } finally {
      setIsSavingAiContext(false)
    }
  }

  const loadAiContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/gmail/context-settings?section=${gmailLabel}`)
      if (res.ok) {
        const data = await res.json()
        setAiContextText(data.context_text || '')
        setAiContextEnabled(data.enabled ?? true)
      }
    } catch (error) {
      console.error('Failed to load AI context:', error)
    }
  }, [gmailLabel])

  // 저장된 AI 분석 결과 불러오기
  const loadSavedAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/gmail/analysis?label=${gmailLabel}`)
      if (res.ok) {
        const data = await res.json()
        if (data.analysis?.analysis_data) {
          setAiAnalysis(data.analysis.analysis_data)
          setSavedAnalysis(data.analysis)
          setShowAiAnalysis(true)
        }
        if (data.todos) {
          setSavedTodos(data.todos)
        }
      }
    } catch (error) {
      console.error('Failed to load saved analysis:', error)
    }
  }, [gmailLabel])

  const handleAnalyzeEmails = async () => {
    setIsAnalyzing(true)
    try {
      // 1. Gemini로 분석
      const analyzeRes = await fetch('/api/gmail/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: gmailLabel,
          daysBack: 30,
        }),
      })
      if (analyzeRes.ok) {
        const analysisResult = await analyzeRes.json()
        setAiAnalysis(analysisResult)
        setCategorySlideIndex(0)
        setShowAiAnalysis(true)

        // 2. 분석 결과 저장 (DB에 analysis + todos 저장)
        const saveRes = await fetch('/api/gmail/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: gmailLabel,
            analysisData: analysisResult,
          }),
        })
        if (saveRes.ok) {
          const savedResult = await saveRes.json()
          setSavedAnalysis(savedResult.analysis)
          setSavedTodos(savedResult.todos || [])
        }
      }
    } catch (error) {
      console.error('Failed to analyze emails:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const loadSavedTodos = useCallback(async () => {
    try {
      const res = await fetch(`/api/gmail/todos?section=${gmailLabel}`)
      if (res.ok) {
        const data = await res.json()
        setSavedTodos(data.todos || [])
      }
    } catch (error) {
      console.error('Failed to load saved todos:', error)
    }
  }, [gmailLabel])

  const handleEmailTodoToggle = async (todoId: string, completed: boolean) => {
    setTogglingTodoIdsEmail(prev => new Set(prev).add(todoId))
    try {
      await fetch(`/api/gmail/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      await loadSavedTodos()
    } catch (error) {
      console.error('Failed to toggle todo:', error)
    } finally {
      setTogglingTodoIdsEmail(prev => {
        const next = new Set(prev)
        next.delete(todoId)
        return next
      })
    }
  }

  const clearRelatedFilter = () => {
    setRelatedEmailIds([])
  }

  const availableCategories = Array.from(new Set(emails.map(e => e.category).filter(Boolean))) as string[]

  const getCategoryColor = (category: string, categories: string[]) => {
    const colors = [
      { bg: 'bg-blue-100', text: 'text-blue-700', button: 'bg-blue-600' },
      { bg: 'bg-green-100', text: 'text-green-700', button: 'bg-green-600' },
      { bg: 'bg-purple-100', text: 'text-purple-700', button: 'bg-purple-600' },
      { bg: 'bg-orange-100', text: 'text-orange-700', button: 'bg-orange-600' },
      { bg: 'bg-pink-100', text: 'text-pink-700', button: 'bg-pink-600' },
    ]
    const index = categories.indexOf(category)
    if (index === -1) return colors[0]
    return colors[index % colors.length]
  }

  // 우선순위 색상
  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-amber-100 text-amber-700'
      case 'low': return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
    }
  }

  const getPriorityLabel = (priority: 'high' | 'medium' | 'low') => {
    return t.gmail.priority[priority]
  }

  // 관련 이메일 보기
  const showRelatedEmails = (emailIds: string[]) => {
    setRelatedEmailIds(emailIds)
    setEmailFilter('all')
    setEmailSearch('')
    setEmailPage(1)
  }

  const filteredEmails = emails.filter(email => {
    if (relatedEmailIds.length > 0 && !relatedEmailIds.includes(email.id)) return false
    if (emailFilter !== 'all' && email.category !== emailFilter) return false
    if (emailSearch) {
      const search = emailSearch.toLowerCase()
      return (
        email.subject?.toLowerCase().includes(search) ||
        email.from?.toLowerCase().includes(search) ||
        email.to?.toLowerCase().includes(search) ||
        email.body?.toLowerCase().includes(search)
      )
    }
    return true
  })

  const paginatedEmails = filteredEmails.slice(
    (emailPage - 1) * emailsPerPage,
    emailPage * emailsPerPage
  )

  const formatEmailDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Load Invoice, Wiki, and Gmail data
  useEffect(() => {
    loadInvoices()
    loadWikiNotes()
  }, [loadInvoices, loadWikiNotes])

  useEffect(() => {
    const savedLabel = localStorage.getItem('tensw-mgmt-gmail-label')
    if (savedLabel) {
      setGmailLabel(savedLabel)
      setLabelInput(savedLabel)
    }
  }, [])

  useEffect(() => {
    checkGmailStatus()
    loadSavedTodos()
    loadAiContext()
  }, [checkGmailStatus, loadSavedTodos, loadAiContext])

  // 저장된 AI 분석 결과 로드 (별도 useEffect)
  useEffect(() => {
    loadSavedAnalysis()
  }, [loadSavedAnalysis])

  useEffect(() => {
    if (syncStatus.isConnected && emails.length === 0) {
      syncEmails()
    }
  }, [syncStatus.isConnected])

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
        {/* Projects & Milestones Panel + Invoice + Wiki */}
        <div className="lg:col-span-1 order-2 lg:order-1 space-y-4">
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookMarked className="h-5 w-5" />
                  클라이언트 및 프로젝트
                </CardTitle>
                <CardDescription>프로젝트 및 마일스톤 관리</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                  onClick={() => openClientDialog()}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">클라이언트 추가</span>
                </button>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                  onClick={() => openProjectDialog()}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">프로젝트 추가</span>
                </button>
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

          {/* Invoice Section (Simplified Tax Invoice Tracking) */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  재무관리
                </CardTitle>
                <CardDescription>현금흐름 관리</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInvoiceViewMode('list')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      invoiceViewMode === 'list'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    목록
                  </button>
                  <button
                    onClick={() => setInvoiceViewMode('summary')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      invoiceViewMode === 'summary'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    표
                  </button>
                </div>
                <button
                  onClick={openNewInvoiceModal}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">추가</span>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {invoiceViewMode === 'list' ? (
                <>
                  {/* Type filter tabs */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(['all', 'revenue', 'expense', 'asset', 'liability'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setInvoiceTypeFilter(type)
                          setInvoicePage(1)
                        }}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                          invoiceTypeFilter === type
                            ? 'bg-slate-900 text-white dark:bg-slate-600'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                        )}
                      >
                        {type === 'all' ? '전체' : type === 'revenue' ? '매출' : type === 'expense' ? '비용' : type === 'asset' ? '자산' : '부채'}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const totalPages = Math.ceil(invoices.length / INVOICES_PER_PAGE)
                    const paginatedInvoices = invoices.slice(
                      (invoicePage - 1) * INVOICES_PER_PAGE,
                      invoicePage * INVOICES_PER_PAGE
                    )
                    return (
                      <>
                        <div className="space-y-2">
                          {isLoadingInvoices ? (
                            <div className="text-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                            </div>
                          ) : invoices.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                              <p className="text-sm">등록된 재무항목이 없습니다</p>
                              <p className="text-xs">새 항목을 추가해주세요</p>
                            </div>
                          ) : (
                            paginatedInvoices.map((invoice) => {
                              const statusStyle = INVOICE_STATUS_STYLES[invoice.status]
                              return (
                                <div key={invoice.id} className="rounded-lg bg-white dark:bg-slate-700 p-3">
                                  <div
                                    className="flex items-start justify-between cursor-pointer"
                                    onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={cn(
                                          'px-2 py-0.5 rounded text-xs font-medium shrink-0',
                                          invoice.type === 'revenue' ? 'bg-blue-100 text-blue-700' :
                                          invoice.type === 'expense' ? 'bg-orange-100 text-orange-700' :
                                          invoice.type === 'asset' ? 'bg-emerald-100 text-emerald-700' :
                                          'bg-purple-100 text-purple-700'
                                        )}>
                                          {invoice.type === 'revenue' ? '매출' : invoice.type === 'expense' ? '비용' : invoice.type === 'asset' ? '자산' : '부채'}
                                        </span>
                                        <span className="font-medium text-sm truncate">{invoice.counterparty}</span>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleToggleInvoiceStatus(invoice) }}
                                          className={cn(
                                            'rounded-full px-2 py-0.5 text-xs flex items-center gap-1 shrink-0',
                                            statusStyle.bg, statusStyle.text
                                          )}
                                        >
                                          {invoice.status === 'completed' ? (
                                            <CheckCircle2 className="h-3 w-3" />
                                          ) : (
                                            <Clock className="h-3 w-3" />
                                          )}
                                          {statusStyle.label}
                                        </button>
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-0.5">
                                        <p>{invoice.issue_date} · <span className="font-medium text-foreground">{formatKRW(invoice.amount)}</span></p>
                                        {invoice.description && <p>{invoice.description}</p>}
                                        {invoice.account_number && <p>계좌: {invoice.account_number}</p>}
                                        {invoice.notes && <p className="text-slate-500">메모: {invoice.notes}</p>}
                                        {invoice.attachments && invoice.attachments.length > 0 && (
                                          <p className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{invoice.attachments.length}개 파일</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2 shrink-0">
                                      {expandedInvoice === invoice.id ? (
                                        <ChevronUp className="h-4 w-4 text-slate-400" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-slate-400" />
                                      )}
                                    </div>
                                  </div>
                                  {expandedInvoice === invoice.id && (
                                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-600 space-y-2">
                                      {invoice.attachments && invoice.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {invoice.attachments.map((att, idx) => (
                                            <a
                                              key={idx}
                                              href={att.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <Paperclip className="h-3 w-3" />
                                              {att.name}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex flex-wrap gap-2 pt-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); openEditInvoiceModal(invoice) }}
                                          className="flex items-center gap-1 rounded bg-slate-100 dark:bg-slate-600 px-2 py-1 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-500 cursor-pointer"
                                        >
                                          <Pencil className="h-3 w-3" />
                                          수정
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(invoice.id) }}
                                          className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-200 cursor-pointer"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          삭제
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })
                          )}
                        </div>
                        {invoices.length > 0 && (
                          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                            <p className="text-xs text-muted-foreground whitespace-nowrap">
                              총 {invoices.length}건 중 {(invoicePage - 1) * INVOICES_PER_PAGE + 1}-{Math.min(invoicePage * INVOICES_PER_PAGE, invoices.length)}
                            </p>
                            {totalPages > 1 && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setInvoicePage(1)} disabled={invoicePage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">«</button>
                                <button onClick={() => setInvoicePage(p => Math.max(1, p - 1))} disabled={invoicePage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">‹</button>
                                <span className="px-2 py-1 text-xs font-medium">{invoicePage}/{totalPages}</span>
                                <button onClick={() => setInvoicePage(p => Math.min(totalPages, p + 1))} disabled={invoicePage === totalPages} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">›</button>
                                <button onClick={() => setInvoicePage(totalPages)} disabled={invoicePage === totalPages} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">»</button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              ) : (
                /* Financial Summary View */
                (() => {
                  // Period filter tabs
                  const periodLabels = { monthly: '월별', quarterly: '분기별', yearly: '연도별' }

                  // Calculate summary data based on period
                  const getSummaryData = () => {
                    const allInvoices = invoices // Use all invoices, not filtered
                    const summaryMap = new Map<string, {
                      revenue: number; expense: number; asset: number; liability: number;
                      revenueCount: number; expenseCount: number; assetCount: number; liabilityCount: number
                    }>()

                    for (const inv of allInvoices) {
                      const date = new Date(inv.issue_date)
                      let periodKey: string

                      if (invoiceSummaryPeriod === 'monthly') {
                        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                      } else if (invoiceSummaryPeriod === 'quarterly') {
                        const quarter = Math.ceil((date.getMonth() + 1) / 3)
                        periodKey = `${date.getFullYear()}-Q${quarter}`
                      } else {
                        periodKey = `${date.getFullYear()}`
                      }

                      const existing = summaryMap.get(periodKey) || {
                        revenue: 0, expense: 0, asset: 0, liability: 0,
                        revenueCount: 0, expenseCount: 0, assetCount: 0, liabilityCount: 0
                      }
                      if (inv.type === 'revenue') {
                        existing.revenue += inv.amount
                        existing.revenueCount++
                      } else if (inv.type === 'expense') {
                        existing.expense += inv.amount
                        existing.expenseCount++
                      } else if (inv.type === 'asset') {
                        existing.asset += inv.amount
                        existing.assetCount++
                      } else if (inv.type === 'liability') {
                        existing.liability += inv.amount
                        existing.liabilityCount++
                      }
                      summaryMap.set(periodKey, existing)
                    }

                    // Sort by period (descending)
                    return Array.from(summaryMap.entries())
                      .sort((a, b) => b[0].localeCompare(a[0]))
                  }

                  const summaryData = getSummaryData()

                  return (
                    <>
                      {/* Period filter */}
                      <div className="flex gap-1 mb-4">
                        {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                          <button
                            key={period}
                            onClick={() => setInvoiceSummaryPeriod(period)}
                            className={cn(
                              'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                              invoiceSummaryPeriod === period
                                ? 'bg-slate-900 text-white dark:bg-slate-600'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                            )}
                          >
                            {periodLabels[period]}
                          </button>
                        ))}
                      </div>

                      {isLoadingInvoices ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                        </div>
                      ) : summaryData.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <BarChart3 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                          <p className="text-sm">데이터가 없습니다</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {summaryData.map(([period, data]) => {
                            // 현금흐름 계산: 매출 + 부채(유입) - 비용 - 자산(유출)
                            const operatingCashFlow = data.revenue - data.expense
                            const investingCashFlow = -data.asset // 자산 취득은 현금 유출
                            const financingCashFlow = data.liability // 부채 증가는 현금 유입
                            const totalCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow
                            const isExpanded = expandedSummaryPeriod === period

                            // Get invoices for this period
                            const getInvoicesForPeriod = () => {
                              return invoices.filter((inv) => {
                                const date = new Date(inv.issue_date)
                                let periodKey: string

                                if (invoiceSummaryPeriod === 'monthly') {
                                  periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                                } else if (invoiceSummaryPeriod === 'quarterly') {
                                  const quarter = Math.ceil((date.getMonth() + 1) / 3)
                                  periodKey = `${date.getFullYear()}-Q${quarter}`
                                } else {
                                  periodKey = `${date.getFullYear()}`
                                }

                                return periodKey === period
                              }).sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime())
                            }

                            const periodInvoices = isExpanded ? getInvoicesForPeriod() : []

                            return (
                              <div key={period} className="bg-white dark:bg-slate-700 rounded-lg overflow-hidden">
                                <button
                                  onClick={() => setExpandedSummaryPeriod(isExpanded ? null : period)}
                                  className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                >
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-medium text-muted-foreground">{period}</h4>
                                    <ChevronDown className={cn(
                                      'h-4 w-4 text-slate-400 transition-transform',
                                      isExpanded && 'rotate-180'
                                    )} />
                                  </div>
                                  {/* 영업활동 */}
                                  <div className="grid grid-cols-4 gap-2 mb-3">
                                    <div>
                                      <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                                        <TrendingUp className="h-3 w-3" />
                                        매출 ({data.revenueCount})
                                      </div>
                                      <p className="text-sm font-bold text-blue-700">{formatKRW(data.revenue)}</p>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1 text-xs text-orange-600 mb-1">
                                        <TrendingDown className="h-3 w-3" />
                                        비용 ({data.expenseCount})
                                      </div>
                                      <p className="text-sm font-bold text-orange-700">{formatKRW(data.expense)}</p>
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">영업이익</div>
                                      <p className={cn(
                                        'text-sm font-bold',
                                        operatingCashFlow >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-600'
                                      )}>
                                        {formatKRW(operatingCashFlow)}
                                      </p>
                                    </div>
                                    <div>
                                      <div className="text-xs text-muted-foreground mb-1">현금흐름</div>
                                      <p className={cn(
                                        'text-sm font-bold',
                                        totalCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      )}>
                                        {totalCashFlow >= 0 ? '+' : ''}{formatKRW(totalCashFlow)}
                                      </p>
                                    </div>
                                  </div>
                                  {/* 투자/재무활동 */}
                                  {(data.assetCount > 0 || data.liabilityCount > 0) && (
                                    <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-600">
                                      <div>
                                        <div className="flex items-center gap-1 text-xs text-emerald-600 mb-1">
                                          <TrendingDown className="h-3 w-3" />
                                          자산 ({data.assetCount})
                                        </div>
                                        <p className="text-sm font-bold text-emerald-700">{formatKRW(data.asset)}</p>
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-1 text-xs text-purple-600 mb-1">
                                          <TrendingUp className="h-3 w-3" />
                                          부채 ({data.liabilityCount})
                                        </div>
                                        <p className="text-sm font-bold text-purple-700">{formatKRW(data.liability)}</p>
                                      </div>
                                      <div />
                                      <div />
                                    </div>
                                  )}
                                </button>

                                {/* Expanded invoice list */}
                                {isExpanded && (
                                  <div className="border-t border-slate-200 dark:border-slate-600">
                                    {periodInvoices.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-4">항목 없음</p>
                                    ) : (
                                      <div className="divide-y divide-slate-100 dark:divide-slate-600">
                                        {periodInvoices.map((inv) => (
                                          <div
                                            key={inv.id}
                                            className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
                                            onClick={() => {
                                              setEditingInvoice(inv)
                                              setInvoiceFormType(inv.type)
                                              setInvoiceFormCounterparty(inv.counterparty)
                                              setInvoiceFormDescription(inv.description || '')
                                              setInvoiceFormAmount(String(inv.amount))
                                              setInvoiceFormDate(inv.issue_date)
                                              setInvoiceFormNotes(inv.notes || '')
                                              setInvoiceFormAccountNumber(inv.account_number || '')
                                              setIsInvoiceModalOpen(true)
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className={cn(
                                                'flex-shrink-0 text-[10px] w-7 text-center py-0.5 rounded font-medium',
                                                inv.type === 'revenue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                                inv.type === 'expense' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                                                inv.type === 'asset' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' :
                                                'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                              )}>
                                                {inv.type === 'revenue' ? '매출' : inv.type === 'expense' ? '비용' : inv.type === 'asset' ? '자산' : '부채'}
                                              </span>
                                              <span className="flex-shrink-0 text-xs text-muted-foreground w-20">{inv.issue_date}</span>
                                              <span className="text-sm font-medium truncate flex-1 min-w-0">
                                                {inv.counterparty}
                                                {inv.description && <span className="text-muted-foreground font-normal"> - {inv.description}</span>}
                                              </span>
                                              <span className={cn(
                                                'flex-shrink-0 text-sm font-bold text-right min-w-[80px]',
                                                inv.type === 'revenue' ? 'text-blue-600' :
                                                inv.type === 'expense' ? 'text-orange-600' :
                                                inv.type === 'asset' ? 'text-emerald-600' :
                                                'text-purple-600'
                                              )}>
                                                {formatKRW(inv.amount)}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })()
              )}
            </CardContent>
          </Card>

          {/* Work Wiki Section */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  {t.wiki.title}
                </CardTitle>
                <CardDescription>{t.wiki.description}</CardDescription>
              </div>
              <button
                onClick={() => setIsAddingNote(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t.invoice.create}</span>
              </button>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <div className="relative">
                  <input
                    type="text"
                    value={wikiSearch}
                    onChange={(e) => setWikiSearch(e.target.value)}
                    placeholder={t.wiki.searchPlaceholder}
                    className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-1.5 text-sm pl-8 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  {wikiSearch && (
                    <button onClick={() => setWikiSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {wikiSearch && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.wiki.searchCount.replace('{count}', String(filteredWikiNotes.length))}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                {isAddingNote && (
                  <div
                    className={`rounded-lg bg-white dark:bg-slate-700 p-3 border-2 transition-colors ${
                      isDraggingWiki ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30' : 'border-purple-200 dark:border-purple-800'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingWiki(true) }}
                    onDragLeave={() => setIsDraggingWiki(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDraggingWiki(false); if (e.dataTransfer.files) handleWikiFilesDrop(e.dataTransfer.files) }}
                  >
                    <input
                      type="text"
                      value={newNoteTitle}
                      onChange={(e) => setNewNoteTitle(e.target.value)}
                      placeholder={t.wiki.titlePlaceholder}
                      className="w-full border-b border-slate-200 dark:border-slate-600 px-1 py-1 text-sm font-medium focus:outline-none focus:border-purple-400 bg-transparent mb-2"
                    />
                    <textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder={t.wiki.contentPlaceholder}
                      rows={3}
                      className="w-full text-sm resize-none focus:outline-none bg-transparent"
                    />
                    {newNoteFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {newNoteFiles.map((file, idx) => (
                          <span key={idx} className="text-xs bg-slate-100 dark:bg-slate-600 px-2 py-0.5 rounded flex items-center gap-1">
                            <Paperclip className="h-3 w-3" />
                            {file.name}
                            <button onClick={() => setNewNoteFiles(files => files.filter((_, i) => i !== idx))} className="ml-1 hover:text-red-500">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-600">
                      <label className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {t.wiki.fileAttach}
                        <input type="file" multiple className="hidden" onChange={(e) => e.target.files && handleWikiFilesDrop(e.target.files)} />
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => { setIsAddingNote(false); setNewNoteTitle(''); setNewNoteContent(''); setNewNoteFiles([]) }} className="text-xs text-slate-500 hover:text-slate-700">
                          {t.common.cancel}
                        </button>
                        <button
                          onClick={handleAddNote}
                          disabled={!newNoteTitle.trim() || !newNoteContent.trim() || isUploadingWiki}
                          className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isUploadingWiki && <Loader2 className="h-3 w-3 animate-spin" />}
                          {t.common.save}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {editingNote && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3 border-2 border-amber-200 dark:border-amber-800">
                    <input
                      type="text"
                      value={newNoteTitle}
                      onChange={(e) => setNewNoteTitle(e.target.value)}
                      className="w-full border-b border-slate-200 dark:border-slate-600 px-1 py-1 text-sm font-medium focus:outline-none focus:border-amber-400 bg-transparent mb-2"
                    />
                    <textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      rows={3}
                      className="w-full text-sm resize-none focus:outline-none bg-transparent"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-600">
                      <button onClick={() => { setEditingNote(null); setNewNoteTitle(''); setNewNoteContent(''); setNewNoteFiles([]) }} className="text-xs text-slate-500 hover:text-slate-700">
                        {t.common.cancel}
                      </button>
                      <button onClick={handleUpdateNote} disabled={!newNoteTitle.trim() || !newNoteContent.trim() || isUploadingWiki} className="text-xs bg-amber-600 text-white px-2 py-1 rounded hover:bg-amber-700 disabled:opacity-50">
                        {t.common.save}
                      </button>
                    </div>
                  </div>
                )}
                {isLoadingWiki ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </div>
                ) : filteredWikiNotes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <StickyNote className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">{wikiSearch ? t.wiki.noSearchResults : t.wiki.noNotes}</p>
                    {!wikiSearch && <p className="text-xs">{t.wiki.addNoteHint}</p>}
                  </div>
                ) : (
                  paginatedWikiNotes.map((note) => (
                    <div key={note.id} className="rounded-lg bg-white dark:bg-slate-700 p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{note.title}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{note.content}</p>
                          {note.attachments && note.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {note.attachments.map((att, idx) => (
                                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                  <Paperclip className="h-3 w-3" />
                                  {att.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button onClick={() => startEditNote(note)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded">
                            <Pencil className="h-3 w-3 text-slate-400" />
                          </button>
                          <button onClick={() => handleDeleteNote(note.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded">
                            <Trash2 className="h-3 w-3 text-slate-400" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(note.updated_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {filteredWikiNotes.length > 0 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {t.wiki.showingRange
                      .replace('{total}', String(filteredWikiNotes.length))
                      .replace('{start}', String((wikiPage - 1) * WIKI_PER_PAGE + 1))
                      .replace('{end}', String(Math.min(wikiPage * WIKI_PER_PAGE, filteredWikiNotes.length)))}
                  </p>
                  {totalWikiPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setWikiPage(1)} disabled={wikiPage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">«</button>
                      <button onClick={() => setWikiPage(p => Math.max(1, p - 1))} disabled={wikiPage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">‹</button>
                      <span className="px-2 py-1 text-xs font-medium">{wikiPage}/{totalWikiPages}</span>
                      <button onClick={() => setWikiPage(p => Math.min(totalWikiPages, p + 1))} disabled={wikiPage === totalWikiPages} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">›</button>
                      <button onClick={() => setWikiPage(totalWikiPages)} disabled={wikiPage === totalWikiPages} className="rounded px-2 py-1 text-xs hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">»</button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Progress Summary + Calendar */}
        <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
          {/* Progress Summary */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader
              className={cn("cursor-pointer", progressExpanded ? "" : "-mb-2")}
              onClick={() => setProgressExpanded(!progressExpanded)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    진행 현황
                  </CardTitle>
                  <CardDescription>클라이언트별 마일스톤 달성률</CardDescription>
                </div>
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
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    일정
                  </CardTitle>
                  <CardDescription>프로젝트 일정 및 마감일 관리</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
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
                      'px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      viewMode === 'month'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white'
                        : 'border dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                    onClick={() => setViewMode('month')}
                  >
                    월간
                  </button>
                  <button
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => openScheduleDialog()}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">일정 추가</span>
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

          {/* Email Section */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {t.gmail.title}
                    {syncStatus.isConnected ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Gmail · {t.gmail.watchLabel}: {gmailLabel}
                    {syncStatus.lastSyncAt && (
                      <span className="ml-2">· {formatRelativeTime(syncStatus.lastSyncAt)}</span>
                    )}
                  </CardDescription>
                </div>
                <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    onClick={syncEmails}
                    disabled={isSyncing || !syncStatus.isConnected}
                    className="flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleAnalyzeEmails}
                    disabled={isAnalyzing || !syncStatus.isConnected}
                    className="flex items-center justify-center gap-2 rounded-lg bg-purple-100 dark:bg-purple-900/50 px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 disabled:opacity-50 cursor-pointer"
                  >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span className="hidden sm:inline">{isAnalyzing ? t.gmail.analyzing : t.gmail.aiAnalysis}</span>
                  </button>
                  <button
                    onClick={() => setShowGmailSettings(!showGmailSettings)}
                    className="flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setComposeMode('new'); setComposeOriginalEmail(null); setIsComposeOpen(true) }}
                    className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                  >
                    <Mail className="h-4 w-4" />
                    <span className="hidden sm:inline">{t.gmail.newEmail}</span>
                  </button>
                </div>
              </div>

              {/* Gmail Settings Modal */}
              {showGmailSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/50" onClick={() => setShowGmailSettings(false)} />
                  <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-base">{t.gmail.settings}</h4>
                      <button onClick={() => setShowGmailSettings(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.gmail.connectionStatus}</span>
                        <div className="flex items-center gap-1.5">
                          {syncStatus.isConnected ? (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {t.gmail.connected}
                              </span>
                              <button onClick={handleGmailDisconnect} className="text-xs px-2 py-0.5 rounded-full text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors">
                                {t.gmail.disconnect}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                {t.gmail.notConnected}
                              </span>
                              <button onClick={handleGmailConnect} disabled={isConnecting} className="text-xs bg-slate-900 text-white px-2.5 py-0.5 rounded-full hover:bg-slate-800 disabled:opacity-50 transition-colors">
                                {isConnecting ? t.gmail.connecting : t.gmail.connect}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.gmail.watchLabel}</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={labelInput}
                            onChange={(e) => setLabelInput(e.target.value)}
                            className="font-mono bg-slate-100 px-2 py-1 rounded text-xs w-24 border border-slate-200 focus:outline-none focus:border-slate-400"
                            placeholder="TenSW"
                          />
                          <button onClick={handleLabelSave} disabled={labelInput === gmailLabel} className="text-xs bg-slate-900 text-white px-2.5 py-1 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors">
                            {t.common.save}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">{t.gmail.totalEmails}</span>
                        <span className="font-medium">{syncStatus.totalEmails}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-6 items-start">
                {/* Email List */}
                <div className="w-full lg:w-1/2">
                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    <button
                      onClick={() => setEmailFilter('all')}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                        emailFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {t.gmail.filterAll}
                    </button>
                    {availableCategories.map((category) => {
                      const color = getCategoryColor(category, availableCategories)
                      return (
                        <button
                          key={category}
                          onClick={() => setEmailFilter(category)}
                          className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                            emailFilter === category ? `${color.button} text-white` : `${color.bg} ${color.text} hover:opacity-80`
                          }`}
                        >
                          {category}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mb-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={emailSearch}
                        onChange={(e) => setEmailSearch(e.target.value)}
                        placeholder={t.header.searchPlaceholder}
                        className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      />
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      {emailSearch && (
                        <button onClick={() => setEmailSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {emailSearch && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.gmail.searchResultCount.replace('{count}', String(filteredEmails.length))}
                      </p>
                    )}
                    {relatedEmailIds.length > 0 && (
                      <div className="flex items-center justify-between mt-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-700">
                          {t.gmail.showingRelatedEmails.replace('{count}', String(relatedEmailIds.length))}
                        </p>
                        <button onClick={clearRelatedFilter} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                          <X className="h-3 w-3" />
                          {t.gmail.clearRelatedFilter}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {!syncStatus.isConnected ? (
                      <div className="text-center py-8">
                        <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                        <p className="text-muted-foreground mb-4">{t.gmail.notConnectedMessage}</p>
                        <button
                          onClick={handleGmailConnect}
                          disabled={isConnecting}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50"
                        >
                          {isConnecting ? (
                            <><Loader2 className="h-4 w-4 animate-spin" />{t.gmail.connecting}</>
                          ) : (
                            <><Mail className="h-4 w-4" />{t.gmail.connect}</>
                          )}
                        </button>
                      </div>
                    ) : filteredEmails.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        {isSyncing ? t.gmail.syncing : t.gmail.noEmails}
                      </div>
                    ) : (
                      <>
                        {paginatedEmails.map((email) => (
                          <div
                            key={email.id}
                            className={`rounded-lg bg-white dark:bg-slate-700 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 ${selectedEmail?.id === email.id ? 'ring-2 ring-blue-500' : ''}`}
                            onClick={() => setSelectedEmail(email)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <Mail className={`h-5 w-5 mt-0.5 flex-shrink-0 ${email.direction === 'outbound' ? 'text-blue-500' : 'text-slate-400'}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm truncate">{email.subject || t.gmail.noSubject}</p>
                                    {email.attachments && email.attachments.length > 0 && <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                    <p className="truncate"><span className="text-slate-400">{t.gmail.from}:</span> {email.fromName || email.from}</p>
                                    <p className="truncate"><span className="text-slate-400">{t.gmail.to}:</span> {email.to}</p>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {email.direction === 'outbound' ? t.gmail.outbound : t.gmail.inbound} · {formatEmailDate(email.date)}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                    {email.body?.replace(/\n+/g, ' ').trim() || t.gmail.noContent}
                                  </p>
                                </div>
                              </div>
                              {(email.categories?.length || email.category) && (
                                <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                                  {(email.categories || (email.category ? [email.category] : [])).map((cat, idx) => (
                                    <span key={idx} className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${getCategoryColor(cat, availableCategories).bg} ${getCategoryColor(cat, availableCategories).text}`}>
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {filteredEmails.length > 0 && (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {t.gmail.showingRange.replace('{total}', String(filteredEmails.length)).replace('{start}', String((emailPage - 1) * emailsPerPage + 1)).replace('{end}', String(Math.min(emailPage * emailsPerPage, filteredEmails.length)))}
                              </p>
                              <select
                                value={emailsPerPage}
                                onChange={(e) => {
                                  setEmailsPerPage(Number(e.target.value))
                                  setEmailPage(1)
                                }}
                                className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5"
                              >
                                <option value={5}>5개</option>
                                <option value={10}>10개</option>
                                <option value={25}>25개</option>
                                <option value={50}>50개</option>
                                <option value={100}>100개</option>
                              </select>
                            </div>
                            {Math.ceil(filteredEmails.length / emailsPerPage) > 1 && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEmailPage(1)} disabled={emailPage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">«</button>
                                <button onClick={() => setEmailPage(p => Math.max(1, p - 1))} disabled={emailPage === 1} className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">‹</button>
                                <span className="px-2 sm:px-3 py-1 text-xs font-medium">{emailPage}/{Math.ceil(filteredEmails.length / emailsPerPage)}</span>
                                <button onClick={() => setEmailPage(p => Math.min(Math.ceil(filteredEmails.length / emailsPerPage), p + 1))} disabled={emailPage === Math.ceil(filteredEmails.length / emailsPerPage)} className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">›</button>
                                <button onClick={() => setEmailPage(Math.ceil(filteredEmails.length / emailsPerPage))} disabled={emailPage === Math.ceil(filteredEmails.length / emailsPerPage)} className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed">»</button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Email Detail / AI Analysis */}
                <div className="w-full lg:w-1/2">
                  {selectedEmail ? (
                    <div className="rounded-lg bg-white dark:bg-slate-700 p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${selectedEmail.direction === 'outbound' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {selectedEmail.direction === 'outbound' ? t.gmail.outbound : t.gmail.inbound}
                        </span>
                        <h3 className="text-lg font-semibold break-words flex-1">{selectedEmail.subject || t.gmail.noSubject}</h3>
                        <button onClick={() => setSelectedEmail(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-1 text-sm mb-4">
                        <div className="flex"><span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.from}:</span><span className="break-all">{selectedEmail.from}</span></div>
                        <div className="flex"><span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.to}:</span><span className="break-all">{selectedEmail.to}</span></div>
                        <div className="flex"><span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.date}:</span><span>{new Date(selectedEmail.date).toLocaleString('ko-KR')}</span></div>
                      </div>
                      {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                        <div className="mb-4 p-2 bg-slate-50 dark:bg-slate-600 rounded">
                          <span className="text-sm font-medium">{selectedEmail.attachments.length} {t.gmail.attachments}</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedEmail.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={`/api/gmail/attachments/${selectedEmail.id}/${att.attachmentId}?context=tensoftworks&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`}
                                download={att.filename}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Paperclip className="h-3 w-3" />
                                {att.filename}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedEmail.body || t.gmail.noContent}
                      </div>
                      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-600">
                        <button
                          onClick={() => { setComposeMode('reply'); setComposeOriginalEmail(selectedEmail); setIsComposeOpen(true) }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
                        >
                          <Reply className="h-4 w-4" />
                          {t.gmail.reply}
                        </button>
                        <button
                          onClick={() => { setComposeMode('replyAll'); setComposeOriginalEmail(selectedEmail); setIsComposeOpen(true) }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
                        >
                          <ReplyAll className="h-4 w-4" />
                          {t.gmail.replyAll}
                        </button>
                        <button
                          onClick={() => { setComposeMode('forward'); setComposeOriginalEmail(selectedEmail); setIsComposeOpen(true) }}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-500"
                        >
                          <Forward className="h-4 w-4" />
                          {t.gmail.forward}
                        </button>
                      </div>
                    </div>
                  ) : showAiAnalysis && aiAnalysis ? (
                    <div className="rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-800 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-purple-900 dark:text-purple-200 flex items-center gap-2">
                          <Sparkles className="h-4 w-4" />
                          {t.gmail.aiAnalysis}
                          <span className="text-xs text-purple-600 dark:text-purple-400 font-normal">
                            ({t.gmail.analysisScope.replace('{days}', '30')})
                          </span>
                        </h4>
                        <button
                          onClick={() => setShowAiAnalysis(false)}
                          className="text-purple-400 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Overall Summary */}
                      <div className="bg-white dark:bg-slate-700 rounded-lg p-3 mb-4">
                        <h5 className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{t.gmail.overallSummary}</h5>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{aiAnalysis.overallSummary}</p>
                      </div>

                      {/* Categories Carousel */}
                      {aiAnalysis.categories.length > 0 && (() => {
                        const currentIndex = Math.min(categorySlideIndex, aiAnalysis.categories.length - 1)
                        const cat = aiAnalysis.categories[currentIndex]
                        const color = getCategoryColor(cat.category, availableCategories)

                        return (
                          <div>
                            {/* Navigation Header */}
                            <div className="flex items-center justify-between mb-2">
                              <button
                                onClick={() => setCategorySlideIndex(Math.max(0, currentIndex - 1))}
                                disabled={currentIndex === 0}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronLeft className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              </button>

                              {/* Dot Indicators */}
                              <div className="flex items-center gap-1">
                                {aiAnalysis.categories.map((c, idx) => (
                                  <button
                                    key={c.category}
                                    onClick={() => setCategorySlideIndex(idx)}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                      idx === currentIndex ? 'bg-purple-600 dark:bg-purple-400' : 'bg-purple-300 dark:bg-purple-700 hover:bg-purple-400 dark:hover:bg-purple-500'
                                    }`}
                                  />
                                ))}
                              </div>

                              <button
                                onClick={() => setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))}
                                disabled={currentIndex === aiAnalysis.categories.length - 1}
                                className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <ChevronRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              </button>
                            </div>

                            {/* Category Card */}
                            <div
                              className="bg-white dark:bg-slate-700 rounded-lg p-3 cursor-grab active:cursor-grabbing select-none"
                              style={{
                                transform: isDraggingCarousel ? `translateX(${dragDeltaX}px)` : 'translateX(0)',
                                transition: isDraggingCarousel ? 'none' : 'transform 0.3s ease-out',
                              }}
                              onTouchStart={(e) => {
                                setDragStartX(e.touches[0].clientX)
                                setIsDraggingCarousel(true)
                                setDragDeltaX(0)
                              }}
                              onTouchMove={(e) => {
                                if (dragStartX === null) return
                                const diff = e.touches[0].clientX - dragStartX
                                setDragDeltaX(diff)
                              }}
                              onTouchEnd={(e) => {
                                if (dragStartX === null) return
                                const diff = e.changedTouches[0].clientX - dragStartX
                                if (diff > 50) {
                                  setCategorySlideIndex(Math.max(0, currentIndex - 1))
                                } else if (diff < -50) {
                                  setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))
                                }
                                setDragStartX(null)
                                setDragDeltaX(0)
                                setIsDraggingCarousel(false)
                              }}
                              onMouseDown={(e) => {
                                setDragStartX(e.clientX)
                                setIsDraggingCarousel(true)
                                setDragDeltaX(0)
                              }}
                              onMouseMove={(e) => {
                                if (dragStartX === null || !isDraggingCarousel) return
                                const diff = e.clientX - dragStartX
                                setDragDeltaX(diff)
                              }}
                              onMouseUp={(e) => {
                                if (dragStartX === null) return
                                const diff = e.clientX - dragStartX
                                if (diff > 50) {
                                  setCategorySlideIndex(Math.max(0, currentIndex - 1))
                                } else if (diff < -50) {
                                  setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))
                                }
                                setDragStartX(null)
                                setDragDeltaX(0)
                                setIsDraggingCarousel(false)
                              }}
                              onMouseLeave={() => {
                                if (isDraggingCarousel) {
                                  setDragStartX(null)
                                  setDragDeltaX(0)
                                  setIsDraggingCarousel(false)
                                }
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
                                  {cat.category}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{cat.emailCount} emails</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">{currentIndex + 1}/{aiAnalysis.categories.length}</span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{cat.summary}</p>

                              {/* Recent Topics */}
                              {cat.recentTopics && cat.recentTopics.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {cat.recentTopics.map((topic, idx) => (
                                    <span key={idx} className="px-1.5 py-px bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-[10px]">
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Issues */}
                              {cat.issues.length > 0 && (
                                <div className="mb-3">
                                  <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    {t.gmail.issues}
                                  </h6>
                                  <div className="space-y-2">
                                    {cat.issues.map((issue, idx) => (
                                      <div key={idx} className="bg-slate-50 dark:bg-slate-600 rounded p-2">
                                        <div className="flex items-start gap-2 mb-1">
                                          <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(issue.priority)}`}>
                                            {getPriorityLabel(issue.priority)}
                                          </span>
                                          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{issue.title}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-300">{issue.description}</p>
                                        {issue.relatedEmailIds.length > 0 && (
                                          <button
                                            onClick={() => showRelatedEmails(issue.relatedEmailIds)}
                                            className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline mt-1 flex items-center gap-1 cursor-pointer"
                                          >
                                            <Mail className="h-3 w-3" />
                                            {t.gmail.relatedEmails.replace('{count}', String(issue.relatedEmailIds.length))}
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Todos - DB에서 가져온 savedTodos 사용 */}
                              {(() => {
                                const categoryTodos = savedTodos.filter(t => t.category === cat.category)
                                const incompleteTodos = categoryTodos.filter(t => !t.completed)
                                const completedTodos = categoryTodos
                                  .filter(t => t.completed)
                                  .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
                                  .slice(0, 3)
                                const displayTodos = [...incompleteTodos, ...completedTodos]

                                return displayTodos.length > 0 ? (
                                  <div>
                                    <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                      <ListTodo className="h-3 w-3" />
                                      {t.gmail.todoList}
                                      <span className="text-slate-400 dark:text-slate-500 font-normal">
                                        ({incompleteTodos.length}{completedTodos.length > 0 ? ` + ${t.gmail.completedCount.replace('{count}', String(completedTodos.length))}` : ''})
                                      </span>
                                    </h6>
                                    <div className="space-y-2">
                                      {displayTodos.map((todo) => (
                                        <div key={todo.id} className={`bg-slate-50 dark:bg-slate-600 rounded p-2 flex items-start gap-2 ${todo.completed ? 'opacity-60' : ''}`}>
                                          {togglingTodoIdsEmail.has(todo.id) ? (
                                            <Loader2 className="mt-1 h-4 w-4 flex-shrink-0 animate-spin text-slate-400" />
                                          ) : (
                                            <input
                                              type="checkbox"
                                              checked={todo.completed}
                                              onChange={() => handleEmailTodoToggle(todo.id, !todo.completed)}
                                              className="mt-1 rounded flex-shrink-0 cursor-pointer"
                                            />
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-start gap-2">
                                              <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(todo.priority)}`}>
                                                {getPriorityLabel(todo.priority)}
                                              </span>
                                              <span className={`text-xs text-slate-700 dark:text-slate-200 ${todo.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                                {todo.task}
                                              </span>
                                            </div>
                                            {todo.due_date && (
                                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.gmail.dueDate}: {todo.due_date}</p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : cat.todos.length > 0 ? (
                                  <div>
                                    <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                      <ListTodo className="h-3 w-3" />
                                      {t.gmail.todoList}
                                      <span className="text-slate-400 dark:text-slate-500 font-normal">({t.gmail.syncing2})</span>
                                    </h6>
                                    <div className="space-y-2">
                                      {cat.todos.map((todo, idx) => (
                                        <div key={idx} className="bg-slate-50 dark:bg-slate-600 rounded p-2 flex items-start gap-2 opacity-50">
                                          <input
                                            type="checkbox"
                                            className="mt-1 rounded flex-shrink-0"
                                            disabled
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-start gap-2">
                                              <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(todo.priority)}`}>
                                                {getPriorityLabel(todo.priority)}
                                              </span>
                                              <span className="text-xs text-slate-700 dark:text-slate-200">{todo.task}</span>
                                            </div>
                                            {todo.dueDate && (
                                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.gmail.dueDate}: {todo.dueDate}</p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null
                              })()}

                              {cat.issues.length === 0 && cat.todos.length === 0 && savedTodos.filter(t => t.category === cat.category).length === 0 && (
                                <p className="text-xs text-slate-400 italic">{t.gmail.noIssues}</p>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      <p className="text-xs text-purple-400 mt-3 text-right">
                        {t.gmail.generated}: {new Date(aiAnalysis.generatedAt).toLocaleString(locale)}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-white dark:bg-slate-700 p-4 text-center text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-sm">이메일을 선택하거나 AI 분석을 실행하세요</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoice Modal (Simplified) */}
      <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingInvoice ? '재무항목 수정' : '재무항목 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1">
                {/* Type Selection */}
                <div>
                  <label className="block text-sm font-medium mb-2">유형</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('revenue')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg border transition-colors',
                        invoiceFormType === 'revenue'
                          ? 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                      )}
                    >
                      매출
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('expense')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg border transition-colors',
                        invoiceFormType === 'expense'
                          ? 'bg-orange-100 border-orange-300 text-orange-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                      )}
                    >
                      비용
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('asset')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg border transition-colors',
                        invoiceFormType === 'asset'
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                      )}
                    >
                      자산
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('liability')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg border transition-colors',
                        invoiceFormType === 'liability'
                          ? 'bg-purple-100 border-purple-300 text-purple-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                      )}
                    >
                      부채
                    </button>
                  </div>
                </div>

                {/* Counterparty */}
                <div>
                  <label className="block text-sm font-medium mb-1">거래처 *</label>
                  <input
                    type="text"
                    value={invoiceFormCounterparty}
                    onChange={(e) => setInvoiceFormCounterparty(e.target.value)}
                    placeholder="거래처명"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-1">내역</label>
                  <input
                    type="text"
                    value={invoiceFormDescription}
                    onChange={(e) => setInvoiceFormDescription(e.target.value)}
                    placeholder="내역 설명 (선택)"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium mb-1">금액 (원) *</label>
                  <input
                    type="text"
                    value={invoiceFormAmount}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, '')
                      setInvoiceFormAmount(value ? parseInt(value).toLocaleString() : '')
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                {/* Issue Date */}
                <div>
                  <label className="block text-sm font-medium mb-1">발행일 *</label>
                  <input
                    type="date"
                    value={invoiceFormDate}
                    onChange={(e) => setInvoiceFormDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                {/* Account Number */}
                <div className="relative">
                  <label className="block text-sm font-medium mb-1">계좌번호</label>
                  <input
                    type="text"
                    value={invoiceFormAccountNumber}
                    onChange={(e) => setInvoiceFormAccountNumber(e.target.value)}
                    onFocus={() => setShowAccountSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                    placeholder="계좌번호 (선택)"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  {showAccountSuggestions && (() => {
                    const uniqueAccounts = Array.from(new Set(
                      invoices
                        .map(inv => inv.account_number)
                        .filter((acc): acc is string => !!acc && acc !== invoiceFormAccountNumber)
                    )).filter(acc =>
                      !invoiceFormAccountNumber || acc.toLowerCase().includes(invoiceFormAccountNumber.toLowerCase())
                    )
                    if (uniqueAccounts.length === 0) return null
                    return (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                        {uniqueAccounts.map((acc, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setInvoiceFormAccountNumber(acc)
                              setShowAccountSuggestions(false)
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-600"
                          >
                            {acc}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-1">메모</label>
                  <textarea
                    value={invoiceFormNotes}
                    onChange={(e) => setInvoiceFormNotes(e.target.value)}
                    rows={2}
                    placeholder="메모 (선택)"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                  />
                </div>

                {/* Existing Attachments (edit mode) */}
                {editingInvoice && editingInvoice.attachments.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">기존 첨부파일</label>
                    <div className="space-y-1">
                      {editingInvoice.attachments.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 px-3 py-2 rounded-lg">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            {att.name}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveInvoiceAttachment(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">새 첨부파일</label>
                  <div
                    className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-500"
                    onClick={() => document.getElementById('invoice-file-input')?.click()}
                  >
                    <input
                      id="invoice-file-input"
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        setInvoiceFormFiles(prev => [...prev, ...files])
                        e.target.value = ''
                      }}
                      className="hidden"
                    />
                    <Paperclip className="h-6 w-6 mx-auto mb-2 text-slate-400" />
                    <p className="text-sm text-slate-500">클릭하여 파일 선택</p>
                  </div>
                  {invoiceFormFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {invoiceFormFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 px-3 py-2 rounded-lg">
                          <span className="text-sm truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setInvoiceFormFiles(files => files.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0">
            {editingInvoice ? (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!editingInvoice) return
                  try {
                    const res = await fetch(`/api/tensw-mgmt/invoices?id=${editingInvoice.id}`, { method: 'DELETE' })
                    if (!res.ok) throw new Error('Failed to delete')
                    setInvoices(invoices.filter(inv => inv.id !== editingInvoice.id))
                    setIsInvoiceModalOpen(false)
                    resetInvoiceForm()
                  } catch (error) {
                    console.error('Failed to delete invoice:', error)
                  }
                }}
              >
                삭제
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsInvoiceModalOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSaveInvoice} disabled={isSavingInvoice || isUploadingInvoiceFiles}>
                {(isSavingInvoice || isUploadingInvoiceFiles) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
