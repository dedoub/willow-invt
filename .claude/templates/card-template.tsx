/**
 * 카드 템플릿 모음
 *
 * 사용법:
 * 필요한 카드 패턴을 복사하여 사용
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Folder,
  Clock,
  Loader2,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Users,
  Plus,
  Zap,
  Ban,
  GitCommit,
  Bell,
  Search,
} from 'lucide-react'

// ============================================
// 1. 기본 카드
// ============================================
export function BasicCard() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">카드 제목</CardTitle>
        <CardDescription className="text-sm mt-0.5">카드 설명</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          카드 내용
        </p>
      </CardContent>
    </Card>
  )
}

// ============================================
// 2. 아이콘 헤더 카드
// ============================================
export function IconHeaderCard() {
  const status = 'active'
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
              <Folder className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg truncate">프로젝트 제목</CardTitle>
              <CardDescription className="text-sm mt-0.5 line-clamp-1">
                프로젝트 설명이 여기에 들어갑니다
              </CardDescription>
            </div>
          </div>
          {/* 상태 배지 스타일: px-2.5 py-1 rounded-full */}
          <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor(status)}`}>
            Active
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          카드 내용
        </p>
      </CardContent>
    </Card>
  )
}

// ============================================
// 3. 액션 버튼 헤더 카드
// ============================================
export function ActionHeaderCard() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-lg">섹션 제목</CardTitle>
          <CardDescription className="text-sm mt-0.5">섹션 설명</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer">
            External Link
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-500">콘텐츠...</p>
      </CardContent>
    </Card>
  )
}

// ============================================
// 4. 통계 카드 (ETF/Akros 스타일 - Slate 통일)
// ============================================
export function StatsCard() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-700">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Total AUM</CardTitle>
        <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
          <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">12,345억원</div>
            <p className="text-xs text-muted-foreground">$9.2m</p>
          </div>
          {/* 차트 영역 (선택적) */}
          <div className="w-24 h-10 bg-slate-200 dark:bg-slate-600 rounded" />
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================
// 5. 컬러 통계 그리드 (Tensoftworks 스타일)
// ============================================
export function ColorStatsGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {/* 대기 - Amber */}
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-amber-700 dark:text-amber-400">배정</div>
          <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">5</div>
      </div>

      {/* 진행 - Blue */}
      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-blue-700 dark:text-blue-400">진행</div>
          <div className="rounded bg-blue-100 dark:bg-blue-800/50 p-1">
            <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">3</div>
      </div>

      {/* 완료 - Emerald */}
      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-emerald-700 dark:text-emerald-400">완료</div>
          <div className="rounded bg-emerald-100 dark:bg-emerald-800/50 p-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">12</div>
      </div>

      {/* 진행률 - Slate */}
      <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-600">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">진행률</div>
          <div className="rounded bg-white/50 dark:bg-white/10 p-1">
            <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">60%</div>
      </div>
    </div>
  )
}

// ============================================
// 6. 활동 카드 (Activity Card)
// ============================================
// 카드 배경이 slate-100이므로, neutral 색상은 slate-200 사용
export function ActivityCards() {
  const activities = [
    { type: 'created', icon: <Plus className="h-4 w-4" />, label: '생성됨', color: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' },
    { type: 'assigned', icon: <Users className="h-4 w-4" />, label: '배정됨', color: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' },
    { type: 'started', icon: <Zap className="h-4 w-4" />, label: '시작됨', color: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400' },
    { type: 'completed', icon: <CheckCircle2 className="h-4 w-4" />, label: '완료됨', color: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' },
    { type: 'analysis', icon: <Search className="h-4 w-4" />, label: 'AI 분석', color: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400' },
    { type: 'discarded', icon: <Ban className="h-4 w-4" />, label: '취소됨', color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
    { type: 'commit', icon: <GitCommit className="h-4 w-4" />, label: '커밋', color: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400' },
    { type: 'default', icon: <Bell className="h-4 w-4" />, label: '알림', color: 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400' },
  ]

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">최근 활동</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {activities.map((activity) => (
          <div
            key={activity.type}
            className={`flex items-center gap-2 p-2 rounded-lg ${activity.color}`}
          >
            {activity.icon}
            <span className="text-sm font-medium">{activity.label}</span>
            <span className="text-xs ml-auto opacity-70">방금 전</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ============================================
// 7. POC 카드 (Amber 테마)
// ============================================
export function POCCard() {
  return (
    <Card className="bg-amber-50 dark:bg-amber-900/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2 flex-shrink-0">
              <Folder className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg truncate">POC 프로젝트</CardTitle>
              <CardDescription className="text-sm mt-0.5 line-clamp-1">
                실험적인 프로젝트 설명
              </CardDescription>
            </div>
          </div>
          {/* 상태 배지 스타일: px-2.5 py-1 rounded-full */}
          <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
            POC
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <a href="#" className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900">
          <ExternalLink className="h-4 w-4" />
          <span>서비스 링크</span>
        </a>
        <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
          <Users className="h-4 w-4" />
          <span>홍길동, 김철수</span>
        </div>
      </CardContent>
    </Card>
  )
}
