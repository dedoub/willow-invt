'use client'

import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { useAuth, useIsAdmin } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import {
  Plus,
  CheckCircle2,
  Clock,
  Loader2,
  X,
  FileText,
  Pencil,
  TrendingUp,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Circle,
  Zap,
  Sparkles,
  Ban,
  Check,
  Download,
  Palette,
  BookOpen,
  Layout,
  Type,
  Code2,
  Save,
  ToggleLeft,
  Upload,
  Eye,
  EyeOff,
  Settings,
  Monitor,
  AlertCircle,
  ClipboardCheck,
  Calendar,
  Users,
  RefreshCw,
  Shield,
  Info,
  DollarSign,
  Package,
  ExternalLink,
  Folder,
  Activity,
  Bell,
  GitCommit,
  Brain,
  ListTodo,
  ClipboardList,
} from 'lucide-react'

// ============= Helper Functions =============

// Priority colors (Tensoftworks 통일)
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// Status colors
const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'managed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'closed': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'poc': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// Activity type colors
const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'started': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'discarded': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'doc_created': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
    case 'schedule': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'
    case 'commit': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// Category colors
const getCategoryColor = (color: string) => {
  switch (color) {
    case 'blue': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'purple': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'green': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
    case 'amber': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'red': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'pink': return 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-400'
    case 'cyan': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'orange': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  }
}

// ============= Code Block Component =============
function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="rounded-lg overflow-hidden">
      {title && (
        <div className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          {title}
        </div>
      )}
      <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 p-4 overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ============= Section Component =============
function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-4">
        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ============= Main Component =============
