'use client'

import { useState } from 'react'
import { t } from '@/app/willow-investment/_components/linear-tokens'
import { LCard } from '@/app/willow-investment/_components/linear-card'
import { LSectionHead } from '@/app/willow-investment/_components/linear-section-head'
import { LIcon } from '@/app/willow-investment/_components/linear-icons'

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

interface ProjectWithStats {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  icon: string | null
  is_poc: boolean
  stats: ProjectStats
  aiProgressScore?: number | null
}

interface ProjectBlockProps {
  projects: ProjectWithStats[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 10
const PAGE_SIZE_KEY = 'tensw-project-page-size'

// ─── Icon mapping ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, string> = {
  code: 'file',
  database: 'more',
  globe: 'trending',
  smartphone: 'message',
  server: 'settings',
  package: 'briefcase',
  briefcase: 'briefcase',
  brain: 'sparkles',
}

function resolveIcon(icon: string | null): string {
  if (!icon) return 'folder'
  if (ICON_MAP[icon]) return ICON_MAP[icon]
  // check if the icon name itself is in LIcon paths
  const directNames = [
    'folder', 'code', 'globe', 'server', 'briefcase', 'brain',
    'package', 'database', 'smartphone', 'pencil', 'plus', 'x',
    'chevronLeft', 'chevronRight', 'refresh', 'file', 'check',
    'calendar', 'trending', 'book',
  ]
  if (directNames.includes(icon)) return icon
  return 'folder'
}

// ─── Status badge config ─────────────────────────────────────────────────────

interface StatusStyle {
  bg: string
  fg: string
  label: string
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  active:   { bg: '#16A34A20', fg: '#16A34A', label: '진행' },
  managed:  { bg: '#3B82F620', fg: '#3B82F6', label: '관리' },
  closed:   { bg: '#9CA3AF20', fg: '#9CA3AF', label: '종료' },
  poc:      { bg: '#F59E0B20', fg: '#F59E0B', label: 'POC' },
}

function getStatusStyle(status: string, isPoc: boolean): StatusStyle {
  if (isPoc) return STATUS_STYLES.poc
  return STATUS_STYLES[status] ?? { bg: '#9CA3AF20', fg: '#9CA3AF', label: status }
}

// ─── Filter config ────────────────────────────────────────────────────────────

type FilterKey = '전체' | 'active' | 'managed' | 'closed' | 'poc'

interface FilterDef {
  key: FilterKey
  label: string
  count: number
}

function buildFilters(projects: ProjectWithStats[]): FilterDef[] {
  return [
    { key: '전체',   label: '전체',   count: projects.length },
    { key: 'active', label: '진행',   count: projects.filter(p => p.status === 'active' && !p.is_poc).length },
    { key: 'managed',label: '관리',   count: projects.filter(p => p.status === 'managed' && !p.is_poc).length },
    { key: 'closed', label: '종료',   count: projects.filter(p => p.status === 'closed' && !p.is_poc).length },
    { key: 'poc',    label: 'POC',    count: projects.filter(p => p.is_poc).length },
  ]
}

function filterProjects(projects: ProjectWithStats[], filter: FilterKey): ProjectWithStats[] {
  if (filter === '전체') return projects
  if (filter === 'poc') return projects.filter(p => p.is_poc)
  return projects.filter(p => p.status === filter && !p.is_poc)
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getStoredPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
  const v = localStorage.getItem(PAGE_SIZE_KEY)
  if (!v) return DEFAULT_PAGE_SIZE
  const n = Number(v)
  return n >= 5 && n <= 100 ? n : DEFAULT_PAGE_SIZE
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

function calcProgress(stats: ProjectStats): string {
  const denominator = stats.total - stats.discarded
  if (denominator <= 0) return '-'
  const pct = Math.round((stats.completed / denominator) * 100)
  return `${pct}%`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectBlock({ projects }: ProjectBlockProps) {
  const [filter, setFilter] = useState<FilterKey>('전체')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [pageSizeInput, setPageSizeInput] = useState(String(getStoredPageSize()))

  const filters = buildFilters(projects)
  const filtered = filterProjects(projects, filter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)

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

  const thStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 10,
    fontFamily: t.font.mono,
    fontWeight: 600,
    color: t.neutrals.subtle,
    textAlign: 'left',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  }

  const tdStyle: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: 11.5,
    fontFamily: t.font.sans,
    color: t.neutrals.text,
  }

  return (
    <LCard pad={0}>
      {/* Header */}
      <div style={{ padding: t.density.cardPad, paddingBottom: 10 }}>
        <LSectionHead
          eyebrow="PROJECTS"
          title="프로젝트"
          action={
            <span style={{ fontSize: 11, color: t.neutrals.muted, fontFamily: t.font.mono }}>
              {filtered.length}개
            </span>
          }
        />

        {/* Filter badges */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11,
                fontFamily: t.font.sans,
                fontWeight: filter === f.key ? 600 : 400,
                background: filter === f.key ? t.brand[600] + '18' : 'transparent',
                color: filter === f.key ? t.brand[600] : t.neutrals.muted,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {f.label}{f.count > 0 && (
                <span style={{ fontFamily: t.font.mono, fontSize: 10, marginLeft: 2 }}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col />
            <col style={{ width: 60 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr style={{ background: t.neutrals.inner, borderBottom: `1px solid ${t.neutrals.line}` }}>
              <th style={thStyle}></th>
              <th style={thStyle}>PROJECT</th>
              <th style={thStyle}>STATUS</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>PROGRESS</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>AI SCORE</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(project => {
              const statusStyle = getStatusStyle(project.status, project.is_poc)
              const progress = calcProgress(project.stats)
              const aiScore = project.aiProgressScore != null
                ? `${Math.round(project.aiProgressScore)}%`
                : '-'

              return (
                <tr
                  key={project.id}
                  onClick={() => window.open(`https://tensw-todo.vercel.app/projects/${project.slug}`, '_blank')}
                  style={{
                    borderBottom: `1px solid ${t.neutrals.line}`,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    ;(e.currentTarget as HTMLTableRowElement).style.background = t.neutrals.inner
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLTableRowElement).style.background = 'transparent'
                  }}
                >
                  {/* Icon */}
                  <td style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle }}>
                    <LIcon name={resolveIcon(project.icon)} size={14} />
                  </td>

                  {/* Name + description */}
                  <td style={{ ...tdStyle, overflow: 'hidden' }}>
                    <div style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {project.name}
                    </div>
                    {project.description && (
                      <div style={{
                        fontSize: 10.5,
                        color: t.neutrals.muted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 1,
                      }}>
                        {project.description}
                      </div>
                    )}
                  </td>

                  {/* Status badge */}
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 7px',
                      borderRadius: t.radius.pill,
                      fontSize: 10,
                      fontFamily: t.font.mono,
                      fontWeight: 600,
                      background: statusStyle.bg,
                      color: statusStyle.fg,
                      whiteSpace: 'nowrap',
                    }}>
                      {statusStyle.label}
                    </span>
                  </td>

                  {/* Progress */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono }}>
                    {progress}
                  </td>

                  {/* AI Score */}
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: t.font.mono, color: t.neutrals.muted }}>
                    {aiScore}
                  </td>
                </tr>
              )
            })}
            {paged.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ ...tdStyle, textAlign: 'center', color: t.neutrals.subtle, padding: 30 }}
                >
                  프로젝트 데이터가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        borderTop: `1px solid ${t.neutrals.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            value={pageSizeInput}
            onChange={e => setPageSizeInput(e.target.value.replace(/\D/g, ''))}
            onBlur={commitPageSize}
            onKeyDown={e => { if (e.key === 'Enter') commitPageSize() }}
            style={{
              width: 32,
              textAlign: 'center',
              border: 'none',
              background: t.neutrals.inner,
              borderRadius: t.radius.sm,
              fontSize: 11,
              fontFamily: t.font.mono,
              color: t.neutrals.muted,
              padding: '2px 0',
              outline: 'none',
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
                background: 'transparent',
                border: 'none',
                padding: 4,
                borderRadius: 4,
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
                background: 'transparent',
                border: 'none',
                padding: 4,
                borderRadius: 4,
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
