/**
 * 클라이언트 및 프로젝트 섹션 템플릿
 *
 * 구조:
 * - 카드 헤더: 제목 + 클라이언트/프로젝트 추가 버튼
 * - 클라이언트 필터 배지 (동적 색상)
 * - 프로젝트 목록 (접기/펼치기)
 *   - 프로젝트 헤더 (클라이언트 색상 테두리)
 *   - 마일스톤 목록 (상태 토글, 인라인 수정)
 */

import { useState } from 'react'
import {
  BookMarked,
  Plus,
  Pencil,
  ChevronDown,
  Circle,
  Clock,
  CheckCircle2,
  Loader2,
  Calendar,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'


// ============================================================
// 1. 타입 정의
// ============================================================

interface Client {
  id: string
  name: string
  color: string // HEX 색상 (예: '#3B82F6')
}

interface Project {
  id: string
  client_id: string
  client?: Client
  name: string
  description?: string
  status: 'active' | 'completed' | 'on_hold' | 'cancelled'
}

interface Milestone {
  id: string
  project_id: string
  name: string
  description?: string
  target_date?: string // YYYY-MM-DD
  status: 'pending' | 'in_progress' | 'completed'
}


// ============================================================
// 2. 전체 섹션 구조
// ============================================================

export function ClientProjectSection() {
  // State
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])

  const [selectedClient, setSelectedClient] = useState<string | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<string[]>([])

  // 필터링된 프로젝트
  const filteredProjects = selectedClient
    ? projects.filter(p => p.client_id === selectedClient)
    : projects

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      {/* 헤더 */}
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
            onClick={() => {/* openClientDialog() */}}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">클라이언트</span>
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
            onClick={() => {/* openProjectDialog() */}}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">프로젝트</span>
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {/* 클라이언트 필터 배지 */}
        <ClientFilterBadges
          clients={clients}
          selectedClient={selectedClient}
          onSelect={setSelectedClient}
        />

        {/* 프로젝트 목록 */}
        <div className="space-y-2">
          {filteredProjects.map((project) => (
            <ProjectItem
              key={project.id}
              project={project}
              milestones={milestones.filter(m => m.project_id === project.id)}
              isExpanded={expandedProjects.includes(project.id)}
              onToggle={() => {
                setExpandedProjects(prev =>
                  prev.includes(project.id)
                    ? prev.filter(id => id !== project.id)
                    : [...prev, project.id]
                )
              }}
              onEditProject={() => {/* openProjectDialog(project) */}}
            />
          ))}
          {filteredProjects.length === 0 && (
            <div className="text-center text-muted-foreground py-4 text-sm">
              프로젝트가 없습니다
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


// ============================================================
// 3. 클라이언트 필터 배지
// ============================================================

interface ClientFilterBadgesProps {
  clients: Client[]
  selectedClient: string | null
  onSelect: (clientId: string | null) => void
}

function ClientFilterBadges({ clients, selectedClient, onSelect }: ClientFilterBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1 items-center mb-4">
      {/* 전체 버튼 */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
          selectedClient === null
            ? 'bg-slate-900 text-white dark:bg-slate-600'
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
        )}
      >
        전체
      </button>

      {/* 클라이언트 배지 (이름순 정렬) */}
      {[...clients].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((client) => (
        <button
          key={client.id}
          onClick={() => onSelect(client.id)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-full transition-colors',
            selectedClient === client.id
              ? 'text-white'
              : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
          )}
          style={{
            backgroundColor: selectedClient === client.id ? client.color : undefined,
          }}
        >
          {client.name}
        </button>
      ))}
    </div>
  )
}


// ============================================================
// 4. 프로젝트 아이템 (접기/펼치기)
// ============================================================

interface ProjectItemProps {
  project: Project
  milestones: Milestone[]
  isExpanded: boolean
  onToggle: () => void
  onEditProject: () => void
}

function ProjectItem({ project, milestones, isExpanded, onToggle, onEditProject }: ProjectItemProps) {
  const completed = milestones.filter(m => m.status === 'completed').length
  const total = milestones.length
  const clientColor = project.client?.color || '#888'

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ borderLeft: `3px solid ${clientColor}` }}
    >
      {/* 프로젝트 헤더 */}
      <div
        className="p-2 cursor-pointer flex items-center justify-between transition-opacity hover:opacity-80"
        style={{ backgroundColor: `${clientColor}15` }}
        onClick={onToggle}
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
                <ProjectStatusBadge status={project.status} />
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
              onEditProject()
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 마일스톤 목록 */}
      {isExpanded && (
        <MilestoneList
          projectId={project.id}
          milestones={milestones}
        />
      )}
    </div>
  )
}


// ============================================================
// 5. 프로젝트 상태 배지
// ============================================================

function ProjectStatusBadge({ status }: { status: Project['status'] }) {
  const config = {
    completed: { label: '완료', className: 'bg-green-100 text-green-700' },
    on_hold: { label: '보류', className: 'bg-yellow-100 text-yellow-700' },
    cancelled: { label: '취소', className: 'bg-red-100 text-red-700' },
    active: { label: '진행중', className: 'bg-blue-100 text-blue-700' },
  }[status]

  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0', config.className)}>
      {config.label}
    </span>
  )
}


