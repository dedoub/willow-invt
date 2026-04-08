'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAgentRefresh } from '@/hooks/use-agent-refresh'
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
  issue_date: string | null  // 세금계산서 발행일
  payment_date: string | null  // 입금일/지급일
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
import { TiptapEditor, plainTextToHtml } from '@/components/ui/tiptap-editor'
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
  ChevronsLeft,
  ChevronsRight,
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
  Pin,
  Maximize2,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { InvestmentKanban } from '@/components/willow-mgmt/investment-kanban'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip as RechartsTooltip, Legend as RechartsLegend,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceDot,
  BarChart, Bar, AreaChart, Area, ReferenceLine, ComposedChart,
} from 'recharts'
import { WillowMgmtClient, WillowMgmtProject, WillowMgmtMilestone, WillowMgmtSchedule, WillowMgmtDailyMemo, WillowMgmtTask } from '@/types/willow-mgmt'
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

// Skeleton for Investment Research (full-width)
function ResearchPanelSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800 animate-pulse">
      <CardHeader className="pb-2">
        <div className="h-5 w-28 bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-3 w-40 bg-slate-200 dark:bg-slate-700 rounded mt-1" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex gap-2">
          <div className="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <div className="h-6 w-12 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="h-[220px] bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-[220px] bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
          <div className="space-y-3">
            <div className="h-[220px] bg-slate-200 dark:bg-slate-700 rounded-lg" />
            <div className="h-[220px] bg-slate-200 dark:bg-slate-700 rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Full page skeleton
function WillowManagementPageSkeleton() {
  return (
    <div className="space-y-6">
      <CalendarPanelSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProjectsPanelSkeleton />
        <ProjectsPanelSkeleton />
      </div>
      <ResearchPanelSkeleton />
    </div>
  )
}

// Draggable Schedule Card Component
function DraggableScheduleCard({
  schedule,
  onToggleComplete,
  onEdit,
  isToggling = false,
  currentDate,
}: {
  schedule: WillowMgmtSchedule
  onToggleComplete: () => void
  onEdit: () => void
  isToggling?: boolean
  currentDate?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: currentDate ? `${schedule.id}-${currentDate}` : schedule.id,
    data: { type: 'schedule', schedule, currentDate },
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

  // 여러 날짜에 걸친 일정인 경우 현재 날짜의 완료 상태 확인
  const isMultiDay = !!schedule.end_date
  const isDateCompleted = isMultiDay && currentDate
    ? (schedule.completed_dates || []).includes(currentDate)
    : schedule.is_completed

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        borderLeft: clientColor ? `3px solid ${clientColor}` : undefined,
        backgroundColor: !isDateCompleted && displayColor
          ? `${displayColor}20`
          : undefined,
      }
    : {
        borderLeft: clientColor ? `3px solid ${clientColor}` : undefined,
        backgroundColor: !isDateCompleted && displayColor
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
        isDateCompleted
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
          ) : isDateCompleted ? (
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
        <div className="text-muted-foreground text-[11px] mt-0.5 line-clamp-3">
          {schedule.description}
        </div>
      )}
      {/* Display connected milestones */}
      {schedule.milestones && schedule.milestones.length > 0 && (
        <div className="text-[11px] mt-0.5 space-y-0.5">
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
              'flex items-center gap-1 text-[11px]',
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
          'flex items-center gap-1 mt-0.5 text-[11px]',
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
    <div className="min-h-[140px] md:min-h-0">
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
  isOtherMonth,
  children,
  onClick,
}: {
  day: Date | null
  isToday: boolean
  isOtherMonth?: boolean
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
        'min-h-[80px] rounded-lg p-1',
        day ? 'cursor-pointer bg-white dark:bg-slate-700' : 'bg-transparent',
        day && !isOver && 'hover:bg-slate-50 dark:hover:bg-slate-600',
        isOver && 'bg-slate-200 dark:bg-slate-600',
        isToday && 'bg-slate-200 dark:bg-slate-600',
        isOtherMonth && 'opacity-40'
      )}
      onClick={() => day && onClick()}
    >
      {children}
    </div>
  )
}

// Generic Draggable Item wrapper for tasks and other items
function DraggableItem({
  id,
  data,
  children,
  className,
  style: styleProp,
  onClick,
}: {
  id: string
  data: Record<string, unknown>
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data })
  const wasDraggingRef = useRef(false)
  useEffect(() => { if (isDragging) wasDraggingRef.current = true }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(className, isDragging && 'opacity-50', 'cursor-grab active:cursor-grabbing touch-none')}
      style={{
        ...styleProp,
        ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
      }}
      onClick={(e) => {
        if (wasDraggingRef.current) { wasDraggingRef.current = false; return }
        onClick?.(e)
      }}
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
  currentDate,
}: {
  schedule: WillowMgmtSchedule
  onEdit: () => void
  onToggleComplete: () => void
  isToggling?: boolean
  currentDate?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: currentDate ? `${schedule.id}-${currentDate}` : schedule.id,
    data: { type: 'schedule', schedule, currentDate },
  })

  // Determine display color: client color takes priority, then custom color
  const displayColor = schedule.client?.color || schedule.color
  const clientColor = schedule.client?.color

  // 여러 날짜에 걸친 일정인 경우 현재 날짜의 완료 상태 확인
  const isMultiDay = !!schedule.end_date
  const isDateCompleted = isMultiDay && currentDate
    ? (schedule.completed_dates || []).includes(currentDate)
    : schedule.is_completed

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
        borderLeft: clientColor ? `2px solid ${clientColor}` : undefined,
        backgroundColor: isDateCompleted
          ? undefined
          : displayColor
            ? `${displayColor}25`
            : undefined,
      }
    : {
        borderLeft: clientColor ? `2px solid ${clientColor}` : undefined,
        backgroundColor: isDateCompleted
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
        'text-xs px-1 py-0.5 rounded cursor-grab active:cursor-grabbing touch-none flex items-center gap-0.5',
        isDragging && 'opacity-50',
        isDateCompleted
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
        ) : isDateCompleted ? (
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
      <span className="flex-1 break-words">
        {schedule.title}
      </span>
    </div>
  )
}

// 이메일 작성 모달
type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeEmailData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

