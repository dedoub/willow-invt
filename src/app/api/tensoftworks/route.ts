import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export interface ProjectStats {
  total: number
  pending: number
  assigned: number
  in_progress: number
  pending_approval: number
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
  actor?: string
  assignees?: string[]
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

// GET /api/tensoftworks - List all tensw projects with full details
export async function GET() {
  try {
    const supabase = getServiceSupabase()

    // Get all projects
    const { data: projects, error: projectError } = await supabase
      .from('tensw_projects')
      .select('*')
      .order('status', { ascending: true })
      .order('updated_at', { ascending: false })

    if (projectError) {
      console.error('Error fetching projects:', projectError)
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
    }

    if (!projects || projects.length === 0) {
      return NextResponse.json({ projects: [] })
    }

    const projectIds = projects.map(p => p.id)

    // Get all todos for all projects with assignees
    const { data: allTodos } = await supabase
      .from('tensw_todos')
      .select(`
        id, project_id, title, status, priority, due_date, readable_id, assigned_at, completed_at,
        assignees:tensw_todo_assignees(
          id,
          member_id,
          member:tensw_project_members!tensw_todo_assignees_member_id_fkey(id, name)
        )
      `)
      .in('project_id', projectIds)

    // Get schedules (진행 중인 것만, start_date 오름차순)
    const today = new Date()
    const { data: allSchedules } = await supabase
      .from('tensw_project_schedules')
      .select('id, project_id, title, start_date, end_date, milestone_type, status')
      .in('project_id', projectIds)
      .eq('status', 'in_progress')
      .order('start_date', { ascending: true })

    // Get all documents
    const { data: allDocs } = await supabase
      .from('tensw_project_docs')
      .select('id, project_id, title, doc_type, created_at, created_by')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })

    // Get all project members
    const { data: allMembers } = await supabase
      .from('tensw_project_members')
      .select('id, project_id, name, role, is_manager')
      .in('project_id', projectIds)
      .order('is_manager', { ascending: false })
      .order('name', { ascending: true })

    // Get service URLs for all projects
    const { data: allServiceUrls } = await supabase
      .from('tensw_project_service_urls')
      .select('id, project_id, name, url, description')
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true })

    // Get recent todo logs (last 7 days)
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todoIds = allTodos?.map(t => t.id) || []

    let recentLogs: Array<{ id: string; todo_id: string; action: string; created_at: string; changed_by: string | null }> = []
    if (todoIds.length > 0) {
      const { data: logs } = await supabase
        .from('tensw_todo_logs')
        .select('id, todo_id, action, created_at, changed_by')
        .in('todo_id', todoIds)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(200)
      recentLogs = logs || []
    }

    // Get recent AI analyses (last 7 days)
    const { data: allAnalyses } = await supabase
      .from('tensw_project_analyses')
      .select('id, project_id, analysis_type, summary, created_at, created_by')
      .in('project_id', projectIds)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })

    // Get recent schedule changes (last 7 days)
    const { data: recentScheduleChanges } = await supabase
      .from('tensw_project_schedules')
      .select('id, project_id, title, status, created_at, updated_at, created_by')
      .in('project_id', projectIds)
      .gte('updated_at', sevenDaysAgo.toISOString())
      .order('updated_at', { ascending: false })

    // Get project repos for GitHub commits
    const { data: allRepos } = await supabase
      .from('tensw_project_repos')
      .select('id, project_id, name, url')
      .in('project_id', projectIds)

    // Fetch GitHub commits for each repo
    interface CommitData {
      project_id: string
      sha: string
      message: string
      author: string
      date: string
      repo: string
      url: string
    }
    const allCommits: CommitData[] = []
    const githubToken = process.env.GITHUB_TOKEN

    if (allRepos && allRepos.length > 0) {
      const reposByProject = new Map<string, typeof allRepos>()
      allRepos.forEach(repo => {
        const list = reposByProject.get(repo.project_id) || []
        list.push(repo)
        reposByProject.set(repo.project_id, list)
      })

      for (const [projectId, repos] of reposByProject) {
        for (const repo of repos.slice(0, 2)) { // Max 2 repos per project
          try {
            const urlMatch = repo.url.match(/github\.com\/([^/]+)\/([^/]+)/)
            if (!urlMatch) continue

            const [, owner, repoName] = urlMatch
            const cleanRepoName = repoName.replace(/\.git$/, '')

            const headers: Record<string, string> = {
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'Willow-Dashboard',
            }
            if (githubToken) {
              headers['Authorization'] = `Bearer ${githubToken}`
            }

            const response = await fetch(
              `https://api.github.com/repos/${owner}/${cleanRepoName}/commits?per_page=3&since=${sevenDaysAgo.toISOString()}`,
              { headers, next: { revalidate: 300 } }
            )

            if (response.ok) {
              const commits = await response.json()
              for (const commit of commits) {
                allCommits.push({
                  project_id: projectId,
                  sha: commit.sha,
                  message: commit.commit.message.split('\n')[0].substring(0, 80),
                  author: commit.commit.author.name,
                  date: commit.commit.author.date,
                  repo: cleanRepoName,
                  url: commit.html_url,
                })
              }
            }
          } catch (err) {
            console.error(`Error fetching commits for repo ${repo.name}:`, err)
          }
        }
      }
    }

    // Collect all user IDs for name lookup
    const userIds = new Set<string>()
    recentLogs.forEach(l => { if (l.changed_by) userIds.add(l.changed_by) })
    allDocs?.forEach(d => { if (d.created_by) userIds.add(d.created_by) })
    allAnalyses?.forEach(a => { if (a.created_by) userIds.add(a.created_by) })
    recentScheduleChanges?.forEach(s => { if (s.created_by) userIds.add(s.created_by) })

    // Fetch user names
    const userNameMap = new Map<string, string>()
    if (userIds.size > 0) {
      const { data: users } = await supabase
        .from('tensw_users')
        .select('id, name')
        .in('id', Array.from(userIds))
      users?.forEach(u => userNameMap.set(u.id, u.name))
    }

    // Create todo maps
    const todoProjectMap = new Map<string, string>()
    const todoTitleMap = new Map<string, string>()
    const todoPriorityMap = new Map<string, string>()
    const todoDueDateMap = new Map<string, string | null>()
    const todoAssigneesMap = new Map<string, string[]>()
    allTodos?.forEach(t => {
      todoProjectMap.set(t.id, t.project_id)
      todoTitleMap.set(t.id, t.title)
      todoPriorityMap.set(t.id, t.priority)
      todoDueDateMap.set(t.id, t.due_date)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assigneeNames = (t as any).assignees
        ?.map((a: { member: { name: string } | null }) => a.member?.name)
        .filter(Boolean) || []
      todoAssigneesMap.set(t.id, assigneeNames)
    })

    // Build project data with all details
    const projectsWithDetails: TenswProject[] = projects.map(project => {
      const projectTodos = allTodos?.filter(t => t.project_id === project.id) || []

      // Stats
      const stats: ProjectStats = {
        total: projectTodos.length,
        pending: projectTodos.filter(t => t.status === 'pending').length,
        assigned: projectTodos.filter(t => t.status === 'assigned').length,
        in_progress: projectTodos.filter(t => t.status === 'in_progress').length,
        pending_approval: projectTodos.filter(t => t.status === 'pending_approval').length,
        completed: projectTodos.filter(t => t.status === 'completed').length,
        discarded: projectTodos.filter(t => t.status === 'discarded').length,
      }

      // Schedules
      const schedules = allSchedules
        ?.filter(s => s.project_id === project.id)
        .slice(0, 5)
        .map(s => ({
          id: s.id,
          title: s.title,
          start_date: s.start_date,
          end_date: s.end_date,
          milestone_type: s.milestone_type,
          status: s.status,
        })) || []

      // Docs (최신순)
      const docs = allDocs
        ?.filter(d => d.project_id === project.id)
        .map(d => ({
          id: d.id,
          title: d.title,
          doc_type: d.doc_type,
          created_at: d.created_at,
        })) || []

      // 활성 할일 (pending, assigned, in_progress)
      const todos = projectTodos
        .filter(t => ['pending', 'assigned', 'in_progress'].includes(t.status))
        .sort((a, b) => {
          // 상태 순서: in_progress > assigned > pending
          const statusOrder: Record<string, number> = { in_progress: 0, assigned: 1, pending: 2 }
          const statusDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
          if (statusDiff !== 0) return statusDiff
          // 우선순위 순서
          const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
          return (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5)
        })
        .slice(0, 10)
        .map(t => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const assigneeNames = (t as any).assignees
            ?.map((a: { member: { name: string } | null }) => a.member?.name)
            .filter(Boolean) || []
          return {
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            due_date: t.due_date,
            readable_id: t.readable_id,
            assignees: assigneeNames,
          }
        })

      // Recent activity - combine all activity types
      const projectTodoIds = projectTodos.map(t => t.id)
      const allActivities: Array<{
        id: string
        type: string
        title: string
        created_at: string
        changed_by: string | null
        priority: string | null
        due_date: string | null
        actor?: string
        assignees?: string[]
      }> = []

      // Todo logs only (tensw-todo와 동일하게)
      recentLogs
        .filter(log => projectTodoIds.includes(log.todo_id))
        .forEach(log => {
          const actorName = log.changed_by ? userNameMap.get(log.changed_by) || undefined : undefined
          const assignees = todoAssigneesMap.get(log.todo_id) || []
          allActivities.push({
            id: log.id,
            type: log.action,
            title: todoTitleMap.get(log.todo_id) || 'Unknown',
            created_at: log.created_at,
            changed_by: log.changed_by ? userNameMap.get(log.changed_by) || null : null,
            priority: todoPriorityMap.get(log.todo_id) || null,
            due_date: todoDueDateMap.get(log.todo_id) || null,
            actor: actorName,
            assignees: assignees.length > 0 ? assignees : undefined,
          })
        })

      // Sort by created_at desc and take top 5
      const recentActivity = allActivities
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)

      // Members
      const members = allMembers
        ?.filter(m => m.project_id === project.id)
        .map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          is_manager: m.is_manager,
        })) || []

      // Service URLs
      const serviceUrls = allServiceUrls
        ?.filter(s => s.project_id === project.id)
        .map(s => ({
          id: s.id,
          name: s.name,
          url: s.url,
          description: s.description,
        })) || []

      // 사람별 진행 중 / 완료 할일 수 계산
      const getMemberTodoCounts = (statuses: string[]) => {
        const counts: Record<string, { name: string; count: number }> = {}
        projectTodos
          .filter(t => statuses.includes(t.status))
          .forEach(todo => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const assignees = (todo as any).assignees || []
            assignees.forEach((a: { member: { name: string } | null; member_id: string }) => {
              if (!counts[a.member_id]) {
                counts[a.member_id] = { name: a.member?.name || '미배정', count: 0 }
              }
              counts[a.member_id].count++
            })
          })
        return Object.values(counts).sort((a, b) => b.count - a.count)
      }
      const inProgressByMember = getMemberTodoCounts(['assigned', 'in_progress'])
      const completedByMember = getMemberTodoCounts(['completed'])

      // 평균 완료 시간 계산
      let avgCompletionTime: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completedWithTime = projectTodos.filter((t: any) =>
        t.status === 'completed' && t.assigned_at && t.completed_at
      )
      if (completedWithTime.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const totalMs = completedWithTime.reduce((sum: number, t: any) => {
          const assignedAt = new Date(t.assigned_at).getTime()
          const completedAt = new Date(t.completed_at).getTime()
          return sum + (completedAt - assignedAt)
        }, 0)
        const avgMs = totalMs / completedWithTime.length
        const avgHours = avgMs / (1000 * 60 * 60)
        const avgDays = Math.floor(avgHours / 24)
        const remainingHours = Math.round(avgHours % 24)
        if (avgDays > 0) {
          avgCompletionTime = remainingHours > 0 ? `${avgDays}일 ${remainingHours}시간` : `${avgDays}일`
        } else if (avgHours >= 1) {
          avgCompletionTime = `${Math.round(avgHours)}시간`
        } else {
          avgCompletionTime = `${Math.round(avgMs / (1000 * 60))}분`
        }
      }

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        status: project.status,
        icon: project.icon,
        is_poc: project.is_poc || false,
        memo: project.memo,
        project_url: project.project_url,
        created_at: project.created_at,
        updated_at: project.updated_at,
        stats,
        schedules,
        docs,
        todos,
        recentActivity,
        members,
        serviceUrls,
        inProgressByMember,
        completedByMember,
        avgCompletionTime,
      }
    })

    return NextResponse.json({ projects: projectsWithDetails })
  } catch (error) {
    console.error('Tensoftworks GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
