/**
 * 배지 템플릿 모음
 *
 * 사용법:
 * 필요한 배지 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 상태 배지 (Status Badge)
 * 2. 우선순위 배지 (Priority Badge)
 * 3. 활동 유형 배지 (Activity Badge)
 * 4. 카테고리 배지 (Category Badge)
 * 5. 필터 배지 (Filter Badge)
 * 6. 색상 헬퍼 함수
 */

import { cn } from '@/lib/utils'
import {
  Plus,
  CheckCircle2,
  Clock,
  Play,
  Ban,
  AlertCircle,
  FileText,
  Calendar,
  GitCommit,
  Brain,
} from 'lucide-react'

// ============================================
// 1. 상태 배지 (Status Badge) - rounded-full
// ============================================

// 상태 색상 헬퍼 함수
export function getStatusColor(status: string) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'managed':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'closed':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'poc':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 상태 배지 컴포넌트
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('text-sm px-2.5 py-1 rounded-full', getStatusColor(status))}>
      {label || status}
    </span>
  )
}

// 상태 배지 예시
export function StatusBadgeExamples() {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="active" label="Active" />
      <StatusBadge status="managed" label="Managed" />
      <StatusBadge status="completed" label="Completed" />
      <StatusBadge status="in_progress" label="In Progress" />
      <StatusBadge status="pending" label="Pending" />
      <StatusBadge status="closed" label="Closed" />
      <StatusBadge status="poc" label="POC" />
    </div>
  )
}

// ============================================
// 2. 우선순위 배지 (Priority Badge) - rounded
// ============================================

// 우선순위 색상 헬퍼 함수
export function getPriorityColor(priority: string) {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 우선순위 배지 컴포넌트
export function PriorityBadge({ priority, label }: { priority: string; label?: string }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getPriorityColor(priority))}>
      {label || priority}
    </span>
  )
}

// 우선순위 배지 예시
export function PriorityBadgeExamples() {
  return (
    <div className="flex flex-wrap gap-2">
      <PriorityBadge priority="critical" label="Critical" />
      <PriorityBadge priority="high" label="High" />
      <PriorityBadge priority="medium" label="Medium" />
      <PriorityBadge priority="low" label="Low" />
    </div>
  )
}

// ============================================
// 3. 활동 유형 배지 (Activity Badge) - 아이콘 포함
// ============================================

// 활동 유형 색상 헬퍼 함수
export function getActivityColor(type: string) {
  switch (type) {
    case 'created':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'started':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'discarded':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'analysis':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'doc_created':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
    case 'schedule':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'
    case 'commit':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 활동 유형 아이콘
const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Plus,
  assigned: Clock,
  started: Play,
  completed: CheckCircle2,
  discarded: Ban,
  analysis: Brain,
  doc_created: FileText,
  schedule: Calendar,
  commit: GitCommit,
}

// 활동 유형 배지 컴포넌트
export function ActivityBadge({ type, label }: { type: string; label?: string }) {
  const Icon = activityIcons[type] || AlertCircle

  return (
    <span
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
        getActivityColor(type)
      )}
    >
      <Icon className="h-4 w-4" />
      {label || type}
    </span>
  )
}

// 활동 유형 배지 예시
export function ActivityBadgeExamples() {
  return (
    <div className="flex flex-wrap gap-2">
      <ActivityBadge type="created" label="생성" />
      <ActivityBadge type="assigned" label="배정" />
      <ActivityBadge type="started" label="시작" />
      <ActivityBadge type="completed" label="완료" />
      <ActivityBadge type="analysis" label="분석" />
      <ActivityBadge type="doc_created" label="문서 생성" />
      <ActivityBadge type="schedule" label="일정" />
      <ActivityBadge type="commit" label="커밋" />
    </div>
  )
}

// ============================================
// 4. 카테고리 배지 (Category Badge)
// ============================================

// 카테고리 색상 헬퍼 함수
export function getCategoryColor(color: string) {
  switch (color) {
    case 'blue':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'purple':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'green':
      return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'amber':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'red':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'pink':
      return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-400'
    case 'cyan':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'orange':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  }
}

// 카테고리 배지 컴포넌트
export function CategoryBadge({ color, label }: { color: string; label: string }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', getCategoryColor(color))}>
      {label}
    </span>
  )
}

// ============================================
// 5. 필터 배지 (Filter Badge) - 탭 스타일
// ============================================

interface FilterBadgeProps {
  items: string[]
  selected: string
  onChange: (item: string) => void
}

export function FilterBadges({ items, selected, onChange }: FilterBadgeProps) {
  return (
    <div className="flex flex-wrap gap-1 items-center mb-4">
      {items.map((item) => (
        <button
          key={item}
          onClick={() => onChange(item)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-full transition-colors',
            selected === item
              ? 'bg-slate-900 text-white dark:bg-slate-600'
              : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
          )}
        >
          {item}
        </button>
      ))}
    </div>
  )
}

// 필터 배지 예시
export function FilterBadgeExample() {
  // 사용 시: const [filter, setFilter] = useState('전체')

  return (
    <div className="flex flex-wrap gap-1 items-center mb-4">
      <button className="px-3 py-1 text-xs font-medium rounded-full bg-slate-900 text-white dark:bg-slate-600">
        전체
      </button>
      <button className="px-3 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
        매출
      </button>
      <button className="px-3 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
        비용
      </button>
    </div>
  )
}

// ============================================
// 6. 마일스톤/인보이스 상태 배지
// ============================================

// 마일스톤 상태 색상
export function getMilestoneStatusColor(status: string) {
  switch (status) {
    case 'upcoming':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'in_progress':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'delayed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 인보이스 상태 색상
export function getInvoiceStatusColor(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'sent':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'paid':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'overdue':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'cancelled':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}
