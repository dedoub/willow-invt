/**
 * 접기/펼치기 템플릿 모음
 *
 * 사용법:
 * 필요한 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 접기/펼치기 카드
 * 2. 아코디언 아이템
 * 3. localStorage 저장 패턴
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================
// 1. 접기/펼치기 카드 (Collapsible Card)
// ============================================

// 기본 접기/펼치기 카드
export function CollapsibleCard({
  title,
  description,
  children,
  defaultExpanded = true,
}: {
  title: string
  description?: string
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader
        className={cn('cursor-pointer pb-2', !expanded && '-mb-2')}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm mt-0.5">{description}</CardDescription>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        </div>
      </CardHeader>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

// 펼쳐진 상태 예시 (정적)
export function ExpandedCardExample() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-700">
      <CardHeader className="cursor-pointer pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">펼쳐진 섹션</CardTitle>
            <CardDescription className="text-sm mt-0.5">상세 정보 표시</CardDescription>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-slate-600 dark:text-slate-400">섹션 내용이 표시됩니다...</p>
      </CardContent>
    </Card>
  )
}

// 접힌 상태 예시 (정적)
export function CollapsedCardExample() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-700">
      <CardHeader className="cursor-pointer -mb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">접힌 섹션</CardTitle>
            <CardDescription className="text-sm mt-0.5">클릭하여 펼치기</CardDescription>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform -rotate-90" />
        </div>
      </CardHeader>
    </Card>
  )
}

// ============================================
// 2. 아코디언 아이템 (Accordion Item)
// ============================================

// 기본 아코디언 아이템
export function AccordionItem({
  title,
  count,
  children,
  defaultExpanded = false,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
      <div
        className="p-3 flex items-center justify-between cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', !expanded && '-rotate-90')}
          />
          <span className="font-medium text-sm">{title}</span>
        </div>
        {count !== undefined && <span className="text-xs text-muted-foreground">{count}개</span>}
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-white dark:bg-slate-800">{children}</div>
      )}
    </div>
  )
}

// 아코디언 내용 아이템
export function AccordionContentItem({ children }: { children: React.ReactNode }) {
  return <div className="pl-6 text-sm text-slate-600 dark:text-slate-400">{children}</div>
}

// 아코디언 예시
export function AccordionExample() {
  return (
    <div className="space-y-2">
      <AccordionItem title="카테고리 1" count={3} defaultExpanded>
        <AccordionContentItem>내용 1</AccordionContentItem>
        <AccordionContentItem>내용 2</AccordionContentItem>
        <AccordionContentItem>내용 3</AccordionContentItem>
      </AccordionItem>
      <AccordionItem title="카테고리 2" count={2}>
        <AccordionContentItem>내용 A</AccordionContentItem>
        <AccordionContentItem>내용 B</AccordionContentItem>
      </AccordionItem>
    </div>
  )
}

// ============================================
// 3. localStorage 저장 패턴
// ============================================

// localStorage 연동 접기/펼치기 카드
export function PersistentCollapsibleCard({
  title,
  description,
  storageKey,
  children,
  defaultExpanded = true,
}: {
  title: string
  description?: string
  storageKey: string
  children: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // localStorage에서 초기값 읽기
  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      setExpanded(saved === 'true')
    }
  }, [storageKey])

  // 상태 변경 시 localStorage에 저장
  const handleToggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    localStorage.setItem(storageKey, String(newExpanded))
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader
        className={cn('cursor-pointer pb-2', !expanded && '-mb-2')}
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm mt-0.5">{description}</CardDescription>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        </div>
      </CardHeader>
      {expanded && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  )
}

// ============================================
// 4. 커스텀 훅 (useCollapsible)
// ============================================

// localStorage 연동 접기/펼치기 훅
export function useCollapsible(storageKey: string, defaultExpanded = true) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      setExpanded(saved === 'true')
    }
  }, [storageKey])

  const toggle = () => {
    const newExpanded = !expanded
    setExpanded(newExpanded)
    localStorage.setItem(storageKey, String(newExpanded))
  }

  return { expanded, toggle, setExpanded }
}

/*
사용 예시:

const { expanded, toggle } = useCollapsible('my-section-expanded', true)

<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader
    className={cn("cursor-pointer pb-2", !expanded && "-mb-2")}
    onClick={toggle}
  >
    <div className="flex items-center justify-between">
      <CardTitle className="text-lg">제목</CardTitle>
      <ChevronDown className={cn(
        "h-4 w-4 text-muted-foreground transition-transform",
        !expanded && "-rotate-90"
      )} />
    </div>
  </CardHeader>
  {expanded && (
    <CardContent className="pt-0">내용</CardContent>
  )}
</Card>
*/