export default function UIGuidePage() {
  const { user } = useAuth()
  const isAdmin = useIsAdmin()
  const router = useRouter()
  const { t } = useI18n()

  // Redirect non-admin users
  useEffect(() => {
    if (!isAdmin) {
      router.push('/')
    }
  }, [isAdmin, router])

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">{t.common.loading}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-purple-100 dark:bg-purple-900 p-2">
          <BookOpen className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">UI 가이드라인</h1>
          <p className="text-sm text-muted-foreground">디자인 시스템 및 컴포넌트 레퍼런스</p>
        </div>
      </div>

      {/* Table of Contents */}
      <Card className="bg-slate-50 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5" />
            목차
          </CardTitle>
          <CardDescription>AI 참조용 UI 컴포넌트 및 디자인 가이드라인</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <a href="#buttons" className="text-sm text-blue-600 hover:underline">1. 버튼</a>
            <a href="#cards" className="text-sm text-blue-600 hover:underline">2. 카드</a>
            <a href="#project-cards" className="text-sm text-blue-600 hover:underline">3. 프로젝트 카드</a>
            <a href="#stats-cards" className="text-sm text-blue-600 hover:underline">4. 통계 카드</a>
            <a href="#tables" className="text-sm text-blue-600 hover:underline">5. 테이블</a>
            <a href="#forms" className="text-sm text-blue-600 hover:underline">6. 폼 요소</a>
            <a href="#badges" className="text-sm text-blue-600 hover:underline">7. 배지/상태</a>
            <a href="#colors" className="text-sm text-blue-600 hover:underline">8. 색상 시스템</a>
            <a href="#skeleton" className="text-sm text-blue-600 hover:underline">9. 스켈레톤 로딩</a>
            <a href="#sections" className="text-sm text-blue-600 hover:underline">10. 섹션 헤더</a>
            <a href="#layout" className="text-sm text-blue-600 hover:underline">11. 레이아웃</a>
            <a href="#patterns" className="text-sm text-blue-600 hover:underline">12. UI 패턴</a>
            <a href="#modals" className="text-sm text-blue-600 hover:underline">13. 모달/다이얼로그</a>
            <a href="#typography" className="text-sm text-blue-600 hover:underline">14. 타이포그래피</a>
            <a href="#spacing" className="text-sm text-blue-600 hover:underline">15. 간격 시스템</a>
          </div>
        </CardContent>
      </Card>

      {/* Design Principle Alert */}
      <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30">
        <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">핵심 디자인 원칙</h3>
        <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
          <li>• <strong>카드 배경색</strong>: <code>bg-slate-100 dark:bg-slate-800</code> 통일</li>
          <li>• <strong>아이콘 래퍼 (기본)</strong>: <code>rounded-lg bg-slate-200 dark:bg-slate-700 p-2</code></li>
          <li>• <strong>아이콘 래퍼 (Stats)</strong>: <code>rounded-lg bg-white/50 dark:bg-white/10 p-2</code></li>
          <li>• <strong>CardHeader</strong>: <code>pb-2</code> / <strong>CardContent</strong>: <code>pt-0 space-y-3</code></li>
          <li>• <strong>CardTitle</strong>: <code>text-lg truncate</code> / <strong>CardDescription</strong>: <code>text-sm mt-0.5 line-clamp-1</code></li>
        </ul>
      </div>

      {/* 1. Buttons Section */}
      <Section id="buttons" title="1. 버튼 (Button)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">버튼 Variants</CardTitle>
            <CardDescription className="text-sm mt-0.5">상황에 맞는 버튼 variant를 사용하세요</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Variants */}
            <div>
              <Label className="mb-3 block">Variants</Label>
              <div className="flex flex-wrap gap-3">
                <Button variant="default">Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <Label className="mb-3 block">Sizes</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">Large</Button>
                <Button size="default">Default</Button>
                <Button size="sm">Small</Button>
                <Button size="icon"><Plus className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* With Icons */}
            <div>
              <Label className="mb-3 block">아이콘 포함</Label>
              <div className="flex flex-wrap gap-3">
                <Button><Plus className="h-4 w-4 mr-1" />추가</Button>
                <Button variant="secondary"><Pencil className="h-4 w-4 mr-1" />수정</Button>
                <Button variant="destructive"><Trash2 className="h-4 w-4 mr-1" />삭제</Button>
                <Button variant="secondary"><Download className="h-4 w-4 mr-1" />내보내기</Button>
              </div>
            </div>

            {/* Card Button Style (실제 프로젝트 패턴) */}
            <div>
              <Label className="mb-3 block">카드 내 버튼 (실제 패턴)</Label>
              <div className="flex flex-wrap gap-3">
                <button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer">
                  External Link
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Loading State */}
            <div>
              <Label className="mb-3 block">로딩 상태</Label>
              <div className="flex flex-wrap gap-3">
                <Button disabled><Loader2 className="h-4 w-4 animate-spin mr-2" />처리 중...</Button>
                <Button variant="secondary" disabled><Loader2 className="h-4 w-4 animate-spin mr-2" />저장 중...</Button>
              </div>
            </div>

            {/* Special Buttons */}
            <div>
              <Label className="mb-3 block">특수 버튼 (AI 분석 등)</Label>
              <div className="flex flex-wrap gap-3">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI 분석
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded text-xs">3</span>
                </Button>
              </div>
            </div>

            <CodeBlock title="버튼 패턴" code={`// 카드 내 새로고침 버튼
<button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
  <RefreshCw className={\`h-4 w-4 \${isLoading ? 'animate-spin' : ''}\`} />
</button>

// 로딩 버튼
<Button disabled>
  <Loader2 className="h-4 w-4 animate-spin mr-2" />
  처리 중...
</Button>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 2. Cards Section */}
      <Section id="cards" title="2. 카드 (Card)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">카드 구성 요소</CardTitle>
            <CardDescription className="text-sm mt-0.5">배경색으로 구분하는 카드 스타일</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Basic Card Structure */}
            <div>
              <Label className="mb-3 block">기본 카드 구조</Label>
              <Card className="max-w-md bg-slate-100 dark:bg-slate-700">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 flex-shrink-0">
                        <Folder className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg truncate">프로젝트 제목</CardTitle>
                        <CardDescription className="text-sm mt-0.5 line-clamp-1">
                          프로젝트 설명 텍스트가 여기에 들어갑니다
                        </CardDescription>
                      </div>
                    </div>
                    <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                      Active
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">카드 본문 내용</p>
                </CardContent>
              </Card>
            </div>

            {/* Card with Action Header */}
            <div>
              <Label className="mb-3 block">반응형 카드 헤더 (버튼 포함)</Label>
              <Card className="bg-slate-100 dark:bg-slate-700">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
                  <div>
                    <CardTitle className="text-lg">상품 리스트</CardTitle>
                    <CardDescription className="text-sm mt-0.5">아크로스 지수 추종 상품</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-600 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500 cursor-pointer">
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 cursor-pointer">
                      Supernova
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-slate-500">테이블 내용...</p>
                </CardContent>
              </Card>
            </div>

            <CodeBlock title="카드 구조 패턴" code={`<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2 flex-shrink-0">
          <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg truncate">{title}</CardTitle>
          <CardDescription className="text-sm mt-0.5 line-clamp-1">
            {description}
          </CardDescription>
        </div>
      </div>
      <span className="text-sm px-2.5 py-1 rounded-full flex-shrink-0 bg-green-100 ...">
        Active
      </span>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">...</CardContent>
</Card>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 3. Project Cards Section (Tensoftworks 스타일) */}
      <Section id="project-cards" title="3. 프로젝트 카드 (Tensoftworks)" icon={Folder}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">프로젝트 카드 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">Tensoftworks 프로젝트 목록에 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Default Project Card */}
            <div>
              <Label className="mb-3 block">기본 프로젝트 카드</Label>
              <Card className="max-w-xl bg-slate-100 dark:bg-slate-700 h-full overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 flex-shrink-0">
                        <Folder className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-lg truncate">프로젝트명</CardTitle>
                        <CardDescription className="text-sm mt-0.5 line-clamp-1">프로젝트 설명</CardDescription>
                      </div>
                    </div>
                    <span className={`text-sm px-2.5 py-1 rounded-full flex-shrink-0 ${getStatusColor('active')}`}>
                      Active
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3 overflow-hidden">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-amber-700 dark:text-amber-400">배정</div>
                        <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">5</div>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-blue-700 dark:text-blue-400">진행</div>
                        <div className="rounded bg-blue-100 dark:bg-blue-800/50 p-1">
                          <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">3</div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm text-emerald-700 dark:text-emerald-400">완료</div>
                        <div className="rounded bg-emerald-100 dark:bg-emerald-800/50 p-1">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">12</div>
                    </div>
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
                </CardContent>
              </Card>
            </div>

            {/* POC Card Variant */}
            <div>
              <Label className="mb-3 block">POC 카드 (Amber 테마)</Label>
              <Card className="max-w-md bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 h-full">
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
            </div>

            <CodeBlock title="프로젝트 카드 패턴" code={`// 기본 프로젝트 카드
<Card className="bg-slate-100 dark:bg-slate-800 h-full overflow-hidden">
  <CardHeader className="pb-2">...</CardHeader>
  <CardContent className="pt-0 space-y-3 overflow-hidden">
    {/* Stats Grid */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-amber-700 dark:text-amber-400">배정</div>
          <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{count}</div>
      </div>
    </div>
  </CardContent>
</Card>

// POC 카드
<Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
  <CardHeader className="pb-2">
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-amber-100 dark:bg-amber-800/50 p-2">
        <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </div>
      ...
    </div>
  </CardHeader>
</Card>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 4. Stats Cards Section */}
      <Section id="stats-cards" title="4. 통계 카드 (Stats Cards)" icon={TrendingUp}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">통계 카드 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">대시보드 상단에 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* ETF/Akros Style (Neutral) */}
            <div>
              <Label className="mb-3 block">ETF/Akros 스타일 (Slate 통일)</Label>
              <div className="grid gap-4 md:grid-cols-3">
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
                      <div className="w-24 h-10 bg-slate-200 dark:bg-slate-600 rounded" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-100 dark:bg-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
                    <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                      <Package className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold">42</div>
                        <p className="text-xs text-muted-foreground">2024년 5개 출시</p>
                      </div>
                      <div className="w-24 h-10 bg-slate-200 dark:bg-slate-600 rounded" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-100 dark:bg-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total ARR</CardTitle>
                    <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                      <DollarSign className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-bold">3.5억원</div>
                        <p className="text-xs text-muted-foreground">$260K</p>
                      </div>
                      <div className="w-24 h-10 bg-slate-200 dark:bg-slate-600 rounded" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Tensoftworks Colored Stats Grid */}
            <div>
              <Label className="mb-3 block">Tensoftworks 스타일 (컬러 분리)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-amber-700 dark:text-amber-400">배정 대기</div>
                    <div className="rounded bg-amber-100 dark:bg-amber-800/50 p-1">
                      <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">5</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-blue-700 dark:text-blue-400">진행 중</div>
                    <div className="rounded bg-blue-100 dark:bg-blue-800/50 p-1">
                      <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">8</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-emerald-700 dark:text-emerald-400">완료</div>
                    <div className="rounded bg-emerald-100 dark:bg-emerald-800/50 p-1">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">24</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-slate-500 dark:text-slate-400">진행률</div>
                    <div className="rounded bg-white/50 dark:bg-white/10 p-1">
                      <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">65%</div>
                </div>
              </div>
            </div>

            <CodeBlock title="통계 카드 패턴 비교" code={`// ETF/Akros 스타일 (모든 카드 동일 배경)
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium text-muted-foreground">Title</CardTitle>
    <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
      <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
    </div>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{value}</div>
    <p className="text-xs text-muted-foreground">{subText}</p>
  </CardContent>
</Card>

// Tensoftworks 스타일 (컬러별 분리)
<div className="p-3 rounded-lg bg-{color}-50 dark:bg-{color}-900/30">
  <div className="flex items-center justify-between mb-1">
    <div className="text-sm text-{color}-700 dark:text-{color}-400">{label}</div>
    <div className="rounded bg-{color}-100 dark:bg-{color}-800/50 p-1">
      <Icon className="h-4 w-4 text-{color}-600 dark:text-{color}-400" />
    </div>
  </div>
  <div className="text-2xl font-bold text-{color}-600 dark:text-{color}-400">{value}</div>
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 5. Tables Section */}
      <Section id="tables" title="5. 테이블 (Table)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">테이블 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">데이터 테이블 스타일</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <div>
              <Label className="mb-3 block">기본 테이블 (overflow-x-auto)</Label>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                      <th className="pb-3 pr-6 font-medium">Symbol</th>
                      <th className="pb-3 pr-6 font-medium">Country</th>
                      <th className="pb-3 pr-6 font-medium">Fund Name</th>
                      <th className="pb-3 pr-6 font-medium">AUM</th>
                      <th className="pb-3 font-medium">ARR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
                      <td className="py-3 pr-6 font-mono font-medium">KDEF</td>
                      <td className="py-3 pr-6 text-sm">KR</td>
                      <td className="py-3 pr-6 text-sm min-w-[220px]">PLUS Korea Defense ETF</td>
                      <td className="py-3 pr-6">$123.5M</td>
                      <td className="py-3 font-medium">$1.2M</td>
                    </tr>
                    <tr className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
                      <td className="py-3 pr-6 font-mono font-medium">KBAT</td>
                      <td className="py-3 pr-6 text-sm">KR</td>
                      <td className="py-3 pr-6 text-sm min-w-[220px]">PLUS Battery ETF</td>
                      <td className="py-3 pr-6">$89.2M</td>
                      <td className="py-3 font-medium">$890K</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <CodeBlock title="테이블 패턴" code={`<div className="overflow-x-auto">
  <table className="w-full min-w-max">
    <thead>
      <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
        <th className="pb-3 pr-6 font-medium">Column</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
        <td className="py-3 pr-6">{value}</td>
      </tr>
    </tbody>
  </table>
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 6. Form Elements Section */}
      <Section id="forms" title="6. 폼 요소 (Form Elements)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">입력 폼 컴포넌트</CardTitle>
            <CardDescription className="text-sm mt-0.5">Input, Textarea, Checkbox</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Basic Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="mb-2 block">기본 Input</Label>
                <Input placeholder="텍스트를 입력하세요..." className="bg-white dark:bg-slate-700" />
              </div>
              <div>
                <Label className="mb-2 block">비활성화 Input</Label>
                <Input placeholder="비활성화됨" disabled className="bg-white dark:bg-slate-700" />
              </div>
            </div>

            {/* Search Input */}
            <div>
              <Label className="mb-2 block">검색 Input (아이콘 포함)</Label>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="검색..."
                  className="pl-10 h-9 bg-white dark:bg-slate-700"
                />
              </div>
            </div>

            {/* Textarea */}
            <div>
              <Label className="mb-2 block">Textarea</Label>
              <Textarea
                placeholder="내용을 입력하세요..."
                rows={3}
                className="bg-white dark:bg-slate-700"
              />
            </div>

            {/* Checkbox */}
            <div>
              <Label className="mb-2 block">Checkbox</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="check1" />
                  <label htmlFor="check1" className="text-sm">옵션 1</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="check2" defaultChecked />
                  <label htmlFor="check2" className="text-sm">옵션 2 (선택됨)</label>
                </div>
              </div>
            </div>

            <CodeBlock title="폼 요소 패턴" code={`// Input 배경 (카드 내부에서)
<Input className="bg-white dark:bg-slate-700" />

// 검색 Input
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
  <Input className="pl-10 h-9 bg-white dark:bg-slate-700" />
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 7. Badges Section */}
      <Section id="badges" title="7. 배지/상태 (Badges)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">배지 스타일</CardTitle>
            <CardDescription className="text-sm mt-0.5">상태, 우선순위, 활동 유형별 배지</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Status Badges */}
            <div>
              <Label className="mb-3 block">프로젝트 상태 배지 (rounded-full)</Label>
              <div className="flex flex-wrap gap-2">
                <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor('active')}`}>Active</span>
                <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor('managed')}`}>Managed</span>
                <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor('poc')}`}>POC</span>
                <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor('closed')}`}>Closed</span>
              </div>
            </div>

            {/* Priority Badges */}
            <div>
              <Label className="mb-3 block">우선순위 배지</Label>
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor('low')}`}>Low</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor('medium')}`}>Medium</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor('high')}`}>High</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor('critical')}`}>Critical</span>
              </div>
            </div>

            {/* Activity Badges with Icons */}
            <div>
              <Label className="mb-3 block">활동 유형 배지 (아이콘 포함)</Label>
              <div className="flex flex-wrap gap-2">
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('created')}`}>
                  <Plus className="h-4 w-4" />생성
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('assigned')}`}>
                  <Users className="h-4 w-4" />배정
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('started')}`}>
                  <Zap className="h-4 w-4" />시작
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('completed')}`}>
                  <CheckCircle2 className="h-4 w-4" />완료
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('discarded')}`}>
                  <Ban className="h-4 w-4" />폐기
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('analysis')}`}>
                  <Brain className="h-4 w-4" />분석
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('doc_created')}`}>
                  <FileText className="h-4 w-4" />문서
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('schedule')}`}>
                  <Calendar className="h-4 w-4" />일정
                </span>
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getActivityColor('commit')}`}>
                  <GitCommit className="h-4 w-4" />커밋
                </span>
              </div>
            </div>

            {/* Category Badges */}
            <div>
              <Label className="mb-3 block">카테고리 배지 (rounded-full)</Label>
              <div className="flex flex-wrap gap-2">
                {['blue', 'purple', 'green', 'amber', 'red', 'pink', 'cyan', 'orange'].map(color => (
                  <span key={color} className={`px-2 py-0.5 text-xs rounded-full ${getCategoryColor(color)}`}>
                    {color}
                  </span>
                ))}
              </div>
            </div>

            <CodeBlock title="배지 헬퍼 함수" code={`// 우선순위 색상 (통일된 패턴)
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}

