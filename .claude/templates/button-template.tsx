/**
 * 버튼 템플릿 모음
 *
 * 사용법:
 * 필요한 버튼 패턴을 복사하여 사용
 *
 * 주의: AI 버튼은 purple 테마 사용
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Save,
  X,
} from 'lucide-react'

// ============================================
// 1. 기본 버튼 Variants
// ============================================
export function ButtonVariants() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  )
}

// ============================================
// 2. 버튼 사이즈
// ============================================
export function ButtonSizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg">Large</Button>
      <Button size="default">Default</Button>
      <Button size="sm">Small</Button>
      <Button size="icon"><Plus className="h-4 w-4" /></Button>
    </div>
  )
}

// ============================================
// 3. 아이콘 포함 버튼
// ============================================
export function IconButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button>
        <Plus className="h-4 w-4 mr-1" />
        추가
      </Button>
      <Button variant="secondary">
        <Pencil className="h-4 w-4 mr-1" />
        수정
      </Button>
      <Button variant="destructive">
        <Trash2 className="h-4 w-4 mr-1" />
        삭제
      </Button>
      <Button variant="secondary">
        <Download className="h-4 w-4 mr-1" />
        내보내기
      </Button>
      <Button variant="outline">
        <Save className="h-4 w-4 mr-1" />
        저장
      </Button>
    </div>
  )
}

// ============================================
// 4. 로딩 상태 버튼
// ============================================
export function LoadingButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    // API 호출 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsLoading(false)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={isLoading} onClick={handleClick}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {isLoading ? '처리 중...' : '저장'}
      </Button>
      <Button variant="secondary" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        저장 중...
      </Button>
    </div>
  )
}

// ============================================
// 5. 카드 내 버튼 (실제 패턴)
// ============================================
export function CardButtons() {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsRefreshing(false)
  }

  return (
    <div className="flex flex-wrap gap-3">
      {/* 새로고침 버튼 */}
      <button
        onClick={handleRefresh}
        className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
      >
        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>

      {/* 외부 링크 버튼 */}
      <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer">
        External Link
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  )
}

// ============================================
// 6. AI 특수 버튼 (Purple 테마)
// ============================================
export function AIButton() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const pendingCount = 3

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsAnalyzing(false)
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        className="bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isAnalyzing ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {isAnalyzing ? 'AI 분석 중...' : 'AI 분석'}
        {!isAnalyzing && pendingCount > 0 && (
          <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">
            {pendingCount}
          </span>
        )}
      </Button>
    </div>
  )
}

// ============================================
// 7. 버튼 그룹 (저장/취소)
// ============================================
export function ButtonGroup() {
  return (
    <div className="flex gap-2">
      <Button variant="outline">
        <X className="h-4 w-4 mr-1" />
        취소
      </Button>
      <Button>
        <Save className="h-4 w-4 mr-1" />
        저장
      </Button>
    </div>
  )
}

// ============================================
// 8. 인라인 폼 버튼 (통일 사이즈)
// ============================================
export function InlineFormButtons() {
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="destructive" className="h-8 px-3">
        삭제
      </Button>
      <Button size="sm" variant="outline" className="h-8 px-3">
        취소
      </Button>
      <Button size="sm" className="h-8 px-3">
        저장
      </Button>
    </div>
  )
}
