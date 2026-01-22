/**
 * 공통 UI 패턴 템플릿 모음
 *
 * 사용법:
 * 필요한 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 로딩 스피너
 * 2. 빈 상태
 * 3. 확장/축소 아이템
 * 4. 페이지네이션
 * 5. 섹션 헤더
 */

import { Button } from '@/components/ui/button'
import {
  Loader2,
  FileText,
  Plus,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Info,
  Calendar,
  Activity,
} from 'lucide-react'

// ============================================
// 1. 로딩 스피너 (Loading Spinner)
// ============================================

// 기본 로딩 스피너
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 페이지 전체 로딩
export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

// 버튼 로딩 상태 예시
export function LoadingButtonExample() {
  return (
    <div className="flex gap-3">
      <Button disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
        저장 중...
      </Button>
      <Button variant="destructive" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
        삭제 중...
      </Button>
    </div>
  )
}

// ============================================
// 2. 빈 상태 (Empty State)
// ============================================

// 기본 빈 상태
export function EmptyState() {
  return (
    <div className="p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
      <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
      <p className="text-slate-500">데이터가 없습니다</p>
      <Button size="sm" className="mt-3">
        <Plus className="h-4 w-4 mr-1" />
        새로 만들기
      </Button>
    </div>
  )
}

// 버튼 없는 빈 상태
export function EmptyStateSimple() {
  return (
    <div className="p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
      <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
      <p className="text-slate-500">데이터가 없습니다</p>
    </div>
  )
}

// 컴팩트 빈 상태 (리스트용)
export function EmptyStateCompact() {
  return (
    <div className="p-4 rounded-lg bg-white dark:bg-slate-700 text-center">
      <p className="text-sm text-slate-500">항목이 없습니다</p>
    </div>
  )
}

// ============================================
// 3. 확장/축소 아이템 (Expandable Item)
// ============================================

// 축소된 상태
export function CollapsedItem() {
  return (
    <div className="p-3 rounded-lg bg-white dark:bg-slate-700 cursor-pointer">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400">
            High
          </span>
          <span className="text-sm font-medium">축소된 상태</span>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  )
}

// 확장된 상태
export function ExpandedItem() {
  return (
    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
            Medium
          </span>
          <span className="text-sm font-medium">확장된 상태</span>
        </div>
        <ChevronUp className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-400">
        상세 내용이 표시됩니다...
      </div>
    </div>
  )
}

// 우선순위 색상 헬퍼 (design-system.md 기준)
export function getPriorityColor(priority: 'critical' | 'high' | 'medium' | 'low') {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// ============================================
// 4. 페이지네이션 (Pagination)
// ============================================

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPrevious: () => void
  onNext: () => void
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPrevious,
  onNext,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-slate-500">
        {startItem}-{endItem} / {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={currentPage === 1}
          onClick={onPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-3">
          {currentPage} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={currentPage === totalPages}
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// 간단한 페이지네이션 (아이템 수 표시 없음)
export function SimplePagination({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: {
  currentPage: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={currentPage === 1}
        onClick={onPrevious}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm px-3">
        {currentPage} / {totalPages}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={currentPage === totalPages}
        onClick={onNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ============================================
// 5. 섹션 헤더 (Section Headers)
// ============================================

// 기본 섹션 헤더
export function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </div>
  )
}

// 섹션 예시 (Info)
export function SectionInfo() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Info className="h-4 w-4" />
        <span>정보</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">섹션 내용...</p>
    </div>
  )
}

// 섹션 예시 (일정)
export function SectionSchedule() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Calendar className="h-4 w-4" />
        <span>일정</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">일정 내용...</p>
    </div>
  )
}

// 섹션 예시 (활동)
export function SectionActivity() {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        <Activity className="h-4 w-4" />
        <span>활동</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">활동 내용...</p>
    </div>
  )
}

// 섹션 그룹 (여러 섹션을 묶을 때)
export function SectionGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