// ============================================================
// 6. 마일스톤 목록
// ============================================================

interface MilestoneListProps {
  projectId: string
  milestones: Milestone[]
}

function MilestoneList({ projectId, milestones }: MilestoneListProps) {
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [milestoneForm, setMilestoneForm] = useState({ name: '', target_date: '' })
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  const toggleMilestoneStatus = async (milestone: Milestone) => {
    // pending → in_progress → completed → pending
    const nextStatus = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
    }[milestone.status] as Milestone['status']

    setTogglingIds(prev => new Set(prev).add(milestone.id))
    // await API call...
    setTogglingIds(prev => {
      const next = new Set(prev)
      next.delete(milestone.id)
      return next
    })
  }

  return (
    <div className="p-2 space-y-1 bg-background">
      {milestones.map((milestone) =>
        editingMilestoneId === milestone.id ? (
          <MilestoneEditForm
            key={milestone.id}
            milestone={milestone}
            form={milestoneForm}
            setForm={setMilestoneForm}
            onSave={() => setEditingMilestoneId(null)}
            onCancel={() => setEditingMilestoneId(null)}
            onDelete={() => setEditingMilestoneId(null)}
          />
        ) : (
          <MilestoneItem
            key={milestone.id}
            milestone={milestone}
            isToggling={togglingIds.has(milestone.id)}
            onToggleStatus={() => toggleMilestoneStatus(milestone)}
            onEdit={() => {
              setMilestoneForm({
                name: milestone.name,
                target_date: milestone.target_date || '',
              })
              setEditingMilestoneId(milestone.id)
            }}
          />
        )
      )}

      {/* 마일스톤 추가 */}
      {addingMilestone ? (
        <MilestoneAddForm
          form={milestoneForm}
          setForm={setMilestoneForm}
          onSave={() => {
            // saveMilestone()
            setAddingMilestone(false)
            setMilestoneForm({ name: '', target_date: '' })
          }}
          onCancel={() => {
            setAddingMilestone(false)
            setMilestoneForm({ name: '', target_date: '' })
          }}
        />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => {
            setMilestoneForm({ name: '', target_date: '' })
            setAddingMilestone(true)
          }}
        >
          <Plus className="h-3 w-3 mr-1" />
          마일스톤 추가
        </Button>
      )}
    </div>
  )
}


// ============================================================
// 7. 마일스톤 아이템 (읽기 모드)
// ============================================================

interface MilestoneItemProps {
  milestone: Milestone
  isToggling: boolean
  onToggleStatus: () => void
  onEdit: () => void
  hasSchedules?: boolean
}

function MilestoneItem({ milestone, isToggling, onToggleStatus, onEdit, hasSchedules }: MilestoneItemProps) {
  const statusConfig = {
    pending: {
      label: '대기',
      tooltip: '클릭해서 진행중으로 변경',
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/50',
      Icon: Circle,
    },
    in_progress: {
      label: '진행중',
      tooltip: '클릭해서 완료로 변경',
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/50',
      Icon: Clock,
    },
    completed: {
      label: '완료',
      tooltip: '클릭해서 대기로 변경',
      color: 'text-emerald-700 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/50',
      Icon: CheckCircle2,
    },
  }
  const config = statusConfig[milestone.status]
  const StatusIcon = config.Icon

  // D-day 계산
  const dDayInfo = milestone.target_date && milestone.status !== 'completed'
    ? getDDayInfo(milestone.target_date)
    : null

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-1.5 rounded text-sm',
        milestone.status === 'completed' && 'bg-muted/50'
      )}
    >
      {/* 상태 토글 버튼 */}
      <button
        onClick={onToggleStatus}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
          config.bgColor,
          'hover:opacity-80 transition-opacity'
        )}
        title={config.tooltip}
        disabled={isToggling}
      >
        {isToggling ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <StatusIcon className={cn('h-4 w-4', config.color)} />
        )}
        <span className={config.color}>{config.label}</span>
      </button>

      {/* 마일스톤 이름 + D-day */}
      <span
        className={cn(
          'flex-1 truncate flex items-center gap-1',
          milestone.status === 'completed' && 'line-through text-muted-foreground'
        )}
      >
        {milestone.name}
        {dDayInfo && (
          <span className={cn('text-xs flex-shrink-0', dDayInfo.colorClass)} title={`목표: ${milestone.target_date}`}>
            {dDayInfo.label}
          </span>
        )}
        {hasSchedules && (
          <span title="일정 있음">
            <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </span>
        )}
      </span>

      {/* 수정 버튼 */}
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 opacity-30 hover:opacity-100"
        onClick={onEdit}
      >
        <Pencil className="h-2.5 w-2.5" />
      </Button>
    </div>
  )
}


// ============================================================
// 8. D-day 계산 헬퍼
// ============================================================

function getDDayInfo(targetDate: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
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

  return { label, colorClass, diffDays }
}


