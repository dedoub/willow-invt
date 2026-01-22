/**
 * 스켈레톤 로딩 템플릿 모음
 *
 * 사용법:
 * 데이터 로딩 중 표시할 스켈레톤을 복사하여 사용
 *
 * 주의: animate-pulse 필수!
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'

// ============================================
// 1. 기본 스켈레톤
// ============================================
export function BasicSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {/* 텍스트 라인 */}
      <div className="h-5 w-40 bg-slate-200 dark:bg-slate-600 rounded" />
      <div className="h-4 w-full bg-slate-200 dark:bg-slate-600 rounded" />
      <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-600 rounded" />
    </div>
  )
}

// ============================================
// 2. 아이콘 스켈레톤
// ============================================
export function IconSkeleton() {
  return (
    <div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 w-9 h-9" />
  )
}

// ============================================
// 3. 배지 스켈레톤
// ============================================
export function BadgeSkeleton() {
  return (
    <div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" />
  )
}

// ============================================
// 4. 카드 스켈레톤 (기본)
// ============================================
export function CardSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800 animate-pulse">
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
      <CardContent className="pt-0 space-y-3">
        <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
      </CardContent>
    </Card>
  )
}

// ============================================
// 5. 프로젝트 카드 스켈레톤 (Tensoftworks)
// ============================================
export function ProjectCardSkeleton() {
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
            <div className="space-y-1.5">
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          </div>
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

// ============================================
// 6. POC 카드 스켈레톤
// ============================================
export function PocCardSkeleton() {
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

// ============================================
// 7. 테이블 스켈레톤
// ============================================
export function TableSkeleton() {
  return (
    <div className="animate-pulse">
      {/* 헤더 */}
      <div className="bg-slate-200 dark:bg-slate-700 rounded-t-lg h-10" />
      {/* 로우들 */}
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`h-12 ${i % 2 === 1 ? 'bg-slate-50 dark:bg-slate-700/30' : ''}`}
        >
          <div className="flex items-center gap-4 px-3 py-3">
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-600 rounded" />
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-600 rounded" />
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-600 rounded flex-1" />
            <div className="h-4 w-16 bg-slate-200 dark:bg-slate-600 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// 8. 통계 카드 스켈레톤
// ============================================
export function StatsCardSkeleton() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-700 animate-pulse">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-20 bg-slate-200 dark:bg-slate-600 rounded" />
        <div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 w-8 h-8" />
      </CardHeader>
      <CardContent>
        <div className="h-7 w-24 bg-slate-200 dark:bg-slate-600 rounded" />
        <div className="h-3 w-16 bg-slate-200 dark:bg-slate-600 rounded mt-2" />
      </CardContent>
    </Card>
  )
}

// ============================================
// 9. 리스트 아이템 스켈레톤
// ============================================
export function ListItemSkeleton() {
  return (
    <div className="animate-pulse p-3 rounded-lg bg-white dark:bg-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-200 dark:bg-slate-600 rounded" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-200 dark:bg-slate-600 rounded" />
            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-600 rounded" />
          </div>
        </div>
        <div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" />
      </div>
    </div>
  )
}
