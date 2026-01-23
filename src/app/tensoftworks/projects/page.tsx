'use client'

import { ProtectedPage } from '@/components/auth/protected-page'
import { useI18n } from '@/lib/i18n/context'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import {
  CheckCircle2,
  TrendingUp,
  Calendar,
  Play,
  Wrench,
  Archive,
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
  FlaskConical,
  FileText,
  Circle,
  GitCommit,
  Search,
} from 'lucide-react'

// tensw-todo 사이트 URL
const TENSW_TODO_URL = 'https://tensw-todo.vercel.app'

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

interface ProjectStats {
  total: number
  pending: number
  assigned: number
  in_progress: number
  completed: number
  discarded: number
}

interface ProjectSchedule {
  id: string
  title: string
  start_date: string
  end_date: string | null
  milestone_type: string
  status: string
}

interface RecentActivity {
  id: string
  type: string
  title: string
  created_at: string
}

interface ServiceUrl {
  id: string
  name: string
  url: string
  description: string | null
}

interface ProjectWithStats {
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
  schedules?: ProjectSchedule[]
  recentActivity: RecentActivity[]
  serviceUrls?: ServiceUrl[]
}

function DashboardContent() {
  const { t } = useI18n()
  const tensw = t.tensoftworks
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/tensoftworks')
        if (res.ok) {
          const data = await res.json()
          setProjects(data.projects || [])
        }
      } catch (error) {
        console.error('Error fetching dashboard:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}/${day}`
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t.time.justNow
    if (diffMins < 60) return t.time.minutesAgo.replace('{minutes}', String(diffMins))
    if (diffHours < 24) return t.time.hoursAgo.replace('{hours}', String(diffHours))
    return t.time.daysAgo.replace('{days}', String(diffDays))
  }

  const getActivityConfig = (type: string) => {
    switch (type) {
      case 'created':
        return { icon: <Plus className="h-4 w-4" />, color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400', label: tensw.activityType.created }
      case 'assigned':
        return { icon: <Users className="h-4 w-4" />, color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400', label: tensw.activityType.assigned }
      case 'started':
        return { icon: <Zap className="h-4 w-4" />, color: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400', label: tensw.activityType.started }
      case 'completed':
        return { icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400', label: tensw.activityType.completed }
      case 'updated':
        return { icon: <Bell className="h-4 w-4" />, color: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300', label: tensw.activityType.updated }
      case 'discarded':
        return { icon: <Ban className="h-4 w-4" />, color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400', label: tensw.activityType.discarded }
      case 'analysis':
        return { icon: <Search className="h-4 w-4" />, color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400', label: tensw.activityType.analysis || 'AI 분석' }
      case 'commit':
        return { icon: <GitCommit className="h-4 w-4" />, color: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400', label: tensw.activityType.commit || 'commit' }
      case 'doc_created':
        return { icon: <FileText className="h-4 w-4" />, color: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400', label: tensw.activityType.docCreated || '문서 등록' }
      case 'schedule_created':
        return { icon: <Calendar className="h-4 w-4" />, color: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400', label: tensw.activityType.scheduleCreated || '일정 등록' }
      case 'schedule_updated':
        return { icon: <Calendar className="h-4 w-4" />, color: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400', label: tensw.activityType.scheduleUpdated || '일정 수정' }
      case 'schedule_completed':
        return { icon: <CheckCircle2 className="h-4 w-4" />, color: 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400', label: tensw.activityType.scheduleCompleted || '일정 완료' }
      default:
        return { icon: <Bell className="h-4 w-4" />, color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400', label: type }
    }
  }

  // 스켈레톤 카드 컴포넌트
  const SkeletonCard = () => (
    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 h-full animate-pulse">
      {/* Header */}
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
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-700">
            <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded mb-2" />
            <div className="h-6 w-8 bg-slate-300 dark:bg-slate-600 rounded" />
          </div>
        ))}
      </div>
      {/* Schedule & Activity */}
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

  // 최신 활동 시간 기준으로 정렬하는 함수
  const getLatestActivityTime = (project: ProjectWithStats): number => {
    if (project.recentActivity && project.recentActivity.length > 0) {
      return new Date(project.recentActivity[0].created_at).getTime()
    }
    return new Date(project.updated_at || project.created_at).getTime()
  }

  const sortByRecentActivity = (a: ProjectWithStats, b: ProjectWithStats) => {
    return getLatestActivityTime(b) - getLatestActivityTime(a)
  }

  if (loading) {
    return (
      <div className="space-y-8">
        {/* 진행 프로젝트 스켈레톤 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
        {/* 관리 프로젝트 스켈레톤 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard />
          </div>
        </section>
      </div>
    )
  }

  // Group projects by status and sort by recent activity
  const pocProjects = projects.filter(p => p.is_poc || p.status === 'poc').sort(sortByRecentActivity)
  const activeProjects = projects.filter(p => p.status === 'active' && !p.is_poc).sort(sortByRecentActivity)
  const managedProjects = projects.filter(p => p.status === 'managed' && !p.is_poc).sort(sortByRecentActivity)
  const closedProjects = projects.filter(p => p.status === 'closed' && !p.is_poc).sort(sortByRecentActivity)

  const renderProjectCard = (project: ProjectWithStats) => {
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

    // API returns schedules, not upcomingSchedules
    const upcomingSchedules = project.schedules || []

    return (
      <Link key={project.id} href={`${TENSW_TODO_URL}/projects/${project.slug}`} target="_blank">
        <Card className="bg-slate-100 dark:bg-slate-800 cursor-pointer h-full hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
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
              <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(project.status)}`}>
                {tensw.status[project.status as keyof typeof tensw.status] || project.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* Stats Grid - 4 columns in a row */}
            <div className="grid grid-cols-4 gap-2">
              {/* 배정 대기 */}
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-amber-700 dark:text-amber-400">{tensw.stats.waiting}</div>
                  <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-1.5">
                    <Circle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{waitingCount}</div>
              </div>

              {/* 진행 중 */}
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-blue-700 dark:text-blue-400">{tensw.stats.inProgress}</div>
                  <div className="rounded-lg bg-blue-200 dark:bg-blue-800/50 p-1.5">
                    <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{inProgressCount}</div>
              </div>

              {/* 완료 */}
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-emerald-700 dark:text-emerald-400">{tensw.stats.completed}</div>
                  <div className="rounded-lg bg-emerald-100 dark:bg-emerald-800/50 p-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</div>
              </div>

              {/* 진행률 */}
              <div className="p-2 rounded-lg bg-slate-200 dark:bg-slate-600">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-slate-500 dark:text-slate-400">{tensw.stats.progress}</div>
                  <div className="rounded-lg bg-white/50 dark:bg-slate-600/50 p-1.5">
                    <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                  </div>
                </div>
                <div className="text-xl font-bold text-slate-700 dark:text-slate-300">{progress}%</div>
              </div>
            </div>

            {/* Schedule & Activity - 2 column grid */}
            {(upcomingSchedules.length > 0 || project.recentActivity.length > 0) && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                {/* Upcoming Schedules */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm sm:text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span>{tensw.sections.schedule}</span>
                  </div>
                  {upcomingSchedules.length > 0 ? (
                    <div className="space-y-1.5">
                      {upcomingSchedules.slice(0, 2).map(schedule => (
                        <div key={schedule.id} className="flex items-center gap-2 text-sm sm:text-xs">
                          <span className="text-slate-400 w-12 flex-shrink-0 text-sm">
                            {formatDate(schedule.start_date)}
                          </span>
                          <span className="truncate text-slate-600 dark:text-slate-300">{schedule.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">-</p>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm sm:text-xs text-slate-500 dark:text-slate-400">
                    <Activity className="h-4 w-4" />
                    <span>{tensw.sections.activity}</span>
                  </div>
                  {project.recentActivity.length > 0 ? (
                    <div className="space-y-2">
                      {project.recentActivity.slice(0, 2).map(activity => {
                        const config = getActivityConfig(activity.type)
                        return (
                          <div key={activity.id} className={`p-2 rounded ${config.color}`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {config.icon}
                              <span className="text-sm font-medium">{config.label}</span>
                            </div>
                            <p className="text-sm sm:text-xs truncate font-medium opacity-90" title={activity.title}>
                              {activity.title}
                            </p>
                            <span className="text-sm opacity-70">
                              {formatRelativeTime(activity.created_at)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">-</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    )
  }

  const renderProjectSection = (
    title: string,
    icon: React.ReactNode,
    projectList: ProjectWithStats[]
  ) => {
    if (projectList.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
          <span className="text-sm sm:text-xs text-slate-500 dark:text-slate-400">({projectList.length})</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectList.map(renderProjectCard)}
        </div>
      </div>
    )
  }

  const renderPocCard = (project: ProjectWithStats) => {
    const IconComponent = PROJECT_ICONS[project.icon || 'folder'] || Folder
    const hasServiceUrls = project.serviceUrls && project.serviceUrls.length > 0

    return (
      <Card key={project.id} className="bg-amber-50 dark:bg-amber-900/20 h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2 flex-shrink-0">
                <IconComponent className="h-6 w-6 text-amber-600 dark:text-amber-400" />
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
            <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
              POC
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {/* Service URLs */}
          {hasServiceUrls && (
            <div className="space-y-1.5">
              {project.serviceUrls!.map((serviceUrl) => (
                <div key={serviceUrl.id}>
                  <a
                    href={serviceUrl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm sm:text-xs group min-w-0"
                  >
                    <span className="text-amber-700 dark:text-amber-300 group-hover:text-amber-900 dark:group-hover:text-amber-200 transition-colors flex-shrink-0">{serviceUrl.name}</span>
                    <span className="text-sm text-slate-400 dark:text-slate-500 group-hover:text-amber-600 dark:group-hover:text-amber-400 truncate flex-1 min-w-0 transition-colors">{serviceUrl.url}</span>
                  </a>
                  {serviceUrl.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{serviceUrl.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Memo */}
          {project.memo && (
            <div className="flex items-start gap-2 text-sm sm:text-xs">
              <FileText className="h-5 w-5 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-600 dark:text-slate-300 line-clamp-2">{project.memo}</span>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderPocSection = () => {
    if (pocProjects.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">{tensw.status.poc} 프로젝트</h2>
          <span className="text-sm sm:text-xs text-slate-500 dark:text-slate-400">({pocProjects.length})</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pocProjects.map(renderPocCard)}
        </div>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-slate-500 dark:text-slate-400">
        <Folder className="h-12 w-12 mb-4 text-slate-300" />
        <p>{tensw.noProjects}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {renderProjectSection(
        tensw.status.active + ' 프로젝트',
        <Play className="h-5 w-5 text-green-600 dark:text-green-400" />,
        activeProjects
      )}
      {renderProjectSection(
        tensw.status.managed + ' 프로젝트',
        <Wrench className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
        managedProjects
      )}
      {renderProjectSection(
        '종료 프로젝트',
        <Archive className="h-5 w-5 text-slate-500" />,
        closedProjects
      )}
      {renderPocSection()}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <ProtectedPage pagePath="/tensoftworks/projects">
      <DashboardContent />
    </ProtectedPage>
  )
}