// ============================================================
// 9. 마일스톤 수정 폼 (인라인)
// ============================================================

interface MilestoneFormProps {
  form: { name: string; target_date: string }
  setForm: (form: { name: string; target_date: string }) => void
  onSave: () => void
  onCancel: () => void
}

interface MilestoneEditFormProps extends MilestoneFormProps {
  milestone: Milestone
  onDelete: () => void
}

function MilestoneEditForm({ milestone, form, setForm, onSave, onCancel, onDelete }: MilestoneEditFormProps) {
  const [saving, setSaving] = useState(false)

  return (
    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
      <Input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="마일스톤명"
        className="h-8 text-sm focus-visible:bg-white dark:focus-visible:bg-slate-700"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && form.name.trim()) onSave()
          else if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center gap-2">
        {/* 날짜 입력 (placeholder 처리) */}
        <div
          className="relative flex-1 cursor-pointer"
          onClick={(e) => {
            const input = e.currentTarget.querySelector('input')
            if (input) {
              input.showPicker?.()
              input.focus()
            }
          }}
        >
          <Input
            type="date"
            value={form.target_date}
            onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            className={cn(
              "h-9 text-sm w-full cursor-pointer focus-visible:bg-white dark:focus-visible:bg-slate-700",
              !form.target_date && "date-placeholder-hidden"
            )}
          />
          {!form.target_date && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              목표마감일
            </span>
          )}
        </div>
        <Button size="sm" variant="destructive" className="h-9 px-3" onClick={onDelete}>
          삭제
        </Button>
        <Button size="sm" variant="outline" className="h-9 px-3" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" className="h-9 px-3" disabled={!form.name.trim() || saving} onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  )
}


// ============================================================
// 10. 마일스톤 추가 폼 (인라인)
// ============================================================

function MilestoneAddForm({ form, setForm, onSave, onCancel }: MilestoneFormProps) {
  const [saving, setSaving] = useState(false)

  return (
    <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
      <Input
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="마일스톤명"
        className="h-8 text-sm focus-visible:bg-white dark:focus-visible:bg-slate-700"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && form.name.trim()) onSave()
          else if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex items-center gap-2">
        <div
          className="relative flex-1 cursor-pointer"
          onClick={(e) => {
            const input = e.currentTarget.querySelector('input')
            if (input) {
              input.showPicker?.()
              input.focus()
            }
          }}
        >
          <Input
            type="date"
            value={form.target_date}
            onChange={(e) => setForm({ ...form, target_date: e.target.value })}
            className={cn(
              "h-9 text-sm w-full cursor-pointer focus-visible:bg-white dark:focus-visible:bg-slate-700",
              !form.target_date && "date-placeholder-hidden"
            )}
          />
          {!form.target_date && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              목표마감일
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-9 px-3" onClick={onCancel}>
          취소
        </Button>
        <Button size="sm" className="h-9 px-3" disabled={!form.name.trim() || saving} onClick={onSave}>
          저장
        </Button>
      </div>
    </div>
  )
}


// ============================================================
// 11. 스타일 요약
// ============================================================

const STYLES = {
  // 카드 헤더 버튼 (추가)
  headerButton: 'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors',

  // 클라이언트 필터 - 기본
  filterBadge: 'px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
  // 클라이언트 필터 - 선택됨 (전체)
  filterBadgeActive: 'px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-900 text-white dark:bg-slate-600',
  // 클라이언트 필터 - 선택됨 (동적 색상)
  // style={{ backgroundColor: client.color }}

  // 프로젝트 컨테이너
  projectContainer: 'rounded-lg overflow-hidden',
  // style={{ borderLeft: `3px solid ${clientColor}` }}

  // 프로젝트 헤더
  projectHeader: 'p-2 cursor-pointer flex items-center justify-between transition-opacity hover:opacity-80',
  // style={{ backgroundColor: `${clientColor}15` }}

  // 프로젝트 상태 배지
  projectStatusCompleted: 'text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700',
  projectStatusOnHold: 'text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700',
  projectStatusCancelled: 'text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700',

  // 마일스톤 컨테이너
  milestoneContainer: 'p-2 space-y-1 bg-background',

  // 마일스톤 아이템
  milestoneItem: 'flex items-center gap-2 p-1.5 rounded text-sm',
  milestoneItemCompleted: 'flex items-center gap-2 p-1.5 rounded text-sm bg-muted/50',

  // 마일스톤 상태 버튼
  milestoneStatusButton: 'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium hover:opacity-80 transition-opacity',
  // + statusConfig.bgColor

  // 마일스톤 수정 버튼 (opacity 패턴)
  milestoneEditButton: 'h-5 w-5 opacity-30 hover:opacity-100',

  // 인라인 수정 폼
  inlineForm: 'p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2',
  inlineFormButtons: 'flex items-center gap-2',

  // D-day 색상
  dDayOverdue: 'text-red-500',       // D+N (지남)
  dDayToday: 'text-red-500',         // D-Day
  dDayUrgent: 'text-orange-500',     // D-3 이내
  dDayNormal: 'text-muted-foreground', // 그 외
}
