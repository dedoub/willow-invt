'use client'

import { useEffect, useState } from 'react'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { TenswProject } from '@/components/tensoftworks/project-card'
import {
  Loader2,
  Clock,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Play,
  Wrench,
  FlaskConical,
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
  Plus,
  Users,
  Zap,
  Ban,
  Bell,
  Activity,
  ExternalLink,
  FileText,
  Circle,
  GitCommit,
  Search,
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

// 활동 유형 설정
const getActivityConfig = (type: string, activityT: {
  created: string
  assigned: string
  started: string
  completed: string
  discarded: string
  analysis?: string
  commit?: string
}) => {
  switch (type) {
    case 'created':
      return { icon: <Plus className="h-4 w-4" />, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400', label: activityT.created }
    case 'assigned':
      return { icon: <Users className="h-4 w-4" />, color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400', label: activityT.assigned }
    case 'started':
      return { icon: <Zap className="h-4 w-4" />, color: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400', label: activityT.started }
    case 'completed':
      return { icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400', label: activityT.completed }
    case 'analysis':
      return { icon: <Search className="h-4 w-4" />, color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400', label: activityT.analysis || 'AI 분석' }
    case 'discarded':
      return { icon: <Ban className="h-4 w-4" />, color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400', label: activityT.discarded }
    case 'commit':
      return { icon: <GitCommit className="h-4 w-4" />, color: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400', label: activityT.commit || 'commit' }
    default:
      return { icon: <Bell className="h-4 w-4" />, color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400', label: type }
  }
}

// 스켈레톤 카드
function SkeletonCard() {
  return (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 h-full animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
        <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
      </div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700">
            <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded mb-2" />
            <div className="h-6 w-8 bg-slate-300 dark:bg-slate-600 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-12 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-16 w-full bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      </div>
    </div>
  )
}

// POC 스켈레톤
function PocSkeletonCard() {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 h-full animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-200 dark:bg-amber-800/50" />
          <div className="space-y-2">
            <div className="h-5 w-28 bg-amber-200 dark:bg-amber-800/50 rounded" />
            <div className="h-3 w-40 bg-amber-100 dark:bg-amber-900/30 rounded" />
          </div>
        </div>
        <div className="h-6 w-12 bg-amber-200 dark:bg-amber-800/50 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full bg-amber-100 dark:bg-amber-900/30 rounded" />
        <div className="h-4 w-3/4 bg-amber-100 dark:bg-amber-900/30 rounded" />
      </div>
    </div>
  )
}

function ProjectsContent() {
  const { t } = useI18n()
  const tensw = t.tensoftworks
  const [projects, setProjects] = useState<TenswProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/tensoftworks')
        if (!res.ok) {
          throw new Error('Failed to fetch projects')
        }
        const data = await res.json()
        setProjects(data.projects || [])
      } catch (err) {
        console.error('Error fetching projects:', err)
        setError(t.common.error)
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [t.common.error])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
      case 'managed':
        return 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
      case 'closed':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
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

  // Group projects by status
  const pocProjects = projects.filter(p => p.is_poc || p.status === 'poc')
  const activeProjects = projects.filter(p => p.status === 'active' && !p.is_poc)
  const managedProjects = projects.filter(p => p.status === 'managed' && !p.is_poc)

  const renderProjectCard = (project: TenswProject) => {
    const { stats } = project
    const IconComponent = PROJECT_ICONS[project.icon || 'folder'] || Folder

    // 배정 대기 = pending
    const waitingCount = stats.pending
    // 진행 중 = assigned + in_progress
    const inProgressCount = stats.assigned + stats.in_progress
    // 완료
    const completedCount = stats.completed
    // 진행률
    const totalExcludingDiscarded = stats.total - stats.discarded
    const progress = totalExcludingDiscarded > 0
      ? Math.round((completedCount / totalExcludingDiscarded) * 100)
      : 0

    const hasSchedules = project.schedules && project.schedules.length > 0
    const hasActivity = project.recentActivity && project.recentActivity.length > 0

    return (
      <Card key={project.id} className="bg-slate-100 dark:bg-slate-800 h-full">
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
                <IconComponent className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="text-sm mt-0.5 line-clamp-1">
                    {project.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-md font-medium flex-shrink-0 ${getStatusColor(project.status)}`}>
              {getStatusLabel(project.status)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-2">
            {/* 배정 대기 */}
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-amber-700 dark:text-amber-400">{tensw.stats.waiting}</div>
                <div className="rounded bg-amber-200 dark:bg-amber-800/50 p-1">
                  <Circle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{waitingCount}</div>
            </div>

            {/* 진행 중 */}
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-blue-700 dark:text-blue-400">{tensw.stats.inProgress}</div>
                <div className="rounded bg-blue-200 dark:bg-blue-800/50 p-1">
                  <Zap className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
            </div>

            {/* 완료 */}
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-emerald-700 dark:text-emerald-400">{tensw.stats.completed}</div>
                <div className="rounded bg-emerald-200 dark:bg-emerald-800/50 p-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
            </div>

            {/* 진행률 */}
            <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">{tensw.stats.progress}</div>
                <div className="rounded bg-white/50 dark:bg-slate-600/50 p-1">
                  <TrendingUp className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                </div>
              </div>
              <div className="text-xl font-bold text-slate-700 dark:text-slate-300">{progress}%</div>
            </div>
          </div>

          {/* Schedule & Activity */}
          {(hasSchedules || hasActivity) && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {/* Upcoming Schedules */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Calendar className="h-4 w-4" />
                  <span>{tensw.sections.schedule}</span>
                </div>
                {hasSchedules ? (
                  <div className="space-y-1.5">
                    {project.schedules.slice(0, 2).map(schedule => (
                      <div key={schedule.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-10 flex-shrink-0">
                          {formatDate(schedule.start_date)}
                        </span>
                        <span className="truncate text-slate-600 dark:text-slate-300">{schedule.title}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">-</p>
                )}
              </div>

              {/* Recent Activity */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Activity className="h-4 w-4" />
                  <span>{tensw.sections.activity}</span>
                </div>
                {hasActivity ? (
                  <div className="space-y-1.5">
                    {project.recentActivity.slice(0, 2).map(activity => {
                      const config = getActivityConfig(activity.type, tensw.activityType)
                      return (
                        <div key={activity.id} className={`p-1.5 rounded ${config.color}`}>
                          <div className="flex items-center gap-1 mb-0.5">
                            {config.icon}
                            <span className="text-xs font-medium">{config.label}</span>
                          </div>
                          <p className="text-xs truncate opacity-90" title={activity.title}>
                            {activity.title}
                          </p>
                          <span className="text-xs opacity-70">
                            {formatRelativeTime(activity.created_at, t.time)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">-</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderPocCard = (project: TenswProject) => {
    const IconComponent = PROJECT_ICONS[project.icon || 'folder'] || Folder
    const hasServiceUrls = project.serviceUrls && project.serviceUrls.length > 0

    return (
      <Card key={project.id} className="bg-amber-50 dark:bg-amber-900/20 h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2 flex-shrink-0">
                <IconComponent className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="text-sm mt-0.5 line-clamp-1">
                    {project.description}
                  </CardDescription>
                )}
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded-md font-medium flex-shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
              POC
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {/* Service URLs */}
          {hasServiceUrls && (
            <div className="space-y-1">
              {project.serviceUrls!.map((serviceUrl) => (
                <a
                  key={serviceUrl.id}
                  href={serviceUrl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm group"
                >
                  <ExternalLink className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-700 dark:text-amber-300 group-hover:text-amber-900 dark:group-hover:text-amber-200">{serviceUrl.name}</span>
                </a>
              ))}
            </div>
          )}

          {/* Memo */}
          {project.memo && (
            <div className="flex items-start gap-2 text-sm">
              <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-600 dark:text-slate-300 line-clamp-2">{project.memo}</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderProjectSection = (
    title: string,
    icon: React.ReactNode,
    projectList: TenswProject[],
    gridCols: string = 'sm:grid-cols-2 lg:grid-cols-3'
  ) => {
    if (projectList.length === 0) return null

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">({projectList.length})</span>
        </div>
        <div className={`grid gap-4 ${gridCols}`}>
          {projectList.map(renderProjectCard)}
        </div>
      </section>
    )
  }

  const renderPocSection = () => {
    if (pocProjects.length === 0) return null

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">{tensw.status.poc} 프로젝트</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">({pocProjects.length})</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pocProjects.map(renderPocCard)}
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Active section skeleton */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
        {/* Managed section skeleton */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
          </div>
        </section>
        {/* POC section skeleton */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 bg-amber-200 dark:bg-amber-800/50 rounded animate-pulse" />
            <div className="h-6 w-28 bg-amber-200 dark:bg-amber-800/50 rounded animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PocSkeletonCard />
            <PocSkeletonCard />
          </div>
        </section>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500 dark:text-slate-400">
        <Folder className="h-12 w-12 mb-4 text-slate-300" />
        <p>{tensw.noProjects}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 dark:bg-blue-900 p-2">
          <Briefcase className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">프로젝트 관리</h1>
          <p className="text-sm text-muted-foreground">텐소프트웍스 프로젝트 현황</p>
        </div>
      </div>

      {/* Active Projects */}
      {renderProjectSection(
        tensw.status.active + ' 프로젝트',
        <Play className="h-6 w-6 text-green-600 dark:text-green-400" />,
        activeProjects
      )}

      {/* Managed Projects */}
      {renderProjectSection(
        tensw.status.managed + ' 프로젝트',
        <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />,
        managedProjects
      )}

      {/* POC Projects */}
      {renderPocSection()}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/projects">
      <ProjectsContent />
    </ProtectedPage>
  )
}