// 활동 유형 색상
const getActivityColor = (type: string) => {
  switch (type) {
    case 'created': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'assigned': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'started': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-400'
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'discarded': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    case 'analysis': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'doc_created': return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400'
    case 'schedule': return 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'
    case 'commit': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  }
}`} />
          </CardContent>
        </Card>
      </Section>

      {/* 8. Color System Section */}
      <Section id="colors" title="8. 색상 시스템 (Color System)" icon={Palette}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tailwind 색상 팔레트</CardTitle>
            <CardDescription className="text-sm mt-0.5">프로젝트에서 사용하는 주요 색상</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Semantic Colors */}
            <div>
              <Label className="mb-3 block">시맨틱 색상 (용도별)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">대기/경고</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-amber-50" title="bg-amber-50" />
                    <div className="w-8 h-8 rounded bg-amber-100" title="bg-amber-100" />
                    <div className="w-8 h-8 rounded bg-amber-600" title="bg-amber-600" />
                    <div className="w-8 h-8 rounded bg-amber-900/30" title="bg-amber-900/30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">진행 중</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-blue-50" title="bg-blue-50" />
                    <div className="w-8 h-8 rounded bg-blue-100" title="bg-blue-100" />
                    <div className="w-8 h-8 rounded bg-blue-600" title="bg-blue-600" />
                    <div className="w-8 h-8 rounded bg-blue-900/30" title="bg-blue-900/30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">완료/성공</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-emerald-50" title="bg-emerald-50" />
                    <div className="w-8 h-8 rounded bg-emerald-100" title="bg-emerald-100" />
                    <div className="w-8 h-8 rounded bg-emerald-600" title="bg-emerald-600" />
                    <div className="w-8 h-8 rounded bg-emerald-900/30" title="bg-emerald-900/30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">AI/특별</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-purple-50" title="bg-purple-50" />
                    <div className="w-8 h-8 rounded bg-purple-100" title="bg-purple-100" />
                    <div className="w-8 h-8 rounded bg-purple-600" title="bg-purple-600" />
                    <div className="w-8 h-8 rounded bg-purple-900/30" title="bg-purple-900/30" />
                  </div>
                </div>
              </div>
            </div>

            {/* Card Background Colors */}
            <div>
              <Label className="mb-3 block">배경색 패턴 (Light / Dark)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700">
                  <div className="font-medium">Input/Form</div>
                  <div className="text-slate-500">bg-white</div>
                  <div className="text-slate-500">dark:bg-slate-700</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <div className="font-medium">Card BG (표준)</div>
                  <div className="text-slate-500">bg-slate-100</div>
                  <div className="text-slate-500">dark:bg-slate-800</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-700">
                  <div className="font-medium">Icon Wrapper (기본)</div>
                  <div className="text-slate-500">bg-slate-200</div>
                  <div className="text-slate-500">dark:bg-slate-700</div>
                </div>
                <div className="p-3 rounded-lg bg-white/50 dark:bg-white/10">
                  <div className="font-medium">Icon Wrapper (Stats)</div>
                  <div className="text-slate-500">bg-white/50</div>
                  <div className="text-slate-500">dark:bg-white/10</div>
                </div>
              </div>
            </div>

            <CodeBlock title="색상 패턴 규칙" code={`// 카드 배경색 (통일)
