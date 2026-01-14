'use client'

import { useEffect, useState } from 'react'
import { ProjectCard, TenswProject } from './project-card'
import { Loader2 } from 'lucide-react'

type ProjectStatus = 'poc' | 'active' | 'managed' | 'closed'

interface ProjectListProps {
  status: ProjectStatus
}

export function ProjectList({ status }: ProjectListProps) {
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
        setError('프로젝트를 불러오는데 실패했습니다.')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
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
        <p className="text-muted-foreground">프로젝트가 없습니다.</p>
      </div>
    )
  }

  const isPoc = status === 'poc'

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
