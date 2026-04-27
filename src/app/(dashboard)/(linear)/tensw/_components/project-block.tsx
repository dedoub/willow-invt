'use client'

import { useState, useMemo } from 'react'
import { t, tonePalettes } from '@/app/(dashboard)/_components/linear-tokens'
import { LCard } from '@/app/(dashboard)/_components/linear-card'
import { LSectionHead } from '@/app/(dashboard)/_components/linear-section-head'
import { LIcon } from '@/app/(dashboard)/_components/linear-icons'
import { LStat } from '@/app/(dashboard)/_components/linear-stat'

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface ProjectStats {
  total: number
  pending: number
  assigned: number
  in_progress: number
  pending_approval: number
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

interface ProjectDoc {
  id: string
  title: string
  doc_type: string
  created_at: string
}

interface ProjectTodo {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  readable_id: string | null
  assignees: string[]
}

interface ProjectActivity {
  id: string
  type: string
  title: string
  created_at: string
  changed_by: string | null
  priority: string | null
  due_date: string | null
}

interface ProjectMember {
  id: string
  name: string
  role: string | null
  is_manager: boolean
}

interface ServiceUrl {
  id: string
  name: string
  url: string
  description: string | null
}

interface MemberTodoCount {
  name: string
  count: number
}

export interface TenswProjectFull {
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
  aiProgressScore?: number | null
}

interface ProjectBlockProps {
  projects: TenswProjectFull[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_KEY = 'tensw-project-page-size'

// ─── Icon mapping ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, string> = {
  code: 'file', database: 'more', globe: 'trending', smartphone: 'message',
  server: 'settings', package: 'briefcase', briefcase: 'briefcase', brain: 'sparkles',
}

const DIRECT_NAMES = [
  'folder', 'code', 'globe', 'server', 'briefcase', 'brain',
  'package', 'database', 'smartphone', 'pencil', 'plus', 'x',
  'chevronLeft', 'chevronRight', 'refresh', 'file', 'check',
  'calendar', 'trending', 'book',
]

function resolveIcon(icon: string | null): string {
  if (!icon) return 'folder'
  if (ICON_MAP[icon]) return ICON_MAP[icon]
  if (DIRECT_NAMES.includes(icon)) return icon
  return 'folder'
}

// ─── Status badge config ─────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  active:   { bg: '#16A34A20', fg: '#16A34A', label: '진행' },
  managed:  { bg: '#3B82F620', fg: '#3B82F6', label: '관리' },
  closed:   { bg: '#9CA3AF20', fg: '#9CA3AF', label: '종료' },
  poc:      { bg: '#F59E0B20', fg: '#F59E0B', label: 'POC' },
}

function getStatusStyle(status: string, isPoc: boolean) {
  if (isPoc) return STATUS_STYLES.poc
  return STATUS_STYLES[status] ?? { bg: '#9CA3AF20', fg: '#9CA3AF', label: status }
}

// ─── Filter config ────────────────────────────────────────────────────────────

type FilterKey = '전체' | 'active' | 'managed' | 'closed' | 'poc'

function buildFilters(projects: TenswProjectFull[]) {
  return [
    { key: '전체' as FilterKey,   label: '전체',   count: projects.length },
    { key: 'active' as FilterKey, label: '진행',   count: projects.filter(p => p.status === 'active' && !p.is_poc).length },
    { key: 'managed' as FilterKey,label: '관리',   count: projects.filter(p => p.status === 'managed' && !p.is_poc).length },
    { key: 'closed' as FilterKey, label: '종료',   count: projects.filter(p => p.status === 'closed' && !p.is_poc).length },
    { key: 'poc' as FilterKey,    label: 'POC',    count: projects.filter(p => p.is_poc).length },
  ]
}

function filterProjects(projects: TenswProjectFull[], filter: FilterKey) {
  if (filter === '전체') return projects
  if (filter === 'poc') return projects.filter(p => p.is_poc)
  return projects.filter(p => p.status === filter && !p.is_poc)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

function calcProgress(stats: ProjectStats): string {
  const d = stats.total - stats.discarded
  if (d <= 0) return '-'
  return `${Math.round((stats.completed / d) * 100)}%`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(diff / 86400000)}일 전`
}

// Activity type config
const ACTIVITY_TONES: Record<string, { bg: string; fg: string; label: string }> = {
  created:            { bg: '#DBEAFE', fg: '#1D4ED8', label: '생성' },
  assigned:           { bg: '#FEF3C7', fg: '#B45309', label: '배정' },
  started:            { bg: '#CFFAFE', fg: '#0E7490', label: '시작' },
  completed:          { bg: '#D1FAE5', fg: '#047857', label: '완료' },
  discarded:          { bg: '#E5E7EB', fg: '#6B7280', label: '폐기' },
  analysis:           { bg: '#EDE9FE', fg: '#7C3AED', label: '분석' },
  doc_created:        { bg: '#E0E7FF', fg: '#4338CA', label: '문서' },
  schedule_created:   { bg: '#CCFBF1', fg: '#0F766E', label: '일정생성' },
  schedule_updated:   { bg: '#FFEDD5', fg: '#C2410C', label: '일정수정' },
  schedule_completed: { bg: '#D1FAE5', fg: '#047857', label: '일정완료' },
  commit:             { bg: '#E5E7EB', fg: '#374151', label: '커밋' },
}

const PRIORITY_TONES: Record<string, { bg: string; fg: string }> = {
  critical: { bg: '#FEE2E2', fg: '#B91C1C' },
  high:     { bg: '#FFEDD5', fg: '#C2410C' },
  medium:   { bg: '#FEF9C3', fg: '#A16207' },
  low:      { bg: '#F1F5F9', fg: '#64748B' },
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '긴급', high: '높음', medium: '보통', low: '낮음',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectBlock({ projects }: ProjectBlockProps) {
  const [filter, setFilter] = useState<FilterKey>('전체')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filters = buildFilters(projects)
  const filtered = filterProjects(projects, filter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

  // Aggregate KPIs across all active (non-closed, non-poc) projects
  const activeProjects = useMemo(() => projects.filter(p => p.status === 'active' && !p.is_poc), [projects])
  const totalTodos = useMemo(() => activeProjects.reduce((s, p) => s + p.stats.total, 0), [activeProjects])
  const totalPending = useMemo(() => activeProjects.reduce((s, p) => s + p.stats.pending, 0), [activeProjects])
  const totalInProgress = useMemo(() => activeProjects.reduce((s, p) => s + p.stats.assigned + p.stats.in_progress, 0), [activeProjects])
  const totalCompleted = useMemo(() => activeProjects.reduce((s, p) => s + p.stats.completed, 0), [activeProjects])
  const totalDiscarded = useMemo(() => activeProjects.reduce((s, p) => s + p.stats.discarded, 0), [activeProjects])
  const overallProgress = useMemo(() => {
    const d = totalTodos - totalDiscarded
    return d > 0 ? `${Math.round((totalCompleted / d) * 100)}%` : '-'
  }, [totalTodos, totalCompleted, totalDiscarded])

  const commitPageSize = () => {
    const n = Math.max(5, Math.min(100, Number(pageSizeInput) || DEFAULT_PAGE_SIZE))
    setPageSizeInput(String(n))
    setPageSize(n)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_KEY, String(n))
  }

  const handleFilterChange = (key: FilterKey) => {
    setFilter(key)
    setPage(0)
  }

  return (
    <LCard pad={0}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: 8 }}>
        <LSectionHead
          eyebrow="PROJECTS"
          title="프로젝트"
          action={
            <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
              {filtered.length}개
            </span>
          }
        />

        {/* Summary KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
          <LStat label="배정 대기" value={String(totalPending)} tone="warn" />
          <LStat label="진행 중" value={String(totalInProgress)} tone="info" />
          <LStat label="완료" value={String(totalCompleted)} tone="pos" />
          <LStat label="전체 진행률" value={overallProgress} tone="default" />
        </div>

        {/* Filter badges */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {filters.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => handleFilterChange(f.key)}
                style={{
                  padding: '4px 10px', borderRadius: t.radius.pill,
                  fontSize: 11, fontFamily: t.font.sans,
                  fontWeight: active ? t.weight.medium : t.weight.regular,
                  background: active ? t.brand[100] : t.neutrals.inner,
                  color: active ? t.brand[700] : t.neutrals.muted,
                  border: 'none', cursor: 'pointer', transition: 'all .12s',
                }}
              >
                {f.label}{f.count > 0 && (
                  <span style={{ fontFamily: t.font.mono, fontSize: 10, marginLeft: 2 }}>{f.count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Project rows */}
      <div style={{ padding: '0 0 4px' }}>
        {paged.length === 0 && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 12, color: t.neutrals.subtle,
          }}>
            프로젝트 데이터가 없습니다
          </div>
        )}
        {paged.map(project => {
          const statusStyle = getStatusStyle(project.status, project.is_poc)
          const progress = calcProgress(project.stats)
          const expanded = expandedId === project.id
          const waiting = project.stats.pending
          const inProgress = project.stats.assigned + project.stats.in_progress
          const completed = project.stats.completed

          return (
            <div key={project.id} style={{ borderTop: `1px solid ${t.neutrals.line}` }}>
              {/* Compact row */}
              <div
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onClick={() => setExpandedId(expanded ? null : project.id)}
              >
                {/* Icon */}
                <span style={{ color: t.neutrals.subtle, flexShrink: 0 }}>
                  <LIcon name={resolveIcon(project.icon)} size={14} />
                </span>

                {/* Name + description */}
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 500, color: t.neutrals.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {project.name}
                  </div>
                  {project.description && (
                    <div style={{
                      fontSize: 10.5, color: t.neutrals.muted,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginTop: 1,
                    }}>
                      {project.description}
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <span style={{
                  display: 'inline-block', padding: '2px 7px', borderRadius: t.radius.pill,
                  fontSize: 10, fontFamily: t.font.mono, fontWeight: 600,
                  background: statusStyle.bg, color: statusStyle.fg,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {statusStyle.label}
                </span>

                {/* Stats mini: 대기/진행/완료 */}
                <div style={{
                  display: 'flex', gap: 8, flexShrink: 0,
                  fontSize: 10, fontFamily: t.font.mono,
                }}>
                  <span style={{ color: tonePalettes.pending.fg }}>
                    <span style={{ fontSize: 9, opacity: 0.8 }}>대기</span> {waiting}
                  </span>
                  <span style={{ color: tonePalettes.info.fg }}>
                    <span style={{ fontSize: 9, opacity: 0.8 }}>진행</span> {inProgress}
                  </span>
                  <span style={{ color: tonePalettes.pos.fg }}>
                    <span style={{ fontSize: 9, opacity: 0.8 }}>완료</span> {completed}
                  </span>
                </div>

                {/* Progress */}
                <span style={{
                  fontSize: 11, fontFamily: t.font.mono, fontWeight: 500,
                  color: t.neutrals.text, whiteSpace: 'nowrap', flexShrink: 0,
                  minWidth: 32, textAlign: 'right',
                }}>
                  {progress}
                </span>

                {/* AI Score */}
                {project.aiProgressScore != null && (
                  <span style={{
                    fontSize: 10, fontFamily: t.font.mono,
                    color: t.neutrals.muted, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    AI {Math.round(project.aiProgressScore)}%
                  </span>
                )}

                {/* Expand chevron */}
                <span style={{ color: t.neutrals.subtle, flexShrink: 0 }}>
                  <LIcon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} stroke={2} />
                </span>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <ExpandedDetail
                  project={project}
                  waiting={waiting}
                  inProgress={inProgress}
                  completed={completed}
                  progress={progress}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 16px', borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={pageSizeInput}
            onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPageSize}
            onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
            style={{
              width: 32, textAlign: 'center',
              border: 'none', background: t.neutrals.inner,
              borderRadius: t.radius.sm, fontSize: 11,
              fontFamily: t.font.mono, color: t.neutrals.muted,
              padding: '2px 0', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: t.neutrals.subtle, fontFamily: t.font.sans }}>개씩</span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: 4, borderRadius: 4,
                cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? t.neutrals.line : t.neutrals.muted,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronLeft" size={13} stroke={2} />
            </button>
            <span style={{ fontSize: 10, fontFamily: t.font.mono, color: t.neutrals.muted }}>
              {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'transparent', border: 'none',
                padding: 4, borderRadius: 4,
                cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? t.neutrals.line : t.neutrals.muted,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              <LIcon name="chevronRight" size={13} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </LCard>
  )
}

// ─── Expanded Detail ──────────────────────────────────────────────────────────

function ExpandedDetail({
  project, waiting, inProgress, completed, progress,
}: {
  project: TenswProjectFull
  waiting: number; inProgress: number; completed: number; progress: string
}) {
  const hasSchedules = project.schedules.length > 0
  const hasDocs = project.docs.length > 0
  const hasTodos = project.todos.length > 0
  const hasActivity = project.recentActivity.length > 0
  const hasMembers = project.members.length > 0
  const hasServiceUrls = project.serviceUrls.length > 0

  return (
    <div style={{ padding: '0 16px 12px' }}>
      {/* Stats KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10,
      }}>
        <LStat label="배정 대기" value={String(waiting)} tone="warn" />
        <LStat label="진행 중" value={String(inProgress)} tone="info" />
        <LStat label="완료" value={String(completed)} tone="pos" />
        <LStat label="진행률" value={progress} tone="default" />
      </div>

      {/* Member breakdowns */}
      {(project.inProgressByMember.length > 0 || project.completedByMember.length > 0) && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10,
        }}>
          {project.inProgressByMember.length > 0 && (
            <div style={{
              background: t.neutrals.inner, borderRadius: t.radius.md, padding: 10,
            }}>
              <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 4 }}>진행 중 (담당자별)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {project.inProgressByMember.slice(0, 4).map((m, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: t.radius.sm,
                    background: tonePalettes.info.bg, color: tonePalettes.info.fg,
                  }}>
                    {m.name} {m.count}
                  </span>
                ))}
                {project.inProgressByMember.length > 4 && (
                  <span style={{ fontSize: 10, color: t.neutrals.muted }}>+{project.inProgressByMember.length - 4}</span>
                )}
              </div>
            </div>
          )}
          {project.completedByMember.length > 0 && (
            <div style={{
              background: t.neutrals.inner, borderRadius: t.radius.md, padding: 10,
            }}>
              <div style={{ fontSize: 10, color: t.neutrals.subtle, marginBottom: 4 }}>완료 (담당자별)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {project.completedByMember.slice(0, 4).map((m, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: t.radius.sm,
                    background: tonePalettes.pos.bg, color: tonePalettes.pos.fg,
                  }}>
                    {m.name} {m.count}
                  </span>
                ))}
                {project.completedByMember.length > 4 && (
                  <span style={{ fontSize: 10, color: t.neutrals.muted }}>+{project.completedByMember.length - 4}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Avg completion time + AI Score */}
      {(project.avgCompletionTime || project.aiProgressScore != null) && (
        <div style={{
          display: 'flex', gap: 12, marginBottom: 10, fontSize: 11,
        }}>
          {project.avgCompletionTime && (
            <span style={{ color: t.neutrals.muted }}>
              평균 완료: <span style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{project.avgCompletionTime}</span>
            </span>
          )}
          {project.aiProgressScore != null && (
            <span style={{ color: t.neutrals.muted }}>
              AI 진행률: <span style={{ fontFamily: t.font.mono, color: t.neutrals.text }}>{Math.round(project.aiProgressScore)}%</span>
            </span>
          )}
        </div>
      )}

      {/* Two-column: left (info/schedules/docs/members) + right (activity) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Service URLs */}
          {hasServiceUrls && (
            <DetailSection label="서비스 URL">
              {project.serviceUrls.map(svc => (
                <a
                  key={svc.id}
                  href={svc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: t.brand[700], textDecoration: 'none',
                  }}
                >
                  <LIcon name="trending" size={10} stroke={1.8} />
                  {svc.name}
                </a>
              ))}
            </DetailSection>
          )}

          {/* Schedules */}
          {hasSchedules && (
            <DetailSection label="일정">
              {project.schedules.slice(0, 5).map(s => (
                <div key={s.id} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ fontFamily: t.font.mono, color: t.neutrals.muted, flexShrink: 0, width: 36 }}>
                    {formatDate(s.start_date)}
                  </span>
                  <span style={{
                    color: t.neutrals.text, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.title}
                  </span>
                </div>
              ))}
            </DetailSection>
          )}

          {/* Documents */}
          {hasDocs && (
            <DetailSection label="문서">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {project.docs.slice(0, 6).map(doc => (
                  <span key={doc.id} style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: t.radius.sm,
                    background: t.neutrals.inner, color: t.neutrals.text,
                  }}>
                    {doc.title}
                  </span>
                ))}
                {project.docs.length > 6 && (
                  <span style={{ fontSize: 10, color: t.neutrals.muted }}>+{project.docs.length - 6}</span>
                )}
              </div>
            </DetailSection>
          )}

          {/* Members */}
          {hasMembers && (
            <DetailSection label="멤버">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 11 }}>
                {project.members.filter(m => m.is_manager).map(m => (
                  <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ color: t.neutrals.text }}>{m.name}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 4px', borderRadius: t.radius.sm,
                      background: '#EDE9FE', color: '#7C3AED',
                    }}>매니저</span>
                  </span>
                ))}
                {project.members.filter(m => !m.is_manager).length > 0 && (
                  <span style={{ color: t.neutrals.muted }}>
                    외 {project.members.filter(m => !m.is_manager).length}명
                  </span>
                )}
              </div>
            </DetailSection>
          )}
        </div>

        {/* Right column: Recent Activity */}
        <div>
          {hasActivity && (
            <DetailSection label="최근 활동">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {project.recentActivity.slice(0, 5).map(act => {
                  const actTone = ACTIVITY_TONES[act.type] ?? { bg: '#E5E7EB', fg: '#6B7280', label: act.type }
                  return (
                    <div key={act.id} style={{
                      padding: '6px 8px', borderRadius: t.radius.sm,
                      background: actTone.bg,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600, color: actTone.fg,
                        }}>
                          {actTone.label}
                        </span>
                        {act.changed_by && (
                          <span style={{ fontSize: 9, color: actTone.fg, opacity: 0.7 }}>
                            · {act.changed_by}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11, color: actTone.fg, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {act.title}
                      </div>
                      <div style={{ fontSize: 9, color: actTone.fg, opacity: 0.7, marginTop: 2 }}>
                        {formatRelativeTime(act.created_at)}
                        {act.due_date && ` · 마감 ${formatDate(act.due_date)}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            </DetailSection>
          )}
        </div>
      </div>

      {/* Todos */}
      {hasTodos && (
        <DetailSection label="할 일" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {project.todos.map(todo => {
              const pTone = PRIORITY_TONES[todo.priority] ?? PRIORITY_TONES.low
              return (
                <div key={todo.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                }}>
                  {todo.readable_id && (
                    <span style={{
                      fontFamily: t.font.mono, fontSize: 10, color: t.brand[700], flexShrink: 0,
                    }}>
                      [{todo.readable_id}]
                    </span>
                  )}
                  <span style={{
                    color: t.neutrals.text, flex: 1, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {todo.title}
                  </span>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: t.radius.sm,
                    background: pTone.bg, color: pTone.fg, fontWeight: 500, flexShrink: 0,
                  }}>
                    {PRIORITY_LABELS[todo.priority] ?? todo.priority}
                  </span>
                  {todo.due_date && (
                    <span style={{ fontFamily: t.font.mono, fontSize: 10, color: t.neutrals.muted, flexShrink: 0 }}>
                      {formatDate(todo.due_date)}
                    </span>
                  )}
                  {todo.assignees.length > 0 && (
                    <span style={{
                      fontSize: 10, color: t.neutrals.muted, flexShrink: 0,
                      maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {todo.assignees.join(', ')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </DetailSection>
      )}

      {/* Memo */}
      {project.memo && (
        <div style={{
          padding: '8px 12px', borderRadius: t.radius.md,
          background: t.neutrals.inner, fontSize: 11, color: t.neutrals.muted,
          lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8,
        }}>
          {project.memo}
        </div>
      )}

      {/* Project link + external link */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {project.project_url && (
          <a
            href={project.project_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              padding: '4px 12px', borderRadius: t.radius.sm,
              background: t.neutrals.inner, border: 'none',
              fontSize: 11, fontFamily: t.font.sans, fontWeight: 500,
              color: t.brand[700], cursor: 'pointer', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <LIcon name="trending" size={10} stroke={2} />
            프로젝트 URL
          </a>
        )}
        <a
          href={`https://tensw-todo.vercel.app/projects/${project.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            padding: '4px 12px', borderRadius: t.radius.sm,
            background: t.neutrals.inner, border: 'none',
            fontSize: 11, fontFamily: t.font.sans, fontWeight: 500,
            color: t.neutrals.text, cursor: 'pointer', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <LIcon name="trending" size={10} stroke={2} />
          상세 보기
        </a>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailSection({
  label, children, style: extraStyle,
}: {
  label: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div style={extraStyle}>
      <div style={{
        fontSize: 10, fontWeight: 600, color: t.neutrals.subtle,
        fontFamily: t.font.mono, letterSpacing: 0.3,
        textTransform: 'uppercase' as const, marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}
