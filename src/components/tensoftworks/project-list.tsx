'use client'

import { useEffect, useState } from 'react'
import { ProjectCard, TenswProject } from './project-card'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

type ProjectStatus = 'poc' | 'active' | 'managed' | 'closed'

interface ProjectListProps {
  status: ProjectStatus
}

// POC 카드 스켈레톤
function PocCardSkeleton() {
  return (
    <Card className="bg-amber-50 dark:bg-amber-900/20 h-full animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-amber-200 dark:bg-amber-800/50 p-2 w-9 h-9" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-32 bg-amber-200 dark:bg-amber-800/50 rounded" />
              <div className="h-3 w-48 bg-amber-100 dark:bg-amber-900/30 rounded" />
            </div>
          </div>
          <div className="h-6 w-12 bg-amber-200 dark:bg-amber-800/50 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="h-4 w-36 bg-amber-100 dark:bg-amber-900/30 rounded" />
        <div className="h-4 w-24 bg-amber-100 dark:bg-amber-900/30 rounded" />
      </CardContent>
    </Card>
  )
}

// 기본 프로젝트 카드 스켈레톤
function ProjectCardSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800 h-full overflow-hidden animate-pulse">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 w-9 h-9" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-3 w-56 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
          <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 overflow-hidden">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-12 bg-amber-200 dark:bg-amber-800/50 rounded" />
              <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1 w-6 h-6" />
            </div>
            <div className="h-7 w-8 bg-amber-200 dark:bg-amber-800/50 rounded mt-2" />
          </div>
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-12 bg-blue-200 dark:bg-blue-800/50 rounded" />
              <div className="rounded bg-blue-100 dark:bg-blue-800/50 p-1 w-6 h-6" />
            </div>
            <div className="h-7 w-8 bg-blue-200 dark:bg-blue-800/50 rounded mt-2" />
          </div>
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-12 bg-emerald-200 dark:bg-emerald-800/50 rounded" />
              <div className="rounded bg-emerald-100 dark:bg-emerald-800/50 p-1 w-6 h-6" />
            </div>
            <div className="h-7 w-8 bg-emerald-200 dark:bg-emerald-800/50 rounded mt-2" />
          </div>
          <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-700">
            <div className="flex items-center justify-between mb-1">
              <div className="h-4 w-12 bg-slate-300 dark:bg-slate-600 rounded" />
              <div className="rounded bg-slate-300 dark:bg-slate-600 p-1 w-6 h-6" />
            </div>
            <div className="h-7 w-12 bg-slate-300 dark:bg-slate-600 rounded mt-2" />
          </div>
        </div>

        {/* Info Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-3 min-w-0">
            {/* Info Section */}
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
            {/* Schedule Section */}
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="space-y-1">
                <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
            {/* Docs Section */}
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="flex gap-1">
                <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            </div>
          </div>
          {/* Activity Section */}
          <div className="space-y-1.5 min-w-0">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="space-y-2">
              <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectList({ status }: ProjectListProps) {
  const { t } = useI18n()
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
  }, [])

  const filteredProjects = projects.filter(p => {
    switch (status) {
      case 'poc':
        return p.is_poc || p.status === 'poc'
      case 'active':
        return p.status === 'active' && !p.is_poc
      case 'managed':
        return p.status === 'managed' && !p.is_poc
      case 'closed':
        return p.status === 'closed' && !p.is_poc
      default:
        return false
    }
  })

  const isPoc = status === 'poc'

  if (loading) {
    return (
      <div className={`grid gap-4 overflow-hidden ${isPoc ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-1 lg:grid-cols-2'}`}>
        {isPoc ? (
          [...Array(4)].map((_, i) => <PocCardSkeleton key={i} />)
        ) : (
          [...Array(2)].map((_, i) => <ProjectCardSkeleton key={i} />)
        )}
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

  if (filteredProjects.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">{t.tensoftworks.noProjects}</p>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 overflow-hidden ${isPoc ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-1 lg:grid-cols-2'}`}>
      {filteredProjects.map(project => (
        <ProjectCard
          key={project.id}
          project={project}
          variant={isPoc ? 'poc' : 'default'}
        />
      ))}
    </div>
  )
}
