/**
 * 페이지 템플릿
 *
 * 사용법:
 * 1. 이 파일을 복사하여 새 페이지 생성
 * 2. PageName, pageIcon, pageTitle, pageDescription 수정
 * 3. 필요한 섹션 추가
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  // 페이지 아이콘 (변경 필요)
  BookOpen,
  // 기타 필요한 아이콘
  Plus,
  RefreshCw,
} from 'lucide-react'

export default function PageName() {
  return (
    <div className="space-y-8">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
          <BookOpen className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">페이지 제목</h1>
          <p className="text-sm text-muted-foreground">페이지 설명</p>
        </div>
      </div>

      {/* 통계 카드 섹션 (선택적) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-100 dark:bg-slate-700">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">통계 1</CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <BookOpen className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">123</div>
            <p className="text-xs text-muted-foreground">부가 설명</p>
          </CardContent>
        </Card>
      </div>

      {/* 메인 콘텐츠 카드 */}
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
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* 콘텐츠 영역 */}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            여기에 콘텐츠를 추가하세요.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
