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
            <a href="#collapsible" className="text-sm text-blue-600 hover:underline">16. 접기/펼치기</a>
            <a href="#calendar" className="text-sm text-blue-600 hover:underline">17. 캘린더 셀</a>
            <a href="#charts" className="text-sm text-blue-600 hover:underline">18. 차트</a>
            <a href="#dnd" className="text-sm text-blue-600 hover:underline">19. 드래그앤드롭</a>
            <a href="#icon-buttons" className="text-sm text-blue-600 hover:underline">20. 수정 버튼 패턴</a>
            <a href="#number-format" className="text-sm text-blue-600 hover:underline">21. 숫자 포맷</a>
          </div>
        </CardContent>
      </Card>

      {/* Design Principle Alert */}
      <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30">
        <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">🚨 제1 디자인 원칙</h3>
        <div className="text-lg font-bold text-red-800 dark:text-red-300 mb-3 p-3 bg-red-200 dark:bg-red-800/50 rounded">
          테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다
        </div>
        <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
          <li>• <strong>카드 배경색</strong>: <code>bg-slate-100 dark:bg-slate-800</code> (border 없음)</li>
          <li>• <strong>내부 영역 구분</strong>: <code>bg-white dark:bg-slate-700</code> (중첩 배경색)</li>
          <li>• <strong>아이콘 래퍼 (기본)</strong>: <code>rounded-lg bg-slate-200 dark:bg-slate-700 p-2</code></li>
          <li>• <strong>아이콘 래퍼 (Stats)</strong>: <code>rounded-lg bg-white/50 dark:bg-white/10 p-2</code></li>
          <li>• <strong>CardHeader</strong>: <code>pb-2</code> / <strong>CardContent</strong>: <code>pt-0 space-y-3</code></li>
          <li>• <strong>CardTitle</strong>: <code>text-lg truncate</code> / <strong>CardDescription</strong>: <code>text-sm mt-0.5 line-clamp-1</code></li>
        </ul>
      </div>

      {/* No Border/Shadow Rule */}
      <div className="p-4 rounded-lg bg-amber-100 dark:bg-amber-900/30">
        <h3 className="font-bold text-amber-700 dark:text-amber-400 mb-2">색상으로 구분하는 방법</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">✅ 올바른 패턴</p>
            <ul className="text-amber-600 dark:text-amber-400 space-y-1">
              <li>• 페이지 배경: <code>bg-slate-50</code></li>
              <li>• 카드 배경: <code>bg-slate-100</code></li>
              <li>• 내부 영역: <code>bg-white</code> 또는 <code>bg-slate-200</code></li>
              <li>• 상태별 색상: <code>bg-{'{color}'}-50/100</code></li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">❌ 피해야 할 패턴</p>
            <ul className="text-amber-600 dark:text-amber-400 space-y-1">
              <li>• <code className="line-through">border border-gray-200</code></li>
              <li>• <code className="line-through">shadow-md</code></li>
              <li>• <code className="line-through">ring-1 ring-gray-200</code></li>
              <li>• <code className="line-through">outline outline-gray-200</code></li>
            </ul>
          </div>
        </div>
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
                <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer">
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
                    <button className="flex items-center justify-center gap-2 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer">
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
              <Card className="max-w-md bg-amber-50 dark:bg-amber-900/20 h-full">
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