className="bg-slate-100 dark:bg-slate-800"

// 아이콘 래퍼 (기본 - 프로젝트 카드 등)
<div className="rounded-lg bg-slate-200 dark:bg-slate-700 p-2">

// 아이콘 래퍼 (Stats 카드)
<div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">

// 아이콘 래퍼 (컬러 Stats)
<div className="rounded bg-{color}-100 dark:bg-{color}-800/50 p-1">

// 배지 색상 패턴
// Light: bg-{color}-100 text-{color}-700
// Dark: dark:bg-{color}-900/50 dark:text-{color}-400

// 컬러 Stats 배경
// Light: bg-{color}-50
// Dark: dark:bg-{color}-900/30`} />
          </CardContent>
        </Card>
      </Section>

      {/* 9. Skeleton Loading Section */}
      <Section id="skeleton" title="9. 스켈레톤 로딩" icon={Loader2}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">스켈레톤 로딩 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">데이터 로딩 중 플레이스홀더</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Project Card Skeleton */}
            <div>
              <Label className="mb-3 block">프로젝트 카드 스켈레톤</Label>
              <Card className="max-w-xl bg-slate-100 dark:bg-slate-700 h-full overflow-hidden animate-pulse">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 w-9 h-9" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-600 rounded" />
                        <div className="h-3 w-56 bg-slate-200 dark:bg-slate-600 rounded" />
                      </div>
                    </div>
                    <div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" />
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
                    <div className="p-3 rounded-lg bg-slate-200 dark:bg-slate-600">
                      <div className="flex items-center justify-between mb-1">
                        <div className="h-4 w-12 bg-slate-300 dark:bg-slate-500 rounded" />
                        <div className="rounded bg-slate-300 dark:bg-slate-500 p-1 w-6 h-6" />
                      </div>
                      <div className="h-7 w-12 bg-slate-300 dark:bg-slate-500 rounded mt-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Panel Skeleton */}
            <div>
              <Label className="mb-3 block">패널 스켈레톤 (Management)</Label>
              <Card className="max-w-md bg-slate-100 dark:bg-slate-700 animate-pulse">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-24 bg-slate-300 dark:bg-slate-600 rounded" />
                    <div className="flex gap-2">
                      <div className="h-7 w-20 bg-slate-300 dark:bg-slate-600 rounded-lg" />
                      <div className="h-7 w-20 bg-slate-300 dark:bg-slate-600 rounded-lg" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-6 w-16 bg-slate-300 dark:bg-slate-600 rounded-full" />
                    ))}
                  </div>
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="border dark:border-slate-600 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 bg-slate-300 dark:bg-slate-600 rounded" />
                        <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <CodeBlock title="스켈레톤 패턴" code={`// 기본 스켈레톤 요소
<div className="animate-pulse">
  <div className="h-5 w-40 bg-slate-200 dark:bg-slate-600 rounded" />
</div>

// 컬러 스켈레톤 (Stats)
<div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 animate-pulse">
  <div className="h-4 w-12 bg-amber-200 dark:bg-amber-800/50 rounded" />
  <div className="h-7 w-8 bg-amber-200 dark:bg-amber-800/50 rounded mt-2" />
</div>

// 아이콘 자리
<div className="rounded-lg bg-slate-200 dark:bg-slate-600 p-2 w-9 h-9" />

// 배지 자리
<div className="h-6 w-16 bg-slate-200 dark:bg-slate-600 rounded-full" />`} />
          </CardContent>
        </Card>
      </Section>

      {/* 10. Section Headers */}
      <Section id="sections" title="10. 섹션 헤더 (Section Headers)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">섹션 헤더 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">카드 내 섹션 구분용 헤더</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <div>
              <Label className="mb-3 block">섹션 헤더 예시</Label>
              <div className="space-y-4 max-w-md">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    <Info className="h-4 w-4" />
                    <span>정보</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">섹션 내용...</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span>일정</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">일정 내용...</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    <FileText className="h-4 w-4" />
                    <span>문서</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">문서 내용...</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    <Activity className="h-4 w-4" />
                    <span>활동</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">활동 내용...</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                    <ListTodo className="h-4 w-4" />
                    <span>할 일</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">할 일 내용...</p>
                </div>
              </div>
            </div>

            <CodeBlock title="섹션 헤더 패턴" code={`// 섹션 헤더 (통일된 스타일)
<div className="space-y-1.5">
  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
    <Icon className="h-4 w-4" />
    <span>{sectionTitle}</span>
  </div>
  {/* 섹션 내용 */}
  <div>...</div>
</div>

// 섹션 간 간격
<div className="space-y-3">
  {/* 섹션 1 */}
  {/* 섹션 2 */}
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 11. Layout Section */}
      <Section id="layout" title="11. 레이아웃 (Layout)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">레이아웃 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">반응형 레이아웃, 그리드 시스템</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Common Grid Patterns */}
            <div>
              <Label className="mb-3 block">자주 사용하는 그리드 패턴</Label>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono text-blue-600">grid gap-4 md:grid-cols-3</div>
                  <div className="text-slate-500">Stats 카드 (ETF/Akros)</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono text-blue-600">grid grid-cols-2 sm:grid-cols-4 gap-2</div>
                  <div className="text-slate-500">Stats Grid (Tensoftworks)</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono text-blue-600">grid sm:grid-cols-1 lg:grid-cols-2 gap-4</div>
                  <div className="text-slate-500">프로젝트 카드 리스트</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono text-blue-600">grid grid-cols-1 lg:grid-cols-3 gap-6</div>
                  <div className="text-slate-500">Management 페이지 (1:2 비율)</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono text-blue-600">grid grid-cols-1 sm:grid-cols-2 gap-3</div>
                  <div className="text-slate-500">카드 내 2컬럼 레이아웃</div>
                </div>
              </div>
            </div>

            {/* Overflow Handling */}
            <div>
              <Label className="mb-3 block">오버플로우 처리 (필수)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700 dark:text-blue-300">min-w-0</code>
                  <p className="text-slate-500 mt-1">flex 컨테이너 필수</p>
                </div>
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700 dark:text-blue-300">truncate</code>
                  <p className="text-slate-500 mt-1">텍스트 말줄임</p>
                </div>
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700 dark:text-blue-300">flex-shrink-0</code>
                  <p className="text-slate-500 mt-1">아이콘/버튼에</p>
                </div>
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700 dark:text-blue-300">line-clamp-1/2/3</code>
                  <p className="text-slate-500 mt-1">멀티라인 제한</p>
                </div>
              </div>
            </div>

            <CodeBlock title="레이아웃 패턴" code={`// Management 페이지 레이아웃 (1:2 비율)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-1 order-2 lg:order-1">
    {/* 사이드바 (프로젝트 패널) */}
  </div>
  <div className="lg:col-span-2 order-1 lg:order-2">
    {/* 메인 (캘린더 패널) */}
  </div>
</div>

// 오버플로우 처리 (필수!)
<div className="flex items-center gap-2 min-w-0">
  <Icon className="h-4 w-4 flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>

// CardContent 오버플로우
<CardContent className="pt-0 space-y-3 overflow-hidden">`} />
          </CardContent>
        </Card>
      </Section>

      {/* 12. UI Patterns Section */}
      <Section id="patterns" title="12. UI 패턴 (UI Patterns)" icon={Code2}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">공통 UI 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">반복 사용되는 UI 패턴</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Loading Spinner */}
            <div>
              <Label className="mb-3 block">로딩 스피너</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center p-4 bg-white dark:bg-slate-700 rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
                <code className="text-sm">&lt;Loader2 className="h-8 w-8 animate-spin" /&gt;</code>
              </div>
            </div>

            {/* Expandable Item */}
            <div>
              <Label className="mb-3 block">확장/축소 아이템</Label>
              <div className="max-w-md space-y-2">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('high')}`}>High</span>
                      <span className="text-sm font-medium">축소된 상태</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('medium')}`}>Medium</span>
                      <span className="text-sm font-medium">확장된 상태</span>
                    </div>
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    상세 내용이 표시됩니다...
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div>
              <Label className="mb-3 block">페이지네이션</Label>
              <div className="flex items-center justify-between max-w-md">
                <div className="text-sm text-slate-500">1-10 / 45</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-3">1 / 5</span>
                  <Button size="sm" variant="secondary">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Empty State */}
            <div>
              <Label className="mb-3 block">빈 상태</Label>
              <div className="max-w-md p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
                <FileText className="h-12 w-12 mx-auto text-slate-400 mb-3" />
                <p className="text-slate-500">데이터가 없습니다</p>
                <Button size="sm" className="mt-3">
                  <Plus className="h-4 w-4 mr-1" />
                  새로 만들기
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 13. Modal/Dialog Section */}
      <Section id="modals" title="13. 모달/다이얼로그" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Dialog 컴포넌트</CardTitle>
            <CardDescription className="text-sm mt-0.5">모달 다이얼로그 패턴</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <div>
              <Label className="mb-3 block">Dialog 미리보기</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">다이얼로그 제목</h3>
                    <p className="text-sm text-muted-foreground">다이얼로그 설명</p>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">입력 필드</label>
                      <Input placeholder="값 입력" className="bg-white dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline">취소</Button>
                    <Button>저장</Button>
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock title="Dialog 패턴" code={`<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>제목</DialogTitle>
      <DialogDescription>설명</DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
      <div>
        <label className="text-xs text-slate-500 mb-1 block">필드명</label>
        <Input className="bg-white dark:bg-slate-700" />
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button onClick={handleSave}>저장</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 14. Typography Section */}
      <Section id="typography" title="14. 타이포그래피" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">텍스트 크기 가이드</CardTitle>
            <CardDescription className="text-sm mt-0.5">일관된 텍스트 크기 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <div className="space-y-4">
              <div className="flex items-baseline gap-4">
                <span className="text-2xl font-bold">text-2xl font-bold</span>
                <span className="text-xs text-slate-500">값, 숫자 (Stats)</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-xl font-bold">text-xl font-bold</span>
                <span className="text-xs text-slate-500">페이지 섹션 제목</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-lg truncate">text-lg (truncate)</span>
                <span className="text-xs text-slate-500">CardTitle</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-sm font-medium">text-sm font-medium</span>
                <span className="text-xs text-slate-500">섹션 헤더, 라벨</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-sm text-slate-600">text-sm</span>
                <span className="text-xs text-slate-500">본문, 설명</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-xs text-slate-500">text-xs text-muted-foreground</span>
                <span className="text-xs text-slate-500">보조 정보</span>
              </div>
              <div className="flex items-baseline gap-4">
                <span className="text-[10px] text-slate-500">text-[10px]</span>
                <span className="text-xs text-slate-500">매우 작은 (일정 상세)</span>
              </div>
            </div>

            <CodeBlock title="타이포그래피 패턴" code={`// CardTitle (프로젝트 카드)
<CardTitle className="text-lg truncate">{title}</CardTitle>

// CardDescription
<CardDescription className="text-sm mt-0.5 line-clamp-1">

// 섹션 헤더
<div className="text-sm font-medium text-slate-500 dark:text-slate-400">

// Stats 값
<div className="text-2xl font-bold text-{color}-600">{value}</div>

// 보조 텍스트
<p className="text-xs text-muted-foreground">{subText}</p>

// 매우 작은 텍스트 (일정 상세 등)
<div className="text-[10px] text-muted-foreground">{detail}</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 15. Spacing Section */}
      <Section id="spacing" title="15. 간격 시스템" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Tailwind 간격 가이드</CardTitle>
            <CardDescription className="text-sm mt-0.5">일관된 간격 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="space-y-1">
                <div className="font-medium">페이지 섹션</div>
                <div className="text-slate-500 font-mono">space-y-6 / space-y-8</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">카드 그리드</div>
                <div className="text-slate-500 font-mono">gap-4 / gap-6</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">CardContent 내부</div>
                <div className="text-slate-500 font-mono">space-y-3</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">Stats Grid</div>
                <div className="text-slate-500 font-mono">gap-2</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">섹션 내부</div>
                <div className="text-slate-500 font-mono">space-y-1.5</div>
              </div>
              <div className="space-y-1">
                <div className="font-medium">버튼/요소 간</div>
                <div className="text-slate-500 font-mono">gap-2 / gap-3</div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="mb-3 block">CardHeader / CardContent 간격</Label>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700">CardHeader: pb-2</code>
                  <p className="text-slate-500 mt-1">헤더 하단 패딩</p>
                </div>
                <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                  <code className="text-blue-700">CardContent: pt-0 space-y-3</code>
                  <p className="text-slate-500 mt-1">상단 패딩 제거, 내부 간격</p>
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-3 block">간격 시각화</Label>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-1 bg-blue-500 rounded" />
                  <span className="text-xs mt-1">gap-1 (4px)</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-2 bg-blue-500 rounded" />
                  <span className="text-xs mt-1">gap-2 (8px)</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-3 bg-blue-500 rounded" />
                  <span className="text-xs mt-1">gap-3 (12px)</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-4 bg-blue-500 rounded" />
                  <span className="text-xs mt-1">gap-4 (16px)</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-16 h-6 bg-blue-500 rounded" />
                  <span className="text-xs mt-1">gap-6 (24px)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