function ComposeEmailModal({
  isOpen,
  onClose,
  mode,
  originalEmail,
  initialData,
  initialAttachments,
  onSendSuccess,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  mode: ComposeMode
  originalEmail: ParsedEmail | null
  initialData?: Partial<ComposeEmailData>
  initialAttachments?: File[]
  onSendSuccess?: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const [formData, setFormData] = useState<ComposeEmailData>({ to: '', cc: '', bcc: '', subject: '', body: '' })
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && originalEmail) {
      const replyPrefix = mode === 'forward' ? 'Fwd: ' : 'Re: '
      const subjectHasPrefix = originalEmail.subject.startsWith('Re:') || originalEmail.subject.startsWith('Fwd:')
      const newSubject = subjectHasPrefix ? originalEmail.subject : replyPrefix + originalEmail.subject
      const quotedBody = `\n\n-------- Original Message --------\nFrom: ${originalEmail.fromName || originalEmail.from}\nDate: ${originalEmail.date}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body || originalEmail.snippet}`
      if (mode === 'reply') setFormData({ to: originalEmail.from, cc: '', bcc: '', subject: newSubject, body: quotedBody })
      else if (mode === 'replyAll') {
        const allRecipients = [originalEmail.from]
        if (originalEmail.to) allRecipients.push(...originalEmail.to.split(',').map(e => e.trim()).filter(e => e))
        setFormData({ to: originalEmail.from, cc: allRecipients.slice(1).join(', '), bcc: '', subject: newSubject, body: quotedBody })
      } else if (mode === 'forward') setFormData({ to: '', cc: '', bcc: '', subject: newSubject, body: quotedBody })
    } else if (isOpen && mode === 'new') {
      setFormData({ to: initialData?.to || '', cc: initialData?.cc || '', bcc: initialData?.bcc || '', subject: initialData?.subject || '', body: initialData?.body || '' })
      setAttachments(initialAttachments || [])
      setError(null)
      return
    }
    setAttachments([])
    setError(null)
  }, [isOpen, mode, originalEmail, initialData, initialAttachments])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const newFiles = Array.from(files)
      setAttachments(prev => [...prev, ...newFiles])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  const handleRemoveAttachment = (index: number) => setAttachments(prev => prev.filter((_, i) => i !== index))
  const formatFileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

  const handleSend = async () => {
    if (!formData.to.trim()) { setError(t.gmail.errorNoRecipient); return }
    if (!formData.subject.trim()) { setError(t.gmail.errorNoSubject); return }
    setIsSending(true)
    setError(null)
    try {
      const result = await gmailService.sendEmail({ to: formData.to, subject: formData.subject, body: formData.body, cc: formData.cc || undefined, bcc: formData.bcc || undefined, attachments: attachments.length > 0 ? attachments : undefined, context: 'willow' })
      if (result.success) { onSendSuccess?.(); onClose() }
      else setError(result.error || t.gmail.sendFailed)
    } catch { setError(t.gmail.sendFailed) }
    finally { setIsSending(false) }
  }

  if (!isOpen) return null
  const getTitle = () => { switch (mode) { case 'reply': return t.gmail.reply; case 'replyAll': return t.gmail.replyAll; case 'forward': return t.gmail.forward; default: return t.gmail.newEmail } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 max-h-[90vh] flex flex-col overflow-hidden p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold">{getTitle()}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1 -mx-1">
          {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>}
          <div><label className="text-xs text-slate-500 mb-1 block">{t.gmail.to} *</label><input type="email" value={formData.to} onChange={(e) => setFormData({ ...formData, to: e.target.value })} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" placeholder="recipient@example.com" /></div>
          <div><label className="text-xs text-slate-500 mb-1 block">{t.gmail.cc}</label><input type="text" value={formData.cc} onChange={(e) => setFormData({ ...formData, cc: e.target.value })} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" placeholder="cc@example.com" /></div>
          <div><label className="text-xs text-slate-500 mb-1 block">{t.gmail.bcc}</label><input type="text" value={formData.bcc} onChange={(e) => setFormData({ ...formData, bcc: e.target.value })} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" placeholder="bcc@example.com" /></div>
          <div><label className="text-xs text-slate-500 mb-1 block">{t.gmail.subject} *</label><input type="text" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm" placeholder={t.gmail.subjectPlaceholder} /></div>
          <div><label className="text-xs text-slate-500 mb-1 block">{t.gmail.body}</label><textarea value={formData.body} onChange={(e) => setFormData({ ...formData, body: e.target.value })} className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm min-h-[200px] font-mono" placeholder={t.gmail.bodyPlaceholder} /></div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-xs text-slate-500">{t.gmail.attachments}</label><input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" id="tensw-compose-file-input" /><label htmlFor="tensw-compose-file-input" className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 cursor-pointer"><Plus className="h-4 w-4" />{t.gmail.addAttachment}</label></div>
            {attachments.length > 0 && <div className="space-y-2">{attachments.map((file, index) => (<div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700 px-3 py-2"><div className="flex items-center gap-2 min-w-0"><FileText className="h-4 w-4 text-slate-400 flex-shrink-0" /><span className="text-sm truncate">{file.name}</span><span className="text-xs text-muted-foreground flex-shrink-0">({formatFileSize(file.size)})</span></div><button onClick={() => handleRemoveAttachment(index)} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 flex-shrink-0"><X className="h-4 w-4 text-slate-500" /></button></div>))}</div>}
          </div>
        </div>
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600">{t.common.cancel}</button>
            <button onClick={handleSend} disabled={isSending} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t.gmail.send}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WillowManagementPage() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-mgmt-calendar-view')
      return (saved === 'week' || saved === 'month') ? saved : 'week'
    }
    return 'week'
  })
  const [studyPlanExpanded, setStudyPlanExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-mgmt-study-plan-expanded')
      return saved !== 'false'
    }
    return true
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const [clients, setClients] = useState<WillowMgmtClient[]>([])
  const [projects, setProjects] = useState<WillowMgmtProject[]>([])
  const [milestones, setMilestones] = useState<WillowMgmtMilestone[]>([])
  const [schedules, setSchedules] = useState<WillowMgmtSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedClient, setSelectedClient] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('willow-mgmt-selected-client')
    }
    return null
  })
  const [expandedProjects, setExpandedProjects] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-mgmt-expanded-projects')
      return saved ? JSON.parse(saved) : []
    }
    return []
  })
  const [milestonesWithSchedules, setMilestonesWithSchedules] = useState<Set<string>>(new Set())
  const [activeDragItem, setActiveDragItem] = useState<{ type: string; schedule: WillowMgmtSchedule; taskItem?: WillowMgmtTask } | null>(null)
  const [memos, setMemos] = useState<Map<string, WillowMgmtDailyMemo>>(new Map())
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
  const [scheduleViewMode, setScheduleViewMode] = useState<'read' | 'edit'>('edit')
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [addingMilestoneForProject, setAddingMilestoneForProject] = useState<string | null>(null)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<WillowMgmtSchedule | null>(null)
  const [editingProject, setEditingProject] = useState<WillowMgmtProject | null>(null)
  const [editingMilestone, setEditingMilestone] = useState<WillowMgmtMilestone | null>(null)
  const [editingClient, setEditingClient] = useState<WillowMgmtClient | null>(null)
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
  const [invoicesPerPage, setInvoicesPerPage] = useState(5)
  const [invoices, setInvoices] = useState<TenswInvoice[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [invoicePage, setInvoicePage] = useState(1)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<TenswInvoice | null>(null)
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<'all' | 'revenue' | 'expense' | 'asset' | 'liability'>('all')
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('')
  const [invoiceDateTo, setInvoiceDateTo] = useState('')
  const [invoiceViewMode, setInvoiceViewMode] = useState<'list' | 'summary'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-mgmt-invoice-view-mode')
      return (saved === 'list' || saved === 'summary') ? saved : 'list'
    }
    return 'list'
  })
  const [invoiceSummaryPeriod, setInvoiceSummaryPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [expandedSummaryPeriod, setExpandedSummaryPeriod] = useState<string | null>(null)
  const [summaryCounterpartyFilter, setSummaryCounterpartyFilter] = useState<string | null>(null)

  // Stock trade types
  interface StockTrade {
    id: string
    ticker: string
    company_name: string
    market: 'KR' | 'US'
    trade_date: string
    trade_type: 'buy' | 'sell'
    quantity: number
    price: number
    total_amount: number
    currency: 'KRW' | 'USD'
    broker: string | null
    memo: string | null
    created_at: string
  }

  // Stock trade states
  const [stockTrades, setStockTrades] = useState<StockTrade[]>([])
  const [isLoadingTrades, setIsLoadingTrades] = useState(true)
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<StockTrade | null>(null)
  const [isSavingTrade, setIsSavingTrade] = useState(false)
  const [tradeViewMode, setTradeViewMode] = useState<'list' | 'portfolio' | 'analysis'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-mgmt-trade-view-mode')
      return (saved === 'list' || saved === 'portfolio' || saved === 'analysis') ? saved as 'list' | 'portfolio' | 'analysis' : 'list'
    }
    return 'list'
  })
  const [tradeMarketFilter, setTradeMarketFilter] = useState<'all' | 'KR' | 'US'>('all')
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'all' | 'buy' | 'sell'>('all')
  const [portfolioMarketFilter, setPortfolioMarketFilter] = useState<'all' | 'KR' | 'US'>('all')
  const [portfolioCurrencyMode, setPortfolioCurrencyMode] = useState<'original' | 'KRW'>('original')
  const [tradePage, setTradePage] = useState(1)
  const [tradesPerPage, setTradesPerPage] = useState(5)

  // Stock trade form states
  const [tradeFormTicker, setTradeFormTicker] = useState('')
  const [tradeFormCompanyName, setTradeFormCompanyName] = useState('')
  const [tradeFormMarket, setTradeFormMarket] = useState<'KR' | 'US'>('KR')
  const [tradeFormDate, setTradeFormDate] = useState('')
  const [tradeFormType, setTradeFormType] = useState<'buy' | 'sell'>('buy')
  const [tradeFormQuantity, setTradeFormQuantity] = useState('')
  const [tradeFormPrice, setTradeFormPrice] = useState('')
  const [tradeFormBroker, setTradeFormBroker] = useState('토스증권')
  const [tradeFormMemo, setTradeFormMemo] = useState('')

  // Stock quote & theme states
  const [stockQuotes, setStockQuotes] = useState<Record<string, { price: number; change: number; changePercent: number; currency: string }>>({})
  const [stockThemes, setStockThemes] = useState<Record<string, { theme: string; parentTheme: string | null }[]>>({})
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false)
  const [usdKrwRate, setUsdKrwRate] = useState(1400) // fallback
  const [fxHistory, setFxHistory] = useState<Record<string, number>>({}) // date → KRW/USD rate
  const [stockHistory, setStockHistory] = useState<Record<string, { dates: string[]; prices: number[] }>>({})
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [trendViewMode, setTrendViewMode] = useState<'total' | 'group' | 'market'>('total')
  const [trendTooltipActive, setTrendTooltipActive] = useState(false)

  // Invoice form states (simplified)
  const [invoiceFormType, setInvoiceFormType] = useState<'revenue' | 'expense' | 'asset' | 'liability'>('revenue')
  const [invoiceFormCounterparty, setInvoiceFormCounterparty] = useState('')
  const [invoiceFormDescription, setInvoiceFormDescription] = useState('')
  const [invoiceFormAmount, setInvoiceFormAmount] = useState('')
  const [invoiceFormDate, setInvoiceFormDate] = useState('')  // 발행일 (선택)
  const [invoiceFormPaymentDate, setInvoiceFormPaymentDate] = useState('')  // 입금일/지급일 (선택)
  const [invoiceFormNotes, setInvoiceFormNotes] = useState('')
  const [invoiceFormAccountNumber, setInvoiceFormAccountNumber] = useState('')
  const [showAccountSuggestions, setShowAccountSuggestions] = useState(false)
  const [invoiceFormFiles, setInvoiceFormFiles] = useState<File[]>([])
  const [isUploadingInvoiceFiles, setIsUploadingInvoiceFiles] = useState(false)

  // Invoice status styles (UI guide pattern)
  const INVOICE_STATUS_STYLES = {
    pending: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', label: '미처리' },
    issued: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400', label: '발행됨' },
    completed: { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-400', label: '완료' },
  }

  // 인보이스 상태 자동 계산
  const getInvoiceStatus = (invoice: TenswInvoice): 'pending' | 'issued' | 'completed' => {
    // 입금일/지급일이 있으면 완료
    if (invoice.payment_date) return 'completed'
    // 매출/비용이고 발행일이 있으면 발행됨
    if ((invoice.type === 'revenue' || invoice.type === 'expense') && invoice.issue_date) return 'issued'
    // 그 외는 미처리
    return 'pending'
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
  const [wikiPerPage, setWikiPerPage] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('willow-wiki-per-page')
      return saved ? Number(saved) : 5
    }
    return 5
  })
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
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [viewingNote, setViewingNote] = useState<WikiNote | null>(null)

  // Stock research types & states
  interface StockResearch {
    id: string
    ticker: string
    company_name: string
    scan_date: string
    source: string
    market_cap_b: number | null
    current_price: number | null
    revenue_growth_yoy: string | null
    margin: string | null
    value_chain_position: string | null
    structural_thesis: string | null
    sector_tags: string[]
    high_12m: number | null
    gap_from_high_pct: number | null
    trend_verdict: string | null
    verdict: string | null
    fail_reason: string | null
    notes: string | null
    created_at: string
    updated_at: string
  }
  interface SmallcapScreening {
    id: string
    ticker: string
    company_name: string | null
    sector: string | null
    industry: string | null
    country: string | null
    scan_date: string
    market_cap_m: number | null
    price: number | null
    change_pct: number | null
    volume: number | null
    avg_volume: number | null
    pe: number | null
    forward_pe: number | null
    peg: number | null
    ps: number | null
    pb: number | null
    roe: number | null
    roa: number | null
    roi: number | null
    gross_margin: number | null
    operating_margin: number | null
    profit_margin: number | null
    current_ratio: number | null
    quick_ratio: number | null
    debt_to_equity: number | null
    perf_week: number | null
    perf_month: number | null
    perf_quarter: number | null
    perf_half: number | null
    perf_year: number | null
    perf_ytd: number | null
    insider_own_pct: number | null
    insider_trans_pct: number | null
    inst_own_pct: number | null
    inst_trans_pct: number | null
    short_float_pct: number | null
    insider_buys_3m: number
    insider_buy_value_3m: number
    reddit_mentions: number
    reddit_sentiment: number | null
    reddit_buzz_score: number | null
    growth_score: number | null
    value_score: number | null
    quality_score: number | null
    momentum_score: number | null
    insider_score: number | null
    sentiment_score: number | null
    composite_score: number | null
    rs_rank: number | null
    tier: 'A' | 'B' | 'C' | 'F'
    track: 'profitable' | 'hypergrowth' | null
    fail_reasons: string[] | null
  }
  const [stockResearch, setStockResearch] = useState<StockResearch[]>([])
  const [isLoadingResearch, setIsLoadingResearch] = useState(true)
  const [isResearchModalOpen, setIsResearchModalOpen] = useState(false)
  const [editingResearch, setEditingResearch] = useState<StockResearch | null>(null)
  const [isSavingResearch, setIsSavingResearch] = useState(false)
  const [researchVerdictFilter, setResearchVerdictFilter] = useState<'all' | 'pass' | 'fail' | 'smallcap'>('all')
  const [researchPage, setResearchPage] = useState(1)
  const [researchPerPage, setResearchPerPage] = useState(10)
  const [expandedResearch, setExpandedResearch] = useState<Set<string>>(new Set())

  // Smallcap screening states
  const [smallcapData, setSmallcapData] = useState<SmallcapScreening[]>([])
  const [smallcapSummary, setSmallcapSummary] = useState<{ total: number; byTier: { A: number; B: number; C: number; F: number }; byTrack: { profitable: number; hypergrowth: number }; scanDate: string | null } | null>(null)
  const [smallcapScanDates, setSmallcapScanDates] = useState<string[]>([])
  const [smallcapSelectedDate, setSmallcapSelectedDate] = useState<string>('')
  const [isLoadingSmallcap, setIsLoadingSmallcap] = useState(false)
  const [smallcapTierFilter, setSmallcapTierFilter] = useState<'all' | 'A' | 'B' | 'C' | 'F'>('all')
  const [smallcapTrackFilter, setSmallcapTrackFilter] = useState<'all' | 'profitable' | 'hypergrowth'>('all')
  const [smallcapPage, setSmallcapPage] = useState(1)
  const [smallcapPerPage, setSmallcapPerPage] = useState(10)
  const [expandedSmallcap, setExpandedSmallcap] = useState<Set<string>>(new Set())
  const [smallcapSortKey, setSmallcapSortKey] = useState<'composite_score' | 'market_cap_m' | 'change_pct' | 'insider_buys_3m' | 'reddit_mentions' | 'rs_rank'>('composite_score')
  const [smallcapSortAsc, setSmallcapSortAsc] = useState(false)

  // Research form states
  const [researchFormTicker, setResearchFormTicker] = useState('')
  const [researchFormCompanyName, setResearchFormCompanyName] = useState('')
  const [researchFormScanDate, setResearchFormScanDate] = useState('')
  const [researchFormSource, setResearchFormSource] = useState('manual')
  const [researchFormMarketCap, setResearchFormMarketCap] = useState('')
  const [researchFormCurrentPrice, setResearchFormCurrentPrice] = useState('')
  const [researchFormRevenueGrowth, setResearchFormRevenueGrowth] = useState('')
  const [researchFormMargin, setResearchFormMargin] = useState('')
  const [researchFormValueChain, setResearchFormValueChain] = useState('')
  const [researchFormThesis, setResearchFormThesis] = useState('')
  const [researchFormSectorTags, setResearchFormSectorTags] = useState('')
  const [researchFormHigh12m, setResearchFormHigh12m] = useState('')
  const [researchFormGapPct, setResearchFormGapPct] = useState('')
  const [researchFormTrendVerdict, setResearchFormTrendVerdict] = useState('')
  const [researchFormVerdict, setResearchFormVerdict] = useState<'pass_tier1' | 'pass_tier2' | 'fail'>('pass_tier1')
  const [researchFormFailReason, setResearchFormFailReason] = useState('')
  const [researchFormNotes, setResearchFormNotes] = useState('')

  // Real estate states
  const [researchSubTab, setResearchSubTab] = useState<'stock' | 'realestate'>('realestate')
  const [reComplexes, setReComplexes] = useState<{ id: string; name: string; district_name: string; dong_name: string | null; total_units: number | null; build_year: number | null; is_tracked: boolean }[]>([])
  const [reSummary, setReSummary] = useState<{ trackedComplexes: number; districtCount: number; avgTradePpp: number; avgJeonsePpp: number; tradeListingGap: number; jeonseListingGap: number; lastListingDate: string | null; lastTradeDate: string | null } | null>(null)
  const [reTrades, setReTrades] = useState<{ months: string[]; complexes: { name: string; data: { month: string; avgPpp: number | null; count: number }[] }[] } | null>(null)
  const [reRentals, setReRentals] = useState<{ months: string[]; complexes: { name: string; data: { month: string; avgPpp: number | null; count: number }[] }[] } | null>(null)
  const [reListingsTrade, setReListingsTrade] = useState<{ complexName: string; complexNo: string | null; areaBand: number; listingMinPpp: number | null; listingMaxPpp: number | null; listingCount: number; actualAvgPpp: number | null; actualCount: number; gap: number | null }[]>([])
  const [reListingsJeonse, setReListingsJeonse] = useState<{ complexName: string; complexNo: string | null; areaBand: number; listingMinPpp: number | null; listingMaxPpp: number | null; listingCount: number; actualAvgPpp: number | null; actualCount: number; gap: number | null }[]>([])
  const [reJeonseRatio, setReJeonseRatio] = useState<{ month: string; ratio: number | null }[]>([])
  const [reListingTrend, setReListingTrend] = useState<{ trend: { date: string; gapRate: number | null }[]; tradeType: string } | null>(null)
  const [reListingTrendJeonse, setReListingTrendJeonse] = useState<{ trend: { date: string; gapRate: number | null }[]; tradeType: string } | null>(null)
  const [reTradeListPage, setReTradeListPage] = useState(0)
  const [reJeonseListPage, setReJeonseListPage] = useState(0)
  const RE_LIST_PAGE_SIZE = 5
  type ReSortKey = 'complexName' | 'areaBand' | 'actualAvgPpp' | 'listingMinPpp' | 'listingMaxPpp' | 'gap' | 'listingCount'
  const [reTradeSortKey, setReTradeSortKey] = useState<ReSortKey>('gap')
  const [reTradeSortAsc, setReTradeSortAsc] = useState(true)
  const [reJeonseSortKey, setReJeonseSortKey] = useState<ReSortKey>('gap')
  const [reJeonseSortAsc, setReJeonseSortAsc] = useState(true)
  const [isLoadingRe, setIsLoadingRe] = useState(false)
  const [reDistrictFilter, setReDistrictFilter] = useState<string[]>(['강남구', '서초구', '송파구'])
  const [reComplexFilter, setReComplexFilter] = useState<string[]>([])
  const [reAreaFilter, setReAreaFilter] = useState<string>('30')
  const [rePeriodFilter, setRePeriodFilter] = useState<string>('12')

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
  const [gmailLabel, setGmailLabel] = useState('WILLOW')
  const [labelInput, setLabelInput] = useState('WILLOW')
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
  const [isAutoLabeling, setIsAutoLabeling] = useState(false)
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
    const res = await fetch('/api/willow-mgmt/clients')
    const data = await res.json()
    setClients(data)
  }, [])

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/willow-mgmt/projects')
    const data = await res.json()
    setProjects(data)
  }, [])

  const fetchMilestones = useCallback(async () => {
    const res = await fetch('/api/willow-mgmt/milestones')
    const data = await res.json()
    setMilestones(data)
  }, [])

  const fetchSchedules = useCallback(async () => {
    const { startDate, endDate } = getDateRange()
    const res = await fetch(`/api/willow-mgmt/schedules?startDate=${startDate}&endDate=${endDate}`)
    const data = await res.json()
    setSchedules(data)
  }, [currentDate, viewMode])

  // Fetch all milestone IDs that have schedules (for status restriction)
  const fetchMilestonesWithSchedules = useCallback(async () => {
    const res = await fetch('/api/willow-mgmt/schedules')
    const data: WillowMgmtSchedule[] = await res.json()
    const milestoneIds = new Set(
      data.filter((s) => s.milestone_id).map((s) => s.milestone_id!)
    )
    setMilestonesWithSchedules(milestoneIds)
  }, [])

  const fetchMemos = useCallback(async () => {
    try {
      const { startDate, endDate } = getDateRange()
      const res = await fetch(`/api/willow-mgmt/memos?startDate=${startDate}&endDate=${endDate}`)
      const data = await res.json()
      const memoMap = new Map<string, WillowMgmtDailyMemo>()
      if (Array.isArray(data)) {
        data.forEach((memo: WillowMgmtDailyMemo) => memoMap.set(memo.memo_date, memo))
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
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      // Extend range to cover prev/next month days shown in calendar grid
      const start = new Date(firstDay)
      start.setDate(start.getDate() - firstDay.getDay())
      const end = new Date(lastDay)
      const pad = 6 - lastDay.getDay()
      if (pad > 0) end.setDate(end.getDate() + pad)
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

  // Refresh data when agent makes mutations to relevant tables
  const refreshAllData = useCallback(() => {
    fetchClients(); fetchProjects(); fetchMilestones()
    fetchSchedules(); fetchMilestonesWithSchedules(); fetchMemos()
  }, [fetchClients, fetchProjects, fetchMilestones, fetchSchedules, fetchMilestonesWithSchedules, fetchMemos])
  useAgentRefresh(['willow_mgmt', 'work_wiki', 'financial', 'stock_research', 'stock_trades', 'smallcap_screening', 're_'], refreshAllData)

  // Save viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('willow-mgmt-calendar-view', viewMode)
  }, [viewMode])


  // Save expandedProjects to localStorage
  useEffect(() => {
    localStorage.setItem('willow-mgmt-expanded-projects', JSON.stringify(expandedProjects))
  }, [expandedProjects])

  // Save invoiceViewMode to localStorage
  useEffect(() => {
    localStorage.setItem('willow-mgmt-invoice-view-mode', invoiceViewMode)
  }, [invoiceViewMode])

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
    const days: Date[] = []
    // Previous month padding
    for (let i = firstDay.getDay() - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i))
    }
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(new Date(year, month, i))
    // Next month padding to complete last row
    const remaining = 7 - (days.length % 7)
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) days.push(new Date(year, month + 1, i))
    }
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
    schedule: WillowMgmtSchedule
    item?: WillowMgmtTask
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

    const overdueMilestones: WillowMgmtMilestone[] = []
    const upcomingByProject: Map<string, WillowMgmtMilestone[]> = new Map()

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
    const upcomingMilestones: WillowMgmtMilestone[] = []
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
  const openScheduleDialog = (date?: Date, schedule?: WillowMgmtSchedule) => {
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
    setScheduleViewMode(schedule ? 'read' : 'edit')
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
        await fetch('/api/willow-mgmt/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSchedule.id, ...payload }),
        })
        scheduleId = editingSchedule.id
      } else {
        const res = await fetch('/api/willow-mgmt/schedules', {
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
            await fetch(`/api/willow-mgmt/tasks?id=${existingId}`, { method: 'DELETE' })
          }
        }

        // Create or update items
        for (let i = 0; i < scheduleForm.tasks.length; i++) {
          const item = scheduleForm.tasks[i]
          if (item.id && existingIds.has(item.id)) {
            // Update existing
            await fetch('/api/willow-mgmt/tasks', {
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
            await fetch('/api/willow-mgmt/tasks', {
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
          await fetch(`/api/willow-mgmt/tasks?id=${item.id}`, { method: 'DELETE' })
        }
      }

      // Auto-update milestones to "in_progress" when schedule is created with milestone_ids
      if (milestoneIds.length > 0) {
        for (const cid of milestoneIds) {
          const milestone = milestones.find((c) => c.id === cid)
          if (milestone && milestone.status === 'pending') {
            await fetch('/api/willow-mgmt/milestones', {
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

  const toggleScheduleComplete = async (schedule: WillowMgmtSchedule, date?: string) => {
    const toggleId = date ? `${schedule.id}-${date}` : schedule.id
    if (togglingIds.has(toggleId)) return
    setTogglingIds(prev => new Set(prev).add(toggleId))
    try {
      // 여러 날짜에 걸친 일정이고 특정 날짜가 지정된 경우
      if (schedule.end_date && date) {
        await fetch('/api/willow-mgmt/schedules/toggle-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schedule_id: schedule.id, date }),
        })
      } else {
        // 단일 날짜 일정이거나 전체 토글
        await fetch('/api/willow-mgmt/schedules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: schedule.id, is_completed: !schedule.is_completed }),
        })
      }
      await fetchSchedules()
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(toggleId)
        return next
      })
    }
  }

  const toggleTaskComplete = async (schedule: WillowMgmtSchedule) => {
    const hwId = `hw-${schedule.id}`
    if (togglingIds.has(hwId)) return
    setTogglingIds(prev => new Set(prev).add(hwId))
    try {
      await fetch('/api/willow-mgmt/schedules', {
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

  const toggleTaskItemComplete = async (item: WillowMgmtTask) => {
    const hwItemId = `hwi-${item.id}`
    if (togglingIds.has(hwItemId)) return
    setTogglingIds(prev => new Set(prev).add(hwItemId))
    try {
      await fetch('/api/willow-mgmt/tasks', {
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
    await fetch(`/api/willow-mgmt/schedules?id=${id}`, { method: 'DELETE' })
    await Promise.all([fetchSchedules(), fetchMilestonesWithSchedules()])
  }

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; schedule?: WillowMgmtSchedule; taskItem?: WillowMgmtTask } | undefined
    if (data?.schedule) {
      setActiveDragItem({ type: data.type, schedule: data.schedule, taskItem: data.taskItem })
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragItem(null)

    if (!over) return

    const dragData = active.data.current as { type: string; schedule?: WillowMgmtSchedule; taskItem?: WillowMgmtTask } | undefined
    const dropData = over.data.current as { dateStr: string } | undefined

    if (!dropData?.dateStr || !dragData) return

    const newDate = dropData.dateStr

    if (dragData.type === 'schedule' || dragData.type === 'task-schedule') {
      const schedule = dragData.schedule
      if (!schedule || schedule.schedule_date === newDate) return

      const updateData: Record<string, string> = { id: schedule.id, schedule_date: newDate }

      // For multi-day events, shift end_date by the same delta
      if (schedule.end_date) {
        const startMs = new Date(schedule.schedule_date + 'T00:00:00').getTime()
        const endMs = new Date(schedule.end_date + 'T00:00:00').getTime()
        const newEndDate = new Date(new Date(newDate + 'T00:00:00').getTime() + (endMs - startMs))
        updateData.end_date = formatDateLocal(newEndDate)
      }

      await fetch('/api/willow-mgmt/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })
      fetchSchedules()
    } else if (dragData.type === 'task-item') {
      const taskItem = dragData.taskItem
      if (!taskItem || taskItem.deadline === newDate) return

      await fetch('/api/willow-mgmt/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskItem.id, deadline: newDate }),
      })
      fetchSchedules()
    } else if (dragData.type === 'task-legacy') {
      const schedule = dragData.schedule
      if (!schedule || schedule.task_deadline === newDate) return

      await fetch('/api/willow-mgmt/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: schedule.id, task_deadline: newDate }),
      })
      fetchSchedules()
    }
  }

  // Project CRUD
  const openProjectDialog = (project?: WillowMgmtProject) => {
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
        await fetch('/api/willow-mgmt/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingProject.id, ...projectForm }),
        })
      } else {
        await fetch('/api/willow-mgmt/projects', {
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
    await fetch(`/api/willow-mgmt/projects?id=${id}`, { method: 'DELETE' })
    fetchProjects()
    fetchMilestones()
  }

  // Milestone CRUD
  const openMilestoneDialog = (projectId: string, milestone?: WillowMgmtMilestone) => {
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
        const res = await fetch('/api/willow-mgmt/milestones', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingMilestone.id, ...payload }),
        })
        if (!res.ok) throw new Error('Failed to update milestone')
      } else {
        const res = await fetch('/api/willow-mgmt/milestones', {
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

  const toggleMilestoneStatus = async (milestone: WillowMgmtMilestone) => {
    const milestoneId = `milestone-${milestone.id}`
    if (togglingIds.has(milestoneId)) return

    const hasSchedules = milestonesWithSchedules.has(milestone.id)

    // Determine next status based on whether milestone has schedules
    // Flow: pending → in_progress → completed
    let nextStatus: 'pending' | 'in_progress' | 'completed'
    if (hasSchedules) {
      // If has schedules: in_progress → completed → in_progress
      if (milestone.status === 'in_progress') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'in_progress'
      }
    } else {
      // If no schedules: pending → in_progress → completed → pending
      if (milestone.status === 'pending') {
        nextStatus = 'in_progress'
      } else if (milestone.status === 'in_progress') {
        nextStatus = 'completed'
      } else {
        nextStatus = 'pending'
      }
    }

    setTogglingIds(prev => new Set(prev).add(milestoneId))
    try {
      const completed_at = nextStatus === 'completed' ? new Date().toISOString() : null

      await fetch('/api/willow-mgmt/milestones', {
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

  const toggleReviewCompleted = async (milestone: WillowMgmtMilestone) => {
    const reviewId = `review-${milestone.id}`
    if (togglingIds.has(reviewId)) return

    setTogglingIds(prev => new Set(prev).add(reviewId))
    try {
      await fetch('/api/willow-mgmt/milestones', {
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
    await fetch(`/api/willow-mgmt/milestones?id=${id}`, { method: 'DELETE' })
    fetchMilestones()
  }

  // Client CRUD
  const openClientDialog = (client?: WillowMgmtClient) => {
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
        await fetch('/api/willow-mgmt/clients', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingClient.id, ...clientForm }),
        })
        // 수정 후 목록 화면으로 돌아가기
        setEditingClient(null)
        setClientForm({ name: '', color: '#6366f1' })
      } else {
        await fetch('/api/willow-mgmt/clients', {
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
    await fetch(`/api/willow-mgmt/clients?id=${id}`, { method: 'DELETE' })
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
      await fetch(`/api/willow-mgmt/memos?date=${editingMemoDate}`, { method: 'DELETE' })
    } else {
      await fetch('/api/willow-mgmt/memos', {
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
      // Always fetch all invoices (filter on client side for list view)
      const res = await fetch('/api/willow-mgmt/invoices')
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
      }
    } catch (error) {
      console.error('Failed to load invoices:', error)
    } finally {
      setIsLoadingInvoices(false)
    }
  }, [])

  const resetInvoiceForm = () => {
    setInvoiceFormType('revenue')
    setInvoiceFormCounterparty('')
    setInvoiceFormDescription('')
    setInvoiceFormAmount('')
    setInvoiceFormDate('')  // 발행일 (선택)
    setInvoiceFormPaymentDate('')  // 입금일/지급일 (선택)
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
    setInvoiceFormAmount(invoice.amount.toLocaleString())
    setInvoiceFormDate(invoice.issue_date || '')
    setInvoiceFormPaymentDate(invoice.payment_date || '')
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
    const amount = parseInt(invoiceFormAmount.replace(/,/g, ''), 10)
    if (isNaN(amount) || amount === 0) {
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
        issue_date: invoiceFormDate || null,  // 발행일 (선택)
        payment_date: invoiceFormPaymentDate || null,  // 입금일/지급일 (선택)
        status: editingInvoice?.status || 'issued',
        attachments,
        notes: invoiceFormNotes.trim() || null,
        account_number: invoiceFormAccountNumber.trim() || null,
      }

      const res = await fetch('/api/willow-mgmt/invoices', {
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

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/willow-mgmt/invoices?id=${invoiceId}`, { method: 'DELETE' })
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

  // ====== Stock Trade Functions ======
  const loadStockQuotes = useCallback(async (trades: StockTrade[]) => {
    // Get unique tickers with their markets
    const tickerMap = new Map<string, string>()
    for (const t of trades) {
      if (!tickerMap.has(t.ticker)) tickerMap.set(t.ticker, t.market)
    }
    if (tickerMap.size === 0) return

    const tickers = Array.from(tickerMap.keys())
    const markets = tickers.map(t => tickerMap.get(t)!)

    setIsLoadingQuotes(true)
    try {
      // Fetch stock quotes, current USD/KRW rate, and FX history in parallel
      const [res, fxRes, fxHistRes] = await Promise.all([
        fetch(`/api/willow-mgmt/stock-quotes?tickers=${tickers.join(',')}&markets=${markets.join(',')}`),
        fetch('/api/willow-mgmt/stock-quotes?tickers=KRW%3DX&markets=US'),
        fetch('/api/willow-mgmt/fx-history'),
      ])
      if (res.ok) {
        const data = await res.json()
        setStockQuotes(data.prices || {})
        setStockThemes(data.themes || {})
      }
      if (fxRes.ok) {
        const fxData = await fxRes.json()
        const krwRate = fxData.prices?.['KRW=X']?.price
        if (krwRate && krwRate > 0) setUsdKrwRate(krwRate)
      }
      if (fxHistRes.ok) {
        const histData = await fxHistRes.json()
        if (histData.rates) setFxHistory(histData.rates)
      }
    } catch (error) {
      console.error('Failed to load stock quotes:', error)
    } finally {
      setIsLoadingQuotes(false)
    }
  }, [])

  const loadStockHistory = useCallback(async (trades: StockTrade[]) => {
    const tickerMap = new Map<string, string>()
    for (const t of trades) {
      if (!tickerMap.has(t.ticker)) tickerMap.set(t.ticker, t.market)
    }
    if (tickerMap.size === 0) return
    const tickers = Array.from(tickerMap.keys())
    const markets = tickers.map(t => tickerMap.get(t)!)
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/willow-mgmt/stock-history?tickers=${tickers.join(',')}&markets=${markets.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setStockHistory(data.history || {})
      }
    } catch (error) {
      console.error('Failed to load stock history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  const loadStockTrades = useCallback(async () => {
    setIsLoadingTrades(true)
    try {
      const res = await fetch('/api/willow-mgmt/stock-trades')
      if (res.ok) {
        const data = await res.json()
        const trades = data.trades || []
        setStockTrades(trades)
        loadStockQuotes(trades)
        loadStockHistory(trades)
      }
    } catch (error) {
      console.error('Failed to load stock trades:', error)
    } finally {
      setIsLoadingTrades(false)
    }
  }, [loadStockQuotes, loadStockHistory])

  const resetTradeForm = () => {
    setTradeFormTicker('')
    setTradeFormCompanyName('')
    setTradeFormMarket('KR')
    setTradeFormDate('')
    setTradeFormType('buy')
    setTradeFormQuantity('')
    setTradeFormPrice('')
    setTradeFormBroker('토스증권')
    setTradeFormMemo('')
    setEditingTrade(null)
  }

  const openNewTradeModal = () => {
    resetTradeForm()
    setIsTradeModalOpen(true)
  }

  const openEditTradeModal = (trade: StockTrade) => {
    setEditingTrade(trade)
    setTradeFormTicker(trade.ticker)
    setTradeFormCompanyName(trade.company_name)
    setTradeFormMarket(trade.market)
    setTradeFormDate(trade.trade_date)
    setTradeFormType(trade.trade_type)
    setTradeFormQuantity(trade.quantity.toLocaleString())
    setTradeFormPrice(trade.price.toLocaleString())
    setTradeFormBroker(trade.broker || '토스증권')
    setTradeFormMemo(trade.memo || '')
    setIsTradeModalOpen(true)
  }

  // Calculate annualized IRR using Newton-Raphson
  const calculateIRR = useCallback((cashFlows: { date: string; amount: number }[]): number | null => {
    if (cashFlows.length < 2) return null
    const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date))
    const t0 = new Date(sorted[0].date).getTime()
    const ms365 = 365.25 * 24 * 60 * 60 * 1000
    const data = sorted.map(cf => ({
      years: (new Date(cf.date).getTime() - t0) / ms365,
      amount: cf.amount,
    }))
    const npv = (r: number) => data.reduce((sum, d) => sum + d.amount / Math.pow(1 + r, d.years), 0)
    const dnpv = (r: number) => data.reduce((sum, d) => sum + (-d.years * d.amount) / Math.pow(1 + r, d.years + 1), 0)
    let rate = 0.1
    for (let i = 0; i < 100; i++) {
      const f = npv(rate)
      const df = dnpv(rate)
      if (Math.abs(df) < 1e-10) break
      const next = rate - f / df
      if (Math.abs(next - rate) < 1e-8) { rate = next; break }
      rate = next
      if (rate < -0.99 || rate > 100) return null
    }
    return Math.abs(npv(rate)) < 1 ? rate : null
  }, [])

  const formatAmount = (amount: number, currency: 'KRW' | 'USD') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    }
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
  }

  // 각 시장의 로컬 시간 기준으로 "오늘"/"어제" 판단
  // 개장시각 ~ 자정: "오늘", 자정 ~ 개장전: "어제"
  const getDailyLabel = (market: 'KR' | 'US') => {
    const now = new Date()
    let targetDate: Date
    if (market === 'KR') {
      const kstHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }))
      const kstStr = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' })
      targetDate = new Date(kstStr)
      if (kstHour < 9) targetDate.setDate(targetDate.getDate() - 1)
    } else {
      const etHour = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))
      const etMin = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }))
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
      targetDate = new Date(etStr)
      if (!(etHour > 9 || (etHour === 9 && etMin >= 30))) targetDate.setDate(targetDate.getDate() - 1)
    }
    return `${targetDate.getMonth() + 1}/${targetDate.getDate()}`
  }

  const handleSaveTrade = async () => {
    if (!tradeFormTicker.trim() || !tradeFormCompanyName.trim() || !tradeFormDate) {
      alert('종목코드, 종목명, 거래일을 입력해주세요.')
      return
    }
    const quantity = parseInt(tradeFormQuantity.replace(/,/g, ''), 10)
    const price = parseFloat(tradeFormPrice.replace(/,/g, ''))
    if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
      alert('수량과 단가를 올바르게 입력해주세요.')
      return
    }

    setIsSavingTrade(true)
    try {
      const currency = tradeFormMarket === 'US' ? 'USD' : 'KRW'
      const payload = {
        id: editingTrade?.id,
        ticker: tradeFormTicker.trim().toUpperCase(),
        company_name: tradeFormCompanyName.trim(),
        market: tradeFormMarket,
        trade_date: tradeFormDate,
        trade_type: tradeFormType,
        quantity,
        price,
        total_amount: quantity * price,
        currency,
        broker: tradeFormBroker.trim() || '토스증권',
        memo: tradeFormMemo.trim() || null,
      }

      const res = await fetch('/api/willow-mgmt/stock-trades', {
        method: editingTrade ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsTradeModalOpen(false)
        resetTradeForm()
        await loadStockTrades()
      } else {
        alert('저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to save trade:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setIsSavingTrade(false)
    }
  }

  // ====== Stock Research Functions ======
  const loadStockResearch = useCallback(async () => {
    setIsLoadingResearch(true)
    try {
      const res = await fetch('/api/willow-mgmt/stock-research')
      if (res.ok) {
        const data = await res.json()
        setStockResearch(data.items || [])
      }
    } catch (error) {
      console.error('Failed to load stock research:', error)
    } finally {
      setIsLoadingResearch(false)
    }
  }, [])

  // ====== Smallcap Screening Functions ======
  const loadSmallcapScreening = useCallback(async (scanDate?: string) => {
    setIsLoadingSmallcap(true)
    try {
      const params = new URLSearchParams()
      if (scanDate) params.set('scan_date', scanDate)
      const res = await fetch(`/api/willow-mgmt/smallcap-screening?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSmallcapData(data.items || [])
        setSmallcapSummary(data.summary || null)
        setSmallcapScanDates(data.scanDates || [])
        if (!scanDate && data.summary?.scanDate) {
          setSmallcapSelectedDate(data.summary.scanDate)
        }
      }
    } catch (error) {
      console.error('Failed to load smallcap screening:', error)
    } finally {
      setIsLoadingSmallcap(false)
    }
  }, [])

  const loadRealEstateData = useCallback(async (districts: string[], complexIds: string[], area: string, period: string) => {
    setIsLoadingRe(true)
    try {
      const params = new URLSearchParams()
      if (districts.length > 0) params.set('districts', districts.join(','))
      if (complexIds.length > 0) params.set('complexIds', complexIds.join(','))
      if (area) params.set('areaRange', area)
      params.set('period', period)

      const base = '/api/willow-mgmt/real-estate'
      const [summaryRes, complexesRes, tradesRes, rentalsRes, listingsTradeRes, listingsJeonseRes, jeonseRatioRes, listingTrendRes, listingTrendJeonseRes] = await Promise.all([
        fetch(`${base}?type=summary&${params}`),
        fetch(`${base}?type=complexes&${params}`),
        fetch(`${base}?type=trades&${params}`),
        fetch(`${base}?type=rentals&${params}`),
        fetch(`${base}?type=listings&tradeType=매매&${params}`),
        fetch(`${base}?type=listings&tradeType=전세&${params}`),
        fetch(`${base}?type=jeonse-ratio&${params}`),
        fetch(`${base}?type=listing-trend&tradeType=매매&${params}`),
        fetch(`${base}?type=listing-trend&tradeType=전세&${params}`),
      ])

      if (summaryRes.ok) { const d = await summaryRes.json(); setReSummary(d.summary) }
      if (complexesRes.ok) { const d = await complexesRes.json(); setReComplexes(d.complexes || []) }
      if (tradesRes.ok) { const d = await tradesRes.json(); setReTrades(d) }
      if (rentalsRes.ok) { const d = await rentalsRes.json(); setReRentals(d) }
      if (listingsTradeRes.ok) { const d = await listingsTradeRes.json(); setReListingsTrade(d.listings || []) }
      if (listingsJeonseRes.ok) { const d = await listingsJeonseRes.json(); setReListingsJeonse(d.listings || []) }
      if (jeonseRatioRes.ok) { const d = await jeonseRatioRes.json(); setReJeonseRatio(d.trend || []) }
      if (listingTrendRes.ok) { const d = await listingTrendRes.json(); setReListingTrend(d) }
      if (listingTrendJeonseRes.ok) { const d = await listingTrendJeonseRes.json(); setReListingTrendJeonse(d) }
    } catch (error) {
      console.error('Failed to load real estate data:', error)
    } finally {
      setIsLoadingRe(false)
    }
  }, [])

  const resetResearchForm = () => {
    setResearchFormTicker('')
    setResearchFormCompanyName('')
    setResearchFormScanDate('')
    setResearchFormSource('manual')
    setResearchFormMarketCap('')
    setResearchFormCurrentPrice('')
    setResearchFormRevenueGrowth('')
    setResearchFormMargin('')
    setResearchFormValueChain('')
    setResearchFormThesis('')
    setResearchFormSectorTags('')
    setResearchFormHigh12m('')
    setResearchFormGapPct('')
    setResearchFormTrendVerdict('')
    setResearchFormVerdict('pass_tier1')
    setResearchFormFailReason('')
    setResearchFormNotes('')
    setEditingResearch(null)
  }

  const openNewResearchModal = () => {
    resetResearchForm()
    setIsResearchModalOpen(true)
  }

  const openEditResearchModal = (r: StockResearch) => {
    setEditingResearch(r)
    setResearchFormTicker(r.ticker)
    setResearchFormCompanyName(r.company_name)
    setResearchFormScanDate(r.scan_date)
    setResearchFormSource(r.source)
    setResearchFormMarketCap(r.market_cap_b?.toString() || '')
    setResearchFormCurrentPrice(r.current_price?.toString() || '')
    setResearchFormRevenueGrowth(r.revenue_growth_yoy || '')
    setResearchFormMargin(r.margin || '')
    setResearchFormValueChain(r.value_chain_position || '')
    setResearchFormThesis(r.structural_thesis || '')
    setResearchFormSectorTags((r.sector_tags || []).join(', '))
    setResearchFormHigh12m(r.high_12m?.toString() || '')
    setResearchFormGapPct(r.gap_from_high_pct?.toString() || '')
    setResearchFormTrendVerdict(r.trend_verdict || '')
    setResearchFormVerdict((r.verdict as 'pass_tier1' | 'pass_tier2' | 'fail') || 'pass_tier1')
    setResearchFormFailReason(r.fail_reason || '')
    setResearchFormNotes(r.notes || '')
    setIsResearchModalOpen(true)
  }

  const handleSaveResearch = async () => {
    if (!researchFormTicker.trim() || !researchFormCompanyName.trim()) {
      alert('종목코드와 종목명을 입력해주세요.')
      return
    }

    setIsSavingResearch(true)
    try {
      const payload = {
        id: editingResearch?.id,
        ticker: researchFormTicker.trim().toUpperCase(),
        company_name: researchFormCompanyName.trim(),
        scan_date: researchFormScanDate || new Date().toISOString().split('T')[0],
        source: researchFormSource || 'manual',
        market_cap_b: researchFormMarketCap ? parseFloat(researchFormMarketCap) : null,
        current_price: researchFormCurrentPrice ? parseFloat(researchFormCurrentPrice) : null,
        revenue_growth_yoy: researchFormRevenueGrowth || null,
        margin: researchFormMargin || null,
        value_chain_position: researchFormValueChain || null,
        structural_thesis: researchFormThesis || null,
        sector_tags: researchFormSectorTags ? researchFormSectorTags.split(',').map(s => s.trim()).filter(Boolean) : [],
        high_12m: researchFormHigh12m ? parseFloat(researchFormHigh12m) : null,
        gap_from_high_pct: researchFormGapPct ? parseFloat(researchFormGapPct) : null,
        trend_verdict: researchFormTrendVerdict || null,
        verdict: researchFormVerdict,
        fail_reason: researchFormFailReason || null,
        notes: researchFormNotes || null,
      }

      const res = await fetch('/api/willow-mgmt/stock-research', {
        method: editingResearch ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsResearchModalOpen(false)
        resetResearchForm()
        await loadStockResearch()
      } else {
        alert('저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Failed to save research:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setIsSavingResearch(false)
    }
  }

  // ====== Wiki Functions ======
  const loadWikiNotes = useCallback(async () => {
    setIsLoadingWiki(true)
    try {
      const res = await fetch('/api/wiki?section=willow-mgmt')
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
    // 제목, 내용, 파일 중 하나만 있어도 저장 가능
    if (!newNoteTitle.trim() && !newNoteContent.trim() && newNoteFiles.length === 0) return

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

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}))
          alert(`파일 업로드 실패: ${errorData.error || uploadRes.statusText}`)
          return
        }
        const uploadData = await uploadRes.json()
        attachments = uploadData.files
      }

      const res = await fetch('/api/wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'willow-mgmt',
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
          attachments,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        alert(`메모 저장 실패: ${errorData.error || res.statusText}`)
        return
      }

      setNewNoteTitle('')
      setNewNoteContent('')
      setNewNoteFiles([])
      setIsAddingNote(false)
      await loadWikiNotes()
    } catch (error) {
      console.error('Failed to add wiki note:', error)
      alert(`저장 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleUpdateNote = async () => {
    if (!editingNote) return
    // 제목, 내용 중 하나만 있어도 수정 가능
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return

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

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}))
          alert(`파일 업로드 실패: ${errorData.error || uploadRes.statusText}`)
          return
        }
        const uploadData = await uploadRes.json()
        attachments = [...(attachments || []), ...uploadData.files]
      }

      const res = await fetch(`/api/wiki/${editingNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
          attachments,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        alert(`메모 수정 실패: ${errorData.error || res.statusText}`)
        return
      }

      setNewNoteTitle('')
      setNewNoteContent('')
      setNewNoteFiles([])
      setEditingNote(null)
      await loadWikiNotes()
    } catch (error) {
      console.error('Failed to update wiki note:', error)
      alert(`수정 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/wiki/${noteId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to delete wiki note:', error)
    }
  }

  const handleTogglePin = async (note: WikiNote) => {
    try {
      const res = await fetch(`/api/wiki/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !note.is_pinned }),
      })
      if (res.ok) {
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    }
  }

  const startEditNote = (note: WikiNote) => {
    setEditingNote(note)
    setNewNoteTitle(note.title)
    setNewNoteContent(note.content || '')
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

  const totalWikiPages = Math.ceil(filteredWikiNotes.length / wikiPerPage)
  const paginatedWikiNotes = filteredWikiNotes.slice(
    (wikiPage - 1) * wikiPerPage,
    wikiPage * wikiPerPage
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
      const res = await fetch(`/api/gmail/status?context=willow`)
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
      const res = await fetch(`/api/gmail/emails?context=willow&label=${gmailLabel}`)
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
      const res = await fetch(`/api/gmail/auth?context=willow`)
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
      await fetch(`/api/gmail/disconnect?context=willow`, { method: 'POST' })
      setSyncStatus({ lastSyncAt: null, totalEmails: 0, newEmailsCount: 0, isConnected: false })
      setEmails([])
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error)
    }
  }

  const handleLabelSave = () => {
    setGmailLabel(labelInput)
    localStorage.setItem('willow-mgmt-gmail-label', labelInput)
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

  const handleAutoLabel = async () => {
    if (!syncStatus.isConnected || isAutoLabeling) return
    setIsAutoLabeling(true)
    try {
      const gmailContext = gmailLabel === 'TENSW' ? 'tensoftworks' : 'default'
      const res = await fetch(`/api/gmail/auto-label?context=${gmailContext}&range=1d`, { method: 'POST' })
      const data = await res.json()
      if (data.labeled > 0) {
        alert(`${data.labeled}건 라벨 적용 완료`)
      } else {
        alert('분류할 이메일이 없습니다')
      }
    } catch {
      alert('자동 라벨 분류 실패')
    } finally {
      setIsAutoLabeling(false)
    }
  }

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

  const availableCategories = Array.from(new Set(emails.map(e => e.category).filter((c): c is string => Boolean(c)))).sort((a, b) => a.localeCompare(b, 'ko'))

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

  // Gmail OAuth callback 결과 처리
  const searchParams = useSearchParams()
  const [gmailMessage, setGmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const gmailError = searchParams.get('gmail_error')
    const gmailConnected = searchParams.get('gmail_connected')
    const details = searchParams.get('details')

    if (gmailError) {
      const errorMessages: Record<string, string> = {
        no_code: 'OAuth 인증 코드를 받지 못했습니다',
        no_access_token: 'Access token을 받지 못했습니다',
        token_exchange_failed: '토큰 교환에 실패했습니다',
        save_failed: '토큰 저장에 실패했습니다',
        no_user_session: '로그인 세션이 만료되었습니다. 다시 로그인해주세요',
        access_denied: '사용자가 권한을 거부했습니다',
      }
      const message = errorMessages[gmailError] || `Gmail 연결 오류: ${gmailError}`
      setGmailMessage({ type: 'error', text: details ? `${message} (${details})` : message })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (gmailConnected) {
      setGmailMessage({ type: 'success', text: 'Gmail이 성공적으로 연결되었습니다' })
      window.history.replaceState({}, '', window.location.pathname)
      setTimeout(() => setGmailMessage(null), 5000)
    }
  }, [searchParams])

  // Load Invoice, Wiki, Stock Trades, Research, and Gmail data
  useEffect(() => {
    loadInvoices()
    loadWikiNotes()
    loadStockTrades()
    loadStockResearch()
  }, [loadInvoices, loadWikiNotes, loadStockTrades, loadStockResearch])

  // Load real estate data when sub-tab is selected or filters change
  useEffect(() => {
    if (researchSubTab === 'realestate') {
      loadRealEstateData(reDistrictFilter, reComplexFilter, reAreaFilter, rePeriodFilter)
    }
  }, [researchSubTab, reDistrictFilter, reComplexFilter, reAreaFilter, rePeriodFilter, loadRealEstateData])

  // Load smallcap screening data on mount (for investment kanban)
  useEffect(() => {
    if (smallcapData.length === 0) {
      loadSmallcapScreening()
    }
  }, [smallcapData.length, loadSmallcapScreening])

  // Auto-refresh stock quotes every 5 minutes
  useEffect(() => {
    if (stockTrades.length === 0) return
    const interval = setInterval(() => {
      loadStockQuotes(stockTrades)
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [stockTrades, loadStockQuotes])

  // Persist trade view mode
  useEffect(() => {
    localStorage.setItem('willow-mgmt-trade-view-mode', tradeViewMode)
  }, [tradeViewMode])

  useEffect(() => {
    const savedLabel = localStorage.getItem('willow-mgmt-gmail-label')
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


  const getMilestonesForProject = (projectId: string) =>
    milestones
      .filter((c) => c.project_id === projectId)
      .sort((a, b) => {
        // 1. 상태순: in_progress > pending > completed
        const statusOrder: Record<string, number> = { in_progress: 0, pending: 1, review_pending: 1, completed: 2 }
        const statusDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1)
        if (statusDiff !== 0) return statusDiff
        // 2. 마감일 가까운 순 (null은 맨 뒤로)
        if (!a.target_date && !b.target_date) return 0
        if (!a.target_date) return 1
        if (!b.target_date) return -1
        return a.target_date.localeCompare(b.target_date)
      })

  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  if (loading) {
    return <WillowManagementPageSkeleton />
  }

  return (
    <ProtectedPage pagePath="/willow-investment/management">
      <div className="space-y-6">
      {/* Row 1 - Schedule (full width) */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    일정
                  </CardTitle>
                  <CardDescription>프로젝트 및 기타 업무 일정 관리</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      viewMode === 'week'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                    onClick={() => setViewMode('week')}
                  >
                    주간
                  </button>
                  <button
                    className={cn(
                      'px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      viewMode === 'month'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                    onClick={() => setViewMode('month')}
                  >
                    월간
                  </button>
                  <button
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-transparent bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
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
                      const groupByProject = (milestoneList: WillowMgmtMilestone[]) => {
                        const grouped: Map<string, { project: WillowMgmtProject | undefined; milestones: WillowMgmtMilestone[] }> = new Map()
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
                              localStorage.setItem('willow-mgmt-study-plan-expanded', String(newValue))
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
                                      <span className="text-red-500 dark:text-red-400 text-[11px] font-medium">D+{daysOverdue}</span>
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
                                        'text-[11px] font-medium',
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
                              'mb-1 p-1 rounded text-[11px] cursor-pointer transition-colors',
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
                          {/* Task deadline items - displayed first (draggable) */}
                          {getTaskForDate(day).map((hw, hwIdx) => {
                            const isCompleted = hw.isLegacy ? hw.schedule.task_completed : hw.item?.is_completed
                            const toggleId = hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}`
                            const content = hw.isLegacy ? hw.schedule.task_content : hw.item?.content
                            const dragId = hw.isLegacy ? `task-legacy-${hw.schedule.id}` : `task-item-${hw.item?.id}`
                            return (
                              <DraggableItem
                                key={hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}-${hwIdx}`}
                                id={dragId}
                                data={hw.isLegacy
                                  ? { type: 'task-legacy', schedule: hw.schedule }
                                  : { type: 'task-item', schedule: hw.schedule, taskItem: hw.item }
                                }
                                className={cn(
                                  'text-xs p-1.5 rounded border-l-2 border-orange-500',
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
                                    onPointerDown={(e) => e.stopPropagation()}
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
                                      <div className="text-muted-foreground mt-0.5 text-[11px] line-clamp-2">
                                        {content}
                                      </div>
                                    )}
                                  </span>
                                </div>
                              </DraggableItem>
                            )
                          })}
                          {/* Task type schedules - displayed with orange style (draggable) */}
                          {getTaskTypeSchedulesForDate(day).map((schedule) => (
                            <DraggableItem
                              key={schedule.id}
                              id={`task-schedule-${schedule.id}`}
                              data={{ type: 'task-schedule', schedule }}
                              className={cn(
                                'text-xs p-1.5 rounded border-l-2 border-orange-500',
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
                                  onPointerDown={(e) => e.stopPropagation()}
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
                                    <div className="text-muted-foreground mt-0.5 text-[11px] line-clamp-2">
                                      {schedule.description}
                                    </div>
                                  )}
                                </span>
                              </div>
                            </DraggableItem>
                          ))}
                          {getSchedulesForDate(day).map((schedule) => {
                            const dateStr = formatDate(day)
                            return (
                              <DraggableScheduleCard
                                key={`${schedule.id}-${dateStr}`}
                                schedule={schedule}
                                currentDate={dateStr}
                                onToggleComplete={() => toggleScheduleComplete(schedule, dateStr)}
                                onEdit={() => openScheduleDialog(undefined, schedule)}
                                isToggling={togglingIds.has(`${schedule.id}-${dateStr}`) || togglingIds.has(schedule.id)}
                              />
                            )
                          })}
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
                        const isOtherMonth = day.getMonth() !== currentDate.getMonth()
                        const memo = getMemoForDate(day)
                        return (
                          <DroppableMonthDay
                            key={idx}
                            day={day}
                            isToday={day.toDateString() === new Date().toDateString()}
                            isOtherMonth={isOtherMonth}
                            onClick={() => openScheduleDialog(day)}
                          >
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
                                  {/* Task deadline items - displayed first (draggable) */}
                                  {getTaskForDate(day).map((hw, hwIdx) => {
                                    const isCompleted = hw.isLegacy ? hw.schedule.task_completed : hw.item?.is_completed
                                    const toggleId = hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}`
                                    const dragId = hw.isLegacy ? `task-legacy-month-${hw.schedule.id}` : `task-item-month-${hw.item?.id}`
                                    return (
                                      <DraggableItem
                                        key={hw.isLegacy ? `hw-${hw.schedule.id}` : `hwi-${hw.item?.id}-${hwIdx}`}
                                        id={dragId}
                                        data={hw.isLegacy
                                          ? { type: 'task-legacy', schedule: hw.schedule }
                                          : { type: 'task-item', schedule: hw.schedule, taskItem: hw.item }
                                        }
                                        className={cn(
                                          'text-xs px-1 py-0.5 rounded flex items-center gap-0.5 border-l-2 border-orange-500',
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
                                          onPointerDown={(e) => e.stopPropagation()}
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
                                        <span className="flex-1 break-words">
                                          {hw.schedule.title}
                                        </span>
                                      </DraggableItem>
                                    )
                                  })}
                                  {/* Task type schedules - month view (draggable) */}
                                  {getTaskTypeSchedulesForDate(day).map((schedule) => (
                                    <DraggableItem
                                      key={schedule.id}
                                      id={`task-schedule-month-${schedule.id}`}
                                      data={{ type: 'task-schedule', schedule }}
                                      className={cn(
                                        'text-xs px-1 py-0.5 rounded flex items-center gap-0.5 border-l-2 border-orange-500',
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
                                        onPointerDown={(e) => e.stopPropagation()}
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
                                      <span className="flex-1 break-words">
                                        {schedule.title}
                                      </span>
                                    </DraggableItem>
                                  ))}
                                  {getSchedulesForDate(day).map((schedule) => {
                                    const dateStr = formatDate(day)
                                    return (
                                      <DraggableMonthScheduleCard
                                        key={`${schedule.id}-${dateStr}`}
                                        schedule={schedule}
                                        currentDate={dateStr}
                                        onEdit={() => openScheduleDialog(undefined, schedule)}
                                        onToggleComplete={() => toggleScheduleComplete(schedule, dateStr)}
                                        isToggling={togglingIds.has(`${schedule.id}-${dateStr}`) || togglingIds.has(schedule.id)}
                                      />
                                    )
                                  })}
                                </div>
                              </>
                          </DroppableMonthDay>
                        )
                      })}
                    </div>
                  </div>
                )}
                <DragOverlay>
                  {activeDragItem && (() => {
                    const { type, schedule, taskItem } = activeDragItem
                    if (type === 'task-item' || type === 'task-legacy' || type === 'task-schedule') {
                      return (
                        <div className="text-xs p-1.5 rounded shadow-lg bg-orange-100 dark:bg-orange-900/30 border-l-2 border-orange-500">
                          <div className="flex items-center gap-1 text-orange-700 dark:text-orange-300">
                            <ClipboardList className="h-3 w-3" />
                            <span>{schedule.title}</span>
                            {taskItem && <span className="text-[11px] text-muted-foreground ml-1">({taskItem.content})</span>}
                          </div>
                        </div>
                      )
                    }
                    const displayColor = schedule.client?.color || schedule.color
                    const clientColor = schedule.client?.color
                    return (
                      <div
                        className={cn(
                          'text-xs p-1.5 rounded shadow-lg',
                          schedule.is_completed
                            ? 'bg-muted line-through text-muted-foreground'
                            : !displayColor && 'bg-slate-300/50 dark:bg-slate-600/50'
                        )}
                        style={{
                          borderLeft: clientColor
                            ? `3px solid ${clientColor}`
                            : undefined,
                          backgroundColor: !schedule.is_completed && displayColor
                            ? `${displayColor}20`
                            : undefined,
                        }}
                      >
                        <div className="flex items-center gap-1">
                          {schedule.is_completed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <Circle className="h-3 w-3" />
                          )}
                          <span>{schedule.title}</span>
                        </div>
                      </div>
                    )
                  })()}
                </DragOverlay>
              </DndContext>
            </CardContent>
          </Card>

      {/* Row 2 - Invoice + Stock Trades + Wiki (5:5) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  현금관리
                </CardTitle>
                <CardDescription>입출금 내역</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInvoiceViewMode('list')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      invoiceViewMode === 'list'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    목록
                  </button>
                  <button
                    onClick={() => setInvoiceViewMode('summary')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      invoiceViewMode === 'summary'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    표
                  </button>
                </div>
                <button
                  onClick={openNewInvoiceModal}
                  className="flex items-center gap-2 rounded-lg border border-transparent bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
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

                  {/* Date range filter */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs text-slate-500">기간</span>
                    <input
                      type="date"
                      value={invoiceDateFrom}
                      onChange={(e) => {
                        setInvoiceDateFrom(e.target.value)
                        setInvoicePage(1)
                      }}
                      className="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 focus:bg-slate-50 dark:focus:bg-slate-600 outline-none"
                    />
                    <span className="text-xs text-slate-400">~</span>
                    <input
                      type="date"
                      value={invoiceDateTo}
                      onChange={(e) => {
                        setInvoiceDateTo(e.target.value)
                        setInvoicePage(1)
                      }}
                      className="px-2 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-700 focus:bg-slate-50 dark:focus:bg-slate-600 outline-none"
                    />
                    {(invoiceDateFrom || invoiceDateTo) && (
                      <button
                        onClick={() => {
                          setInvoiceDateFrom('')
                          setInvoiceDateTo('')
                          setInvoicePage(1)
                        }}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        초기화
                      </button>
                    )}
                  </div>

                  {(() => {
                    // Client-side filtering and sorting for list view
                    let filteredInvoices = invoiceTypeFilter === 'all'
                      ? invoices
                      : invoices.filter(inv => inv.type === invoiceTypeFilter)

                    // Date range filter (based on payment_date or issue_date)
                    if (invoiceDateFrom || invoiceDateTo) {
                      filteredInvoices = filteredInvoices.filter(inv => {
                        const dateToCheck = inv.payment_date || inv.issue_date
                        if (!dateToCheck) return false
                        if (invoiceDateFrom && dateToCheck < invoiceDateFrom) return false
                        if (invoiceDateTo && dateToCheck > invoiceDateTo) return false
                        return true
                      })
                    }

                    filteredInvoices = filteredInvoices.sort((a, b) => {
                      // Sort by payment_date first (newest first), then by issue_date
                      const aPayment = a.payment_date ? new Date(a.payment_date).getTime() : 0
                      const bPayment = b.payment_date ? new Date(b.payment_date).getTime() : 0
                      if (aPayment !== bPayment) return bPayment - aPayment
                      const aIssue = a.issue_date ? new Date(a.issue_date).getTime() : 0
                      const bIssue = b.issue_date ? new Date(b.issue_date).getTime() : 0
                      return bIssue - aIssue
                    })
                    const totalPages = Math.ceil(filteredInvoices.length / invoicesPerPage)
                    const paginatedInvoices = filteredInvoices.slice(
                      (invoicePage - 1) * invoicesPerPage,
                      invoicePage * invoicesPerPage
                    )
                    return (
                      <>
                        <div className="space-y-2">
                          {isLoadingInvoices ? (
                            <div className="text-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                            </div>
                          ) : filteredInvoices.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                              <p className="text-sm">등록된 재무항목이 없습니다</p>
                              <p className="text-xs">새 항목을 추가해주세요</p>
                            </div>
                          ) : (
                            paginatedInvoices.map((invoice) => {
                              const computedStatus = getInvoiceStatus(invoice)
                              const statusStyle = INVOICE_STATUS_STYLES[computedStatus]
                              return (
                                <div
                                  key={invoice.id}
                                  className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                  onClick={() => openEditInvoiceModal(invoice)}
                                >
                                  <span className={cn(
                                    'px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0',
                                    invoice.type === 'revenue' ? 'bg-blue-100 text-blue-700' :
                                    invoice.type === 'expense' ? 'bg-orange-100 text-orange-700' :
                                    invoice.type === 'asset' ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-purple-100 text-purple-700'
                                  )}>
                                    {invoice.type === 'revenue' ? '매출' : invoice.type === 'expense' ? '비용' : invoice.type === 'asset' ? '자산' : '부채'}
                                  </span>
                                  <span className="font-medium text-sm truncate">{invoice.counterparty}</span>
                                  {invoice.description && <span className="text-xs text-muted-foreground truncate hidden sm:inline">{invoice.description}</span>}
                                  {invoice.description && (invoice.payment_date || invoice.issue_date) && <span className="text-xs text-muted-foreground hidden sm:inline">·</span>}
                                  {(invoice.payment_date || invoice.issue_date) && <span className="text-xs text-muted-foreground shrink-0">{(() => { const d = invoice.payment_date || invoice.issue_date!; return `${d}(${['일','월','화','수','목','금','토'][new Date(d).getDay()]})`; })()}</span>}
                                  <span className="font-medium text-sm shrink-0 ml-auto">{formatKRW(invoice.amount)}</span>
                                </div>
                              )
                            })
                          )}
                        </div>
                        {filteredInvoices.length > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {filteredInvoices.length}개 중 {(invoicePage - 1) * invoicesPerPage + 1}-{Math.min(invoicePage * invoicesPerPage, filteredInvoices.length)}
                              </p>
                              <div className="relative">
                                <select
                                  value={invoicesPerPage}
                                  onChange={(e) => {
                                    setInvoicesPerPage(Number(e.target.value))
                                    setInvoicePage(1)
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
                                <button onClick={() => setInvoicePage(1)} disabled={invoicePage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-4 w-4" /></button>
                                <button onClick={() => setInvoicePage(p => Math.max(1, p - 1))} disabled={invoicePage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                                <span className="px-2 py-1 text-xs font-medium">{invoicePage}/{totalPages}</span>
                                <button onClick={() => setInvoicePage(p => Math.min(totalPages, p + 1))} disabled={invoicePage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-4 w-4" /></button>
                                <button onClick={() => setInvoicePage(totalPages)} disabled={invoicePage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-4 w-4" /></button>
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
                      // 입금일/지급일이 없으면 합계에서 제외
                      if (!inv.payment_date) continue
                      // 거래처 필터 적용
                      if (summaryCounterpartyFilter && inv.counterparty !== summaryCounterpartyFilter) continue

                      const date = new Date(inv.payment_date)
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

                  // Get unique counterparties sorted alphabetically
                  const uniqueCounterparties = Array.from(
                    new Set(invoices.filter(inv => inv.payment_date).map(inv => inv.counterparty))
                  ).sort((a, b) => a.localeCompare(b, 'ko'))

                  return (
                    <>
                      {/* Period filter + Counterparty filter */}
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="flex gap-1">
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
                        {uniqueCounterparties.length > 0 && (
                          <div className="relative">
                            <select
                              value={summaryCounterpartyFilter || ''}
                              onChange={(e) => setSummaryCounterpartyFilter(e.target.value || null)}
                              className="text-xs bg-white dark:bg-slate-800 rounded-lg pl-2 pr-6 py-1.5 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <option value="">전체 거래처</option>
                              {uniqueCounterparties.map((cp) => (
                                <option key={cp} value={cp}>{cp}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
                          </div>
                        )}
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

                            // Get invoices for this period (only those with payment_date)
                            const getInvoicesForPeriod = () => {
                              return invoices.filter((inv) => {
                                // 입금일/지급일이 없으면 제외
                                if (!inv.payment_date) return false
                                // 거래처 필터 적용
                                if (summaryCounterpartyFilter && inv.counterparty !== summaryCounterpartyFilter) return false

                                const date = new Date(inv.payment_date)
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
                              }).sort((a, b) => {
                                // Sort by payment_date first (newest first), then by issue_date
                                const aPayment = a.payment_date ? new Date(a.payment_date).getTime() : 0
                                const bPayment = b.payment_date ? new Date(b.payment_date).getTime() : 0
                                if (aPayment !== bPayment) return bPayment - aPayment
                                const aIssue = a.issue_date ? new Date(a.issue_date).getTime() : 0
                                const bIssue = b.issue_date ? new Date(b.issue_date).getTime() : 0
                                if (aIssue !== bIssue) return bIssue - aIssue
                                // Same date: sort by type (revenue > expense > asset > liability)
                                const typeOrder = { revenue: 0, expense: 1, asset: 2, liability: 3 }
                                const aType = typeOrder[a.type as keyof typeof typeOrder] ?? 4
                                const bType = typeOrder[b.type as keyof typeof typeOrder] ?? 4
                                if (aType !== bType) return aType - bType
                                // Same type: sort by counterparty name (가나다순)
                                return a.counterparty.localeCompare(b.counterparty, 'ko')
                              })
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
                                  <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3">
                                    <div>
                                      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-blue-600 mb-1">
                                        <TrendingUp className="h-3 w-3 hidden sm:block" />
                                        매출 ({data.revenueCount})
                                      </div>
                                      <p className="text-xs sm:text-sm font-bold text-blue-700">{formatKRW(data.revenue)}</p>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-orange-600 mb-1">
                                        <TrendingDown className="h-3 w-3 hidden sm:block" />
                                        비용 ({data.expenseCount})
                                      </div>
                                      <p className="text-xs sm:text-sm font-bold text-orange-700">{formatKRW(data.expense)}</p>
                                    </div>
                                    <div>
                                      <div className="text-[11px] sm:text-xs text-muted-foreground mb-1">영업이익</div>
                                      <p className={cn(
                                        'text-xs sm:text-sm font-bold',
                                        operatingCashFlow >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-600'
                                      )}>
                                        {formatKRW(operatingCashFlow)}
                                      </p>
                                    </div>
                                  </div>
                                  {/* 투자/재무활동 + 현금흐름 */}
                                  <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-3 border-t border-slate-100 dark:border-slate-600">
                                    <div>
                                      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-emerald-600 mb-1">
                                        <TrendingDown className="h-3 w-3 hidden sm:block" />
                                        자산 ({data.assetCount})
                                      </div>
                                      <p className="text-xs sm:text-sm font-bold text-emerald-700">{formatKRW(data.asset)}</p>
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-purple-600 mb-1">
                                        <TrendingUp className="h-3 w-3 hidden sm:block" />
                                        부채 ({data.liabilityCount})
                                      </div>
                                      <p className="text-xs sm:text-sm font-bold text-purple-700">{formatKRW(data.liability)}</p>
                                    </div>
                                    <div>
                                      <div className="text-[11px] sm:text-xs text-muted-foreground mb-1">현금흐름</div>
                                      <p className={cn(
                                        'text-xs sm:text-sm font-bold',
                                        totalCashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      )}>
                                        {totalCashFlow >= 0 ? '+' : ''}{formatKRW(totalCashFlow)}
                                      </p>
                                    </div>
                                  </div>
                                </button>

                                {/* Expanded invoice list */}
                                {isExpanded && (
                                  <div>
                                    {periodInvoices.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-4">항목 없음</p>
                                    ) : (
                                      <div>
                                        {periodInvoices.map((inv) => (
                                          <div
                                            key={inv.id}
                                            className="px-4 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer"
                                            onClick={() => {
                                              setEditingInvoice(inv)
                                              setInvoiceFormType(inv.type)
                                              setInvoiceFormCounterparty(inv.counterparty)
                                              setInvoiceFormDescription(inv.description || '')
                                              setInvoiceFormAmount(String(inv.amount))
                                              setInvoiceFormDate(inv.issue_date || '')
                                              setInvoiceFormPaymentDate(inv.payment_date || '')
                                              setInvoiceFormNotes(inv.notes || '')
                                              setInvoiceFormAccountNumber(inv.account_number || '')
                                              setIsInvoiceModalOpen(true)
                                            }}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className={cn(
                                                'flex-shrink-0 text-xs w-7 text-center py-0.5 rounded font-medium',
                                                inv.type === 'revenue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                                inv.type === 'expense' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                                                inv.type === 'asset' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' :
                                                'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                              )}>
                                                {inv.type === 'revenue' ? '매출' : inv.type === 'expense' ? '비용' : inv.type === 'asset' ? '자산' : '부채'}
                                              </span>
                                              <span className="flex-shrink-0 text-xs text-muted-foreground w-20">{inv.payment_date || inv.issue_date || '-'}</span>
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

          {/* Stock Trades Section */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  투자관리
                </CardTitle>
                <CardDescription>주식 매매 내역</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setTradeViewMode('list')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      tradeViewMode === 'list'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    거래
                  </button>
                  <button
                    onClick={() => setTradeViewMode('portfolio')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      tradeViewMode === 'portfolio'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    보유
                  </button>
                  <button
                    onClick={() => setTradeViewMode('analysis')}
                    className={cn(
                      'min-w-[52px] px-3 py-2 text-sm font-medium rounded-lg transition-colors border',
                      tradeViewMode === 'analysis'
                        ? 'bg-slate-900 dark:bg-slate-700 text-white border-transparent'
                        : 'dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    분석
                  </button>
                </div>
                <button
                  onClick={openNewTradeModal}
                  className="flex items-center gap-2 rounded-lg border border-transparent bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">추가</span>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {tradeViewMode === 'list' ? (
                <>
                  {/* Filters */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(['all', 'KR', 'US'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setTradeMarketFilter(m); setTradePage(1) }}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                          tradeMarketFilter === m
                            ? 'bg-slate-900 text-white dark:bg-slate-600'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                        )}
                      >
                        {m === 'all' ? '전체' : m === 'KR' ? '국내' : '해외'}
                      </button>
                    ))}
                    <span className="w-px bg-slate-300 dark:bg-slate-600 mx-1" />
                    {(['all', 'buy', 'sell'] as const).map((tt) => (
                      <button
                        key={tt}
                        onClick={() => { setTradeTypeFilter(tt); setTradePage(1) }}
                        className={cn(
                          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                          tradeTypeFilter === tt
                            ? 'bg-slate-900 text-white dark:bg-slate-600'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                        )}
                      >
                        {tt === 'all' ? '전체' : tt === 'buy' ? '매수' : '매도'}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    let filtered = stockTrades
                    if (tradeMarketFilter !== 'all') filtered = filtered.filter(t => t.market === tradeMarketFilter)
                    if (tradeTypeFilter !== 'all') filtered = filtered.filter(t => t.trade_type === tradeTypeFilter)
                    const totalPages = Math.ceil(filtered.length / tradesPerPage)
                    const paginated = filtered.slice((tradePage - 1) * tradesPerPage, tradePage * tradesPerPage)

                    return (
                      <>
                        <div className="space-y-2">
                          {isLoadingTrades ? (
                            <div className="text-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                            </div>
                          ) : filtered.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <TrendingUp className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                              <p className="text-sm">거래 내역이 없습니다</p>
                              <p className="text-xs">새 거래를 추가해주세요</p>
                            </div>
                          ) : (
                            paginated.map((trade) => (
                              <div
                                key={trade.id}
                                className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                                onClick={() => openEditTradeModal(trade)}
                              >
                                <span className={cn(
                                  'px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0',
                                  trade.trade_type === 'buy' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                                )}>
                                  {trade.trade_type === 'buy' ? '매수' : '매도'}
                                </span>
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0',
                                  trade.market === 'KR' ? 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
                                )}>
                                  {trade.market}
                                </span>
                                <span className="font-medium text-sm truncate">{trade.company_name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{trade.quantity.toLocaleString()}주</span>
                                <span className="text-xs text-muted-foreground shrink-0">{trade.trade_date.slice(5)}</span>
                                <span className="font-medium text-sm shrink-0 ml-auto">{formatAmount(trade.total_amount, trade.currency)}</span>
                              </div>
                            ))
                          )}
                        </div>
                        {filtered.length > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {filtered.length}개 중 {(tradePage - 1) * tradesPerPage + 1}-{Math.min(tradePage * tradesPerPage, filtered.length)}
                              </p>
                              <div className="relative">
                                <select
                                  value={tradesPerPage}
                                  onChange={(e) => { setTradesPerPage(Number(e.target.value)); setTradePage(1) }}
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
                                <button onClick={() => setTradePage(1)} disabled={tradePage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-4 w-4" /></button>
                                <button onClick={() => setTradePage(p => Math.max(1, p - 1))} disabled={tradePage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                                <span className="px-2 py-1 text-xs font-medium">{tradePage}/{totalPages}</span>
                                <button onClick={() => setTradePage(p => Math.min(totalPages, p + 1))} disabled={tradePage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-4 w-4" /></button>
                                <button onClick={() => setTradePage(totalPages)} disabled={tradePage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-4 w-4" /></button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </>
              ) : (
                /* Portfolio & Analysis Views - grouped by theme with current prices */
                (() => {
                  // Group by ticker and calculate holdings using moving average method (이동평균법)
                  const holdingsMap = new Map<string, {
                    ticker: string; company_name: string; market: 'KR' | 'US'; currency: 'KRW' | 'USD';
                    netQty: number; totalCost: number; // moving average state
                    krwCost: number; // KRW cost using historical FX rates (for US stocks)
                  }>()

                  // Find closest FX rate for a date (look back up to 5 days for weekends/holidays)
                  const getFxRate = (date: string): number => {
                    const d = new Date(date)
                    for (let i = 0; i < 5; i++) {
                      const key = d.toISOString().slice(0, 10)
                      if (fxHistory[key]) return fxHistory[key]
                      d.setDate(d.getDate() - 1)
                    }
                    return usdKrwRate // fallback to current
                  }

                  // Process trades chronologically for moving average
                  const sortedTrades = [...stockTrades].sort((a, b) =>
                    new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id)
                  )

                  for (const trade of sortedTrades) {
                    const key = trade.ticker
                    const existing = holdingsMap.get(key) || {
                      ticker: trade.ticker, company_name: trade.company_name, market: trade.market, currency: trade.currency,
                      netQty: 0, totalCost: 0, krwCost: 0,
                    }
                    const isUS = trade.market === 'US'
                    const histRate = isUS ? getFxRate(trade.trade_date) : 1

                    if (trade.trade_type === 'buy') {
                      existing.totalCost += trade.total_amount
                      existing.netQty += trade.quantity
                      existing.krwCost += trade.total_amount * histRate
                    } else {
                      // Sell: remove cost at current average price
                      const currentAvg = existing.netQty > 0 ? existing.totalCost / existing.netQty : 0
                      const currentKrwAvg = existing.netQty > 0 ? existing.krwCost / existing.netQty : 0
                      existing.totalCost -= currentAvg * trade.quantity
                      existing.krwCost -= currentKrwAvg * trade.quantity
                      existing.netQty -= trade.quantity
                      // Guard against floating point issues
                      if (existing.netQty <= 0) { existing.netQty = 0; existing.totalCost = 0; existing.krwCost = 0 }
                    }
                    holdingsMap.set(key, existing)
                  }

                  const holdings = Array.from(holdingsMap.values())
                    .filter(h => h.netQty > 0)
                    .map(h => {
                      const netQty = h.netQty
                      const avgBuyPrice = netQty > 0 ? h.totalCost / netQty : 0 // moving avg (이동평균법)
                      const totalInvested = h.totalCost // 이동평균 원가 = 토스 매입금액
                      const quote = stockQuotes[h.ticker]
                      const currentPrice = quote?.price || 0
                      const dailyChangePercent = quote?.changePercent || 0
                      const currentValue = currentPrice * netQty
                      const pnl = currentPrice > 0 ? currentValue - totalInvested : 0
                      const pnlPercent = totalInvested > 0 && currentPrice > 0 ? (pnl / totalInvested) * 100 : 0

                      // IRR calculation
                      const tickerTrades = stockTrades.filter(t => t.ticker === h.ticker)
                      const cashFlows: { date: string; amount: number }[] = tickerTrades.map(t => ({
                        date: t.trade_date,
                        amount: t.trade_type === 'buy' ? -t.total_amount : t.total_amount,
                      }))
                      if (currentPrice > 0 && netQty > 0) {
                        cashFlows.push({ date: new Date().toISOString().slice(0, 10), amount: currentValue })
                      }
                      const irr = calculateIRR(cashFlows)

                      // Weighted average holding period (by quantity)
                      const buyTrades = tickerTrades.filter(t => t.trade_type === 'buy')
                      const totalBuyQty = buyTrades.reduce((s, t) => s + t.quantity, 0)
                      const weightedBuyDate = totalBuyQty > 0
                        ? buyTrades.reduce((s, t) => s + new Date(t.trade_date).getTime() * t.quantity, 0) / totalBuyQty
                        : Date.now()
                      const holdingDays = Math.round((Date.now() - weightedBuyDate) / (24 * 60 * 60 * 1000))

                      // Get themes for this ticker
                      const tickerThemes = stockThemes[h.ticker] || []
                      const parentTheme = tickerThemes[0]?.parentTheme || null

                      // KRW invested using historical FX rates (for US stocks, KR stocks use as-is)
                      const krwInvested = h.currency === 'USD' ? h.krwCost : totalInvested

                      return {
                        ...h, netQty, avgBuyPrice, totalInvested, currentPrice, currentValue, pnl, pnlPercent, parentTheme, dailyChangePercent, irr, holdingDays, krwInvested,
                        themes: tickerThemes.map(t => t.theme),
                      }
                    })
                    .sort((a, b) => b.currentValue - a.currentValue || b.totalInvested - a.totalInvested)

                  // Group by parent theme, sort each group by pnl descending
                  const themeGroups = new Map<string, typeof holdings>()
                  for (const h of holdings) {
                    const group = h.parentTheme || '미분류'
                    if (!themeGroups.has(group)) themeGroups.set(group, [])
                    themeGroups.get(group)!.push(h)
                  }
                  const toKrw = (pnl: number, currency: 'KRW' | 'USD') => currency === 'USD' ? pnl * usdKrwRate : pnl
                  for (const [, items] of themeGroups) {
                    items.sort((a, b) => toKrw(b.pnl, b.currency) - toKrw(a.pnl, a.currency))
                  }

                  // Theme colors
                  const themeColors: Record<string, string> = {
                    'AI 인프라': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
                    '지정학/안보': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400',
                    '넥스트': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400',
                    '미분류': 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300',
                  }

                  const themeOrder = ['AI 인프라', '미분류', '지정학/안보', '넥스트']
                  const sortedGroups = themeOrder
                    .filter(t => themeGroups.has(t))
                    .map(t => ({ theme: t, items: themeGroups.get(t)! }))

                  // Portfolio totals
                  const krHoldings = holdings.filter(h => h.currency === 'KRW')
                  const usHoldings = holdings.filter(h => h.currency === 'USD')
                  const krInvested = krHoldings.reduce((s, h) => s + h.totalInvested, 0)
                  const krValue = krHoldings.reduce((s, h) => s + h.currentValue, 0)
                  const usInvested = usHoldings.reduce((s, h) => s + h.totalInvested, 0)
                  const usValue = usHoldings.reduce((s, h) => s + h.currentValue, 0)
                  const krPnl = krValue > 0 ? krValue - krInvested : 0
                  const usPnl = usValue > 0 ? usValue - usInvested : 0
                  const krPnlPct = krInvested > 0 && krValue > 0 ? (krPnl / krInvested) * 100 : 0
                  const usPnlPct = usInvested > 0 && usValue > 0 ? (usPnl / usInvested) * 100 : 0
                  // Daily change % (weighted by current value)
                  const krDailyPct = krValue > 0 ? krHoldings.reduce((s, h) => s + h.dailyChangePercent * h.currentValue, 0) / krValue : 0
                  const usDailyPct = usValue > 0 ? usHoldings.reduce((s, h) => s + h.dailyChangePercent * h.currentValue, 0) / usValue : 0
                  const hasQuotes = Object.keys(stockQuotes).length > 0

                  return isLoadingTrades ? (
                    <div className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                    </div>
                  ) : holdings.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">보유 종목이 없습니다</p>
                    </div>
                  ) : tradeViewMode === 'portfolio' ? (
                    <div className="space-y-4">
                      {/* Currency Toggle + Portfolio Summary */}
                      {hasQuotes && (() => {
                        const isKrwMode = portfolioCurrencyMode === 'KRW'
                        // Use historical FX rates for US invested (matches Toss)
                        const usInvestedKrwHist = usHoldings.reduce((s, h) => s + h.krwInvested, 0)
                        const totalInvested = krInvested + usInvestedKrwHist
                        const totalValue = krValue + usValue * usdKrwRate
                        const totalPnl = totalValue - totalInvested
                        const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
                        const totalDailyPct = totalValue > 0
                          ? (krHoldings.reduce((s, h) => s + h.dailyChangePercent * h.currentValue, 0) + usHoldings.reduce((s, h) => s + h.dailyChangePercent * h.currentValue * usdKrwRate, 0)) / totalValue
                          : 0
                        return (
                          <>
                            <div className="flex justify-start">
                              <button
                                onClick={() => setPortfolioCurrencyMode(prev => prev === 'original' ? 'KRW' : 'original')}
                                className={cn(
                                  'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                                  isKrwMode
                                    ? 'bg-slate-900 text-white dark:bg-slate-600'
                                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                )}
                              >
                                {isKrwMode ? '₩ 원화 통합' : '원화/달러'}
                              </button>
                            </div>
                            {(() => {
                              const usValueKrw = usValue * usdKrwRate
                              const usInvestedKrwHist = usHoldings.reduce((s, h) => s + h.krwInvested, 0)
                              const usPnlKrw = usValueKrw - usInvestedKrwHist
                              const usPnlPctKrw = usInvestedKrwHist > 0 ? (usPnlKrw / usInvestedKrwHist) * 100 : 0
                              return (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div
                                    className={cn('rounded-lg bg-white dark:bg-slate-700 px-3 py-2 cursor-pointer transition-opacity', portfolioMarketFilter === 'US' && 'opacity-40')}
                                    onClick={() => setPortfolioMarketFilter(prev => prev === 'KR' ? 'all' : 'KR')}
                                  >
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[11px] text-muted-foreground">국내 {krHoldings.length}종목</span>
                                      {krDailyPct !== 0 && (
                                        <span className={cn(
                                          'text-xs font-medium px-1.5 py-0.5 rounded',
                                          krDailyPct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                        )}>
                                          {getDailyLabel('KR')} {krDailyPct > 0 ? '+' : ''}{krDailyPct.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-bold"><span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">평가 </span>{formatAmount(krValue, 'KRW')}</div>
                                    <div className={cn('text-xs font-medium', krPnl > 0 ? 'text-red-600 dark:text-red-400' : krPnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">누적 </span>{krPnl > 0 ? '+' : ''}{formatAmount(krPnl, 'KRW')} ({krPnl > 0 ? '+' : ''}{krPnlPct.toFixed(1)}%)
                                    </div>
                                  </div>
                                  <div
                                    className={cn('rounded-lg bg-white dark:bg-slate-700 px-3 py-2 cursor-pointer transition-opacity', portfolioMarketFilter === 'KR' && 'opacity-40')}
                                    onClick={() => setPortfolioMarketFilter(prev => prev === 'US' ? 'all' : 'US')}
                                  >
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[11px] text-muted-foreground">해외 {usHoldings.length}종목</span>
                                      {usDailyPct !== 0 && (
                                        <span className={cn(
                                          'text-xs font-medium px-1.5 py-0.5 rounded',
                                          usDailyPct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                        )}>
                                          {getDailyLabel('US')} {usDailyPct > 0 ? '+' : ''}{usDailyPct.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-bold"><span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">평가 </span>{isKrwMode ? formatAmount(usValueKrw, 'KRW') : formatAmount(usValue, 'USD')}</div>
                                    <div className={cn('text-xs font-medium', (isKrwMode ? usPnlKrw : usPnl) > 0 ? 'text-red-600 dark:text-red-400' : (isKrwMode ? usPnlKrw : usPnl) < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">누적 </span>{isKrwMode ? (usPnlKrw > 0 ? '+' : '') + formatAmount(usPnlKrw, 'KRW') + ` (${usPnlKrw > 0 ? '+' : ''}${usPnlPctKrw.toFixed(1)}%)` : `${usPnl > 0 ? '+' : ''}${formatAmount(usPnl, 'USD')} (${usPnl > 0 ? '+' : ''}${usPnlPct.toFixed(1)}%)`}
                                    </div>
                                  </div>
                                  {/* 전체 통합 (항상 원화 환산) */}
                                  <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[11px] text-muted-foreground">전체 {holdings.length}종목 · {Math.round(usdKrwRate).toLocaleString()}원/$</span>
                                      {totalDailyPct !== 0 && (
                                        <span className={cn(
                                          'text-xs font-medium px-1.5 py-0.5 rounded',
                                          totalDailyPct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                        )}>
                                          {(() => { const kr = getDailyLabel('KR'); const us = getDailyLabel('US'); return kr === us ? kr : `${us}~${kr.split('/')[1]}` })()} {totalDailyPct > 0 ? '+' : ''}{totalDailyPct.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-bold"><span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">평가 </span>{formatAmount(totalValue, 'KRW')}</div>
                                    <div className={cn('text-xs font-medium', totalPnl > 0 ? 'text-red-600 dark:text-red-400' : totalPnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">누적 </span>{totalPnl > 0 ? '+' : ''}{formatAmount(totalPnl, 'KRW')} ({totalPnl > 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%)
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </>
                        )
                      })()}
                      {isLoadingQuotes && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          시세 로딩 중...
                        </div>
                      )}
                      {/* Theme Groups - explicit 2-column assignment */}
                      {(() => {
                        const filteredGroups = portfolioMarketFilter === 'all'
                          ? sortedGroups
                          : sortedGroups
                              .map(g => ({ ...g, items: g.items.filter(i => i.market === portfolioMarketFilter) }))
                              .filter(g => g.items.length > 0)
                        const col1Themes = new Set(['AI 인프라', '미분류'])
                        const col1 = filteredGroups.filter(g => col1Themes.has(g.theme))
                        const col2 = filteredGroups.filter(g => !col1Themes.has(g.theme))
                        const renderGroup = ({ theme, items }: typeof sortedGroups[0]) => {
                          const hasMixedCurrency = new Set(items.map(i => i.currency)).size > 1
                          const krItems = items.filter(i => i.currency === 'KRW')
                          const usItems = items.filter(i => i.currency === 'USD')

                          const calcGroup = (group: typeof items, forceKrw = false) => {
                            const inv = group.reduce((s, h) => s + (forceKrw && h.currency === 'USD' ? h.totalInvested * usdKrwRate : h.totalInvested), 0)
                            const val = group.reduce((s, h) => s + (forceKrw && h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue), 0)
                            const pnl = val > 0 ? val - inv : 0
                            const pct = inv > 0 && val > 0 ? (pnl / inv) * 100 : 0
                            return { inv, val, pnl, pct }
                          }
                          const isKrwMode = portfolioCurrencyMode === 'KRW'

                          return (
                            <div key={theme}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={cn('px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap', themeColors[theme] || themeColors['미분류'])}>
                                  {theme}
                                </span>
                                <span className="text-xs text-muted-foreground">{items.length}종목</span>
                                {hasQuotes && (() => {
                                  // 원화모드이거나 단일통화 → 통합 표시, 그 외 KR/US 분리
                                  if (isKrwMode || !hasMixedCurrency) {
                                    const g = calcGroup(items, true) // always KRW
                                    if (g.val <= 0) return null
                                    return (
                                      <span className={cn('text-xs font-medium ml-auto', g.pnl > 0 ? 'text-red-600 dark:text-red-400' : g.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                        {g.pnl > 0 ? '+' : ''}{g.pct.toFixed(1)}% ({g.pnl > 0 ? '+' : ''}{formatAmount(g.pnl, 'KRW')})
                                      </span>
                                    )
                                  }
                                  return (
                                    <div className="flex items-center gap-2 ml-auto">
                                      {(() => { const g = calcGroup(krItems); return krItems.length > 0 && g.val > 0 ? (
                                        <span className={cn('text-[11px] font-medium', g.pnl > 0 ? 'text-red-600 dark:text-red-400' : g.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                          KR {g.pnl > 0 ? '+' : ''}{g.pct.toFixed(1)}%
                                        </span>
                                      ) : null })()}
                                      {(() => { const g = calcGroup(usItems); return usItems.length > 0 && g.val > 0 ? (
                                        <span className={cn('text-[11px] font-medium', g.pnl > 0 ? 'text-red-600 dark:text-red-400' : g.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                          US {g.pnl > 0 ? '+' : ''}{g.pct.toFixed(1)}%
                                        </span>
                                      ) : null })()}
                                    </div>
                                  )
                                })()}
                              </div>
                              {/* Group summary card */}
                              {hasQuotes && (() => {
                                const g = calcGroup(items, true) // always KRW for summary
                                if (g.val <= 0) return null
                                const weightPct = (() => {
                                  const allVal = holdings.reduce((s, h) => s + (h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue), 0)
                                  return allVal > 0 ? (g.val / allVal) * 100 : 0
                                })()
                                const groupDailyPct = g.val > 0
                                  ? items.reduce((s, h) => s + h.dailyChangePercent * (h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue), 0) / g.val
                                  : 0
                                return (
                                  <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2 mb-2">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[11px] text-muted-foreground">
                                        {(() => {
                                          const kr = items.filter(i => i.market === 'KR').length
                                          const us = items.filter(i => i.market === 'US').length
                                          const parts = []
                                          if (kr > 0) parts.push(`국내 ${kr}종목`)
                                          if (us > 0) parts.push(`해외 ${us}종목`)
                                          return parts.join(' · ')
                                        })()}
                                      </span>
                                      {groupDailyPct !== 0 && (
                                        <span className={cn(
                                          'text-xs font-medium px-1.5 py-0.5 rounded',
                                          groupDailyPct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                        )}>
                                          {(() => { const allKR = items.every(i => i.market === 'KR'); const allUS = items.every(i => i.market === 'US'); if (allKR) return getDailyLabel('KR'); if (allUS) return getDailyLabel('US'); const kr = getDailyLabel('KR'); const us = getDailyLabel('US'); return kr === us ? kr : `${us}~${kr.split('/')[1]}`; })()} {groupDailyPct > 0 ? '+' : ''}{groupDailyPct.toFixed(1)}%
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm font-bold"><span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">평가 </span>{formatAmount(g.val, 'KRW')}</div>
                                    <div className={cn('text-xs font-medium', g.pnl > 0 ? 'text-red-600 dark:text-red-400' : g.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">누적 </span>{g.pnl > 0 ? '+' : ''}{formatAmount(g.pnl, 'KRW')} ({g.pnl > 0 ? '+' : ''}{g.pct.toFixed(1)}%)
                                    </div>
                                  </div>
                                )
                              })()}
                              {(() => {
                                const renderItem = (h: typeof items[0]) => {
                                  const isKrwMode = portfolioCurrencyMode === 'KRW'
                                  const toDisplay = (v: number) => isKrwMode && h.currency === 'USD' ? v * usdKrwRate : v
                                  const displayCurrency: 'KRW' | 'USD' = isKrwMode ? 'KRW' : h.currency
                                  const fmtCur = (v: number) => {
                                    const dv = toDisplay(v)
                                    return displayCurrency === 'USD' ? `$${dv.toFixed(2)}` : `${Math.round(dv).toLocaleString()}원`
                                  }
                                  return (
                                    <div key={h.ticker} className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                                      {/* Row 1: 종목명 + 종목코드 + 세부테마 + 오늘수익률 */}
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="font-medium text-sm truncate">{h.company_name}</span>
                                          <span className="text-[11px] text-muted-foreground shrink-0">{h.ticker}</span>
                                          {h.themes.map((t) => (
                                            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-600 dark:text-slate-400 shrink-0">{t}</span>
                                          ))}
                                        </div>
                                        {h.dailyChangePercent !== 0 && (
                                          <span className={cn(
                                            'text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ml-1',
                                            h.dailyChangePercent > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                          )}>
                                            {getDailyLabel(h.market === 'US' ? 'US' : 'KR')} {h.dailyChangePercent > 0 ? '+' : ''}{h.dailyChangePercent.toFixed(1)}%

                                          </span>
                                        )}
                                      </div>
                                      {/* 2열 그리드: 좌=매수/투자/보유, 우=현재/평가/누적 */}
                                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-xs">
                                        <span className="text-muted-foreground"><span className="text-[11px] text-slate-400 dark:text-slate-500">매수 </span>{fmtCur(h.avgBuyPrice)} <span className="text-slate-400 dark:text-slate-500">x</span> {h.netQty.toLocaleString()}주</span>
                                        {h.currentPrice > 0 ? (
                                          <span className="text-muted-foreground"><span className="text-[11px] text-slate-400 dark:text-slate-500">현재 </span>{fmtCur(h.currentPrice)}</span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                        <span className="text-muted-foreground"><span className="text-[11px] text-slate-400 dark:text-slate-500">투자 </span>{formatAmount(toDisplay(h.totalInvested), displayCurrency)}</span>
                                        {h.currentPrice > 0 ? (
                                          <span className="font-medium"><span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">평가 </span>{formatAmount(toDisplay(h.currentValue), displayCurrency)}</span>
                                        ) : (
                                          <span className="text-slate-300">-</span>
                                        )}
                                        {h.currentPrice > 0 && (
                                          <>
                                            <span className="text-muted-foreground flex items-center gap-1.5">
                                              <span><span className="text-[11px] text-slate-400 dark:text-slate-500">보유 </span>{h.holdingDays.toLocaleString()}일</span>
                                              {h.irr != null && h.irr !== 0 && (
                                                <><span>·</span><span><span className="text-[11px] text-slate-400 dark:text-slate-500">IRR </span>{h.irr > 0 ? '+' : ''}{(h.irr * 100).toFixed(1)}%</span></>
                                              )}
                                            </span>
                                            <span className={cn(
                                              'font-medium',
                                              h.pnl > 0 ? 'text-red-600 dark:text-red-400' : h.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
                                            )}>
                                              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal">누적 </span>{h.pnl > 0 ? '+' : ''}{formatAmount(toDisplay(h.pnl), displayCurrency)} ({h.pnl > 0 ? '+' : ''}{h.pnlPercent.toFixed(1)}%)
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )
                                }
                                return <div className="space-y-2">{items.map(renderItem)}</div>
                              })()}
                            </div>
                          )
                        }
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-4">{col1.map(g => renderGroup(g))}</div>
                            <div className="space-y-4">{col2.map(g => renderGroup(g))}</div>
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    /* Analysis View */
                    <div className="space-y-4">
                      {/* Trend Charts */}
                      {(() => {
                        if (Object.keys(stockHistory).length === 0) {
                          return isLoadingHistory ? (
                            <div className="rounded-lg bg-white dark:bg-slate-700 p-4 text-center">
                              <Loader2 className="h-5 w-5 animate-spin mx-auto text-slate-400 mb-1" />
                              <span className="text-xs text-muted-foreground">추이 데이터 로딩 중...</span>
                            </div>
                          ) : null
                        }

                        // Build portfolio timeline
                        // 1. Collect all dates, build forward-filled price maps
                        const allDates = new Set<string>()
                        for (const [, hist] of Object.entries(stockHistory)) {
                          for (const d of hist.dates) allDates.add(d)
                        }
                        const sortedDates = Array.from(allDates).sort()

                        // 2. Build forward-filled price lookup (carry last known price)
                        const priceLookup = new Map<string, Map<string, number>>()
                        for (const [ticker, hist] of Object.entries(stockHistory)) {
                          const dateMap = new Map<string, number>()
                          const rawMap = new Map<string, number>()
                          for (let i = 0; i < hist.dates.length; i++) {
                            rawMap.set(hist.dates[i], hist.prices[i])
                          }
                          let lastPrice = 0
                          for (const d of sortedDates) {
                            const p = rawMap.get(d)
                            if (p && p > 0) lastPrice = p
                            if (lastPrice > 0) dateMap.set(d, lastPrice)
                          }
                          priceLookup.set(ticker, dateMap)
                        }

                        // 3. Build forward-filled FX rate map
                        const fxForDate = new Map<string, number>()
                        {
                          let lastFx = usdKrwRate
                          for (const d of sortedDates) {
                            if (fxHistory[d]) lastFx = fxHistory[d]
                            fxForDate.set(d, lastFx)
                          }
                        }

                        // 4. Build holdings state timeline with KRW cost tracking for US stocks
                        const tradesSorted = [...stockTrades].sort((a, b) =>
                          new Date(a.trade_date).getTime() - new Date(b.trade_date).getTime() || a.id.localeCompare(b.id)
                        )
                        type HoldingState = { qty: number; cost: number; krwCost: number; market: string; parentTheme: string | null }
                        const holdingStates = new Map<string, HoldingState>()
                        let tradeIdx = 0
                        const firstTradeDate = tradesSorted.length > 0 ? tradesSorted[0].trade_date : ''

                        const trendData: { date: string; [key: string]: number | string }[] = []
                        const themeKeys = ['AI 인프라', '지정학/안보', '넥스트', '미분류']

                        for (const date of sortedDates) {
                          if (date < firstTradeDate) continue

                          // Advance trades up to this date
                          while (tradeIdx < tradesSorted.length && tradesSorted[tradeIdx].trade_date <= date) {
                            const t = tradesSorted[tradeIdx]
                            const state = holdingStates.get(t.ticker) || {
                              qty: 0, cost: 0, krwCost: 0, market: t.market,
                              parentTheme: (stockThemes[t.ticker] || [])[0]?.parentTheme || null,
                            }
                            const isUS = t.market === 'US'
                            const tradeFx = isUS ? (fxForDate.get(t.trade_date) || usdKrwRate) : 1

                            if (t.trade_type === 'buy') {
                              state.cost += t.total_amount
                              state.krwCost += t.total_amount * tradeFx
                              state.qty += t.quantity
                            } else {
                              const avg = state.qty > 0 ? state.cost / state.qty : 0
                              const krwAvg = state.qty > 0 ? state.krwCost / state.qty : 0
                              state.cost -= avg * t.quantity
                              state.krwCost -= krwAvg * t.quantity
                              state.qty -= t.quantity
                              if (state.qty <= 0) { state.qty = 0; state.cost = 0; state.krwCost = 0 }
                            }
                            holdingStates.set(t.ticker, state)
                            tradeIdx++
                          }

                          // Calculate portfolio value on this date (all in KRW)
                          let totalVal = 0, totalCost = 0
                          let krVal = 0, krCost = 0, usVal = 0, usCost = 0
                          const themeVal: Record<string, number> = {}
                          const themeCost: Record<string, number> = {}
                          for (const k of themeKeys) { themeVal[k] = 0; themeCost[k] = 0 }
                          let hasAllPrices = true

                          for (const [ticker, state] of holdingStates) {
                            if (state.qty <= 0) continue
                            const price = priceLookup.get(ticker)?.get(date)
                            if (!price) { hasAllPrices = false; continue }

                            const isUS = state.market === 'US'
                            const fx = isUS ? (fxForDate.get(date) || usdKrwRate) : 1
                            const val = price * state.qty * fx
                            // Cost: use historical KRW cost (fixed, not affected by daily FX)
                            const cost = isUS ? state.krwCost : state.cost

                            totalVal += val; totalCost += cost
                            if (isUS) { usVal += val; usCost += cost } else { krVal += val; krCost += cost }

                            const group = state.parentTheme || '미분류'
                            themeVal[group] = (themeVal[group] || 0) + val
                            themeCost[group] = (themeCost[group] || 0) + cost
                          }

                          if (totalCost === 0 || !hasAllPrices) continue

                          const entry: { date: string; [key: string]: number | string } = {
                            date,
                            전체value: Math.round(totalVal), 전체pnl: Math.round(totalVal - totalCost),
                            전체pct: totalCost > 0 ? Math.round((totalVal - totalCost) / totalCost * 1000) / 10 : 0,
                            국내value: Math.round(krVal), 국내pnl: Math.round(krVal - krCost),
                            국내pct: krCost > 0 ? Math.round((krVal - krCost) / krCost * 1000) / 10 : 0,
                            해외value: Math.round(usVal), 해외pnl: Math.round(usVal - usCost),
                            해외pct: usCost > 0 ? Math.round((usVal - usCost) / usCost * 1000) / 10 : 0,
                          }
                          for (const k of themeKeys) {
                            entry[`${k}value`] = Math.round(themeVal[k] || 0)
                            entry[`${k}pnl`] = Math.round((themeVal[k] || 0) - (themeCost[k] || 0))
                            entry[`${k}pct`] = (themeCost[k] || 0) > 0
                              ? Math.round(((themeVal[k] || 0) - (themeCost[k] || 0)) / (themeCost[k] || 0) * 1000) / 10 : 0
                          }
                          trendData.push(entry)
                        }

                        // Append a "today" data point using current quotes to match holdings tab
                        if (Object.keys(stockQuotes).length > 0) {
                          const today = new Date().toISOString().slice(0, 10)
                          // Rebuild current state from holdingStates (already fully advanced)
                          let todayTotalVal = 0, todayTotalCost = 0
                          let todayKrVal = 0, todayKrCost = 0, todayUsVal = 0, todayUsCost = 0
                          const todayThemeVal: Record<string, number> = {}
                          const todayThemeCost: Record<string, number> = {}
                          for (const k of themeKeys) { todayThemeVal[k] = 0; todayThemeCost[k] = 0 }
                          let hasTodayData = false

                          for (const [ticker, state] of holdingStates) {
                            if (state.qty <= 0) continue
                            const quote = stockQuotes[ticker]
                            if (!quote?.price) continue
                            hasTodayData = true

                            const isUS = state.market === 'US'
                            const fx = isUS ? usdKrwRate : 1
                            const val = quote.price * state.qty * fx
                            const cost = isUS ? state.krwCost : state.cost

                            todayTotalVal += val; todayTotalCost += cost
                            if (isUS) { todayUsVal += val; todayUsCost += cost } else { todayKrVal += val; todayKrCost += cost }

                            const group = state.parentTheme || '미분류'
                            todayThemeVal[group] = (todayThemeVal[group] || 0) + val
                            todayThemeCost[group] = (todayThemeCost[group] || 0) + cost
                          }

                          if (hasTodayData && todayTotalCost > 0) {
                            const todayEntry: { date: string; [key: string]: number | string } = {
                              date: today,
                              전체value: Math.round(todayTotalVal), 전체pnl: Math.round(todayTotalVal - todayTotalCost),
                              전체pct: todayTotalCost > 0 ? Math.round((todayTotalVal - todayTotalCost) / todayTotalCost * 1000) / 10 : 0,
                              국내value: Math.round(todayKrVal), 국내pnl: Math.round(todayKrVal - todayKrCost),
                              국내pct: todayKrCost > 0 ? Math.round((todayKrVal - todayKrCost) / todayKrCost * 1000) / 10 : 0,
                              해외value: Math.round(todayUsVal), 해외pnl: Math.round(todayUsVal - todayUsCost),
                              해외pct: todayUsCost > 0 ? Math.round((todayUsVal - todayUsCost) / todayUsCost * 1000) / 10 : 0,
                            }
                            for (const k of themeKeys) {
                              todayEntry[`${k}value`] = Math.round(todayThemeVal[k] || 0)
                              todayEntry[`${k}pnl`] = Math.round((todayThemeVal[k] || 0) - (todayThemeCost[k] || 0))
                              todayEntry[`${k}pct`] = (todayThemeCost[k] || 0) > 0
                                ? Math.round(((todayThemeVal[k] || 0) - (todayThemeCost[k] || 0)) / (todayThemeCost[k] || 0) * 1000) / 10 : 0
                            }
                            // Replace if last entry is today, otherwise append
                            if (trendData.length > 0 && trendData[trendData.length - 1].date === today) {
                              trendData[trendData.length - 1] = todayEntry
                            } else {
                              trendData.push(todayEntry)
                            }
                          }
                        }

                        // Sample data to ~120 points max for performance
                        const sampled = trendData.length > 120
                          ? trendData.filter((_, i) => i % Math.ceil(trendData.length / 120) === 0 || i === trendData.length - 1)
                          : trendData

                        if (sampled.length < 2) return null

                        const groupColors: Record<string, string> = {
                          'AI 인프라': '#6366f1', '지정학/안보': '#f97316', '넥스트': '#a855f7', '미분류': '#94a3b8',
                        }
                        const marketColors = { 국내: '#3b82f6', 해외: '#10b981' }

                        const getLines = (suffix: string) => {
                          if (trendViewMode === 'total') {
                            return [{ key: `전체${suffix}`, color: '#6366f1', name: '전체' }]
                          }
                          if (trendViewMode === 'market') {
                            return [
                              { key: `국내${suffix}`, color: marketColors.국내, name: '국내' },
                              { key: `해외${suffix}`, color: marketColors.해외, name: '해외' },
                            ]
                          }
                          // group
                          return themeKeys
                            .filter(k => sampled.some(d => (d[`${k}value`] as number) > 0))
                            .map(k => ({ key: `${k}${suffix}`, color: groupColors[k], name: k }))
                        }

                        const fmtDate = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`
                        const fmtKrw = (v: number) => {
                          if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`
                          if (Math.abs(v) >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`
                          return v.toLocaleString()
                        }

                        const charts = [
                          { label: '평가액 추이', suffix: 'value', fmt: fmtKrw, unit: '원' },
                          { label: '수익금 추이', suffix: 'pnl', fmt: fmtKrw, unit: '원' },
                          { label: '수익률 추이', suffix: 'pct', fmt: (v: number) => `${v.toFixed(1)}`, unit: '%' },
                        ]

                        return (
                          <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-medium text-muted-foreground">포트폴리오 추이</span>
                              <div className="flex gap-1">
                                {(['total', 'group', 'market'] as const).map(m => (
                                  <button key={m} onClick={() => setTrendViewMode(m)}
                                    className={cn('px-2 py-0.5 text-xs rounded-full transition-colors',
                                      trendViewMode === m ? 'bg-slate-900 text-white dark:bg-slate-500' : 'bg-slate-100 text-slate-500 dark:bg-slate-600 dark:text-slate-400'
                                    )}>
                                    {m === 'total' ? '전체' : m === 'group' ? '그룹별' : '국내/해외'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              {charts.map(({ label, suffix, fmt, unit }) => {
                                const lines = getLines(suffix)
                                const lastPoint = sampled[sampled.length - 1]
                                return (
                                  <div key={suffix}>
                                    <div className="text-[11px] text-slate-400 mb-1">{label}</div>
                                    <ResponsiveContainer width="100%" height={160}>
                                      <LineChart data={sampled} margin={{ top: 12, right: 20, bottom: 5, left: 0 }}
                                        onMouseMove={() => { if (!trendTooltipActive) setTrendTooltipActive(true) }}
                                        onMouseLeave={() => setTrendTooltipActive(false)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                        <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                                        <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: '#94a3b8' }} width={45} />
                                        <RechartsTooltip
                                          contentStyle={{ fontSize: 11 }}
                                          labelFormatter={(d) => fmtDate(String(d))}
                                          formatter={(value) => [`${fmt(Number(value))}${unit}`, '']}
                                        />
                                        {lines.length > 1 && <RechartsLegend wrapperStyle={{ fontSize: 10 }} />}
                                        {lines.map(l => (
                                          <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color}
                                            name={l.name} dot={false} strokeWidth={1.5} />
                                        ))}
                                        {!trendTooltipActive && lastPoint && lines.map(l => {
                                          const val = lastPoint[l.key] as number
                                          if (val == null) return null
                                          return (
                                            <ReferenceDot key={`last-${l.key}`} x={lastPoint.date as string} y={val}
                                              r={3} fill={l.color} stroke="white" strokeWidth={1.5}
                                              label={{ value: `${fmt(val)}${unit}`, position: 'top', fontSize: 9, fontWeight: 600, fill: l.color, offset: 6 }} />
                                          )
                                        })}
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                      {/* Radar Charts */}
                      {(() => {
                        // Prepare data by theme
                        const themeData = new Map<string, { invested: number; value: number; pnl: number }>()
                        for (const h of holdings) {
                          const theme = h.themes?.[0] || '미분류'
                          const krwInvested = h.currency === 'USD' ? h.totalInvested * usdKrwRate : h.totalInvested
                          const krwValue = h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue
                          const krwPnl = h.currency === 'USD' ? h.pnl * usdKrwRate : h.pnl
                          const existing = themeData.get(theme) || { invested: 0, value: 0, pnl: 0 }
                          existing.invested += krwInvested
                          existing.value += krwValue
                          existing.pnl += krwPnl
                          themeData.set(theme, existing)
                        }
                        const totalValue = Array.from(themeData.values()).reduce((s, d) => s + d.value, 0)
                        const themeRadarData = Array.from(themeData.entries()).map(([theme, d]) => ({
                          theme,
                          비중: totalValue > 0 ? Math.round((d.value / totalValue) * 100) : 0,
                          수익률: d.invested > 0 ? Math.round(((d.value - d.invested) / d.invested) * 100) : 0,
                          수익금: Math.round(d.pnl / 10000), // 만원 단위
                        })).sort((a, b) => b.비중 - a.비중)

                        // Prepare data by stock
                        const stockRadarData = holdings
                          .filter(h => h.currentPrice > 0)
                          .map(h => {
                            const krwValue = h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue
                            const krwPnl = h.currency === 'USD' ? h.pnl * usdKrwRate : h.pnl
                            return {
                              name: h.company_name,
                              비중: totalValue > 0 ? Math.round((krwValue / totalValue) * 100) : 0,
                              수익률: Math.round(h.pnlPercent),
                              수익금: Math.round(krwPnl / 10000),
                            }
                          })
                          .sort((a, b) => b.비중 - a.비중)
                        return (
                          <>
                            {/* Theme Radar */}
                            <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2">테마별 분석</div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {[
                                  { key: '비중', label: '비중 (%)', color: '#6366f1' },
                                  { key: '수익률', label: '수익률 (%)', color: '#ef4444' },
                                  { key: '수익금', label: '수익금 (만원)', color: '#10b981' },
                                ].map(({ key, label, color }) => (
                                  <div key={key}>
                                    <div className="text-[11px] text-center text-slate-400 mb-1">{label}</div>
                                    <ResponsiveContainer width="100%" height={180}>
                                      <RadarChart data={themeRadarData} cx="50%" cy="50%" outerRadius="70%">
                                        <PolarGrid stroke="#e2e8f0" />
                                        <PolarAngleAxis dataKey="theme" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <PolarRadiusAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                        <Radar dataKey={key} stroke={color} fill={color} fillOpacity={0.3} />
                                        <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Stock Radar */}
                            <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2">종목별 분석</div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {[
                                  { key: '비중', label: '비중 (%)', color: '#6366f1' },
                                  { key: '수익률', label: '수익률 (%)', color: '#ef4444' },
                                  { key: '수익금', label: '수익금 (만원)', color: '#10b981' },
                                ].map(({ key, label, color }) => (
                                  <div key={key}>
                                    <div className="text-[11px] text-center text-slate-400 mb-1">{label}</div>
                                    <ResponsiveContainer width="100%" height={220}>
                                      <RadarChart data={stockRadarData} cx="50%" cy="50%" outerRadius="65%">
                                        <PolarGrid stroke="#e2e8f0" />
                                        <PolarAngleAxis dataKey="name" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                        <PolarRadiusAxis tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                        <Radar dataKey={key} stroke={color} fill={color} fillOpacity={0.3} />
                                        <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* AI Value Chain Analysis */}
                            {(() => {
                              const aiChainOrder = ['AI 반도체', 'AI 에너지/원전', '데이터센터/냉각/네트워킹']
                              const aiChainColors: Record<string, string> = {
                                'AI 반도체': 'bg-indigo-500',
                                'AI 에너지/원전': 'bg-amber-500',
                                '데이터센터/냉각/네트워킹': 'bg-cyan-500',
                              }
                              const aiChainBadge: Record<string, string> = {
                                'AI 반도체': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400',
                                'AI 에너지/원전': 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400',
                                '데이터센터/냉각/네트워킹': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400',
                              }
                              // Group holdings by AI sub-theme
                              const aiChainData = aiChainOrder.map(chain => {
                                const items = holdings.filter(h => h.currentPrice > 0 && h.themes.includes(chain))
                                const invested = items.reduce((s, h) => s + (h.currency === 'USD' ? h.totalInvested * usdKrwRate : h.totalInvested), 0)
                                const value = items.reduce((s, h) => s + (h.currency === 'USD' ? h.currentValue * usdKrwRate : h.currentValue), 0)
                                const pnl = value - invested
                                const pct = invested > 0 ? (pnl / invested) * 100 : 0
                                return { chain, items, invested, value, pnl, pct }
                              }).filter(d => d.items.length > 0)
                              const aiTotalValue = aiChainData.reduce((s, d) => s + d.value, 0)
                              if (aiChainData.length === 0) return null
                              return (
                                <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                                  <div className="text-xs font-medium text-muted-foreground mb-3">AI 밸류체인 분석</div>
                                  {/* Proportion bar */}
                                  <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
                                    {aiChainData.map(d => (
                                      <div
                                        key={d.chain}
                                        className={cn('h-full', aiChainColors[d.chain])}
                                        style={{ width: `${aiTotalValue > 0 ? (d.value / aiTotalValue) * 100 : 0}%` }}
                                      />
                                    ))}
                                  </div>
                                  {/* Chain segments */}
                                  <div className="space-y-3">
                                    {aiChainData.map(d => {
                                      const weightPct = aiTotalValue > 0 ? (d.value / aiTotalValue) * 100 : 0
                                      return (
                                        <div key={d.chain}>
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap', aiChainBadge[d.chain])}>
                                              {d.chain}
                                            </span>
                                            <span className="text-[11px] text-slate-400">{d.items.length}종목 · 비중 {weightPct.toFixed(0)}%</span>
                                            <span className={cn('text-[11px] font-medium ml-auto', d.pnl > 0 ? 'text-red-600 dark:text-red-400' : d.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                              {d.pnl > 0 ? '+' : ''}{formatAmount(d.pnl, 'KRW')} ({d.pnl > 0 ? '+' : ''}{d.pct.toFixed(1)}%)
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-1.5">
                                            <span>투자 {formatAmount(d.invested, 'KRW')}</span>
                                            <span>→</span>
                                            <span className="font-medium text-foreground">{formatAmount(d.value, 'KRW')}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {d.items.sort((a, b) => (b.currency === 'USD' ? b.pnl * usdKrwRate : b.pnl) - (a.currency === 'USD' ? a.pnl * usdKrwRate : a.pnl)).map(h => {
                                              const krwPnl = h.currency === 'USD' ? h.pnl * usdKrwRate : h.pnl
                                              return (
                                                <span key={h.ticker} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-600">
                                                  <span className="text-slate-600 dark:text-slate-300">{h.company_name}</span>
                                                  <span className={cn('font-medium', h.pnl > 0 ? 'text-red-600 dark:text-red-400' : h.pnl < 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                                                    {h.pnl > 0 ? '+' : ''}{Math.round(krwPnl / 10000).toLocaleString()}만 ({h.pnl > 0 ? '+' : ''}{h.pnlPercent.toFixed(0)}%)
                                                  </span>
                                                </span>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}
                          </>
                        )
                      })()}
                    </div>
                  )
                })()
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
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
                className="flex items-center gap-2 rounded-lg border border-transparent bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
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
                    className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-1.5 text-sm pl-8 outline-none transition-colors focus:bg-slate-50 dark:focus:bg-slate-600"
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
                    className={`!border-0 rounded-lg p-3 transition-colors ${
                      isDraggingWiki ? 'bg-purple-50 dark:bg-purple-900/30' : 'bg-white dark:bg-slate-700'
                    }`}
                    style={{ border: 'none' }}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingWiki(true) }}
                    onDragLeave={() => setIsDraggingWiki(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDraggingWiki(false); const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) setNewNoteFiles(prev => [...prev, ...files]) }}
                  >
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">제목</label>
                        <Input
                          value={newNoteTitle}
                          onChange={(e) => setNewNoteTitle(e.target.value)}
                          placeholder={t.wiki.titlePlaceholder}
                          className="!border-0 h-9"
                          style={{ border: 'none' }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">내용</label>
                        <TiptapEditor
                          content={newNoteContent}
                          onChange={setNewNoteContent}
                          placeholder={t.wiki.contentPlaceholder}
                          minHeight="80px"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">첨부 파일</label>
                        <div className={`!border-0 rounded-lg p-2 text-center transition-colors ${
                            isDraggingWiki ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-700'
                          }`} style={{ border: 'none' }}>
                          <input
                            type="file"
                            id="wiki-file-input-mgmt"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || [])
                              if (files.length > 0) {
                                setNewNoteFiles(prev => [...prev, ...files])
                              }
                              e.target.value = ''
                            }}
                          />
                          <label
                            htmlFor="wiki-file-input-mgmt"
                            className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>{t.wiki.fileAttach}</span>
                          </label>
                        </div>
                        {newNoteFiles.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {newNoteFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-600 rounded px-2 py-1.5">
                                <Paperclip className="h-3 w-3 text-slate-400" />
                                <span className="flex-1 truncate">{file.name}</span>
                                <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                                <button
                                  onClick={() => setNewNoteFiles(files => files.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-red-500"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setIsAddingNote(false); setNewNoteTitle(''); setNewNoteContent(''); setNewNoteFiles([]) }}
                      >
                        {t.common.cancel}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddNote}
                        disabled={(!newNoteTitle.trim() && !newNoteContent.trim() && newNoteFiles.length === 0) || isUploadingWiki}
                      >
                        {isUploadingWiki && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {isUploadingWiki ? t.common.saving : t.common.save}
                      </Button>
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
                ) : filteredWikiNotes.length > 0 ? (
                  paginatedWikiNotes.map((note) => (
                    <div key={note.id} className="!border-0 rounded-lg bg-white dark:bg-slate-700 p-3" style={{ border: 'none' }}>
                      {editingNote?.id === note.id ? (
                        <div
                          className={`!border-0 rounded-lg p-3 -m-3 transition-colors ${
                            isDraggingWiki ? 'bg-purple-50 dark:bg-purple-900/30' : 'bg-white dark:bg-slate-700'
                          }`}
                          style={{ border: 'none' }}
                          onDragOver={(e) => { e.preventDefault(); setIsDraggingWiki(true) }}
                          onDragLeave={() => setIsDraggingWiki(false)}
                          onDrop={(e) => { e.preventDefault(); setIsDraggingWiki(false); const files = Array.from(e.dataTransfer.files || []); if (files.length > 0) setNewNoteFiles(prev => [...prev, ...files]) }}
                        >
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">제목</label>
                              <Input
                                value={newNoteTitle}
                                onChange={(e) => setNewNoteTitle(e.target.value)}
                                className="!border-0 h-9"
                                style={{ border: 'none' }}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 mb-1 block">내용</label>
                              <TiptapEditor
                                content={newNoteContent}
                                onChange={setNewNoteContent}
                                placeholder="내용을 입력하세요..."
                                minHeight="80px"
                              />
                            </div>
                            <div>
                              <span className="text-xs text-slate-500 mb-1 block">첨부 파일</span>
                              <label
                                htmlFor={`wiki-file-input-edit-${note.id}`}
                                className={`!border-0 rounded-lg p-2 text-center transition-colors cursor-pointer block ${
                                  isDraggingWiki ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-600'
                                }`}
                                style={{ border: 'none' }}
                              >
                                <input
                                  type="file"
                                  id={`wiki-file-input-edit-${note.id}`}
                                  multiple
                                  className="hidden"
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || [])
                                    if (files.length > 0) {
                                      setNewNoteFiles(prev => [...prev, ...files])
                                    }
                                    e.target.value = ''
                                  }}
                                />
                                <span className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                  <Paperclip className="h-3 w-3" />
                                  <span>{t.wiki.fileAttach}</span>
                                </span>
                              </label>
                              {(editingNote.attachments && editingNote.attachments.length > 0) && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-xs text-slate-400">기존 첨부파일:</p>
                                  {editingNote.attachments.map((att, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
                                      <Paperclip className="h-3 w-3 text-slate-400" />
                                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">{att.name}</a>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newAttachments = editingNote.attachments?.filter((_, i) => i !== idx) || []
                                          setEditingNote({ ...editingNote, attachments: newAttachments })
                                        }}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {newNoteFiles.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-xs text-slate-400">새 첨부파일:</p>
                                  {newNoteFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-600 rounded px-2 py-1.5">
                                      <Paperclip className="h-3 w-3 text-slate-400" />
                                      <span className="flex-1 truncate">{file.name}</span>
                                      <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                                      <button
                                        onClick={() => setNewNoteFiles(files => files.filter((_, i) => i !== idx))}
                                        className="text-slate-400 hover:text-red-500"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm(t.wiki.deleteConfirm)) {
                                  handleDeleteNote(editingNote.id)
                                  setEditingNote(null)
                                  setNewNoteTitle('')
                                  setNewNoteContent('')
                                  setNewNoteFiles([])
                                }
                              }}
                            >
                              {t.common.delete}
                            </Button>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setEditingNote(null); setNewNoteTitle(''); setNewNoteContent(''); setNewNoteFiles([]) }}
                              >
                                {t.common.cancel}
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleUpdateNote}
                                disabled={(!newNoteTitle.trim() && !newNoteContent.trim()) || isUploadingWiki}
                              >
                                {isUploadingWiki && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                                {isUploadingWiki ? t.common.saving : t.common.save}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {note.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                              <p className="font-medium text-sm">{note.title}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setViewingNote(note)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-400 cursor-pointer"
                              >
                                <Maximize2 className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleTogglePin(note)}
                                className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer ${note.is_pinned ? 'text-amber-500' : 'text-slate-400'}`}
                              >
                                <Pin className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => startEditNote(note)}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-400 cursor-pointer"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <div
                            className={cn(
                              "wiki-content mt-1 text-slate-600 dark:text-slate-400",
                              !expandedNotes.has(note.id) && "line-clamp-3 overflow-hidden"
                            )}
                            dangerouslySetInnerHTML={{ __html: note.content?.startsWith('<') ? note.content : plainTextToHtml(note.content || '') }}
                          />
                          {note.content && (note.content.length > 150 || note.content.split('\n').length > 3) && (
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedNotes)
                                if (newExpanded.has(note.id)) {
                                  newExpanded.delete(note.id)
                                } else {
                                  newExpanded.add(note.id)
                                }
                                setExpandedNotes(newExpanded)
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-1"
                            >
                              {expandedNotes.has(note.id) ? '접기' : '펼치기'}
                            </button>
                          )}
                          {note.attachments && note.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {note.attachments.map((att, idx) => (
                                <a
                                  key={idx}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300"
                                >
                                  <Paperclip className="h-2.5 w-2.5" />
                                  <span>{att.name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(note.updated_at).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                ) : null}
              </div>
              {filteredWikiNotes.length > 0 && (
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-700 mt-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className="hidden sm:inline">{t.wiki.showingRange
                        .replace('{total}', String(filteredWikiNotes.length))
                        .replace('{start}', String((wikiPage - 1) * wikiPerPage + 1))
                        .replace('{end}', String(Math.min(wikiPage * wikiPerPage, filteredWikiNotes.length)))}</span>
                      <span className="sm:hidden">{filteredWikiNotes.length}개 중 {(wikiPage - 1) * wikiPerPage + 1}-{Math.min(wikiPage * wikiPerPage, filteredWikiNotes.length)}</span>
                    </p>
                    <div className="relative">
                      <select
                        value={wikiPerPage}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setWikiPerPage(val)
                          localStorage.setItem('willow-wiki-per-page', String(val))
                          setWikiPage(1)
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
                  {totalWikiPages > 1 && (
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setWikiPage(1)} disabled={wikiPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-4 w-4" /></button>
                      <button onClick={() => setWikiPage(p => Math.max(1, p - 1))} disabled={wikiPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                      <span className="px-2 py-1 text-xs font-medium">{wikiPage}/{totalWikiPages}</span>
                      <button onClick={() => setWikiPage(p => Math.min(totalWikiPages, p + 1))} disabled={wikiPage === totalWikiPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-4 w-4" /></button>
                      <button onClick={() => setWikiPage(totalWikiPages)} disabled={wikiPage === totalWikiPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Row 2.5 - Investment Kanban (full width) */}
      <InvestmentKanban
        stockResearch={stockResearch}
        smallcapData={smallcapData}
        loadStockResearch={loadStockResearch}
        loadSmallcapScreening={loadSmallcapScreening}
        isLoadingResearch={isLoadingResearch}
        isLoadingSmallcap={isLoadingSmallcap}
        stockTrades={stockTrades}
      />

      {/* Row 2.6 - Real Estate Research */}
      <Card className="bg-slate-100 dark:bg-slate-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              부동산 리서치
            </CardTitle>
            <CardDescription>강남3구 부동산 리서치</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {['강남구', '서초구', '송파구'].map(d => (
              <button key={d} onClick={() => {
                setReDistrictFilter(prev =>
                  prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                )
                setReComplexFilter([])
                setReTradeListPage(0)
                setReJeonseListPage(0)
              }}
                className={cn('px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                  reDistrictFilter.includes(d) ? 'bg-slate-900 text-white dark:bg-slate-500' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                )}>
                {d.replace('구', '')}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filter Bar: 단지 + 평형 + 기간 한 줄 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-1 w-full sm:w-auto flex-wrap">
                <span className="text-[11px] text-slate-400 mr-0.5">단지</span>
                {reComplexFilter.length === 0 ? (
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">전체 ({reComplexes.length}개)</span>
                ) : (
                  reComplexFilter.map(id => {
                    const c = reComplexes.find(x => x.id === id)
                    return c ? (
                      <button key={id} onClick={() => { setReComplexFilter(prev => prev.filter(x => x !== id)); setReTradeListPage(0); setReJeonseListPage(0) }}
                        className="px-2 py-0.5 text-xs rounded-full bg-slate-900 text-white dark:bg-slate-500 flex items-center gap-1">
                        {c.name} <X className="h-2.5 w-2.5" />
                      </button>
                    ) : null
                  })
                )}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !reComplexFilter.includes(e.target.value)) {
                      setReComplexFilter(prev => [...prev, e.target.value])
                      setReTradeListPage(0)
                      setReJeonseListPage(0)
                    }
                  }}
                  className="text-xs bg-white dark:bg-slate-700 rounded px-1.5 py-0.5 cursor-pointer"
                >
                  <option value="">+</option>
                  {reComplexes
                    .filter(c => !reComplexFilter.includes(c.id))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.district_name.replace('구', '')} · {c.name}</option>
                    ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-0.5">평형</span>
                {[{ v: '', l: '전체' }, { v: '20', l: '20평' }, { v: '30', l: '30평' }, { v: '40', l: '40평' }, { v: '50', l: '50평' }, { v: '60+', l: '60+' }].map(a => (
                  <button key={a.v} onClick={() => { setReAreaFilter(a.v); setReTradeListPage(0); setReJeonseListPage(0) }}
                    className={cn('px-2 py-0.5 text-xs font-medium rounded-full transition-colors',
                      reAreaFilter === a.v ? 'bg-slate-900 text-white dark:bg-slate-500' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    )}>
                    {a.l}
                  </button>
                ))}
              </div>
              {reSummary && (reSummary.lastListingDate || reSummary.lastTradeDate) && (
                <span className="text-[11px] text-slate-400 sm:ml-auto whitespace-nowrap">
                  호가 {reSummary.lastListingDate?.slice(5).replace('-', '/')} · 실거래 {reSummary.lastTradeDate?.slice(5).replace('-', '/')}
                </span>
              )}
            </div>

            {isLoadingRe ? (
              <div className="text-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                <p className="text-xs text-muted-foreground mt-2">부동산 데이터 로딩중...</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                {reSummary && (
                  <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-5 md:gap-2">
                    <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">추적 단지</div>
                      <div className="text-sm font-bold">{reSummary.trackedComplexes}개 <span className="text-[11px] text-slate-400 font-normal">({reSummary.districtCount}개구)</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">최근1월 매매가 <span className="text-slate-400 dark:text-slate-500">(만/평)</span></div>
                        <div className="text-sm font-bold">{reSummary.avgTradePpp?.toLocaleString() || '-'}</div>
                      </div>
                      <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">매도호가 괴리율</div>
                        <div className={cn('text-sm font-bold', reSummary.tradeListingGap > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
                          {reSummary.tradeListingGap > 0 ? '+' : ''}{reSummary.tradeListingGap.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">최근1월 전세가 <span className="text-slate-400 dark:text-slate-500">(만/평)</span></div>
                        <div className="text-sm font-bold">{reSummary.avgJeonsePpp?.toLocaleString() || '-'}</div>
                      </div>
                      <div className="rounded-lg bg-white dark:bg-slate-700 px-3 py-2">
                        <div className="text-[11px] text-muted-foreground">전세호가 괴리율</div>
                        <div className={cn('text-sm font-bold', reSummary.jeonseListingGap > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
                          {reSummary.jeonseListingGap > 0 ? '+' : ''}{reSummary.jeonseListingGap.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 매매/전세 2열 그리드 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                {/* Section 1: 매매 실거래가 추이 */}
                {reTrades && reTrades.months.length > 0 && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3 pb-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">매매 실거래가 추이 <span className="text-[11px] text-slate-400 font-normal">(평당가, 만원)</span></span>
                      {reTrades.complexes.length > 0 && (() => {
                        // 전월 대비 변동률
                        const months = reTrades.months
                        if (months.length < 2) return null
                        const curMonth = months[months.length - 1]
                        const prevMonth = months[months.length - 2]
                        let prevTotal = 0, prevCount = 0, curTotal = 0, curCount = 0
                        for (const c of reTrades.complexes) {
                          const prevD = c.data.find(d => d.month === prevMonth)
                          if (prevD?.avgPpp) { prevTotal += prevD.avgPpp; prevCount++ }
                          const curD = c.data.find(d => d.month === curMonth)
                          if (curD?.avgPpp) { curTotal += curD.avgPpp; curCount++ }
                        }
                        if (prevCount === 0 || curCount === 0) return null
                        const changePct = ((curTotal / curCount - prevTotal / prevCount) / (prevTotal / prevCount)) * 100
                        return (
                          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
                            changePct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          )}>
                            전월대비 {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={reTrades.months.map(m => {
                        const entry: Record<string, string | number | null> = { month: m }
                        let totalCount = 0
                        for (const c of reTrades.complexes) {
                          const d = c.data.find(dd => dd.month === m)
                          entry[c.name] = d?.avgPpp ?? null
                          totalCount += d?.count || 0
                        }
                        entry._count = totalCount
                        return entry
                      })} margin={{ top: 12, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis yAxisId="price" tickFormatter={(v: number) => v.toLocaleString()} tick={{ fontSize: 9, fill: '#94a3b8' }} width={50} />
                        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 8, fill: '#94a3b8' }} width={30} />
                        <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(value, name) => name === '_count' ? [`${value}건`, '거래량'] : [`${Number(value).toLocaleString()}만원/평`, name]} />
                        <Bar yAxisId="count" dataKey="_count" fill="#cbd5e1" radius={[2, 2, 0, 0]} barSize={16} />
                        {reTrades.complexes.slice(0, 10).map((c, i) => {
                          const colors = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#84cc16', '#64748b']
                          return <Line key={c.name} yAxisId="price" type="monotone" dataKey={c.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={1.5} connectNulls />
                        })}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Section 1.5: 매매 괴리율 일일 추이 */}
                {reListingTrend && reListingTrend.trend.length > 1 && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3 pb-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">매매 괴리율 추이 <span className="text-[11px] text-slate-400 font-normal">(호가 저 vs 실거래, %)</span></span>
                      {reSummary?.tradeListingGap != null && (
                        <span className={`text-[11px] font-medium ${reSummary.tradeListingGap > 0 ? 'text-red-500' : 'text-blue-500'}`}>현재 {reSummary.tradeListingGap > 0 ? '+' : ''}{reSummary.tradeListingGap}%</span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      {(() => {
                        const chartData = reListingTrend.trend.filter(d => d.gapRate != null)
                        const allVals = chartData.map(d => d.gapRate!).filter((v): v is number => v != null)
                        const minVal = allVals.length > 0 ? Math.min(...allVals) : 0
                        const maxVal = allVals.length > 0 ? Math.max(...allVals) : 0
                        const yMin = Math.floor(Math.min(minVal - 2, 0) / 5) * 5
                        const yMax = Math.ceil(Math.max(maxVal + 2, 0) / 5) * 5
                        const yTicks: number[] = []
                        for (let t = yMin; t <= yMax; t += 5) yTicks.push(t)
                        return (
                      <ComposedChart data={chartData} margin={{ top: 12, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis domain={[yMin, yMax]} ticks={yTicks} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                        <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`]} labelFormatter={(l) => String(l)} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="gapRate" name="괴리율" stroke="#6366f1" dot={{ r: 3 }} strokeWidth={2} connectNulls />
                      </ComposedChart>
                        )
                      })()}
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Section 2: 매도 호가 vs 실거래가 */}
                {reListingsTrade.length > 0 && (() => {
                  const sorted = [...reListingsTrade].sort((a, b) => {
                    const av = a[reTradeSortKey], bv = b[reTradeSortKey]
                    const an = typeof av === 'string' ? av : (av ?? (reTradeSortAsc ? Infinity : -Infinity))
                    const bn = typeof bv === 'string' ? bv : (bv ?? (reTradeSortAsc ? Infinity : -Infinity))
                    if (an < bn) return reTradeSortAsc ? -1 : 1
                    if (an > bn) return reTradeSortAsc ? 1 : -1
                    return 0
                  })
                  const totalPages = Math.ceil(sorted.length / RE_LIST_PAGE_SIZE)
                  const paged = sorted.slice(reTradeListPage * RE_LIST_PAGE_SIZE, (reTradeListPage + 1) * RE_LIST_PAGE_SIZE)
                  const thClick = (key: ReSortKey) => { if (reTradeSortKey === key) setReTradeSortAsc(!reTradeSortAsc); else { setReTradeSortKey(key); setReTradeSortAsc(key === 'gap' ? true : true) }; setReTradeListPage(0) }
                  const thCls = (key: ReSortKey) => cn('font-normal pb-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none', reTradeSortKey === key && 'text-slate-600 dark:text-slate-300 font-medium')
                  return (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">매도 호가 vs 실거래가 <span className="text-[11px] text-slate-400 font-normal">(만원/평, 공급면적 기준)</span></span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setReTradeListPage(p => Math.max(0, p - 1))} disabled={reTradeListPage === 0} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                          <span className="text-[11px] text-slate-400">{reTradeListPage + 1}/{totalPages}</span>
                          <button onClick={() => setReTradeListPage(p => Math.min(totalPages - 1, p + 1))} disabled={reTradeListPage >= totalPages - 1} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="text-[11px] text-slate-400">
                          <th className={cn('text-left', thCls('complexName'))} onClick={() => thClick('complexName')}>단지</th>
                          <th className={cn('text-right', thCls('areaBand'))} onClick={() => thClick('areaBand')}>평형</th>
                          <th className={cn('text-right', thCls('actualAvgPpp'))} onClick={() => thClick('actualAvgPpp')}>실거래</th>
                          <th className={cn('text-right', thCls('listingMinPpp'))} onClick={() => thClick('listingMinPpp')}>호가(저)</th>
                          <th className={cn('text-right', thCls('listingMaxPpp'))} onClick={() => thClick('listingMaxPpp')}>호가(고)</th>
                          <th className={cn('text-right', thCls('gap'))} onClick={() => thClick('gap')}>괴리율</th>
                          <th className={cn('text-right', thCls('listingCount'))} onClick={() => thClick('listingCount')}>매물</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(r => (
                          <tr key={`${r.complexName}-${r.areaBand}`} className="border-t border-slate-50 dark:border-slate-600">
                            <td className="py-1 font-medium truncate">{r.complexNo ? <a href={`https://new.land.naver.com/complexes/${r.complexNo}?ms=a1&a=APT&e=OPST`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 underline decoration-slate-300 dark:decoration-slate-500 underline-offset-2">{r.complexName}</a> : r.complexName}</td>
                            <td className="py-1 text-right text-muted-foreground">{r.areaBand >= 60 ? '60+' : r.areaBand}평대</td>
                            <td className="py-1 text-right text-muted-foreground">{r.actualAvgPpp ? Math.round(r.actualAvgPpp).toLocaleString() : '-'}</td>
                            <td className="py-1 text-right">{r.listingMinPpp ? Math.round(r.listingMinPpp).toLocaleString() : '-'}</td>
                            <td className="py-1 text-right text-muted-foreground">{r.listingMaxPpp ? Math.round(r.listingMaxPpp).toLocaleString() : '-'}</td>
                            <td className={cn('py-1 text-right font-medium', r.gap != null && r.gap > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
                              {r.gap != null ? `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}%` : '-'}
                            </td>
                            <td className="py-1 text-right text-muted-foreground">{r.listingCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                })()}

                </div>
                <div className="space-y-4">
                {/* Section 3: 전세 실거래가 추이 */}
                {reRentals && reRentals.months.length > 0 && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3 pb-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">전세 실거래가 추이 <span className="text-[11px] text-slate-400 font-normal">(평당 보증금, 만원)</span></span>
                      {reRentals.complexes.length > 0 && (() => {
                        const months = reRentals.months
                        if (months.length < 2) return null
                        const curMonth = months[months.length - 1]
                        const prevMonth = months[months.length - 2]
                        let prevTotal = 0, prevCount = 0, curTotal = 0, curCount = 0
                        for (const c of reRentals.complexes) {
                          const prevD = c.data.find(d => d.month === prevMonth)
                          if (prevD?.avgPpp) { prevTotal += prevD.avgPpp; prevCount++ }
                          const curD = c.data.find(d => d.month === curMonth)
                          if (curD?.avgPpp) { curTotal += curD.avgPpp; curCount++ }
                        }
                        if (prevCount === 0 || curCount === 0) return null
                        const changePct = ((curTotal / curCount - prevTotal / prevCount) / (prevTotal / prevCount)) * 100
                        return (
                          <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
                            changePct > 0 ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          )}>
                            전월대비 {changePct > 0 ? '+' : ''}{changePct.toFixed(1)}%
                          </span>
                        )
                      })()}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={reRentals.months.map(m => {
                        const entry: Record<string, string | number | null> = { month: m }
                        let totalCount = 0
                        for (const c of reRentals.complexes) {
                          const d = c.data.find(dd => dd.month === m)
                          entry[c.name] = d?.avgPpp ?? null
                          totalCount += d?.count || 0
                        }
                        entry._count = totalCount
                        return entry
                      })} margin={{ top: 12, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis yAxisId="price" tickFormatter={(v: number) => v.toLocaleString()} tick={{ fontSize: 9, fill: '#94a3b8' }} width={50} />
                        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 8, fill: '#94a3b8' }} width={30} />
                        <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(value, name) => name === '_count' ? [`${value}건`, '거래량'] : [`${Number(value).toLocaleString()}만원/평`, name]} />
                        <Bar yAxisId="count" dataKey="_count" fill="#cbd5e1" radius={[2, 2, 0, 0]} barSize={16} />
                        {reRentals.complexes.slice(0, 10).map((c, i) => {
                          const colors = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#84cc16', '#64748b']
                          return <Line key={c.name} yAxisId="price" type="monotone" dataKey={c.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={1.5} connectNulls />
                        })}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Section 3.5: 전세 괴리율 일일 추이 */}
                {reListingTrendJeonse && reListingTrendJeonse.trend.length > 1 && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3 pb-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">전세 괴리율 추이 <span className="text-[11px] text-slate-400 font-normal">(호가 저 vs 실거래, %)</span></span>
                      {reSummary?.jeonseListingGap != null && (
                        <span className={`text-[11px] font-medium ${reSummary.jeonseListingGap > 0 ? 'text-red-500' : 'text-blue-500'}`}>현재 {reSummary.jeonseListingGap > 0 ? '+' : ''}{reSummary.jeonseListingGap}%</span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      {(() => {
                        const chartData = reListingTrendJeonse.trend.filter(d => d.gapRate != null)
                        const allVals = chartData.map(d => d.gapRate!).filter((v): v is number => v != null)
                        const minVal = allVals.length > 0 ? Math.min(...allVals) : 0
                        const maxVal = allVals.length > 0 ? Math.max(...allVals) : 0
                        const yMin = Math.floor(Math.min(minVal - 2, 0) / 5) * 5
                        const yMax = Math.ceil(Math.max(maxVal + 2, 0) / 5) * 5
                        const yTicks: number[] = []
                        for (let t = yMin; t <= yMax; t += 5) yTicks.push(t)
                        return (
                      <ComposedChart data={chartData} margin={{ top: 12, right: 5, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis domain={[yMin, yMax]} ticks={yTicks} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} />
                        <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)}%`]} labelFormatter={(l) => String(l)} />
                        <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="gapRate" name="괴리율" stroke="#10b981" dot={{ r: 3 }} strokeWidth={2} connectNulls />
                      </ComposedChart>
                        )
                      })()}
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Section 4: 전세 호가 vs 실거래가 */}
                {reListingsJeonse.length > 0 && (() => {
                  const sorted = [...reListingsJeonse].sort((a, b) => {
                    const av = a[reJeonseSortKey], bv = b[reJeonseSortKey]
                    const an = typeof av === 'string' ? av : (av ?? (reJeonseSortAsc ? Infinity : -Infinity))
                    const bn = typeof bv === 'string' ? bv : (bv ?? (reJeonseSortAsc ? Infinity : -Infinity))
                    if (an < bn) return reJeonseSortAsc ? -1 : 1
                    if (an > bn) return reJeonseSortAsc ? 1 : -1
                    return 0
                  })
                  const totalPages = Math.ceil(sorted.length / RE_LIST_PAGE_SIZE)
                  const paged = sorted.slice(reJeonseListPage * RE_LIST_PAGE_SIZE, (reJeonseListPage + 1) * RE_LIST_PAGE_SIZE)
                  const thClick = (key: ReSortKey) => { if (reJeonseSortKey === key) setReJeonseSortAsc(!reJeonseSortAsc); else { setReJeonseSortKey(key); setReJeonseSortAsc(key === 'gap' ? true : true) }; setReJeonseListPage(0) }
                  const thCls = (key: ReSortKey) => cn('font-normal pb-1 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none', reJeonseSortKey === key && 'text-slate-600 dark:text-slate-300 font-medium')
                  return (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">전세 호가 vs 실거래가 <span className="text-[11px] text-slate-400 font-normal">(만원/평, 공급면적 기준)</span></span>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setReJeonseListPage(p => Math.max(0, p - 1))} disabled={reJeonseListPage === 0} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                          <span className="text-[11px] text-slate-400">{reJeonseListPage + 1}/{totalPages}</span>
                          <button onClick={() => setReJeonseListPage(p => Math.min(totalPages - 1, p + 1))} disabled={reJeonseListPage >= totalPages - 1} className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-600 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    <table className="w-full text-xs table-fixed">
                      <colgroup>
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[15%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="text-[11px] text-slate-400">
                          <th className={cn('text-left', thCls('complexName'))} onClick={() => thClick('complexName')}>단지</th>
                          <th className={cn('text-right', thCls('areaBand'))} onClick={() => thClick('areaBand')}>평형</th>
                          <th className={cn('text-right', thCls('actualAvgPpp'))} onClick={() => thClick('actualAvgPpp')}>실거래</th>
                          <th className={cn('text-right', thCls('listingMinPpp'))} onClick={() => thClick('listingMinPpp')}>호가(저)</th>
                          <th className={cn('text-right', thCls('listingMaxPpp'))} onClick={() => thClick('listingMaxPpp')}>호가(고)</th>
                          <th className={cn('text-right', thCls('gap'))} onClick={() => thClick('gap')}>괴리율</th>
                          <th className={cn('text-right', thCls('listingCount'))} onClick={() => thClick('listingCount')}>매물</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(r => (
                          <tr key={`${r.complexName}-${r.areaBand}`} className="border-t border-slate-50 dark:border-slate-600">
                            <td className="py-1 font-medium truncate">{r.complexNo ? <a href={`https://new.land.naver.com/complexes/${r.complexNo}?ms=b1&a=APT&e=OPST`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 underline decoration-slate-300 dark:decoration-slate-500 underline-offset-2">{r.complexName}</a> : r.complexName}</td>
                            <td className="py-1 text-right text-muted-foreground">{r.areaBand >= 60 ? '60+' : r.areaBand}평대</td>
                            <td className="py-1 text-right text-muted-foreground">{r.actualAvgPpp ? Math.round(r.actualAvgPpp).toLocaleString() : '-'}</td>
                            <td className="py-1 text-right">{r.listingMinPpp ? Math.round(r.listingMinPpp).toLocaleString() : '-'}</td>
                            <td className="py-1 text-right text-muted-foreground">{r.listingMaxPpp ? Math.round(r.listingMaxPpp).toLocaleString() : '-'}</td>
                            <td className={cn('py-1 text-right font-medium', r.gap != null && r.gap > 0 ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400')}>
                              {r.gap != null ? `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}%` : '-'}
                            </td>
                            <td className="py-1 text-right text-muted-foreground">{r.listingCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                })()}

                {/* Section 5: 전세가율 추이 */}
                {reJeonseRatio.length > 0 && (
                  <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
                    <div className="text-xs font-medium mb-2">전세가율 추이</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={reJeonseRatio} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(5)} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis domain={[30, 70]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9, fill: '#94a3b8' }} width={35} />
                        <RechartsTooltip contentStyle={{ fontSize: 11 }} formatter={(value) => [`${value}%`, '전세가율']} />
                        <ReferenceLine y={40} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '40%', position: 'right', fontSize: 9, fill: '#94a3b8' }} />
                        <ReferenceLine y={60} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '60%', position: 'right', fontSize: 9, fill: '#94a3b8' }} />
                        <Area type="monotone" dataKey="ratio" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={1.5} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                </div>
                </div>

                {/* Empty state */}
                {!reTrades && !reSummary && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">부동산 데이터가 없습니다</p>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Row 3 - Email (full width) */}
          <Card className="bg-slate-100 dark:bg-slate-800">
            <CardHeader className="space-y-4">
              {gmailMessage && (
                <div className={`rounded-lg px-3 py-2 text-sm ${
                  gmailMessage.type === 'error'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                }`}>
                  {gmailMessage.text}
                  <button onClick={() => setGmailMessage(null)} className="ml-2 font-bold hover:opacity-70">×</button>
                </div>
              )}
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
                <div className="grid grid-cols-5 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    onClick={syncEmails}
                    disabled={isSyncing || !syncStatus.isConnected}
                    className="flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleAutoLabel}
                    disabled={isAutoLabeling || !syncStatus.isConnected}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 disabled:opacity-50 cursor-pointer"
                  >
                    {isAutoLabeling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
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
                      <button onClick={() => setShowGmailSettings(false)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <X className="h-5 w-5" />
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
                  <div className="flex gap-1 mb-4 flex-wrap">
                    <button
                      onClick={() => setEmailFilter('all')}
                      className={cn(
                        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                        emailFilter === 'all'
                          ? 'bg-slate-900 text-white dark:bg-slate-600'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      {t.gmail.filterAll}
                    </button>
                    {availableCategories.map((category) => {
                      const color = getCategoryColor(category, availableCategories)
                      return (
                        <button
                          key={category}
                          onClick={() => setEmailFilter(category)}
                          className={cn(
                            'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                            emailFilter === category
                              ? `${color.button} text-white`
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                          )}
                        >
                          {category}
                        </button>
                      )
                    })}
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
                                  {/* 카테고리 배지 (제목 위) */}
                                  {(email.categories?.length || email.category) && (
                                    <div className="flex flex-wrap gap-1 mb-1">
                                      {(email.categories || (email.category ? [email.category] : [])).map((cat, idx) => (
                                        <span key={idx} className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getCategoryColor(cat, availableCategories).bg} ${getCategoryColor(cat, availableCategories).text}`}>
                                          {cat}
                                        </span>
                                      ))}
                                    </div>
                                  )}
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
                            </div>
                          </div>
                        ))}
                        {filteredEmails.length > 0 && (
                          <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                            <div className="flex items-center gap-2">
                              <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                                {t.gmail.showingRange.replace('{total}', String(filteredEmails.length)).replace('{start}', String((emailPage - 1) * emailsPerPage + 1)).replace('{end}', String(Math.min(emailPage * emailsPerPage, filteredEmails.length)))}
                              </p>
                              <p className="sm:hidden text-xs text-muted-foreground whitespace-nowrap">
                                {filteredEmails.length}개 중 {(emailPage - 1) * emailsPerPage + 1}-{Math.min(emailPage * emailsPerPage, filteredEmails.length)}
                              </p>
                              <div className="relative">
                                <select
                                  value={emailsPerPage}
                                  onChange={(e) => {
                                    setEmailsPerPage(Number(e.target.value))
                                    setEmailPage(1)
                                  }}
                                  className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                >
                                  <option value={5}>5개</option>
                                  <option value={10}>10개</option>
                                  <option value={25}>25개</option>
                                  <option value={50}>50개</option>
                                  <option value={100}>100개</option>
                                </select>
                                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
                              </div>
                            </div>
                            {Math.ceil(filteredEmails.length / emailsPerPage) > 1 && (
                              <div className="flex items-center gap-0.5">
                                <button onClick={() => setEmailPage(1)} disabled={emailPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsLeft className="h-4 w-4" /></button>
                                <button onClick={() => setEmailPage(p => Math.max(1, p - 1))} disabled={emailPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                                <span className="px-2 sm:px-3 py-1 text-xs font-medium">{emailPage}/{Math.ceil(filteredEmails.length / emailsPerPage)}</span>
                                <button onClick={() => setEmailPage(p => Math.min(Math.ceil(filteredEmails.length / emailsPerPage), p + 1))} disabled={emailPage === Math.ceil(filteredEmails.length / emailsPerPage)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight className="h-4 w-4" /></button>
                                <button onClick={() => setEmailPage(Math.ceil(filteredEmails.length / emailsPerPage))} disabled={emailPage === Math.ceil(filteredEmails.length / emailsPerPage)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronsRight className="h-4 w-4" /></button>
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
                        <span className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${selectedEmail.direction === 'outbound' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {selectedEmail.direction === 'outbound' ? t.gmail.outbound : t.gmail.inbound}
                        </span>
                        <h3 className="text-lg font-semibold break-words flex-1">{selectedEmail.subject || t.gmail.noSubject}</h3>
                        <button onClick={() => setSelectedEmail(null)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                          <X className="h-5 w-5" />
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
                                href={`/api/gmail/attachments/${selectedEmail.id}/${att.attachmentId}?context=willow&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`}
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
                          className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <X className="h-5 w-5" />
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
                                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${color.bg} ${color.text}`}>
                                  {cat.category}
                                </span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{cat.emailCount} emails</span>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto">{currentIndex + 1}/{aiAnalysis.categories.length}</span>
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{cat.summary}</p>

                              {/* Recent Topics */}
                              {cat.recentTopics && cat.recentTopics.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {cat.recentTopics.map((topic, idx) => (
                                    <span key={idx} className="px-1.5 py-px bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-xs">
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


      {/* Wiki View Modal */}
      <Dialog open={!!viewingNote} onOpenChange={(open) => !open && setViewingNote(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" resizable>
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              {viewingNote?.is_pinned && <Pin className="h-4 w-4 text-amber-500" />}
              {viewingNote?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div
              className="wiki-content text-sm text-slate-600 dark:text-slate-400"
              dangerouslySetInnerHTML={{ __html: viewingNote?.content?.startsWith('<') ? viewingNote.content : plainTextToHtml(viewingNote?.content || '') }}
            />
            {viewingNote?.attachments && viewingNote.attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {viewingNote.attachments.map((att, idx) => (
                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded px-2 py-1 text-slate-600 dark:text-slate-300">
                    <Paperclip className="h-3 w-3" /><span>{att.name}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="flex-shrink-0 pt-4 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              작성 {viewingNote && new Date(viewingNote.created_at).toLocaleDateString('ko-KR')}
              {viewingNote && viewingNote.updated_at !== viewingNote.created_at && ` · 수정 ${new Date(viewingNote.updated_at).toLocaleDateString('ko-KR')}`}
            </p>
            <Button size="sm" variant="outline" onClick={() => { startEditNote(viewingNote!); setViewingNote(null) }}>수정</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Modal (Simplified) */}
      <Dialog open={isInvoiceModalOpen} onOpenChange={setIsInvoiceModalOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{editingInvoice ? '현금관리 수정' : '현금관리 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
                {/* Type Selection */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">유형</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('revenue')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg transition-colors',
                        invoiceFormType === 'revenue'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      매출
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('expense')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg transition-colors',
                        invoiceFormType === 'expense'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      비용
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('asset')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg transition-colors',
                        invoiceFormType === 'asset'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      자산
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceFormType('liability')}
                      className={cn(
                        'py-2 text-sm font-medium rounded-lg transition-colors',
                        invoiceFormType === 'liability'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      부채
                    </button>
                  </div>
                </div>

                {/* Counterparty */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">거래처 *</label>
                  <Input
                    type="text"
                    value={invoiceFormCounterparty}
                    onChange={(e) => setInvoiceFormCounterparty(e.target.value)}
                    placeholder="거래처명"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">내역</label>
                  <Input
                    type="text"
                    value={invoiceFormDescription}
                    onChange={(e) => setInvoiceFormDescription(e.target.value)}
                    placeholder="내역 설명 (선택)"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">금액 (원) *</label>
                  <Input
                    type="text"
                    value={invoiceFormAmount}
                    onChange={(e) => {
                      const raw = e.target.value
                      const isNegative = raw.startsWith('-')
                      const digits = raw.replace(/[^\d]/g, '')
                      if (digits) {
                        const formatted = parseInt(digits).toLocaleString()
                        setInvoiceFormAmount(isNegative ? `-${formatted}` : formatted)
                      } else {
                        setInvoiceFormAmount(isNegative ? '-' : '')
                      }
                    }}
                    placeholder="0"
                  />
                </div>

                {/* Issue Date - 세금계산서 발행일 */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">발행일</label>
                  <Input
                    type="date"
                    value={invoiceFormDate}
                    onChange={(e) => setInvoiceFormDate(e.target.value)}
                  />
                </div>

                {/* Payment Date - 입금일/지급일 */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">
                    {invoiceFormType === 'revenue' || invoiceFormType === 'asset' ? '입금일' : '지급일'}
                  </label>
                  <Input
                    type="date"
                    value={invoiceFormPaymentDate}
                    onChange={(e) => setInvoiceFormPaymentDate(e.target.value)}
                  />
                </div>

                {/* Account Number */}
                <div className="relative">
                  <label className="text-xs text-slate-500 mb-1 block">계좌번호</label>
                  <Input
                    type="text"
                    value={invoiceFormAccountNumber}
                    onChange={(e) => setInvoiceFormAccountNumber(e.target.value)}
                    onFocus={() => setShowAccountSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                    placeholder="계좌번호 (선택)"
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
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 rounded-lg max-h-32 overflow-y-auto">
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
                  <label className="text-xs text-slate-500 mb-1 block">메모</label>
                  <Textarea
                    value={invoiceFormNotes}
                    onChange={(e) => setInvoiceFormNotes(e.target.value)}
                    rows={2}
                    placeholder="메모 (선택)"
                    className="resize-none"
                  />
                </div>

                {/* Existing Attachments (edit mode) */}
                {editingInvoice && editingInvoice.attachments.length > 0 && (
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">기존 첨부파일</label>
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
                  <label className="text-xs text-slate-500 mb-1 block">새 첨부파일</label>
                  <div
                    className="bg-slate-100 dark:bg-slate-700 rounded-lg p-4 text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
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
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            {editingInvoice ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!editingInvoice) return
                  try {
                    const res = await fetch(`/api/willow-mgmt/invoices?id=${editingInvoice.id}`, { method: 'DELETE' })
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
              <Button variant="outline" size="sm" onClick={() => setIsInvoiceModalOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={handleSaveInvoice} disabled={isSavingInvoice || isUploadingInvoiceFiles}>
                {(isSavingInvoice || isUploadingInvoiceFiles) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Trade Modal */}
      <Dialog open={isTradeModalOpen} onOpenChange={setIsTradeModalOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{editingTrade ? '거래 수정' : '거래 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            {/* Trade Type */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">매매구분</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTradeFormType('buy')}
                  className={cn(
                    'py-2 text-sm font-medium rounded-lg transition-colors',
                    tradeFormType === 'buy'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                >
                  매수
                </button>
                <button
                  type="button"
                  onClick={() => setTradeFormType('sell')}
                  className={cn(
                    'py-2 text-sm font-medium rounded-lg transition-colors',
                    tradeFormType === 'sell'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                >
                  매도
                </button>
              </div>
            </div>

            {/* Market */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">시장</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTradeFormMarket('KR')}
                  className={cn(
                    'py-2 text-sm font-medium rounded-lg transition-colors',
                    tradeFormMarket === 'KR'
                      ? 'bg-slate-900 text-white dark:bg-slate-600'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                >
                  국내 (KR)
                </button>
                <button
                  type="button"
                  onClick={() => setTradeFormMarket('US')}
                  className={cn(
                    'py-2 text-sm font-medium rounded-lg transition-colors',
                    tradeFormMarket === 'US'
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                >
                  해외 (US)
                </button>
              </div>
            </div>

            {/* Ticker & Company Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">종목코드 *</label>
                <Input
                  value={tradeFormTicker}
                  onChange={(e) => setTradeFormTicker(e.target.value)}
                  placeholder={tradeFormMarket === 'KR' ? '005930' : 'AAPL'}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">종목명 *</label>
                <Input
                  value={tradeFormCompanyName}
                  onChange={(e) => setTradeFormCompanyName(e.target.value)}
                  placeholder={tradeFormMarket === 'KR' ? '삼성전자' : 'Apple'}
                />
              </div>
            </div>

            {/* Trade Date */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">거래일 *</label>
              <Input
                type="date"
                value={tradeFormDate}
                onChange={(e) => setTradeFormDate(e.target.value)}
              />
            </div>

            {/* Quantity & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">수량 *</label>
                <Input
                  value={tradeFormQuantity}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, '')
                    setTradeFormQuantity(digits ? parseInt(digits).toLocaleString() : '')
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">단가 ({tradeFormMarket === 'US' ? '$' : '원'}) *</label>
                <Input
                  value={tradeFormPrice}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d.]/g, '')
                    if (tradeFormMarket === 'US') {
                      setTradeFormPrice(raw)
                    } else {
                      const digits = e.target.value.replace(/[^\d]/g, '')
                      setTradeFormPrice(digits ? parseInt(digits).toLocaleString() : '')
                    }
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Total Amount (calculated) */}
            {tradeFormQuantity && tradeFormPrice && (() => {
              const qty = parseInt(tradeFormQuantity.replace(/,/g, ''), 10)
              const price = parseFloat(tradeFormPrice.replace(/,/g, ''))
              if (!isNaN(qty) && !isNaN(price) && qty > 0 && price > 0) {
                const total = qty * price
                const currency = tradeFormMarket === 'US' ? 'USD' as const : 'KRW' as const
                return (
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-600 px-3 py-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">총 금액</span>
                    <span className="font-bold text-sm">{formatAmount(total, currency)}</span>
                  </div>
                )
              }
              return null
            })()}

            {/* Broker */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">증권사</label>
              <Input
                value={tradeFormBroker}
                onChange={(e) => setTradeFormBroker(e.target.value)}
                placeholder="토스증권"
              />
            </div>

            {/* Memo */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">메모</label>
              <Textarea
                value={tradeFormMemo}
                onChange={(e) => setTradeFormMemo(e.target.value)}
                rows={2}
                placeholder="메모 (선택)"
                className="resize-none"
              />
            </div>
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            {editingTrade ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!editingTrade) return
                  try {
                    const res = await fetch(`/api/willow-mgmt/stock-trades?id=${editingTrade.id}`, { method: 'DELETE' })
                    if (!res.ok) throw new Error('Failed to delete')
                    setStockTrades(stockTrades.filter(t => t.id !== editingTrade.id))
                    setIsTradeModalOpen(false)
                    resetTradeForm()
                  } catch (error) {
                    console.error('Failed to delete trade:', error)
                  }
                }}
              >
                삭제
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTradeModalOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={handleSaveTrade} disabled={isSavingTrade}>
                {isSavingTrade && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{scheduleViewMode === 'read' ? '일정 상세' : editingSchedule ? '일정 수정' : '일정 추가'}</DialogTitle>
          </DialogHeader>

          {/* 읽기 모드 */}
          {scheduleViewMode === 'read' && editingSchedule ? (
            <>
              <div className="space-y-3 overflow-y-auto flex-1 px-1 -mx-1 py-4">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    editingSchedule.type === 'task'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
                      : editingSchedule.type === 'meeting'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                  )}>
                    {editingSchedule.type === 'task' ? '태스크' : editingSchedule.type === 'meeting' ? '미팅' : '마감'}
                  </span>
                  {editingSchedule.is_completed && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                      완료
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold">{editingSchedule.title}</h3>
                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{editingSchedule.schedule_date}{editingSchedule.end_date && editingSchedule.end_date !== editingSchedule.schedule_date ? ` ~ ${editingSchedule.end_date}` : ''}</span>
                  </div>
                  {(editingSchedule.start_time || editingSchedule.end_time) && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{editingSchedule.start_time || ''}{editingSchedule.end_time ? ` ~ ${editingSchedule.end_time}` : ''}</span>
                    </div>
                  )}
                  {editingSchedule.milestones && editingSchedule.milestones.length > 0 && (
                    <div className="flex items-start gap-2">
                      <BookMarked className="h-4 w-4 mt-0.5" />
                      <div>
                        {editingSchedule.milestones.map((ms, i) => (
                          <div key={i} className="text-xs">{ms.name}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {editingSchedule.description && (
                  <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm whitespace-pre-wrap">
                    {editingSchedule.description}
                  </div>
                )}
                {editingSchedule.tasks && editingSchedule.tasks.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <span className="text-xs font-medium text-slate-500">태스크</span>
                    {editingSchedule.tasks.map((item, i) => (
                      <div key={i} className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-sm">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          {item.deadline && <span>마감: {item.deadline}</span>}
                          {item.is_completed && <span className="text-emerald-600">완료</span>}
                        </div>
                        <div className="whitespace-pre-wrap">{item.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toggleScheduleComplete(editingSchedule)
                    setScheduleDialogOpen(false)
                  }}
                >
                  {editingSchedule.is_completed ? '미완료로 변경' : '완료 처리'}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setScheduleDialogOpen(false)}>
                    닫기
                  </Button>
                  <Button size="sm" onClick={() => setScheduleViewMode('edit')}>
                    수정
                  </Button>
                </div>
              </div>
            </>
          ) : (
          <>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            {/* Schedule type toggle */}
            <div className="flex items-center space-x-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
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

            <div>
              <label className="text-xs text-slate-500 mb-1 block">제목 *</label>
              <Input
                value={scheduleForm.title}
                onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                placeholder="일정 제목"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">시작일</label>
                <Input
                  type="date"
                  value={scheduleForm.schedule_date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, schedule_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">종료일</label>
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
              <div>
                <label className="text-xs text-slate-500 mb-1 block">시작 시간</label>
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
              <div>
                <label className="text-xs text-slate-500 mb-1 block">종료 시간</label>
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
                <label className="text-xs text-slate-500">클라이언트/프로젝트/마일스톤</label>
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
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">색상 (마일스톤 미선택 시)</label>
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
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
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
                          {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((s) => (
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
                      <div className="text-xs text-slate-500 pt-1">
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

            <div>
              <label className="text-xs text-slate-500 mb-1 block">설명</label>
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
              <label htmlFor="email_reminder" className="text-sm">
                이메일 알림 받기
              </label>
            </div>

            {/* Task section */}
            <div className="pt-4 space-y-3">
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
                  <label htmlFor="has_task" className="text-sm font-medium">
                    사전 태스크 있음
                  </label>
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
                <div key={index} className="rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-800">
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
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">마감일</label>
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
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">태스크 내용</label>
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
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            {editingSchedule ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    deleteSchedule(editingSchedule.id)
                    setScheduleDialogOpen(false)
                  }}
                >
                  삭제
                </Button>
                <Button
                  variant="outline"
                  size="sm"
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
              <Button variant="outline" size="sm" onClick={() => setScheduleDialogOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={saveSchedule} disabled={!scheduleForm.title || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{editingProject ? '프로젝트 수정' : '프로젝트 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">클라이언트 *</label>
              <Select
                value={projectForm.client_id}
                onValueChange={(v) => setProjectForm({ ...projectForm, client_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="클라이언트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">프로젝트명 *</label>
              <Input
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                placeholder="예: 대시보드 개발"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">상태</label>
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
            <div>
              <label className="text-xs text-slate-500 mb-1 block">설명</label>
              <Textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                placeholder="프로젝트에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            {editingProject ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteProject(editingProject.id)
                  setProjectDialogOpen(false)
                }}
              >
                삭제
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setProjectDialogOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={saveProject} disabled={!projectForm.name || !projectForm.client_id || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{editingMilestone ? '마일스톤 수정' : '마일스톤 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">마일스톤명 *</label>
              <Input
                value={milestoneForm.name}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
                placeholder="예: 1장 다항식의 연산"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">목표 완료일</label>
              <Input
                type="date"
                value={milestoneForm.target_date}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, target_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">설명</label>
              <Textarea
                value={milestoneForm.description}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                placeholder="마일스톤에 대한 메모"
                rows={2}
              />
            </div>
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            {editingMilestone ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
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
                    size="sm"
                    onClick={async () => {
                      try {
                        await fetch('/api/willow-mgmt/milestones', {
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
              <Button variant="outline" size="sm" onClick={() => setMilestoneDialogOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={saveMilestone} disabled={!milestoneForm.name || saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>{editingClient ? '클라이언트 수정' : '클라이언트 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            {/* Client list when adding */}
            {!editingClient && clients.length > 0 && (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">등록된 클라이언트</label>
                <div className="rounded-lg max-h-[200px] overflow-y-auto bg-slate-50 dark:bg-slate-800">
                  {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((client, idx) => (
                    <div
                      key={client.id}
                      className={cn(
                        "flex items-center justify-between p-2 hover:bg-slate-100 dark:hover:bg-slate-700",
                        idx > 0 && "mt-0.5"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: client.color }}
                        />
                        <span className="text-sm">{client.name}</span>
                      </div>
                      <button
                        className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
                        onClick={() => openClientDialog(client)}
                      >
                        <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-slate-500 mb-1 block">{editingClient ? '클라이언트명 *' : '새 클라이언트명 *'}</label>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="예: 수학, 영어, 국어"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">색상</label>
              <div className="flex flex-wrap gap-2">
                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      'w-7 h-7 rounded-full transition-transform hover:scale-110',
                      clientForm.color === color ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white' : ''
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setClientForm({ ...clientForm, color })}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            {editingClient ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteClient(editingClient.id)}
              >
                삭제
              </Button>
            ) : <div />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setClientDialogOpen(false)}>
                {editingClient ? '취소' : '닫기'}
              </Button>
              <Button size="sm" onClick={saveClient} disabled={!clientForm.name || saving}>
                {saving ? '저장 중...' : editingClient ? '저장' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Memo Dialog */}
      <Dialog open={memoDialogOpen} onOpenChange={setMemoDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              {editingMemoDate && `${editingMemoDate.slice(5).replace('-', '/')} 메모`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <Textarea
              value={memoContent}
              onChange={(e) => setMemoContent(e.target.value)}
              placeholder="이 날짜에 대한 메모를 입력하세요..."
              rows={4}
              className="resize-none"
              autoFocus
            />
          </div>
          <div className="flex flex-row flex-nowrap justify-between flex-shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMemoDialogOpen(false)}>
                취소
              </Button>
              <Button size="sm" onClick={saveMemo}>
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Compose Email Modal */}
      <ComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => { setIsComposeOpen(false); setComposeOriginalEmail(null) }}
        mode={composeMode}
        originalEmail={composeOriginalEmail}
        initialData={composeInitialData}
        initialAttachments={composeInitialAttachments}
        onSendSuccess={() => syncEmails()}
        t={t}
      />
    </ProtectedPage>
  )
}
