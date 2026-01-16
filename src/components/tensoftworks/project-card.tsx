'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import {
  Clock,
  CheckCircle2,
  TrendingUp,
  Folder,
  ShoppingCart,
  Code,
  Database,
  Globe,
  Smartphone,
  Server,
  Package,
  Gamepad2,
  Music,
  Video,
  Image as ImageIcon,
  Briefcase,
  GraduationCap,
  Heart,
  Brain,
  LucideIcon,
  Loader2,
  ExternalLink,
  Calendar,
  FileText,
  ListTodo,
  Activity,
  Users,
  Plus,
  Ban,
  Zap,
  Bell,
  Info,
} from 'lucide-react'

// 프로젝트 아이콘 맵
const PROJECT_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  'shopping-cart': ShoppingCart,
  code: Code,
  database: Database,
  globe: Globe,
  smartphone: Smartphone,
  server: Server,
  package: Package,
  gamepad: Gamepad2,
  music: Music,
  video: Video,
  image: ImageIcon,
  briefcase: Briefcase,
  graduation: GraduationCap,
  heart: Heart,
  brain: Brain,
}

export interface ProjectStats {
  total: number
  pending: number
  assigned: number
  in_progress: number
  completed: number
  discarded: number
}

export interface ProjectSchedule {
  id: string
  title: string
  start_date: string
  end_date: string | null
  milestone_type: string
  status: string
}

export interface ProjectDoc {
  id: string
  title: string
  doc_type: string
  created_at: string
}

export interface ProjectTodo {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  readable_id: string | null
  assignees: string[]
}

export interface ProjectActivity {
  id: string
  type: string
  title: string
  created_at: string
  changed_by: string | null
  priority: string | null
  due_date: string | null
}

export interface ProjectMember {
  id: string
  name: string
  role: string | null
  is_manager: boolean
}

export interface ServiceUrl {
  id: string
  name: string
  url: string
  description: string | null
}

export interface MemberTodoCount {
  name: string
  count: number
}

export interface TenswProject {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  icon: string | null
  is_poc: boolean
  memo: string | null
  project_url: string | null
  created_at: string
  updated_at: string
  stats: ProjectStats
  schedules: ProjectSchedule[]
  docs: ProjectDoc[]
  todos: ProjectTodo[]
  recentActivity: ProjectActivity[]
  members: ProjectMember[]
  serviceUrls: ServiceUrl[]
  inProgressByMember: MemberTodoCount[]
  completedByMember: MemberTodoCount[]
  avgCompletionTime: string | null
}

interface ProjectCardProps {
  project: TenswProject
  variant?: 'default' | 'poc'
}