// POC 카드 (border 없음)
<Card className="bg-amber-50 dark:bg-amber-900/20">
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
                    <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                      <th className="py-2 px-3 font-medium first:rounded-l-lg last:rounded-r-lg">Symbol</th>
                      <th className="py-2 px-3 font-medium">Country</th>
                      <th className="py-2 px-3 font-medium">Fund Name</th>
                      <th className="py-2 px-3 font-medium">AUM</th>
                      <th className="py-2 px-3 font-medium first:rounded-l-lg last:rounded-r-lg">ARR</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="py-3 px-3 font-mono font-medium">KDEF</td>
                      <td className="py-3 px-3 text-sm">KR</td>
                      <td className="py-3 px-3 text-sm min-w-[220px]">PLUS Korea Defense ETF</td>
                      <td className="py-3 px-3">$123.5M</td>
                      <td className="py-3 px-3 font-medium">$1.2M</td>
                    </tr>
                    <tr className="whitespace-nowrap bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50">
                      <td className="py-3 px-3 font-mono font-medium">KBAT</td>
                      <td className="py-3 px-3 text-sm">KR</td>
                      <td className="py-3 px-3 text-sm min-w-[220px]">PLUS Battery ETF</td>
                      <td className="py-3 px-3">$89.2M</td>
                      <td className="py-3 px-3 font-medium">$890K</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <CodeBlock title="테이블 패턴 (border 없이)" code={`<div className="overflow-x-auto">
  <table className="w-full min-w-max">
    <thead>
      {/* 헤더: 배경색으로 구분 */}
      <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
        <th className="py-2 px-3 font-medium first:rounded-l-lg last:rounded-r-lg">Column</th>
      </tr>
    </thead>
    <tbody>
      {/* 홀수/짝수 행: 배경색 교차 */}
      <tr className="whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50">
        <td className="py-3 px-3">{value}</td>
      </tr>
      <tr className="whitespace-nowrap bg-slate-50 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50">
        <td className="py-3 px-3">{value}</td>
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
            <CardDescription className="text-sm mt-0.5">Input, Textarea, Checkbox, Button (border/shadow 없음)</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Form Design Rule */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">폼 요소 디자인 규칙</h4>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>• <strong>border, shadow 없음</strong> - 배경색으로 구분</li>
                <li>• <strong>Input/Textarea</strong>: <code>bg-white dark:bg-slate-700</code></li>
                <li>• <strong>Checkbox 미선택</strong>: <code>bg-slate-200 dark:bg-slate-600</code></li>
                <li>• <strong>Button (outline)</strong>: <code>bg-slate-200 dark:bg-slate-700</code></li>
              </ul>
            </div>

            {/* Basic Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="mb-2 block">기본 Input (배경색으로 구분)</Label>
                <Input placeholder="텍스트를 입력하세요..." />
              </div>
              <div>
                <Label className="mb-2 block">비활성화 Input</Label>
                <Input placeholder="비활성화됨" disabled />
              </div>
            </div>

            {/* Search Input */}
            <div>
              <Label className="mb-2 block">검색 Input (아이콘 포함)</Label>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="검색..." className="pl-10 h-9" />
              </div>
            </div>

            {/* Textarea */}
            <div>
              <Label className="mb-2 block">Textarea</Label>
              <Textarea placeholder="내용을 입력하세요..." rows={3} />
            </div>

            {/* Amount Input */}
            <div>
              <Label className="mb-2 block">금액 입력 (천단위 콤마)</Label>
              <div className="max-w-xs">
                <Input
                  placeholder="0"
                  defaultValue="50,000,000"
                  className="text-right"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">입력 시 자동으로 콤마 추가</p>
            </div>

            {/* Checkbox */}
            <div>
              <Label className="mb-2 block">Checkbox (배경색으로 구분)</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="check1" />
                  <label htmlFor="check1" className="text-sm">미선택 (회색 배경)</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="check2" defaultChecked />
                  <label htmlFor="check2" className="text-sm">선택됨 (primary 배경)</label>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div>
              <Label className="mb-2 block">Button Variants (border/shadow 없음)</Label>
              <div className="flex flex-wrap gap-3">
                <Button>Default</Button>
                <Button variant="outline">Outline (취소)</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="destructive">Destructive (삭제)</Button>
                <Button variant="ghost">Ghost</Button>
              </div>
            </div>

            <CodeBlock title="폼 요소 패턴" code={`// Input (border/shadow 없음, 배경색으로 구분)
<Input placeholder="..." />
// 기본 배경: bg-white dark:bg-slate-700
// 포커스 시: bg-slate-50 dark:bg-slate-600

// Checkbox (배경색으로 구분)
<Checkbox />
// 미선택: bg-slate-200 dark:bg-slate-600
// 선택됨: bg-primary

// 금액 입력 (천단위 콤마)
const [amount, setAmount] = useState('')
<input
  type="text"
  value={amount}
  onChange={(e) => {
    const value = e.target.value.replace(/[^\\d]/g, '')
    setAmount(value ? parseInt(value).toLocaleString() : '')
  }}
  placeholder="0"
/>
// 로드 시: setAmount(invoice.amount.toLocaleString())
// 저장 시: parseInt(amount.replace(/,/g, ''), 10)

// Button outline variant (취소 버튼)
<Button variant="outline">취소</Button>
// 배경: bg-slate-200 dark:bg-slate-700
// 호버: bg-slate-300 dark:bg-slate-600`} />
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

            {/* Filter Badges */}
            <div>
              <Label className="mb-3 block">필터 뱃지 (탭 스타일)</Label>
              <div className="flex flex-wrap gap-1">
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-900 text-white dark:bg-slate-600">
                  전체
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  매출
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  비용
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  자산
                </button>
              </div>
              <div className="flex flex-wrap gap-1 mt-3">
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-900 text-white dark:bg-slate-600">
                  전체
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors text-white" style={{ backgroundColor: '#6366f1' }}>
                  성균관대학교
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  이맥스시스템
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">이메일 카테고리 필터 (선택 시 동적 색상)</p>
              <div className="flex flex-wrap gap-1 mt-2">
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-900 text-white dark:bg-slate-600">
                  전체
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-amber-500 text-white">
                  재무회계
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  고객사/성균관대학교
                </button>
                <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                  모노알앱스
                </button>
              </div>
            </div>

            {/* Search + Filter Combination */}
            <div>
              <Label className="mb-3 block">검색 + 필터 조합</Label>
              <p className="text-xs text-muted-foreground mb-2">검색 입력창을 위에, 필터 뱃지를 아래에 배치</p>
              <div className="space-y-2 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="검색어를 입력하세요..."
                    className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-900 text-white dark:bg-slate-600">
                    전체
                  </button>
                  <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-amber-500 text-white">
                    재무회계
                  </button>
                  <button className="px-3 py-1 text-xs font-medium rounded-full transition-colors bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600">
                    고객사
                  </button>
                </div>
              </div>
            </div>

            <CodeBlock title="필터 뱃지 패턴" code={`// 필터 뱃지 (탭 스타일)
// mb-4로 아래 콘텐츠와 간격 유지
<div className="flex flex-wrap gap-1 mb-4">
  {items.map((item) => (
    <button
      key={item}
      onClick={() => setFilter(item)}
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
        filter === item
          ? 'bg-slate-900 text-white dark:bg-slate-600'
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
      )}
    >
      {item}
    </button>
  ))}
</div>

// 커스텀 색상 필터 뱃지 (클라이언트별 색상)
<button
  onClick={() => setFilter(client.id)}
  className={cn(
    'px-3 py-1 text-xs font-medium rounded-full transition-colors',
    selected === client.id
      ? 'text-white'  // 선택 시 흰 글씨
      : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
  )}
  style={{
    backgroundColor: selected === client.id ? client.color : undefined,
  }}
>
  {client.name}
</button>

// 카테고리 필터 뱃지 (이메일 등 - 선택 시 동적 색상)
{categories.map((category) => {
  const color = getCategoryColor(category)
  return (
    <button
      key={category}
      onClick={() => setFilter(category)}
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
        filter === category
          ? \`\${color.button} text-white\`  // 선택 시 카테고리 색상
          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
      )}
    >
      {category}
    </button>
  )
})}`} />

            <CodeBlock title="검색 + 필터 조합 패턴" code={`// 검색 + 필터 조합 (검색 위, 필터 아래)
<div className="space-y-2">
  {/* 검색 입력창 */}
  <div className="relative">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="검색어를 입력하세요..."
      className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>

  {/* 필터 뱃지 */}
  <div className="flex flex-wrap gap-1">
    {categories.map((category) => (
      <button
        key={category}
        onClick={() => setFilter(category)}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
          filter === category
            ? 'bg-slate-900 text-white dark:bg-slate-600'
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300'
        )}
      >
        {category}
      </button>
    ))}
  </div>
</div>`} />

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
                    <div key={i} className="bg-slate-200 dark:bg-slate-700 rounded-lg p-3 space-y-2">
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
            {/* Create Mode Dialog */}
            <div>
              <Label className="mb-3 block">생성 모드 (Create Mode)</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">항목 추가</h3>
                    <p className="text-sm text-muted-foreground">새 항목을 추가합니다</p>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">입력 필드</label>
                      <Input placeholder="값 입력" className="bg-white dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="flex flex-row justify-between">
                    <div />
                    <div className="flex gap-2">
                      <Button variant="outline">취소</Button>
                      <Button>저장</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Mode Dialog */}
            <div>
              <Label className="mb-3 block">수정 모드 (Edit Mode) - 삭제 버튼 포함</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">항목 수정</h3>
                    <p className="text-sm text-muted-foreground">기존 항목을 수정합니다</p>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">입력 필드</label>
                      <Input defaultValue="기존 값" className="bg-white dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="flex flex-row justify-between">
                    <Button variant="destructive"><Trash2 className="h-4 w-4 mr-1" />삭제</Button>
                    <div className="flex gap-2">
                      <Button variant="outline">취소</Button>
                      <Button>저장</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Button Loading State */}
            <div>
              <Label className="mb-3 block">버튼 로딩 상태</Label>
              <div className="flex gap-3">
                <Button disabled><Loader2 className="h-4 w-4 animate-spin mr-1" />저장 중...</Button>
                <Button variant="destructive" disabled><Loader2 className="h-4 w-4 animate-spin mr-1" />삭제 중...</Button>
              </div>
            </div>

            <Separator />

            {/* Scrollable Modal with Fixed Header/Footer */}
            <div>
              <Label className="mb-3 block">스크롤 모달 (헤더/푸터 고정 + 테두리 구분)</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex flex-col max-h-[300px]">
                  {/* Fixed Header with border-bottom */}
                  <div className="p-4 pb-4 flex-shrink-0 border-b">
                    <h3 className="text-lg font-semibold">헤더 (고정)</h3>
                    <p className="text-sm text-muted-foreground">pb-4 border-b로 구분</p>
                  </div>
                  {/* Scrollable Content with padding */}
                  <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 1</div>
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 2</div>
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 3</div>
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 4</div>
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 5</div>
                    <div className="p-3 rounded bg-blue-50 dark:bg-blue-900/30 text-sm">스크롤 컨텐츠 6</div>
                  </div>
                  {/* Fixed Footer with border-top */}
                  <div className="p-4 pt-4 flex-shrink-0 flex justify-end gap-2 border-t">
                    <Button variant="outline" size="sm">취소</Button>
                    <Button size="sm">저장</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed Header/Footer Rules */}
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-2">헤더/푸터 고정 핵심 규칙</h4>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                <li>• <strong>DialogContent</strong>: <code>max-h-[90vh] flex flex-col</code></li>
                <li>• <strong>DialogHeader</strong>: <code>flex-shrink-0 pb-4 border-b</code> (테두리로 구분)</li>
                <li>• <strong>컨텐츠 영역</strong>: <code>overflow-y-auto flex-1 py-4</code></li>
                <li>• <strong>DialogFooter</strong>: <code>flex-shrink-0 pt-4 border-t</code> (테두리로 구분)</li>
              </ul>
            </div>

            <Separator />

            <CodeBlock title="DialogFooter 패턴 (핵심)" code={`// 생성 모드 - 삭제 버튼 없음
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <div />  {/* 빈 공간 */}
  <div className="flex gap-2">
    <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
    <Button onClick={handleSave}>저장</Button>
  </div>
</DialogFooter>

// 수정 모드 - 삭제 버튼 왼쪽 배치
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <Button variant="destructive" onClick={handleDelete}>
    <Trash2 className="h-4 w-4 mr-1" />삭제
  </Button>
  <div className="flex gap-2">
    <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
    <Button onClick={handleSave} disabled={isSaving}>
      {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
      저장
    </Button>
  </div>
</DialogFooter>`} />

            <CodeBlock title="전체 Dialog 구조" code={`<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-h-[90vh] flex flex-col">
    <DialogHeader className="flex-shrink-0 pb-4 border-b">
      <DialogTitle>{isEditing ? '항목 수정' : '항목 추가'}</DialogTitle>
      <DialogDescription>항목 설명</DialogDescription>
    </DialogHeader>

    {/* 스크롤 가능한 컨텐츠 영역 */}
    <div className="overflow-y-auto flex-1 space-y-4 py-4 px-1 -mx-1">
      <div>
        <label className="text-xs text-slate-500 mb-1 block">필드명</label>
        <Input className="bg-white dark:bg-slate-700" />
      </div>
    </div>

    <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
      {isEditing ? (
        <Button variant="destructive" onClick={handleDelete}>삭제</Button>
      ) : (
        <div />
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
        <Button onClick={handleSave}>저장</Button>
      </div>
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

      {/* 16. Collapsible Sections */}
      <Section id="collapsible" title="16. 접기/펼치기 (Collapsible)" icon={ChevronDown}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">접기/펼치기 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">CardHeader 클릭으로 섹션 접기/펼치기</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Collapsible Card Example */}
            <div>
              <Label className="mb-3 block">접기/펼치기 카드</Label>
              <div className="space-y-3 max-w-md">
                {/* Expanded State */}
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
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      섹션 내용이 표시됩니다...
                    </p>
                  </CardContent>
                </Card>

                {/* Collapsed State */}
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
              </div>
            </div>

            {/* Accordion Pattern */}
            <div>
              <Label className="mb-3 block">아코디언 아이템</Label>
              <div className="max-w-md bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden">
                <div className="p-3 flex items-center justify-between cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <div className="flex items-center gap-2">
                    <ChevronDown className="h-4 w-4 transition-transform" />
                    <span className="font-medium text-sm">펼쳐진 아이템</span>
                  </div>
                  <span className="text-xs text-muted-foreground">3개</span>
                </div>
                <div className="px-3 pb-3 space-y-2 bg-white dark:bg-slate-800">
                  <div className="pl-6 text-sm text-slate-600 dark:text-slate-400">
                    내용 1
                  </div>
                  <div className="pl-6 text-sm text-slate-600 dark:text-slate-400">
                    내용 2
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock title="접기/펼치기 패턴" code={`// 상태 관리
const [expanded, setExpanded] = useState(true)

// 접기/펼치기 카드
<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader
    className={cn("cursor-pointer", !expanded && "-mb-2")}
    onClick={() => setExpanded(!expanded)}
  >
    <div className="flex items-center justify-between">
      <div>
        <CardTitle className="text-lg">제목</CardTitle>
        <CardDescription>설명</CardDescription>
      </div>
      <ChevronDown className={cn(
        "h-4 w-4 text-muted-foreground transition-transform",
        !expanded && "-rotate-90"
      )} />
    </div>
  </CardHeader>
  {expanded && (
    <CardContent className="pt-0">...</CardContent>
  )}
</Card>

// localStorage 저장
useEffect(() => {
  localStorage.setItem('section-expanded', String(expanded))
}, [expanded])`} />
          </CardContent>
        </Card>
      </Section>

      {/* 17. Calendar Cells */}
      <Section id="calendar" title="17. 캘린더 셀 (Calendar)" icon={Calendar}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">캘린더 셀 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">주간/월간 캘린더 뷰 셀 스타일</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Week View Cells */}
            <div>
              <Label className="mb-3 block">주간 뷰 셀 (min-h-[280px])</Label>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {/* Regular Day */}
                <div className="min-h-[140px]">
                  <div className="text-center py-1.5 rounded-t-lg font-medium text-xs bg-slate-200 dark:bg-slate-700 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-600">
                    <div>월</div>
                    <div className="text-base">15</div>
                  </div>
                  <div className="rounded-b-lg p-2 space-y-1 min-h-[100px] cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <div className="text-xs p-1.5 rounded bg-slate-200 dark:bg-slate-700">
                      일정 1
                    </div>
                  </div>
                </div>

                {/* Today */}
                <div className="min-h-[140px]">
                  <div className="text-center py-1.5 rounded-t-lg font-medium text-xs bg-slate-700 text-white dark:bg-white dark:text-slate-700 cursor-pointer hover:bg-slate-600 dark:hover:bg-slate-100">
                    <div>화</div>
                    <div className="text-base">16</div>
                  </div>
                  <div className="rounded-b-lg p-2 space-y-1 min-h-[100px] cursor-pointer bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700">
                    <div className="text-xs p-1.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400">
                      오늘 일정
                    </div>
                  </div>
                </div>

                {/* Empty Day */}
                <div className="min-h-[140px]">
                  <div className="text-center py-1.5 rounded-t-lg font-medium text-xs bg-slate-200 dark:bg-slate-700">
                    <div>수</div>
                    <div className="text-base">17</div>
                  </div>
                  <div className="rounded-b-lg p-2 space-y-1 min-h-[100px] bg-white dark:bg-slate-900 text-center">
                    <p className="text-xs text-muted-foreground mt-4">일정 없음</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Month View Cells */}
            <div>
              <Label className="mb-3 block">월간 뷰 셀 (min-h-[80px])</Label>
              <div className="grid grid-cols-4 gap-1 max-w-sm">
                {/* Regular */}
                <div className="min-h-[60px] bg-white dark:bg-slate-800 rounded p-1 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                  <div className="text-xs text-muted-foreground">15</div>
                  <div className="text-[10px] px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 truncate mt-1">
                    일정
                  </div>
                </div>
                {/* Today */}
                <div className="min-h-[60px] bg-slate-200 dark:bg-slate-600 rounded p-1 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-500">
                  <div className="text-xs font-bold">16</div>
                  <div className="text-[10px] px-1 py-0.5 rounded bg-blue-200 dark:bg-blue-900/50 truncate mt-1">
                    오늘
                  </div>
                </div>
                {/* Hover/Drop */}
                <div className="min-h-[60px] bg-slate-300 dark:bg-slate-500 rounded p-1">
                  <div className="text-xs">17</div>
                  <div className="text-[10px] text-muted-foreground mt-2">드롭 영역</div>
                </div>
                {/* Empty */}
                <div className="min-h-[60px] bg-slate-100 dark:bg-slate-700 rounded p-1">
                  <div className="text-xs text-muted-foreground">-</div>
                </div>
              </div>
            </div>

            <CodeBlock title="캘린더 셀 패턴" code={`// 주간 뷰 셀 (border 없이 배경색으로 구분)
<div className="min-h-[280px]">
  {/* 헤더 - 오늘 */}
  <div className={cn(
    "text-center py-1.5 rounded-t-lg font-medium text-xs cursor-pointer transition-colors",
    isToday
      ? "bg-slate-700 text-white dark:bg-white dark:text-slate-700 hover:bg-slate-600"
      : "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300"
  )}>
    <div>{dayLabel}</div>
    <div className="text-base">{day.getDate()}</div>
  </div>
  {/* 콘텐츠 */}
  <div className={cn(
    "rounded-b-lg p-2 space-y-1 min-h-[120px] cursor-pointer transition-colors",
    "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700",
    isOver && "bg-slate-100 dark:bg-slate-700"
  )}>
    {children}
  </div>
</div>

// 월간 뷰 셀 (border 대신 배경색)
<div className={cn(
  "min-h-[80px] rounded p-1 cursor-pointer",
  "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700",
  isToday && "bg-slate-200 dark:bg-slate-600",
  isOver && "bg-slate-300 dark:bg-slate-500",
  !day && "bg-slate-100 dark:bg-slate-700"
)}>
  {children}
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 18. Charts (recharts) */}
      <Section id="charts" title="18. 차트 (Charts)" icon={TrendingUp}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">차트 패턴 (recharts)</CardTitle>
            <CardDescription className="text-sm mt-0.5">recharts 라이브러리 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Chart Container Pattern */}
            <div>
              <Label className="mb-3 block">차트 컨테이너 (h-48)</Label>
              <div className="h-48 bg-white dark:bg-slate-700 rounded-lg p-4">
                <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-600 rounded">
                  <div className="text-center text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">ResponsiveContainer</p>
                    <p className="text-xs">width="100%" height="100%"</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart Color Scheme */}
            <div>
              <Label className="mb-3 block">차트 색상 팔레트</Label>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#6366f1]" />
                  <span className="text-xs">#6366f1 (indigo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#f97316]" />
                  <span className="text-xs">#f97316 (orange)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#10b981]" />
                  <span className="text-xs">#10b981 (emerald)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-[#3b82f6]" />
                  <span className="text-xs">#3b82f6 (blue)</span>
                </div>
              </div>
            </div>

            <CodeBlock title="차트 패턴 (recharts)" code={`import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

// 기본 LineChart
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
      <Tooltip />
      <Legend />
      <Line
        yAxisId="left"
        type="monotone"
        dataKey="value1"
        stroke="#6366f1"
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls
      />
      <Line
        yAxisId="right"
        type="monotone"
        dataKey="value2"
        stroke="#f97316"
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls
      />
    </LineChart>
  </ResponsiveContainer>
</div>

// 빈 상태
{data.length === 0 && (
  <div className="text-center py-4 text-muted-foreground text-sm">
    데이터가 없습니다
  </div>
)}`} />
          </CardContent>
        </Card>
      </Section>

      {/* 19. Drag and Drop (dnd-kit) */}
      <Section id="dnd" title="19. 드래그앤드롭 (DnD)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">드래그앤드롭 (dnd-kit)</CardTitle>
            <CardDescription className="text-sm mt-0.5">@dnd-kit/core 라이브러리 사용</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Draggable Card */}
            <div>
              <Label className="mb-3 block">드래그 가능한 카드</Label>
              <div className="flex gap-3">
                <div className="text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none bg-slate-200 dark:bg-slate-700">
                  <div className="flex items-center gap-1">
                    <Circle className="h-3 w-3" />
                    <span>드래그 가능</span>
                  </div>
                </div>
                <div className="text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none bg-slate-200 dark:bg-slate-700 opacity-50">
                  <div className="flex items-center gap-1">
                    <Circle className="h-3 w-3" />
                    <span>드래그 중 (opacity-50)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Color Border */}
            <div>
              <Label className="mb-3 block">동적 색상 테두리 (인라인 스타일)</Label>
              <div className="flex flex-wrap gap-3">
                <div
                  className="text-xs p-1.5 rounded bg-indigo-100/20 dark:bg-indigo-900/20"
                  style={{ borderLeft: '3px solid #6366f1' }}
                >
                  과목 A 일정
                </div>
                <div
                  className="text-xs p-1.5 rounded bg-orange-100/20 dark:bg-orange-900/20"
                  style={{ borderLeft: '3px solid #f97316' }}
                >
                  과목 B 일정
                </div>
                <div
                  className="text-xs p-1.5 rounded bg-emerald-100/20 dark:bg-emerald-900/20"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  과목 C 일정
                </div>
              </div>
            </div>

            {/* Completed State */}
            <div>
              <Label className="mb-3 block">완료 상태 스타일</Label>
              <div className="flex gap-3">
                <div className="text-xs p-1.5 rounded bg-slate-200 dark:bg-slate-700">
                  <div className="flex items-center gap-1">
                    <Circle className="h-3 w-3" />
                    <span>미완료</span>
                  </div>
                </div>
                <div className="text-xs p-1.5 rounded bg-muted line-through text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>완료됨</span>
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock title="드래그앤드롭 패턴" code={`import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

// Sensor 설정 (8px 이동 후 드래그 시작)
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  })
)

// Draggable 컴포넌트
function DraggableCard({ item }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  })

  // 동적 색상 스타일
  const style = {
    transform: transform
      ? \`translate3d(\${transform.x}px, \${transform.y}px, 0)\`
      : undefined,
    borderLeft: item.color ? \`3px solid \${item.color}\` : undefined,
    backgroundColor: item.color ? \`\${item.color}20\` : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "text-xs p-1.5 rounded cursor-grab active:cursor-grabbing touch-none",
        isDragging && "opacity-50",
        item.completed && "bg-muted line-through text-muted-foreground"
      )}
    >
      {item.title}
    </div>
  )
}

// Droppable 영역
function DroppableZone({ date, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: \`day-\${date}\`,
    data: { date },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] p-2",
        isOver && "bg-slate-100 dark:bg-slate-800"
      )}
    >
      {children}
    </div>
  )
}`} />
          </CardContent>
        </Card>
      </Section>

      {/* 20. Icon Buttons Section */}
      <Section id="icon-buttons" title="20. 수정 버튼 패턴" icon={Pencil}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">수정/삭제 액션 패턴</CardTitle>
            <CardDescription className="text-sm mt-0.5">삭제는 수정 모달 내에서만 가능</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Important Rule */}
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">🚨 삭제 버튼 규칙</h4>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                <li>• <strong>삭제 아이콘(Trash) 단독 사용 금지</strong></li>
                <li>• <strong>삭제는 수정 모달/인라인 내에서만 가능</strong></li>
                <li>• <strong>삭제 버튼 위치: 모달 좌측 하단</strong></li>
              </ul>
            </div>

            {/* Edit Icon Only */}
            <div>
              <Label className="mb-3 block">수정 아이콘 (테이블/카드에서 유일한 액션)</Label>
              <div className="flex gap-4 items-center p-4 rounded-lg bg-white dark:bg-slate-700">
                <button className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
                  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </button>
                <span className="text-xs text-slate-500">→ 클릭 시 수정 모달 열림 (삭제는 모달 내에서)</span>
              </div>
            </div>

            {/* Disabled State */}
            <div>
              <Label className="mb-3 block">비활성화 상태</Label>
              <div className="flex gap-4 items-center p-4 rounded-lg bg-white dark:bg-slate-700">
                <button className="rounded p-1 opacity-30 cursor-not-allowed">
                  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </button>
                <span className="text-xs text-slate-500">opacity-30 cursor-not-allowed</span>
              </div>
            </div>

            {/* Table Row Example */}
            <div>
              <Label className="mb-3 block">테이블 행 예시 (수정 아이콘만)</Label>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-200 dark:bg-slate-700">
                      <th className="text-left py-2 px-3 font-medium rounded-l-lg">이름</th>
                      <th className="text-left py-2 px-3 font-medium">상태</th>
                      <th className="text-right py-2 px-3 font-medium rounded-r-lg">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="py-2 px-3">항목 1</td>
                      <td className="py-2 px-3"><Badge className="bg-green-100 text-green-700">활성</Badge></td>
                      <td className="py-2 px-3 text-right">
                        <button className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
                          <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Edit Modal with Delete */}
            <div>
              <Label className="mb-3 block">수정 모달 (삭제 버튼 좌측 하단)</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">항목 수정</h3>
                    <p className="text-sm text-muted-foreground">기존 항목을 수정합니다</p>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">입력 필드</label>
                      <Input defaultValue="기존 값" className="bg-white dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="flex flex-row justify-between">
                    <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" />삭제</Button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">취소</Button>
                      <Button size="sm">저장</Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <CodeBlock title="수정/삭제 패턴" code={`// 테이블/카드에서: 수정 아이콘만 표시
<button
  onClick={() => openEditModal(item)}
  className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
  title="수정"
>
  <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</button>

// 수정 모달 내에서: 삭제 버튼 좌측 하단
<DialogFooter className="flex-row justify-between">
  <Button variant="destructive" onClick={handleDelete}>
    <Trash2 className="h-4 w-4 mr-1" />삭제
  </Button>
  <div className="flex gap-2">
    <Button variant="outline">취소</Button>
    <Button>저장</Button>
  </div>
</DialogFooter>`} />

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">아이콘 버튼 규칙</h4>
              <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                <li>• <strong>아이콘 크기</strong>: <code>h-4 w-4</code> (16px)</li>
                <li>• <strong>버튼 패딩</strong>: <code>p-1</code> (4px)</li>
                <li>• <strong>기본 색상</strong>: <code>text-slate-600 dark:text-slate-400</code></li>
                <li>• <strong>호버 배경</strong>: <code>hover:bg-slate-200 dark:hover:bg-slate-700</code></li>
                <li>• <strong>비활성화</strong>: <code>disabled:opacity-30 disabled:cursor-not-allowed</code></li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* 21. Number Formatting Section */}
      <Section id="number-format" title="21. 숫자 포맷 (Number Format)" icon={DollarSign}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">숫자 포맷팅 규칙</CardTitle>
            <CardDescription className="text-sm mt-0.5">천 단위 콤마, 통화, 파일 크기 표시</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-6">
            {/* Thousand Separator */}
            <div>
              <Label className="mb-3 block">천 단위 콤마 (필수)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                  <div className="text-2xl font-bold">{(1234567).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">일반 숫자</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                  <div className="text-2xl font-bold">₩{(1500000).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">원화</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                  <div className="text-2xl font-bold">${(12345.67).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-xs text-muted-foreground">달러 (소수점)</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 text-center">
                  <div className="text-2xl font-bold">{(85.5).toLocaleString()}%</div>
                  <div className="text-xs text-muted-foreground">퍼센트</div>
                </div>
              </div>
            </div>

            {/* Currency Abbreviations */}
            <div>
              <Label className="mb-3 block">큰 숫자 축약 표기</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-center">
                  <div className="text-xl font-bold text-blue-600">$1.5M</div>
                  <div className="text-xs text-muted-foreground">Million</div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-center">
                  <div className="text-xl font-bold text-blue-600">$250K</div>
                  <div className="text-xs text-muted-foreground">Thousand</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-center">
                  <div className="text-xl font-bold text-emerald-600">15.5억원</div>
                  <div className="text-xs text-muted-foreground">억 단위</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-center">
                  <div className="text-xl font-bold text-emerald-600">A$2.3M</div>
                  <div className="text-xs text-muted-foreground">호주 달러</div>
                </div>
              </div>
            </div>

            {/* File Size */}
            <div>
              <Label className="mb-3 block">파일 크기</Label>
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary">256 B</Badge>
                <Badge variant="secondary">1.5 KB</Badge>
                <Badge variant="secondary">12.8 MB</Badge>
                <Badge variant="secondary">2.1 GB</Badge>
              </div>
            </div>

            <Separator />

            <CodeBlock title="숫자 포맷팅 함수" code={`// 기본 천 단위 콤마 (필수!)
const formatted = value.toLocaleString()
// 1234567 → "1,234,567"

// 소수점 포함
const withDecimals = value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})
// 12345.6 → "12,345.60"

// 한국어 로케일
const korean = value.toLocaleString('ko-KR')

// 통화 포맷
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(value)

// 큰 숫자 축약
function formatLargeNumber(value: number): string {
  if (value >= 1000000) return \`$\${(value / 1000000).toFixed(2)}M\`
  if (value >= 1000) return \`$\${(value / 1000).toFixed(1)}K\`
  return \`$\${value.toFixed(0)}\`
}

// 억 단위 (한국)
function formatBillion(value: number): string {
  if (value >= 100000000) return \`\${(value / 100000000).toFixed(1)}억원\`
  return value.toLocaleString() + '원'
}

// 파일 크기
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return \`\${bytes} B\`
  if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(1)} KB\`
  return \`\${(bytes / 1024 / 1024).toFixed(1)} MB\`
}`} />

            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">필수 규칙</h4>
              <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                <li>• <strong>모든 숫자에 천 단위 콤마 필수</strong>: <code>value.toLocaleString()</code></li>
                <li>• <strong>금액 입력 필드</strong>: 입력 시 실시간 콤마 포맷 적용</li>
                <li>• <strong>통계/차트 값</strong>: 항상 포맷된 숫자 표시</li>
                <li>• <strong>테이블 숫자</strong>: 우측 정렬 + 콤마 포맷</li>
              </ul>
            </div>

            <CodeBlock title="금액 입력 필드 예시" code={`// 입력 시 실시간 콤마 포맷
const [displayValue, setDisplayValue] = useState('')

const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const rawValue = e.target.value.replace(/[^0-9]/g, '') // 숫자만 추출
  if (rawValue) {
    setDisplayValue(parseInt(rawValue).toLocaleString())
  } else {
    setDisplayValue('')
  }
}

<Input
  value={displayValue}
  onChange={handleAmountChange}
  placeholder="1,000,000"
/>`} />
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}
