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
} from 'lucide-react'

// ============= Helper Functions =============

// Priority colors
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
    case 'urgent': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
    case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
    case 'low': return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
  }
}

// Status colors
const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    case 'discarded': return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
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
            <a href="#stats-cards" className="text-sm text-blue-600 hover:underline">3. 통계 카드</a>
            <a href="#tables" className="text-sm text-blue-600 hover:underline">4. 테이블</a>
            <a href="#forms" className="text-sm text-blue-600 hover:underline">5. 폼 요소</a>
            <a href="#badges" className="text-sm text-blue-600 hover:underline">6. 배지</a>
            <a href="#colors" className="text-sm text-blue-600 hover:underline">7. 색상 시스템</a>
            <a href="#skeleton" className="text-sm text-blue-600 hover:underline">8. 스켈레톤 로딩</a>
            <a href="#layout" className="text-sm text-blue-600 hover:underline">9. 레이아웃</a>
            <a href="#patterns" className="text-sm text-blue-600 hover:underline">10. UI 패턴</a>
            <a href="#modals" className="text-sm text-blue-600 hover:underline">11. 모달/다이얼로그</a>
            <a href="#spacing" className="text-sm text-blue-600 hover:underline">12. 간격 시스템</a>
          </div>
        </CardContent>
      </Card>

      {/* Design Principle Alert */}
      <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30">
        <h3 className="font-bold text-red-700 dark:text-red-400 mb-2">핵심 디자인 원칙</h3>
        <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
          <li>• <strong>카드 배경색</strong>: <code>bg-slate-100 dark:bg-slate-800</code> 통일</li>
          <li>• <strong>아이콘 래퍼</strong>: <code>rounded-lg bg-white/50 dark:bg-white/10 p-2</code></li>
          <li>• <strong>카드 헤더 반응형</strong>: <code>flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4</code></li>
        </ul>
      </div>

      {/* 1. Buttons Section */}
      <Section id="buttons" title="1. 버튼 (Button)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>버튼 Variants</CardTitle>
            <CardDescription>상황에 맞는 버튼 variant를 사용하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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

            <CodeBlock title="실제 프로젝트 버튼 패턴" code={`// 카드 내 새로고침 버튼
<button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
  <RefreshCw className={\`h-4 w-4 \${isLoading ? 'animate-spin' : ''}\`} />
</button>

// 외부 링크 버튼
<button className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer">
  Supernova
  <ExternalLink className="h-4 w-4" />
</button>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 2. Cards Section */}
      <Section id="cards" title="2. 카드 (Card)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>카드 구성 요소</CardTitle>
            <CardDescription>배경색으로 구분하는 카드 스타일</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic Card */}
            <div>
              <Label className="mb-3 block">기본 카드 (bg-slate-100 dark:bg-slate-800)</Label>
              <Card className="max-w-md bg-slate-100 dark:bg-slate-700">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    카드 제목
                  </CardTitle>
                  <CardDescription>카드 설명 텍스트</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">카드 본문 내용이 여기에 들어갑니다.</p>
                </CardContent>
                <CardFooter className="gap-2">
                  <Button size="sm" variant="ghost">취소</Button>
                  <Button size="sm">저장</Button>
                </CardFooter>
              </Card>
            </div>

            {/* Card with Action Header (실제 패턴) */}
            <div>
              <Label className="mb-3 block">반응형 카드 헤더 (실제 패턴)</Label>
              <Card className="bg-slate-100 dark:bg-slate-700">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <CardTitle>상품 리스트</CardTitle>
                    <CardDescription>아크로스 지수 추종 상품</CardDescription>
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
                <CardContent>
                  <p className="text-sm text-slate-500">테이블 내용...</p>
                </CardContent>
              </Card>
            </div>

            <CodeBlock title="카드 헤더 반응형 패턴" code={`<Card className="bg-slate-100 dark:bg-slate-800">
  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <CardTitle>{t.etf.title}</CardTitle>
      <CardDescription>{t.etf.description}</CardDescription>
    </div>
    <div className="flex items-center gap-2">
      <button className="...">
        <RefreshCw className={\`h-4 w-4 \${isLoading ? 'animate-spin' : ''}\`} />
      </button>
      <button className="...">
        Supernova
        <ExternalLink className="h-4 w-4" />
      </button>
    </div>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 3. Stats Cards Section */}
      <Section id="stats-cards" title="3. 통계 카드 (Stats Cards)" icon={TrendingUp}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>통계 카드 패턴 (실제 프로젝트)</CardTitle>
            <CardDescription>대시보드 상단에 사용 - 모두 slate 배경 통일</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-3 block">3열 그리드 (grid gap-4 md:grid-cols-3)</Label>
              <div className="grid gap-4 md:grid-cols-3">
                {/* Total AUM */}
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
                      {/* Sparkline would go here */}
                      <div className="w-24 h-10 bg-slate-200 dark:bg-slate-600 rounded" />
                    </div>
                  </CardContent>
                </Card>

                {/* Total Products */}
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

                {/* Total ARR */}
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

            <CodeBlock title="통계 카드 패턴 (실제)" code={`<div className="grid gap-4 md:grid-cols-3">
  <Card className="bg-slate-100 dark:bg-slate-800">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {t.etf.totalAum}
      </CardTitle>
      <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
        <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold">{formatAum(value)}</div>
          <p className="text-xs text-muted-foreground">{subText}</p>
        </div>
        <Sparkline data={data} />
      </div>
    </CardContent>
  </Card>
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 4. Tables Section */}
      <Section id="tables" title="4. 테이블 (Table)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>테이블 패턴</CardTitle>
            <CardDescription>데이터 테이블 스타일</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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
        <th className="pb-3 pr-6 font-medium">Symbol</th>
        <th className="pb-3 pr-6 font-medium">Fund Name</th>
        <th className="pb-3 font-medium">AUM</th>
      </tr>
    </thead>
    <tbody>
      {data.map((item) => (
        <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
          <td className="py-3 pr-6 font-mono font-medium">{item.symbol}</td>
          <td className="py-3 pr-6 text-sm min-w-[220px]">{item.name}</td>
          <td className="py-3 font-medium">{formatAUM(item.aum)}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 5. Form Elements Section */}
      <Section id="forms" title="5. 폼 요소 (Form Elements)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>입력 폼 컴포넌트</CardTitle>
            <CardDescription>Input, Textarea, Checkbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
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

            <CodeBlock title="폼 요소 패턴" code={`// 검색 Input (카드 내부)
<div className="relative">
  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
  <Input
    placeholder="검색..."
    className="pl-10 h-9 bg-white dark:bg-slate-700"
  />
</div>

// Checkbox
<div className="flex items-center gap-2">
  <Checkbox id="myCheck" />
  <label htmlFor="myCheck" className="text-sm">옵션</label>
</div>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 6. Badges Section */}
      <Section id="badges" title="6. 배지 (Badges)" icon={Type}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>배지 스타일</CardTitle>
            <CardDescription>상태, 우선순위, 카테고리를 표시하는 배지</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Badges */}
            <div>
              <Label className="mb-3 block">상태 배지 (아이콘 + 텍스트)</Label>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                  <Circle className="h-4 w-4" />
                  대기
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                  <Zap className="h-4 w-4" />
                  진행 중
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  완료
                </span>
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  <Ban className="h-4 w-4" />
                  취소
                </span>
              </div>
            </div>

            {/* Priority Badges */}
            <div>
              <Label className="mb-3 block">우선순위 배지</Label>
              <div className="flex flex-wrap gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('low')}`}>낮음</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('medium')}`}>보통</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('high')}`}>높음</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('urgent')}`}>긴급</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('critical')}`}>치명</span>
              </div>
            </div>

            {/* Category Badges */}
            <div>
              <Label className="mb-3 block">카테고리 배지</Label>
              <div className="flex flex-wrap gap-2">
                {['blue', 'purple', 'green', 'amber', 'red', 'pink', 'cyan', 'orange'].map(color => (
                  <span key={color} className={`px-2 py-0.5 text-xs rounded-full ${getCategoryColor(color)}`}>
                    {color}
                  </span>
                ))}
              </div>
            </div>

            {/* Badge Component */}
            <div>
              <Label className="mb-3 block">Badge 컴포넌트</Label>
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
            </div>

            <CodeBlock title="배지 헬퍼 함수" code={`const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
    case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
  }
}

// 사용
<span className={\`px-2 py-0.5 text-xs rounded-full \${getStatusColor('completed')}\`}>
  완료
</span>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 7. Color System Section */}
      <Section id="colors" title="7. 색상 시스템 (Color System)" icon={Palette}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Tailwind 색상 팔레트</CardTitle>
            <CardDescription>프로젝트에서 사용하는 주요 색상</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Semantic Colors */}
            <div>
              <Label className="mb-3 block">시맨틱 색상</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">대기/경고 (Amber)</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-amber-100" title="bg-amber-100" />
                    <div className="w-8 h-8 rounded bg-amber-400" title="bg-amber-400" />
                    <div className="w-8 h-8 rounded bg-amber-600" title="bg-amber-600" />
                    <div className="w-8 h-8 rounded bg-amber-800" title="bg-amber-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">진행 중 (Blue)</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-blue-100" title="bg-blue-100" />
                    <div className="w-8 h-8 rounded bg-blue-400" title="bg-blue-400" />
                    <div className="w-8 h-8 rounded bg-blue-600" title="bg-blue-600" />
                    <div className="w-8 h-8 rounded bg-blue-800" title="bg-blue-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">완료/성공 (Emerald)</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-emerald-100" title="bg-emerald-100" />
                    <div className="w-8 h-8 rounded bg-emerald-400" title="bg-emerald-400" />
                    <div className="w-8 h-8 rounded bg-emerald-600" title="bg-emerald-600" />
                    <div className="w-8 h-8 rounded bg-emerald-800" title="bg-emerald-800" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">AI/특별 (Purple)</div>
                  <div className="flex gap-1">
                    <div className="w-8 h-8 rounded bg-purple-100" title="bg-purple-100" />
                    <div className="w-8 h-8 rounded bg-purple-400" title="bg-purple-400" />
                    <div className="w-8 h-8 rounded bg-purple-600" title="bg-purple-600" />
                    <div className="w-8 h-8 rounded bg-purple-800" title="bg-purple-800" />
                  </div>
                </div>
              </div>
            </div>

            {/* Card Background Colors */}
            <div>
              <Label className="mb-3 block">카드 배경색 패턴 (Light + Dark)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700">
                  <div className="font-medium">Input/Form</div>
                  <div className="text-slate-600 dark:text-slate-400">bg-white</div>
                  <div className="text-slate-600 dark:text-slate-400">dark:bg-slate-700</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="font-medium">Page BG</div>
                  <div className="text-slate-600 dark:text-slate-400">bg-slate-50</div>
                  <div className="text-slate-600 dark:text-slate-400">dark:bg-slate-900</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700">
                  <div className="font-medium">Card BG (표준)</div>
                  <div className="text-slate-600 dark:text-slate-400">bg-slate-100</div>
                  <div className="text-slate-600 dark:text-slate-400">dark:bg-slate-800</div>
                </div>
                <div className="p-3 rounded-lg bg-white/50 dark:bg-white/10">
                  <div className="font-medium">Icon Wrapper</div>
                  <div className="text-slate-600 dark:text-slate-400">bg-white/50</div>
                  <div className="text-slate-600 dark:text-slate-400">dark:bg-white/10</div>
                </div>
              </div>
            </div>

            <CodeBlock title="색상 패턴 규칙 (실제 프로젝트)" code={`// 카드 배경색 (통일)
className="bg-slate-100 dark:bg-slate-800"

// 아이콘 래퍼 배경
<div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
  <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
</div>

// Input 배경 (카드 내부)
className="bg-white dark:bg-slate-700"

// 배지 패턴
// Light: bg-{color}-100 text-{color}-700
// Dark: dark:bg-{color}-900/50 dark:text-{color}-400`} />
          </CardContent>
        </Card>
      </Section>

      {/* 8. Skeleton Loading Section */}
      <Section id="skeleton" title="8. 스켈레톤 로딩" icon={Loader2}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>스켈레톤 로딩 패턴</CardTitle>
            <CardDescription>데이터 로딩 중 표시되는 플레이스홀더</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stats Card Skeleton */}
            <div>
              <Label className="mb-3 block">통계 카드 스켈레톤</Label>
              <Card className="max-w-sm bg-slate-100 dark:bg-slate-700">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total AUM</CardTitle>
                  <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
                    <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between animate-pulse">
                    <div className="space-y-2">
                      <div className="h-7 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
                      <div className="h-3 w-20 bg-slate-200 dark:bg-slate-600 rounded" />
                    </div>
                    <div className="h-10 w-24 bg-slate-200 dark:bg-slate-600 rounded" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table Skeleton */}
            <div>
              <Label className="mb-3 block">테이블 스켈레톤</Label>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                      <th className="pb-3 pr-4 font-medium">Symbol</th>
                      <th className="pb-3 pr-4 font-medium">Fund Name</th>
                      <th className="pb-3 pr-4 font-medium">AUM</th>
                      <th className="pb-3 font-medium">ARR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...Array(3)].map((_, i) => (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-700 last:border-0 animate-pulse whitespace-nowrap">
                        <td className="py-3 pr-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                        <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                        <td className="py-3"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-600 rounded" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <CodeBlock title="스켈레톤 패턴" code={`// 통계 카드 스켈레톤
{isLoading ? (
  <div className="flex items-end justify-between animate-pulse">
    <div className="space-y-2">
      <div className="h-7 w-28 bg-slate-300 dark:bg-slate-600 rounded" />
      <div className="h-3 w-20 bg-slate-200 dark:bg-slate-600 rounded" />
    </div>
    <div className="h-10 w-24 bg-slate-200 dark:bg-slate-600 rounded" />
  </div>
) : (
  // 실제 데이터
)}

// 테이블 스켈레톤
{[...Array(5)].map((_, i) => (
  <tr key={i} className="border-b border-slate-200 dark:border-slate-700 last:border-0 animate-pulse whitespace-nowrap">
    <td className="py-3 pr-4"><div className="h-4 w-16 bg-slate-200 dark:bg-slate-600 rounded" /></td>
    <td className="py-3 pr-4"><div className="h-4 w-32 bg-slate-200 dark:bg-slate-600 rounded" /></td>
  </tr>
))}`} />
          </CardContent>
        </Card>
      </Section>

      {/* 9. Layout Section */}
      <Section id="layout" title="9. 레이아웃 (Layout)" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>레이아웃 패턴</CardTitle>
            <CardDescription>반응형 레이아웃, 그리드 시스템</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Responsive Breakpoints */}
            <div>
              <Label className="mb-3 block">반응형 브레이크포인트</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono font-medium text-blue-600 dark:text-blue-400">sm:</div>
                  <div className="text-slate-500">640px 이상</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono font-medium text-green-600 dark:text-green-400">md:</div>
                  <div className="text-slate-500">768px 이상</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono font-medium text-amber-600 dark:text-amber-400">lg:</div>
                  <div className="text-slate-500">1024px 이상</div>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-1">
                  <div className="font-mono font-medium text-purple-600 dark:text-purple-400">xl:</div>
                  <div className="text-slate-500">1280px 이상</div>
                </div>
              </div>
            </div>

            {/* Overflow Handling */}
            <div>
              <Label className="mb-3 block">오버플로우 처리 (매우 중요)</Label>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-2">
                    <div className="text-xs font-medium text-red-600 dark:text-red-400">잘못된 예시</div>
                    <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-sm">아주아주아주아주긴텍스트가있으면레이아웃이깨집니다</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-700 space-y-2">
                    <div className="text-xs font-medium text-green-600 dark:text-green-400">올바른 예시 (truncate)</div>
                    <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded min-w-0">
                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm truncate">아주아주아주아주긴텍스트가있으면레이아웃이깨집니다</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                    <code className="text-blue-700 dark:text-blue-300">min-w-0</code>
                    <p className="text-slate-500 mt-1">flex 컨테이너에 필수</p>
                  </div>
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                    <code className="text-blue-700 dark:text-blue-300">truncate</code>
                    <p className="text-slate-500 mt-1">텍스트 말줄임</p>
                  </div>
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                    <code className="text-blue-700 dark:text-blue-300">flex-shrink-0</code>
                    <p className="text-slate-500 mt-1">아이콘/버튼에 적용</p>
                  </div>
                  <div className="p-2 rounded bg-blue-50 dark:bg-blue-900/20">
                    <code className="text-blue-700 dark:text-blue-300">whitespace-nowrap</code>
                    <p className="text-slate-500 mt-1">테이블 셀에 적용</p>
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock title="레이아웃 패턴" code={`// 페이지 기본 구조
<div className="space-y-6">
  {/* Stats Cards */}
  <div className="grid gap-4 md:grid-cols-3">...</div>

  {/* Table Card */}
  <Card className="bg-slate-100 dark:bg-slate-800">...</Card>
</div>

// 오버플로우 처리 (필수!)
<div className="flex items-center gap-2 min-w-0">
  <Icon className="flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>

// 모바일/데스크탑 조건부 표시
<span className="sm:hidden">짧게</span>
<span className="hidden sm:inline">길게 설명</span>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 10. UI Patterns Section */}
      <Section id="patterns" title="10. UI 패턴 (UI Patterns)" icon={Code2}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>공통 UI 패턴</CardTitle>
            <CardDescription>반복적으로 사용되는 UI 패턴</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Loading Spinner */}
            <div>
              <Label className="mb-3 block">로딩 스피너</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center p-4 bg-white dark:bg-slate-700 rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
                <div className="text-sm text-slate-500">
                  <code>&lt;Loader2 className="h-8 w-8 animate-spin" /&gt;</code>
                </div>
              </div>
            </div>

            {/* Expandable Item */}
            <div>
              <Label className="mb-3 block">확장/축소 아이템</Label>
              <div className="max-w-md space-y-2">
                <div className="p-3 rounded-lg bg-white dark:bg-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('high')}`}>높음</span>
                      <span className="font-medium text-sm">축소된 아이템</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPriorityColor('medium')}`}>보통</span>
                      <span className="font-medium text-sm">확장된 아이템</span>
                    </div>
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="pl-2 text-sm text-slate-600 dark:text-slate-400">
                    상세 내용이 여기에 표시됩니다...
                  </div>
                </div>
              </div>
            </div>

            {/* Pagination */}
            <div>
              <Label className="mb-3 block">페이지네이션</Label>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">총 45개 중 1-10</div>
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
              <div className="p-8 rounded-lg bg-white dark:bg-slate-700 text-center">
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

      {/* 11. Modal/Dialog Section */}
      <Section id="modals" title="11. 모달/다이얼로그" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Dialog 컴포넌트</CardTitle>
            <CardDescription>모달 다이얼로그 패턴</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-3 block">Dialog 미리보기 (static)</Label>
              <div className="p-4 rounded-lg bg-white dark:bg-slate-700">
                <div className="max-w-md mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">다이얼로그 제목</h3>
                    <p className="text-sm text-muted-foreground">다이얼로그 설명 텍스트</p>
                  </div>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">입력 필드</label>
                      <Input placeholder="값을 입력하세요" className="bg-white dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline">취소</Button>
                    <Button>저장</Button>
                  </div>
                </div>
              </div>
            </div>

            <CodeBlock title="Dialog 사용법" code={`<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>제목</DialogTitle>
      <DialogDescription>설명</DialogDescription>
    </DialogHeader>

    {/* 폼 내용 */}
    <div className="space-y-4">
      <Input placeholder="입력..." className="bg-white dark:bg-slate-700" />
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>
        취소
      </Button>
      <Button onClick={handleSave}>
        저장
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`} />
          </CardContent>
        </Card>
      </Section>

      {/* 12. Spacing Section */}
      <Section id="spacing" title="12. 간격 시스템" icon={Layout}>
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader>
            <CardTitle>Tailwind 간격 가이드</CardTitle>
            <CardDescription>일관된 간격 사용</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-2">
                <div className="font-medium">페이지 섹션 간격</div>
                <div className="text-slate-500">space-y-6</div>
              </div>
              <div className="space-y-2">
                <div className="font-medium">카드 그리드 간격</div>
                <div className="text-slate-500">gap-4</div>
              </div>
              <div className="space-y-2">
                <div className="font-medium">카드 내부 간격</div>
                <div className="text-slate-500">CardContent (px-6)</div>
              </div>
              <div className="space-y-2">
                <div className="font-medium">버튼/요소 간격</div>
                <div className="text-slate-500">gap-2</div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="mb-3 block">간격 예시</Label>
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