// 날짜 포맷팅
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}/${day}`
}

// 상대 시간 포맷팅
const formatRelativeTime = (dateString: string, timeT: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string }) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return timeT.justNow
  if (diffMins < 60) return timeT.minutesAgo.replace('{minutes}', String(diffMins))
  if (diffHours < 24) return timeT.hoursAgo.replace('{hours}', String(diffHours))
  return timeT.daysAgo.replace('{days}', String(diffDays))
}

// 활동 유형별 설정
type ActivityTypeTranslations = {
  created: string
  assigned: string
  started: string
  completed: string
  discarded: string
  analysis: string
  docCreated: string
  scheduleCreated: string
  scheduleUpdated: string
  scheduleCompleted: string
}

const getActivityConfig = (type: string, activityT: ActivityTypeTranslations) => {
  switch (type) {
    case 'created':
      return { icon: <Plus className="h-3 w-3" />, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400', label: activityT.created }
    case 'assigned':
      return { icon: <Users className="h-3 w-3" />, color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400', label: activityT.assigned }
    case 'started':
      return { icon: <Zap className="h-3 w-3" />, color: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400', label: activityT.started }
    case 'completed':
      return { icon: <CheckCircle2 className="h-3 w-3" />, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400', label: activityT.completed }
    case 'discarded':
      return { icon: <Ban className="h-3 w-3" />, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400', label: activityT.discarded }
    case 'analysis':
      return { icon: <Brain className="h-3 w-3" />, color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400', label: activityT.analysis }
    case 'doc_created':
      return { icon: <FileText className="h-3 w-3" />, color: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400', label: activityT.docCreated }
    case 'schedule_created':
      return { icon: <Calendar className="h-3 w-3" />, color: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400', label: activityT.scheduleCreated }
    case 'schedule_updated':
      return { icon: <Calendar className="h-3 w-3" />, color: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400', label: activityT.scheduleUpdated }
    case 'schedule_completed':
      return { icon: <Calendar className="h-3 w-3" />, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400', label: activityT.scheduleCompleted }
    default:
      return { icon: <Bell className="h-3 w-3" />, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400', label: type }
  }
}

// 우선순위 색상
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'
    case 'high': return 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400'
    default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
  }
}

export function ProjectCard({ project, variant = 'default' }: ProjectCardProps) {
  const { t } = useI18n()
  const tensw = t.tensoftworks
  const { stats } = project
  const IconComponent = PROJECT_ICONS[project.icon || 'folder'] || Folder

  // 배정 대기 = pending (담당자 미배정)
  const waitingCount = stats.pending
  // 진행 중 = assigned + in_progress (담당자 배정됨)
  const inProgressCount = stats.assigned + stats.in_progress
  // 완료
  const completedCount = stats.completed
  // 진행률 = 완료 / (전체 - 폐기) * 100
  const totalExcludingDiscarded = stats.total - stats.discarded
  const progress = totalExcludingDiscarded > 0
    ? Math.round((completedCount / totalExcludingDiscarded) * 100)
    : 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
      case 'managed':
        return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
      case 'closed':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
      case 'poc':
        return 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400'
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return tensw.status.active
      case 'managed': return tensw.status.managed
      case 'closed': return tensw.status.closed
      case 'poc': return tensw.status.poc
      default: return status
    }
  }

  if (variant === 'poc') {
    return (
      <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2 flex-shrink-0">
                <IconComponent className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base truncate">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="text-xs mt-0.5 line-clamp-1">
                    {project.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
              POC
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {/* Service URLs */}
          {project.serviceUrls && project.serviceUrls.length > 0 && (
            <div className="space-y-1">
              {project.serviceUrls.map((serviceUrl) => (
                <a
                  key={serviceUrl.id}
                  href={serviceUrl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs group"
                >
                  <ExternalLink className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-700 dark:text-amber-300 group-hover:text-amber-900 dark:group-hover:text-amber-200">{serviceUrl.name}</span>
                </a>
              ))}
            </div>
          )}
          {project.project_url && !project.serviceUrls?.length && (
            <a
              href={project.project_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="truncate">{project.project_url}</span>
            </a>
          )}
          {project.memo && (
            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{project.memo}</p>
          )}
          {/* Members */}
          {project.members && project.members.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Users className="h-3 w-3" />
              <span>{project.members.map(m => m.name).join(', ')}</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const hasSchedules = project.schedules && project.schedules.length > 0
  const hasDocs = project.docs && project.docs.length > 0
  const hasTodos = project.todos && project.todos.length > 0
  const hasActivity = project.recentActivity && project.recentActivity.length > 0
  const hasMembers = project.members && project.members.length > 0

  return (
    <Card className="bg-slate-100 dark:bg-slate-800 hover:shadow-md transition-shadow h-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
              <IconComponent className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate">{project.name}</CardTitle>
              {project.description && (
                <CardDescription className="text-xs mt-0.5 line-clamp-1">
                  {project.description}
                </CardDescription>
              )}
            </div>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(project.status)}`}>
            {project.is_poc ? 'POC' : getStatusLabel(project.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 overflow-hidden">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* 배정 대기 */}
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-amber-700 dark:text-amber-400">{tensw.stats.waiting}</div>
              <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
                <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{waitingCount}</div>
          </div>

          {/* 진행 중 */}
          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-blue-700 dark:text-blue-400">{tensw.stats.inProgress}</div>
              <div className="rounded bg-blue-100 dark:bg-blue-800/50 p-1">
                <Loader2 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
            {project.inProgressByMember && project.inProgressByMember.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {project.inProgressByMember.slice(0, 2).map((m, i) => (
                  <span key={i} className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">
                    {m.name} {m.count}
                  </span>
                ))}
                {project.inProgressByMember.length > 2 && (
                  <span className="text-xs text-blue-500 dark:text-blue-400">+{project.inProgressByMember.length - 2}</span>
                )}
              </div>
            )}
          </div>

          {/* 완료 */}
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-emerald-700 dark:text-emerald-400">{tensw.stats.completed}</div>
              <div className="rounded bg-emerald-100 dark:bg-emerald-800/50 p-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
            {project.completedByMember && project.completedByMember.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {project.completedByMember.slice(0, 2).map((m, i) => (
                  <span key={i} className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
                    {m.name} {m.count}
                  </span>
                ))}
                {project.completedByMember.length > 2 && (
                  <span className="text-xs text-emerald-500 dark:text-emerald-400">+{project.completedByMember.length - 2}</span>
                )}
              </div>
            )}
          </div>

          {/* 진행률 */}
          <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">{tensw.stats.progress}</div>
              <div className="rounded bg-white/50 dark:bg-white/10 p-1">
                <TrendingUp className="h-3 w-3 text-slate-600 dark:text-slate-400" />
              </div>
            </div>
            <div className="text-lg font-bold text-slate-700 dark:text-slate-300">{progress}%</div>
            {project.avgCompletionTime && (
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3 w-3" />
                <span>{project.avgCompletionTime}</span>
              </div>
            )}
          </div>
        </div>

        {/* Info, Schedule, Documents, Members (left) + Activity (right) - 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Left column: Info + Schedules + Documents */}
          <div className="space-y-3 min-w-0">
            {/* Project Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Info className="h-3 w-3" />
                <span>{tensw.sections.info}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* 설명 */}
                <div>
                  {project.description ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{project.description}</p>
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500">-</p>
                  )}
                </div>
                {/* 서비스 URL */}
                <div className="space-y-1">
                  {project.serviceUrls && project.serviceUrls.length > 0 ? (
                    project.serviceUrls.map(svc => (
                      <a
                        key={svc.id}
                        href={svc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{svc.name}</span>
                      </a>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500">-</p>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Schedules */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="h-3 w-3" />
                <span>{tensw.sections.schedule}</span>
              </div>
              {hasSchedules ? (
                <div className="space-y-1">
                  {project.schedules.slice(0, 3).map(schedule => (
                    <div key={schedule.id} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400 dark:text-slate-500 w-10 flex-shrink-0">
                        {formatDate(schedule.start_date)}
                      </span>
                      <span className="truncate text-slate-600 dark:text-slate-300">{schedule.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">-</p>
              )}
            </div>

            {/* Documents (최신순) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <FileText className="h-3 w-3" />
                <span>{tensw.sections.documents}</span>
              </div>
              {hasDocs ? (
                <div className="flex flex-wrap gap-1">
                  {project.docs.slice(0, 4).map(doc => (
                    <span
                      key={doc.id}
                      className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      {doc.title}
                    </span>
                  ))}
                  {project.docs.length > 4 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500">
                      +{project.docs.length - 4}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">-</p>
              )}
            </div>

            {/* Members */}
            {hasMembers && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Users className="h-3 w-3" />
                  <span>{tensw.sections.members}</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {project.members.filter(m => m.is_manager).map(m => m.name).join(', ')}
                  {project.members.filter(m => !m.is_manager).length > 0 && (
                    <span className="text-slate-400 dark:text-slate-500"> {tensw.membersOther.replace('{count}', String(project.members.filter(m => !m.is_manager).length))}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Recent Activity */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Activity className="h-3 w-3" />
              <span>{tensw.sections.activity}</span>
            </div>
            {hasActivity ? (
              <div className="space-y-2">
                {project.recentActivity.slice(0, 3).map(activity => {
                  const config = getActivityConfig(activity.type, tensw.activityType)
                  const priorityDot = activity.priority === 'critical' ? 'bg-red-500' :
                    activity.priority === 'high' ? 'bg-orange-500' :
                    activity.priority === 'medium' ? 'bg-yellow-500' : 'bg-slate-400'
                  return (
                    <div key={activity.id} className={`p-2 rounded ${config.color}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {config.icon}
                        <span className="text-xs font-medium">{config.label}</span>
                        {activity.changed_by && (
                          <span className="text-xs opacity-70">· {activity.changed_by}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot}`} />
                        <p className="text-xs truncate font-medium opacity-90" title={activity.title}>
                          {activity.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs opacity-70">
                          {formatRelativeTime(activity.created_at, t.time)}
                        </span>
                        {activity.due_date && (
                          <span className="text-xs opacity-70">
                            · {tensw.dueDate} {formatDate(activity.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">-</p>
            )}
          </div>
        </div>

        {/* Todo List */}
        {hasTodos && (
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ListTodo className="h-3 w-3" />
              <span>{tensw.sections.todos}</span>
            </div>
            <div className="space-y-1.5 min-w-0">
              {project.todos.map(todo => {
                const priorityBadge = todo.priority === 'critical' ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400' :
                  todo.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400' :
                  todo.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400' :
                  'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                const priorityLabel = todo.priority === 'critical' ? tensw.priority.critical :
                  todo.priority === 'high' ? tensw.priority.high :
                  todo.priority === 'medium' ? tensw.priority.medium : tensw.priority.low
                return (
                  <div key={todo.id} className="flex items-center gap-2 text-xs">
                    {todo.readable_id && (
                      <span className="text-blue-600 dark:text-blue-400 font-mono text-xs flex-shrink-0">
                        [{todo.readable_id}]
                      </span>
                    )}
                    <span className="truncate text-slate-700 dark:text-slate-200 min-w-0 flex-1">{todo.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${priorityBadge}`}>
                      {priorityLabel}
                    </span>
                    {todo.due_date && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                        {formatDate(todo.due_date)}
                      </span>
                    )}
                    {todo.assignees && todo.assignees.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0 max-w-[80px] truncate">
                        {todo.assignees.join(', ')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Project URL */}
        {project.project_url && (
          <a
            href={project.project_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{project.project_url}</span>
          </a>
        )}

        {/* Memo */}
        {project.memo && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{project.memo}</p>
        )}
      </CardContent>
    </Card>
  )
}
