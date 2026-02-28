'use client'

import { useState, useEffect } from 'react'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TiptapEditor, plainTextToHtml } from '@/components/ui/tiptap-editor'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { gmailService, ParsedEmail, EmailSyncStatus, OverallAnalysisResult, SavedTodo, SavedAnalysis } from '@/lib/gmail'
import type { Invoice, LineItem, InvoiceStatus, InvoiceItemType } from '@/lib/invoice'
import { ITEM_TEMPLATES, MONTH_NAMES, DEFAULT_CLIENT, formatInvoiceDate as formatInvoiceDateUtil, formatAmount } from '@/lib/invoice'
import {
  fetchETFDisplayData,
  createETFProduct,
  updateETFProduct,
  deleteETFProduct,
  fetchETFProducts,
  fetchHistoricalData,
  fetchETFDocuments,
  uploadETFDocument,
  getDocumentDownloadUrl,
  deleteETFDocument,
  ETFDisplayData,
  ETFProductInput,
  HistoricalDataPoint,
  ETFDocument,
  FeeStructure,
  FeeTier,
} from '@/lib/supabase-etf'
import {
  DollarSign,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Send,
  FileText,
  Mail,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Settings,
  Loader2,
  X,
  PiggyBank,
  Archive,
  Download,
  Upload,
  Reply,
  ReplyAll,
  Forward,
  Sparkles,
  ListTodo,
  AlertTriangle,
  BookOpen,
  Pin,
  StickyNote,
  Paperclip,
  Receipt,
  Check,
  Clock,
  Ban,
  Building,
  Search,
} from 'lucide-react'
import { useRef } from 'react'

// Extended invoice status type (includes partial sent states)
type ExtendedInvoiceStatus = InvoiceStatus | 'sent_etc' | 'sent_bank'

// Invoice status colors
const INVOICE_STATUS_COLORS: Record<ExtendedInvoiceStatus, { bg: string; text: string; icon: typeof Check }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', icon: FileText },
  sent_etc: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send },
  sent_bank: { bg: 'bg-amber-100', text: 'text-amber-700', icon: Send },
  sent: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: Send },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: Check },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
  cancelled: { bg: 'bg-slate-200', text: 'text-slate-500', icon: Ban },
}

// INVOICE_STATUS_LABELS는 컴포넌트 내부에서 t 객체를 사용하여 동적으로 생성됨
// getInvoiceStatusLabel(status, t) 함수 사용

// 실제 발송 상태 기반으로 effective status 계산
function getEffectiveInvoiceStatus(invoice: Invoice): ExtendedInvoiceStatus {
  if (invoice.status === 'paid' || invoice.status === 'cancelled' || invoice.status === 'overdue') {
    return invoice.status
  }
  // 둘 다 발송했으면 'sent'
  if (invoice.sent_to_etc_at && invoice.sent_to_bank_at) {
    return 'sent'
  }
  // ETC만 발송
  if (invoice.sent_to_etc_at) {
    return 'sent_etc'
  }
  // 은행만 발송
  if (invoice.sent_to_bank_at) {
    return 'sent_bank'
  }
  return 'draft'
}

function formatCurrency(value: number, currency: string = 'USD') {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value)
}

function formatAUM(value: number | null, currency: string = 'USD') {
  if (value === null) return '-'
  if (currency === 'USD') {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`
  return formatCurrency(value, currency)
}

function formatFlow(value: number | null, currency: string = 'USD') {
  if (value === null) return '-'
  const prefix = value >= 0 ? '+' : ''
  if (currency === 'USD') {
    if (Math.abs(value) >= 1000000) return `${prefix}$${(value / 1000000).toFixed(2)}M`
    if (Math.abs(value) >= 1000) return `${prefix}$${(value / 1000).toFixed(1)}K`
    return `${prefix}$${value.toFixed(0)}`
  }
  return `${prefix}${formatCurrency(value, currency)}`
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(dateString: string, t: ReturnType<typeof useI18n>['t']) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t.time.justNow
  if (diffMins < 60) return t.time.minutesAgo.replace('{minutes}', String(diffMins))
  if (diffHours < 24) return t.time.hoursAgo.replace('{hours}', String(diffHours))
  return t.time.daysAgo.replace('{days}', String(diffDays))
}

// HTML 엔티티 디코딩 (일반 텍스트용)
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

// HTML 콘텐츠 이중 인코딩 해제 (이메일 HTML용)
function decodeDoubleEncodedHtml(html: string): string {
  // &amp;lt; -> &lt; -> < 등의 이중 인코딩 처리
  let decoded = html
  // 이중 인코딩 패턴 감지 및 해제 (최대 2번 반복)
  for (let i = 0; i < 2; i++) {
    if (decoded.includes('&amp;')) {
      decoded = decoded
        .replace(/&amp;lt;/g, '&lt;')
        .replace(/&amp;gt;/g, '&gt;')
        .replace(/&amp;amp;/g, '&amp;')
        .replace(/&amp;quot;/g, '&quot;')
        .replace(/&amp;#39;/g, '&#39;')
        .replace(/&amp;nbsp;/g, '&nbsp;')
    }
  }
  return decoded
}

// 카테고리별 색상 자동 지정
const CATEGORY_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-300', button: 'bg-blue-500' },
  { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-300', button: 'bg-purple-500' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-300', button: 'bg-emerald-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-300', button: 'bg-amber-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900/50', text: 'text-rose-700 dark:text-rose-300', button: 'bg-rose-500' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-300', button: 'bg-cyan-500' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-300', button: 'bg-indigo-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-300', button: 'bg-orange-500' },
  { bg: 'bg-teal-100 dark:bg-teal-900/50', text: 'text-teal-700 dark:text-teal-300', button: 'bg-teal-500' },
  { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-700 dark:text-pink-300', button: 'bg-pink-500' },
]

function getCategoryColor(category: string, categories: string[]) {
  const index = categories.indexOf(category)
  if (index === -1) return CATEGORY_COLORS[0]
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}

// 스파크라인 차트 (범용)
interface SparklineData {
  date: string
  value: number
}

function Sparkline({ data, id }: { data: SparklineData[]; id: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (data.length < 2) return null

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const width = 100
  const height = 40
  const padding = 2

  const pointsArray = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = height - padding - ((d.value - min) / range) * (height - padding * 2)
    return { x, y, date: d.date, value: d.value }
  })

  const linePoints = pointsArray.map(p => `${p.x},${p.y}`).join(' ')

  // 그라데이션용 polygon points (라인 + 하단 닫기)
  const firstX = pointsArray[0].x
  const lastX = pointsArray[pointsArray.length - 1].x
  const areaPoints = `${linePoints} ${lastX},${height} ${firstX},${height}`

  // 트렌드 색상 결정 (첫 값 vs 마지막 값)
  const trend = values[values.length - 1] >= values[0] ? 'up' : 'down'
  const strokeColor = trend === 'up' ? '#10b981' : '#ef4444'
  const gradientUpId = `gradient-up-${id}`
  const gradientDownId = `gradient-down-${id}`
  const gradientId = trend === 'up' ? gradientUpId : gradientDownId

  const formatTooltipValue = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  // X축 기준 호버 - 마우스 위치에서 가장 가까운 데이터 포인트 찾기
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - rect.left

    // 가장 가까운 포인트 찾기
    let closestIndex = 0
    let closestDist = Math.abs(pointsArray[0].x - mouseX)

    for (let i = 1; i < pointsArray.length; i++) {
      const dist = Math.abs(pointsArray[i].x - mouseX)
      if (dist < closestDist) {
        closestDist = dist
        closestIndex = i
      }
    }

    setHoveredIndex(closestIndex)
  }

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        className="opacity-70 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientUpId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={gradientDownId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <polygon
          fill={`url(#${gradientId})`}
          points={areaPoints}
        />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          points={linePoints}
        />
        {/* 호버된 포인트 표시 */}
        {hoveredIndex !== null && (
          <>
            {/* 세로 가이드 라인 */}
            <line
              x1={pointsArray[hoveredIndex].x}
              y1={0}
              x2={pointsArray[hoveredIndex].x}
              y2={height}
              stroke={strokeColor}
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity={0.5}
            />
            <circle
              cx={pointsArray[hoveredIndex].x}
              cy={pointsArray[hoveredIndex].y}
              r={3}
              fill={strokeColor}
            />
          </>
        )}
      </svg>
      {/* 툴팁 */}
      {hoveredIndex !== null && (
        <div
          className="absolute bg-slate-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10"
          style={{
            left: Math.min(pointsArray[hoveredIndex].x, width - 60),
            top: -28,
          }}
        >
          {formatTooltipDate(pointsArray[hoveredIndex].date)}: {formatTooltipValue(pointsArray[hoveredIndex].value)}
        </div>
      )}
    </div>
  )
}

// ETF 추가/수정 모달
// 티어드 수수료 입력 컴포넌트
function TieredFeeInput({
  label,
  feeStructure,
  onChange,
  t,
}: {
  label: string
  feeStructure: FeeStructure
  onChange: (feeStructure: FeeStructure) => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const addTier = () => {
    const newTiers = [...feeStructure.tiers, { upTo: 0, bps: 0 }]
    onChange({ ...feeStructure, tiers: newTiers })
  }

  const removeTier = (index: number) => {
    const newTiers = feeStructure.tiers.filter((_, i) => i !== index)
    onChange({ ...feeStructure, tiers: newTiers })
  }

  const updateTier = (index: number, field: keyof FeeTier, value: number) => {
    const newTiers = [...feeStructure.tiers]
    newTiers[index] = { ...newTiers[index], [field]: value }
    onChange({ ...feeStructure, tiers: newTiers })
  }

  const formatThreshold = (value: number): string => {
    if (value === 0) return ''
    if (value >= 1000000000) return `${value / 1000000000}B`
    if (value >= 1000000) return `${value / 1000000}M`
    return String(value)
  }

  const parseThreshold = (input: string): number => {
    const cleaned = input.trim().toUpperCase()
    if (!cleaned) return 0

    const match = cleaned.match(/^([\d.]+)\s*([BMK])?$/)
    if (!match) return parseFloat(cleaned) || 0

    const num = parseFloat(match[1])
    const suffix = match[2]

    if (suffix === 'B') return num * 1000000000
    if (suffix === 'M') return num * 1000000
    if (suffix === 'K') return num * 1000
    return num
  }

  return (
    <div className="rounded-lg bg-slate-100 dark:bg-slate-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label}</label>
        <button
          type="button"
          onClick={addTier}
          className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700"
        >
          <Plus className="h-3 w-3" />
          {t.etf.form.addTier || '+ 티어 추가'}
        </button>
      </div>

      {/* Min Fee */}
      <div className="mb-3">
        <label className="block text-xs text-slate-500 mb-1">{t.etf.form.minFee}</label>
        <input
          type="number"
          value={feeStructure.minFee || ''}
          onChange={(e) => onChange({ ...feeStructure, minFee: parseFloat(e.target.value) || 0 })}
          className="w-full rounded-lg bg-white dark:bg-slate-600 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
          placeholder="e.g. 90000"
          step="1000"
        />
      </div>

      {/* Tiers */}
      {feeStructure.tiers.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 text-xs text-slate-500">
            <span className="flex-1">{t.etf.form.tierThreshold || 'Up To'}</span>
            <span className="w-16">{t.etf.form.tierBps || 'Bps'}</span>
            <span className="w-6"></span>
          </div>
          {feeStructure.tiers.map((tier, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                value={formatThreshold(tier.upTo)}
                onChange={(e) => updateTier(index, 'upTo', parseThreshold(e.target.value))}
                className="flex-1 min-w-0 rounded-lg bg-white dark:bg-slate-600 px-2 py-1.5 text-sm focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                placeholder={tier.upTo === 0 ? '∞' : 'e.g. 500M'}
              />
              <input
                type="number"
                value={tier.bps || ''}
                onChange={(e) => updateTier(index, 'bps', parseFloat(e.target.value) || 0)}
                className="w-16 rounded-lg bg-white dark:bg-slate-600 px-2 py-1.5 text-sm focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                placeholder="7"
                step="0.5"
              />
              <button
                type="button"
                onClick={() => removeTier(index)}
                className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-500 mt-1">
            {t.etf.form.tierHint || 'Use 0 or empty for unlimited. Supports M (million), B (billion).'}
          </p>
        </div>
      )}
    </div>
  )
}

function ETFModal({
  isOpen,
  onClose,
  onSave,
  editData,
  isSaving,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ETFProductInput) => void
  editData: ETFDisplayData | null
  isSaving: boolean
  t: ReturnType<typeof useI18n>['t']
}) {
  const [formData, setFormData] = useState<ETFProductInput>({
    symbol: '',
    fund_name: '',
    fund_url: '',
    listing_date: '',
    platform_fee_tiers: { minFee: 0, tiers: [] },
    pm_fee_tiers: { minFee: 0, tiers: [] },
    currency: 'USD',
    notes: '',
  })

  useEffect(() => {
    if (editData) {
      setFormData({
        symbol: editData.symbol,
        fund_name: editData.fundName,
        fund_url: editData.fundUrl || '',
        listing_date: editData.listingDate || '',
        platform_fee_tiers: editData.platformFeeTiers || { minFee: editData.platformMinFee, tiers: [] },
        pm_fee_tiers: editData.pmFeeTiers || { minFee: editData.pmMinFee, tiers: [] },
        currency: editData.currency,
        notes: editData.notes || '',
      })
    } else {
      setFormData({
        symbol: '',
        fund_name: '',
        fund_url: '',
        listing_date: '',
        platform_fee_tiers: { minFee: 0, tiers: [] },
        pm_fee_tiers: { minFee: 0, tiers: [] },
        currency: 'USD',
        notes: '',
      })
    }
  }, [editData, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 max-h-[90vh] flex flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold">{editData ? t.etf.editEtf : t.etf.addEtf}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
          {/* Row 1: Symbol + Fund Name */}
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.symbol} *</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none disabled:opacity-50"
                placeholder={t.etf.form.symbolPlaceholder}
                disabled={!!editData}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.fundName} *</label>
              <input
                type="text"
                value={formData.fund_name}
                onChange={(e) => setFormData({ ...formData, fund_name: e.target.value })}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
                placeholder={t.etf.form.fundNamePlaceholder}
              />
            </div>
          </div>

          {/* Row 2: Fund URL + Listing Date + Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_100px] gap-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.fundUrl}</label>
              <input
                type="url"
                value={formData.fund_url}
                onChange={(e) => setFormData({ ...formData, fund_url: e.target.value })}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.listingDate}</label>
              <input
                type="date"
                value={formData.listing_date}
                onChange={(e) => setFormData({ ...formData, listing_date: e.target.value })}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.currency}</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
              >
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
          </div>

          {/* Row 3: Platform Fee + PM Fee (2 columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TieredFeeInput
              label={t.etf.form.platform}
              feeStructure={formData.platform_fee_tiers || { minFee: 0, tiers: [] }}
              onChange={(feeStructure) => setFormData({ ...formData, platform_fee_tiers: feeStructure })}
              t={t}
            />
            <TieredFeeInput
              label={t.etf.form.pm}
              feeStructure={formData.pm_fee_tiers || { minFee: 0, tiers: [] }}
              onChange={(feeStructure) => setFormData({ ...formData, pm_fee_tiers: feeStructure })}
              t={t}
            />
          </div>

          {/* Row 4: Notes (full width) */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.etf.form.notes}</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(formData)}
            disabled={isSaving || !formData.symbol || !formData.fund_name}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.common.save}
          </Button>
        </div>
      </div>
    </div>
  )
}

// 문서 관리 모달
function DocumentModal({
  isOpen,
  onClose,
  etf,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  etf: ETFDisplayData | null
  t: ReturnType<typeof useI18n>['t']
}) {
  const [documents, setDocuments] = useState<ETFDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 문서 목록 로드
  const loadDocuments = async () => {
    if (!etf) return
    setIsLoading(true)
    try {
      const docs = await fetchETFDocuments(etf.symbol)
      setDocuments(docs)
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && etf) {
      loadDocuments()
    }
  }, [isOpen, etf])

  // 파일 업로드
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !etf) return

    setIsUploading(true)
    try {
      const result = await uploadETFDocument(etf.symbol, file)
      if (result.success) {
        await loadDocuments()
      } else {
        alert(t.documents.uploadFailed.replace('{error}', result.error || ''))
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert(t.documents.uploadError)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 파일 다운로드
  const handleDownload = async (fileName: string) => {
    if (!etf) return
    setDownloadingFile(fileName)
    try {
      const url = await getDocumentDownloadUrl(etf.symbol, fileName)
      if (url) {
        window.open(url, '_blank')
      } else {
        alert(t.documents.downloadFailed)
      }
    } catch (error) {
      console.error('Download error:', error)
    } finally {
      setDownloadingFile(null)
    }
  }

  // 파일 삭제
  const handleDelete = async (fileName: string) => {
    if (!etf || !confirm(t.documents.confirmDelete.replace('{fileName}', fileName))) return

    try {
      const success = await deleteETFDocument(etf.symbol, fileName)
      if (success) {
        await loadDocuments()
      } else {
        alert(t.documents.deleteFailed)
      }
    } catch (error) {
      console.error('Delete error:', error)
    }
  }

  // 파일 크기 포맷
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  if (!isOpen || !etf) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{t.documents.title.replace('{symbol}', etf.symbol)}</h3>
            <p className="text-sm text-muted-foreground">{etf.fundName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 업로드 버튼 */}
        <div className="mb-4">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.documents.uploading}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {t.documents.upload}
              </>
            )}
          </label>
        </div>

        {/* 문서 목록 */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-muted-foreground">{t.common.loading}</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t.documents.noDocuments}</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.fullPath}
                className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700 p-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={doc.name}>
                      {doc.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(doc.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(doc.name)}
                    disabled={downloadingFile === doc.name}
                    className="rounded p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                    title={t.etf.actions.download}
                  >
                    {downloadingFile === doc.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(doc.name)}
                    className="rounded p-1.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                    title={t.common.delete}
                  >
                    <Trash2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 닫기 버튼 */}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-lg border dark:border-slate-600 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {t.documents.close}
          </button>
        </div>
      </div>
    </div>
  )
}

// 이메일 상세 모달
function EmailDetailModal({
  email,
  onClose,
  onReply,
  categories,
  t,
}: {
  email: ParsedEmail | null
  onClose: () => void
  onReply?: (mode: 'reply' | 'replyAll' | 'forward') => void
  categories: string[]
  t: ReturnType<typeof useI18n>['t']
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // iframe에 HTML 콘텐츠 로드
  useEffect(() => {
    if (email?.bodyHtml && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument
      if (doc) {
        doc.open()
        // 이중 인코딩된 HTML 엔티티 해제
        const decodedHtml = decodeDoubleEncodedHtml(email.bodyHtml)
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <base target="_blank">
            <style>
              * { box-sizing: border-box; }
              html, body {
                margin: 0;
                padding: 0;
                height: 100%;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: #333;
                padding: 16px;
                word-wrap: break-word;
                overflow-wrap: break-word;
                overflow-y: auto;
              }
              img { max-width: 100%; height: auto; display: block; }
              a { color: #0066cc; }
              table { max-width: 100%; border-collapse: collapse; }
              pre, code { white-space: pre-wrap; word-wrap: break-word; }
              blockquote { margin: 0 0 0 10px; padding-left: 10px; border-left: 2px solid #ccc; }
            </style>
          </head>
          <body>${decodedHtml}</body>
          </html>
        `)
        doc.close()
      }
    }
  }, [email?.bodyHtml])

  if (!email) return null

  const categoryColor = email.category ? getCategoryColor(email.category, categories) : null

  // 첨부파일 다운로드
  const handleDownloadAttachment = (attachment: { filename: string; mimeType: string; attachmentId: string }) => {
    const url = `/api/gmail/attachments/${email.id}/${attachment.attachmentId}?filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`
    window.open(url, '_blank')
  }

  // 파일 크기 포맷
  const formatAttachmentSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-800 h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-2">
              {email.category && categoryColor && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${categoryColor.bg} ${categoryColor.text}`}>
                  {email.category}
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                email.direction === 'outbound' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {email.direction === 'outbound' ? t.gmail.outbound : t.gmail.inbound}
              </span>
            </div>
            <h3 className="text-lg font-semibold break-words">{email.subject || t.gmail.noSubject}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Meta info */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 text-sm space-y-1 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex">
            <span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.from}:</span>
            <span className="font-medium break-all">{email.fromName || email.from}</span>
          </div>
          <div className="flex">
            <span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.to}:</span>
            <span className="break-all">{email.to}</span>
          </div>
          <div className="flex">
            <span className="w-20 text-muted-foreground flex-shrink-0">{t.gmail.date}:</span>
            <span>{formatDate(email.date)}</span>
          </div>
        </div>

        {/* Attachments */}
        {email.hasAttachments && email.attachments.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <span className="text-sm font-medium">{email.attachments.length} {t.gmail.attachments}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {email.attachments.map((attachment, idx) => (
                <button
                  key={idx}
                  onClick={() => handleDownloadAttachment(attachment)}
                  className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  <Download className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  <span className="max-w-[200px] truncate">{attachment.filename}</span>
                  <span className="text-xs text-muted-foreground">({formatAttachmentSize(attachment.size)})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body - 스크롤 가능한 영역 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {email.bodyHtml ? (
            <iframe
              ref={iframeRef}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-popups"
              title="Email content"
            />
          ) : (
            <div className="p-4 h-full overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm font-sans">{decodeHtmlEntities(email.body || email.snippet)}</pre>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => onReply && onReply('reply')}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500"
            >
              <Reply className="h-4 w-4" />
              {t.gmail.reply}
            </button>
            <button
              onClick={() => onReply && onReply('replyAll')}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <ReplyAll className="h-4 w-4" />
              {t.gmail.replyAll}
            </button>
            <button
              onClick={() => onReply && onReply('forward')}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <Forward className="h-4 w-4" />
              {t.gmail.forward}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 이메일 작성 타입
type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeEmailData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

// 이메일 작성 모달
function ComposeEmailModal({
  isOpen,
  onClose,
  mode,
  originalEmail,
  initialData,
  initialAttachments,
  onSendSuccess,
  t,
}: {
  isOpen: boolean
  onClose: () => void
  mode: ComposeMode
  originalEmail: ParsedEmail | null
  initialData?: Partial<ComposeEmailData>
  initialAttachments?: File[]
  onSendSuccess?: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  const [formData, setFormData] = useState<ComposeEmailData>({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
  })
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 모달이 열릴 때 폼 초기화
  useEffect(() => {
    if (isOpen && originalEmail) {
      const replyPrefix = mode === 'forward' ? 'Fwd: ' : 'Re: '
      const subjectHasPrefix = originalEmail.subject.startsWith('Re:') || originalEmail.subject.startsWith('Fwd:')
      const newSubject = subjectHasPrefix ? originalEmail.subject : replyPrefix + originalEmail.subject

      // 인용 본문 생성
      const quotedBody = `\n\n-------- Original Message --------\nFrom: ${originalEmail.fromName || originalEmail.from}\nDate: ${originalEmail.date}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body || originalEmail.snippet}`

      if (mode === 'reply') {
        setFormData({
          to: originalEmail.from,
          cc: '',
          bcc: '',
          subject: newSubject,
          body: quotedBody,
        })
      } else if (mode === 'replyAll') {
        // Reply All: 원래 발신자 + CC에 있던 모든 수신자
        const allRecipients = [originalEmail.from]
        if (originalEmail.to) {
          // 자신의 이메일은 제외하고 추가 (to 필드에 있던 다른 사람들)
          const toList = originalEmail.to.split(',').map(e => e.trim()).filter(e => e)
          allRecipients.push(...toList)
        }
        setFormData({
          to: originalEmail.from,
          cc: allRecipients.slice(1).join(', '),
          bcc: '',
          subject: newSubject,
          body: quotedBody,
        })
      } else if (mode === 'forward') {
        setFormData({
          to: '',
          cc: '',
          bcc: '',
          subject: newSubject,
          body: quotedBody,
        })
      }
    } else if (isOpen && mode === 'new') {
      setFormData({
        to: initialData?.to || '',
        cc: initialData?.cc || '',
        bcc: initialData?.bcc || '',
        subject: initialData?.subject || '',
        body: initialData?.body || '',
      })
      setAttachments(initialAttachments || [])
      setError(null)
      return
    }
    setAttachments([])
    setError(null)
  }, [isOpen, mode, originalEmail, initialData, initialAttachments])

  // 파일 선택 핸들러
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setAttachments(prev => [...prev, ...Array.from(files)])
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 파일 제거 핸들러
  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // 파일 크기 포맷
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const handleSend = async () => {
    if (!formData.to.trim()) {
      setError(t.gmail.errorNoRecipient)
      return
    }
    if (!formData.subject.trim()) {
      setError(t.gmail.errorNoSubject)
      return
    }

    setIsSending(true)
    setError(null)

    try {
      const result = await gmailService.sendEmail({
        to: formData.to,
        subject: formData.subject,
        body: formData.body,
        cc: formData.cc || undefined,
        bcc: formData.bcc || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      })

      if (result.success) {
        onSendSuccess?.()
        onClose()
      } else {
        setError(result.error || t.gmail.sendFailed)
      }
    } catch (err) {
      setError(t.gmail.sendFailed)
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

  const getTitle = () => {
    switch (mode) {
      case 'reply': return t.gmail.reply
      case 'replyAll': return t.gmail.replyAll
      case 'forward': return t.gmail.forward
      default: return t.gmail.newEmail
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 max-h-[90vh] flex flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold">{getTitle()}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1 -mx-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.gmail.to} *</label>
            <input
              type="email"
              value={formData.to}
              onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.gmail.cc}</label>
            <input
              type="text"
              value={formData.cc}
              onChange={(e) => setFormData({ ...formData, cc: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="cc@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.gmail.bcc}</label>
            <input
              type="text"
              value={formData.bcc}
              onChange={(e) => setFormData({ ...formData, bcc: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="bcc@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.gmail.subject} *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder={t.gmail.subjectPlaceholder}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">{t.gmail.body}</label>
            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm min-h-[200px] font-mono"
              placeholder={t.gmail.bodyPlaceholder}
            />
          </div>

          {/* 첨부파일 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500">{t.gmail.attachments}</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="compose-file-input"
              />
              <label
                htmlFor="compose-file-input"
                className="flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                {t.gmail.addAttachment}
              </label>
            </div>
            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-700 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({formatFileSize(file.size)})
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveAttachment(index)}
                      className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 flex-shrink-0"
                    >
                      <X className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t.gmail.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ETCPage() {
  const { t, language } = useI18n()
  const locale = language === 'ko' ? 'ko-KR' : 'en-US'

  // 인보이스 상태 라벨 헬퍼 함수
  const getInvoiceStatusLabel = (status: ExtendedInvoiceStatus): string => {
    const labels: Record<ExtendedInvoiceStatus, string> = {
      draft: t.invoice.status.draft,
      sent_etc: t.invoice.status.sent_etc,
      sent_bank: t.invoice.status.sent_bank,
      sent: t.invoice.status.sent,
      paid: t.invoice.status.paid,
      overdue: t.invoice.status.overdue,
      cancelled: t.invoice.status.cancelled,
    }
    return labels[status]
  }

  const [etfs, setEtfs] = useState<ETFDisplayData[]>([])
  const [isLoadingETFs, setIsLoadingETFs] = useState(true)
  const [emailFilter, setEmailFilter] = useState<string>('all')  // 'all' 또는 카테고리명
  const [emailSearch, setEmailSearch] = useState('')  // 이메일 검색어
  const [availableCategories, setAvailableCategories] = useState<string[]>([])  // 사용 가능한 카테고리 목록
  const [relatedEmailIds, setRelatedEmailIds] = useState<string[]>([])  // 관련 이메일 ID 필터
  const [emailPage, setEmailPage] = useState(1)  // 이메일 페이지네이션
  const [emailsPerPage, setEmailsPerPage] = useState(5)  // 페이지당 이메일 수

  // 인보이스 상태
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [invoicePage, setInvoicePage] = useState(1)
  const INVOICES_PER_PAGE = 5
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [isSavingInvoice, setIsSavingInvoice] = useState(false)
  const [isSendingInvoice, setIsSendingInvoice] = useState<{ id: string; type: 'etc' | 'bank' } | null>(null)

  // 인보이스 생성 폼 상태
  const [invoiceFormDate, setInvoiceFormDate] = useState('')
  const [invoiceFormAttention, setInvoiceFormAttention] = useState<string>(DEFAULT_CLIENT.attention)
  const [invoiceFormNotes, setInvoiceFormNotes] = useState('')
  // 다중 항목 지원
  interface InvoiceFormItem {
    id: string
    itemType: InvoiceItemType
    month: number
    year: number
    customDesc: string
    amount: string
  }
  const createEmptyItem = (): InvoiceFormItem => ({
    id: crypto.randomUUID(),
    itemType: 'monthly_fee',
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    customDesc: '',
    amount: '',
  })
  const [invoiceFormItems, setInvoiceFormItems] = useState<InvoiceFormItem[]>([createEmptyItem()])

  // Modal 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingETF, setEditingETF] = useState<ETFDisplayData | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 문서 모달 상태
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [documentETF, setDocumentETF] = useState<ETFDisplayData | null>(null)

  // Gmail 관련 상태
  const [emails, setEmails] = useState<ParsedEmail[]>([])
  const [selectedEmail, setSelectedEmail] = useState<ParsedEmail | null>(null)
  const [syncStatus, setSyncStatus] = useState<EmailSyncStatus>({
    lastSyncAt: null,
    totalEmails: 0,
    newEmailsCount: 0,
    isConnected: false,
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [showGmailSettings, setShowGmailSettings] = useState(false)
  const [gmailLabel, setGmailLabel] = useState('ETC')
  const [labelInput, setLabelInput] = useState('ETC')
  const [isConnecting, setIsConnecting] = useState(false)

  // 이메일 작성 모달 상태
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeMode, setComposeMode] = useState<'new' | 'reply' | 'replyAll' | 'forward'>('new')
  const [composeOriginalEmail, setComposeOriginalEmail] = useState<ParsedEmail | null>(null)
  const [composeInitialData, setComposeInitialData] = useState<Partial<ComposeEmailData> | undefined>(undefined)
  const [composeInitialAttachments, setComposeInitialAttachments] = useState<File[] | undefined>(undefined)
  const [pendingInvoiceSend, setPendingInvoiceSend] = useState<{ invoiceId: string; recipientType: 'etc' | 'bank' } | null>(null)

  // AI 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<OverallAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showAiAnalysis, setShowAiAnalysis] = useState(false)
  const [savedTodos, setSavedTodos] = useState<SavedTodo[]>([])
  const [savedAnalysis, setSavedAnalysis] = useState<SavedAnalysis | null>(null)
  const [categorySlideIndex, setCategorySlideIndex] = useState(0)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // AI 컨텍스트 설정 상태
  const [aiContextText, setAiContextText] = useState('')
  const [aiContextEnabled, setAiContextEnabled] = useState(true)
  const [isSavingAiContext, setIsSavingAiContext] = useState(false)
  const [showAiContextSettings, setShowAiContextSettings] = useState(false)

  // 히스토리컬 데이터
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([])

  // 업무 위키 상태
  interface WikiAttachment {
    name: string
    url: string
    size: number
    type: string
  }

  interface WikiNote {
    id: string
    user_id: string
    section: string
    title: string
    content: string
    category: string | null
    is_pinned: boolean
    attachments: WikiAttachment[] | null
    created_at: string
    updated_at: string
  }
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [isLoadingWiki, setIsLoadingWiki] = useState(true)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNote, setEditingNote] = useState<WikiNote | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteFiles, setNewNoteFiles] = useState<File[]>([])
  const [isDraggingWiki, setIsDraggingWiki] = useState(false)
  const [isUploadingWiki, setIsUploadingWiki] = useState(false)
  const [wikiSearch, setWikiSearch] = useState('')
  const [wikiPage, setWikiPage] = useState(1)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const WIKI_PER_PAGE = 5

  // ETF 데이터 로드
  const loadETFData = async () => {
    setIsLoadingETFs(true)
    try {
      const data = await fetchETFDisplayData('ETC')
      setEtfs(data)

      // 히스토리컬 데이터 로드
      const products = await fetchETFProducts('ETC')
      const historical = await fetchHistoricalData(products, 180)
      setHistoricalData(historical)
    } catch (error) {
      console.error('Failed to load ETF data:', error)
    } finally {
      setIsLoadingETFs(false)
    }
  }

  useEffect(() => {
    loadETFData()
  }, [])

  // 총 AUM 계산
  const totalAUM = etfs.reduce((sum, etf) => sum + (etf.aum || 0), 0)
  const totalMonthlyFee = etfs.reduce((sum, etf) => sum + etf.totalMonthlyFee, 0) + 2083.33
  const totalRemainingFee = etfs.reduce((sum, etf) => sum + (etf.remainingFee || 0), 0)

  // ETF 저장 (추가/수정)
  const handleSaveETF = async (data: ETFProductInput) => {
    setIsSaving(true)
    try {
      if (editingETF) {
        await updateETFProduct(editingETF.id, data)
      } else {
        await createETFProduct({ ...data, bank: 'ETC' })
      }
      await loadETFData()
      setIsModalOpen(false)
      setEditingETF(null)
    } catch (error) {
      console.error('Failed to save ETF:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // ETF 삭제
  const handleDeleteETF = async (etf: ETFDisplayData) => {
    if (!confirm(t.etf.confirmDelete.replace('{symbol}', etf.symbol))) return

    try {
      await deleteETFProduct(etf.id)
      await loadETFData()
    } catch (error) {
      console.error('Failed to delete ETF:', error)
    }
  }

  // 인보이스 함수들
  const loadInvoices = async () => {
    setIsLoadingInvoices(true)
    try {
      const res = await fetch('/api/invoices')
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
      }
    } catch (error) {
      console.error('Failed to load invoices:', error)
    } finally {
      setIsLoadingInvoices(false)
    }
  }

  const resetInvoiceForm = () => {
    setInvoiceFormDate(new Date().toISOString().split('T')[0])
    setInvoiceFormAttention(DEFAULT_CLIENT.attention)
    setInvoiceFormNotes('')
    setInvoiceFormItems([createEmptyItem()])
    setEditingInvoice(null)
  }

  const openNewInvoiceModal = () => {
    resetInvoiceForm()
    setIsInvoiceModalOpen(true)
  }

  const startEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice)
    setInvoiceFormDate(invoice.invoice_date)
    setInvoiceFormAttention(invoice.attention)
    setInvoiceFormNotes(invoice.notes || '')
    // line_items를 form items로 변환
    const formItems: InvoiceFormItem[] = (invoice.line_items as LineItem[]).map(item => ({
      id: crypto.randomUUID(),
      itemType: 'custom' as InvoiceItemType,
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
      customDesc: item.description,
      amount: String(item.amount),
    }))
    setInvoiceFormItems(formItems.length > 0 ? formItems : [createEmptyItem()])
    setExpandedInvoice(invoice.id)
    setIsInvoiceModalOpen(true)
  }

  const getItemDescription = (item: InvoiceFormItem): string => {
    if (item.itemType === 'custom') {
      return item.customDesc
    }
    const template = ITEM_TEMPLATES.find(t => t.type === item.itemType)
    if (!template) return ''
    return template.descriptionTemplate
      .replace('{month}', MONTH_NAMES[item.month])
      .replace('{year}', String(item.year))
  }

  const updateFormItem = (id: string, updates: Partial<InvoiceFormItem>) => {
    setInvoiceFormItems(items => items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }

  const addFormItem = () => {
    setInvoiceFormItems(items => [...items, createEmptyItem()])
  }

  const removeFormItem = (id: string) => {
    setInvoiceFormItems(items => items.filter(item => item.id !== id))
  }

  const handleSaveInvoice = async () => {
    if (!invoiceFormDate) {
      alert('날짜를 입력해주세요.')
      return
    }

    // Validate all items
    const lineItems: LineItem[] = []
    for (const item of invoiceFormItems) {
      const amount = parseFloat(item.amount)
      if (isNaN(amount) || amount <= 0) {
        alert('모든 항목의 금액을 올바르게 입력해주세요.')
        return
      }
      const description = getItemDescription(item)
      if (!description) {
        alert('모든 항목의 설명을 입력해주세요.')
        return
      }
      lineItems.push({
        description,
        qty: null,
        unitPrice: null,
        amount,
      })
    }

    if (lineItems.length === 0) {
      alert('최소 하나의 항목을 추가해주세요.')
      return
    }

    setIsSavingInvoice(true)
    try {
      const payload = {
        invoice_date: invoiceFormDate,
        attention: invoiceFormAttention,
        line_items: lineItems,
        notes: invoiceFormNotes || undefined,
      }

      const isEditing = !!editingInvoice
      const url = isEditing ? `/api/invoices/${editingInvoice.id}` : '/api/invoices'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setIsInvoiceModalOpen(false)
        resetInvoiceForm()
        await loadInvoices()
      } else {
        const err = await res.json()
        console.error('Save failed:', err.error)
        alert(t.invoice.saveFailed)
      }
    } catch (error) {
      console.error('Failed to save invoice:', error)
      alert(t.invoice.saveFailed)
    } finally {
      setIsSavingInvoice(false)
    }
  }

  const handleDownloadPdf = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'invoice.pdf'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        alert(t.invoice.downloadFailed)
      }
    } catch (error) {
      console.error('Failed to download PDF:', error)
      alert(t.invoice.downloadFailed)
    }
  }

  const handleSendInvoice = async (invoiceId: string, recipientType: 'etc' | 'bank') => {
    // Find the invoice to get details
    const invoice = invoices.find(inv => inv.id === invoiceId)
    if (!invoice) return

    setIsSendingInvoice({ id: invoiceId, type: recipientType })
    try {
      // Fetch the PDF
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
      if (!res.ok) {
        alert(t.invoice.pdfFailed)
        return
      }

      const blob = await res.blob()
      const filename = `Willow_Invoice_${invoice.invoice_no.replace('#', '')}_${invoice.invoice_date.replace(/-/g, '')}.pdf`
      const pdfFile = new File([blob], filename, { type: 'application/pdf' })

      // Prepare email content based on recipient type
      let emailTo: string
      let emailSubject: string
      let emailBody: string

      // Get item name from first line item
      const itemName = invoice.line_items?.[0]?.description || 'services'

      if (recipientType === 'etc') {
        emailTo = 'kyle@exchangetradedconcepts.com'
        emailSubject = `Willow Investments - ${itemName}`
        emailBody = `Hi Kyle,

Attached is my invoice for the ${itemName}.

Please let me know once the payment is made so I can inform my bank.

Thank you.


Best,

Dongwook`
      } else {
        emailTo = 'ysjmto@shinhan.com'
        emailSubject = `윌로우인베스트먼트 외화인보이스 - ${invoice.invoice_no}`
        emailBody = `안녕하세요.

당사 추가 외화 인보이스 첨부와 같이 보내 드립니다.

이에 확인 부탁 드립니다.

감사합니다.

김동욱 드림 (010-9629-1025)`
      }

      // Set initial compose data and open modal
      setComposeInitialData({
        to: emailTo,
        cc: recipientType === 'etc' ? 'accounting@exchangetradedconcepts.com' : '',
        subject: emailSubject,
        body: emailBody,
      })
      setComposeInitialAttachments([pdfFile])
      setPendingInvoiceSend({ invoiceId, recipientType })
      setComposeMode('new')
      setComposeOriginalEmail(null)
      setIsComposeOpen(true)
    } catch (error) {
      console.error('Failed to prepare invoice email:', error)
      alert(t.invoice.emailFailed)
    } finally {
      setIsSendingInvoice(null)
    }
  }

  // 인보이스 이메일 발송 성공 시 상태 업데이트
  const handleInvoiceEmailSent = async () => {
    if (!pendingInvoiceSend) return

    const { invoiceId, recipientType } = pendingInvoiceSend
    const now = new Date().toISOString()

    try {
      const updateData: Record<string, string> = {}
      if (recipientType === 'etc') {
        updateData.sent_to_etc_at = now
      } else {
        updateData.sent_to_bank_at = now
      }

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        await loadInvoices()
      }
    } catch (error) {
      console.error('Failed to update invoice status:', error)
    } finally {
      setPendingInvoiceSend(null)
    }
  }

  const handleUpdateInvoiceStatus = async (invoiceId: string, status: InvoiceStatus) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (res.ok) {
        await loadInvoices()
      }
    } catch (error) {
      console.error('Failed to update invoice status:', error)
    }
  }

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm(t.invoice.deleteConfirm)) return

    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await loadInvoices()
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error)
    }
  }

  // 인보이스 로드
  useEffect(() => {
    loadInvoices()
  }, [])

  // 업무 위키 함수들
  const loadWikiNotes = async () => {
    setIsLoadingWiki(true)
    try {
      const res = await fetch('/api/wiki?section=etf-etc')
      if (res.ok) {
        const data = await res.json()
        setWikiNotes(data)
      }
    } catch (error) {
      console.error('Failed to load wiki notes:', error)
    } finally {
      setIsLoadingWiki(false)
    }
  }

  const handleAddNote = async () => {
    // 제목, 내용, 파일 중 하나만 있어도 저장 가능
    if (!newNoteTitle.trim() && !newNoteContent.trim() && newNoteFiles.length === 0) return

    try {
      setIsUploadingWiki(true)
      let attachments: WikiAttachment[] | null = null

      // 파일이 있으면 먼저 업로드
      if (newNoteFiles.length > 0) {
        const formData = new FormData()
        newNoteFiles.forEach(file => formData.append('files', file))

        const uploadRes = await fetch('/api/wiki/upload', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}))
          console.error('File upload failed:', uploadRes.status, errorData)
          alert(`파일 업로드 실패: ${errorData.error || uploadRes.statusText}`)
          return
        }

        const uploadData = await uploadRes.json()
        attachments = uploadData.files
      }

      const res = await fetch('/api/wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'etf-etc',
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
          attachments,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Note creation failed:', res.status, errorData)
        alert(`메모 저장 실패: ${errorData.error || res.statusText}`)
        return
      }

      setNewNoteTitle('')
      setNewNoteContent('')
      setNewNoteFiles([])
      setIsAddingNote(false)
      await loadWikiNotes()
    } catch (error) {
      console.error('Failed to add wiki note:', error)
      alert(`저장 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleUpdateNote = async (note: WikiNote) => {
    try {
      setIsUploadingWiki(true)
      let attachments = note.attachments

      // 새 파일이 있으면 업로드
      if (newNoteFiles.length > 0) {
        const formData = new FormData()
        newNoteFiles.forEach(file => formData.append('files', file))

        const uploadRes = await fetch('/api/wiki/upload', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json().catch(() => ({}))
          alert(`파일 업로드 실패: ${errorData.error || uploadRes.statusText}`)
          return
        }
        const uploadData = await uploadRes.json()
        attachments = [...(attachments || []), ...uploadData.files]
      }

      const res = await fetch(`/api/wiki/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          content: note.content,
          attachments,
        }),
      })
      if (res.ok) {
        setEditingNote(null)
        setNewNoteFiles([])
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to update wiki note:', error)
    } finally {
      setIsUploadingWiki(false)
    }
  }

  const handleDeleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/wiki/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to delete wiki note:', error)
    }
  }

  const handleTogglePin = async (note: WikiNote) => {
    try {
      const res = await fetch(`/api/wiki/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !note.is_pinned }),
      })
      if (res.ok) {
        await loadWikiNotes()
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error)
    }
  }

  // 위키 노트 로드
  useEffect(() => {
    loadWikiNotes()
  }, [])

  // localStorage에서 라벨 불러오기
  useEffect(() => {
    const savedLabel = localStorage.getItem('gmail_label_etf_etc')
    if (savedLabel) {
      setGmailLabel(savedLabel)
      setLabelInput(savedLabel)
    }
  }, [])

  // Gmail 초기화
  useEffect(() => {
    const initGmail = async () => {
      const isConnected = await gmailService.checkConnection()
      setSyncStatus(prev => ({ ...prev, isConnected }))
      if (isConnected) {
        gmailService.startPolling(gmailLabel, 5 * 60 * 1000)
        await syncEmails()
        // 저장된 분석 로드
        await loadSavedAnalysis()
      }
    }
    initGmail()
    return () => {
      gmailService.stopPolling()
    }
  }, [gmailLabel])

  // 저장된 분석 로드
  const loadSavedAnalysis = async () => {
    try {
      const result = await gmailService.getSavedAnalysis(gmailLabel)
      if (result) {
        if (result.analysis) {
          setSavedAnalysis(result.analysis)
          setAiAnalysis(result.analysis.analysis_data)
          setCategorySlideIndex(0)
          setShowAiAnalysis(true)
          // 저장되지 않은 todos 동기화
          await syncUnsavedTodos(result.analysis.analysis_data, result.todos)
        }
        setSavedTodos(result.todos)
      }
    } catch (error) {
      console.error('Failed to load saved analysis:', error)
    }
  }

  const syncEmails = async () => {
    setIsSyncing(true)
    try {
      const result = await gmailService.fetchEmailsByLabel(gmailLabel)
      setEmails(result.emails)
      setAvailableCategories(result.categories)
      setSyncStatus(gmailService.getSyncStatus())
    } catch (error) {
      console.error('Failed to sync emails:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleGmailConnect = async () => {
    setIsConnecting(true)
    try {
      const authUrl = await gmailService.startAuth()
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to start Gmail auth:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleGmailDisconnect = async () => {
    if (!confirm(t.gmail.disconnectConfirm)) return
    await gmailService.disconnect()
    setSyncStatus(prev => ({ ...prev, isConnected: false }))
    setEmails([])
  }

  const handleLabelSave = () => {
    if (labelInput.trim()) {
      setGmailLabel(labelInput.trim())
      localStorage.setItem('gmail_label_etf_etc', labelInput.trim())
      setShowGmailSettings(false)
      syncEmails()
    }
  }

  // AI 컨텍스트 설정 로드
  const loadAiContextSettings = async () => {
    try {
      const res = await fetch('/api/gmail/context-settings')
      if (res.ok) {
        const data = await res.json()
        setAiContextText(data.context_text || '')
        setAiContextEnabled(data.is_enabled !== false)
      }
    } catch (error) {
      console.error('Failed to load AI context settings:', error)
    }
  }

  // AI 컨텍스트 설정 저장
  const handleSaveAiContext = async () => {
    setIsSavingAiContext(true)
    try {
      const res = await fetch('/api/gmail/context-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_text: aiContextText,
          is_enabled: aiContextEnabled,
        }),
      })
      if (res.ok) {
        setShowAiContextSettings(false)
      }
    } catch (error) {
      console.error('Failed to save AI context settings:', error)
    } finally {
      setIsSavingAiContext(false)
    }
  }

  // AI 컨텍스트 설정 로드 useEffect
  useEffect(() => {
    loadAiContextSettings()
  }, [])

  // AI 이메일 분석
  const handleAnalyzeEmails = async () => {
    if (!syncStatus.isConnected) return
    setIsAnalyzing(true)
    try {
      // Gemini로 분석
      const result = await gmailService.analyzeEmails(gmailLabel, 30)
      if (result) {
        setAiAnalysis(result)
        setCategorySlideIndex(0)
        setShowAiAnalysis(true)
        // 분석 결과 저장
        const savedResult = await gmailService.saveAnalysis(gmailLabel, result)
        if (savedResult) {
          setSavedAnalysis(savedResult.analysis)
          setSavedTodos(savedResult.todos)
          // 저장되지 않은 todos 추가 동기화
          await syncUnsavedTodos(result, savedResult.todos)
        }
      }
    } catch (error) {
      console.error('Failed to analyze emails:', error)
      alert(t.gmail.analysisError)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Todo 완료 상태 토글
  const handleTodoToggle = async (todoId: string, currentCompleted: boolean) => {
    try {
      const updated = await gmailService.toggleTodoCompleted(todoId, !currentCompleted)
      if (updated) {
        setSavedTodos(prev => prev.map(todo =>
          todo.id === todoId ? updated : todo
        ))
      }
    } catch (error) {
      console.error('Failed to toggle todo:', error)
    }
  }

  // AI 분석에서 생성된 todos를 DB에 동기화 (completed: false로 저장)
  const syncUnsavedTodos = async (analysisData: OverallAnalysisResult, currentSavedTodos: SavedTodo[]) => {
    const unsavedTodos: Array<{
      category: string
      task: string
      priority: 'high' | 'medium' | 'low'
      dueDate?: string
      relatedEmailIds?: string[]
    }> = []

    // 저장되지 않은 todos 찾기
    for (const cat of analysisData.categories || []) {
      for (const todo of cat.todos || []) {
        const existsInSaved = currentSavedTodos.some(
          st => st.category === cat.category && st.task === todo.task
        )
        if (!existsInSaved) {
          unsavedTodos.push({
            category: cat.category,
            task: todo.task,
            priority: todo.priority,
            dueDate: todo.dueDate,
            relatedEmailIds: todo.relatedEmailIds,
          })
        }
      }
    }

    // 저장되지 않은 todos를 DB에 저장
    if (unsavedTodos.length > 0) {
      const newSavedTodos: SavedTodo[] = []
      for (const todo of unsavedTodos) {
        try {
          const res = await fetch('/api/gmail/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: gmailLabel,
              category: todo.category,
              task: todo.task,
              priority: todo.priority,
              due_date: todo.dueDate,
              related_email_ids: todo.relatedEmailIds,
              completed: false,
            }),
          })
          if (res.ok) {
            const created = await res.json()
            newSavedTodos.push(created)
          }
        } catch (error) {
          console.error('Failed to sync todo:', error)
        }
      }
      if (newSavedTodos.length > 0) {
        setSavedTodos(prev => [...prev, ...newSavedTodos])
      }
    }
  }

  // 우선순위 색상
  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-amber-100 text-amber-700'
      case 'low': return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
    }
  }

  const getPriorityLabel = (priority: 'high' | 'medium' | 'low') => {
    return t.gmail.priority[priority]
  }

  // 관련 이메일 필터 적용 (최우선)
  const relatedFilteredEmails = relatedEmailIds.length > 0
    ? emails.filter((email) => relatedEmailIds.includes(email.id))
    : emails

  // 카테고리 필터 적용
  const categoryFilteredEmails = emailFilter === 'all'
    ? relatedFilteredEmails
    : relatedFilteredEmails.filter((email) => email.category === emailFilter)

  // 검색 필터 적용
  const filteredEmails = emailSearch.trim()
    ? categoryFilteredEmails.filter((email) => {
        const searchLower = emailSearch.toLowerCase()
        return (
          email.subject.toLowerCase().includes(searchLower) ||
          email.body.toLowerCase().includes(searchLower) ||
          email.from.toLowerCase().includes(searchLower) ||
          email.fromName.toLowerCase().includes(searchLower) ||
          email.to.toLowerCase().includes(searchLower)
        )
      })
    : categoryFilteredEmails

  // 관련 이메일 필터 클리어 함수
  const clearRelatedFilter = () => {
    setRelatedEmailIds([])
    setEmailPage(1)
  }

  // 관련 이메일 필터 설정 함수
  const showRelatedEmails = (emailIds: string[]) => {
    setRelatedEmailIds(emailIds)
    setEmailFilter('all')
    setEmailSearch('')
    setEmailPage(1)
  }

  // 페이지네이션 계산
  const totalEmailPages = Math.ceil(filteredEmails.length / emailsPerPage)
  const paginatedEmails = filteredEmails.slice((emailPage - 1) * emailsPerPage, emailPage * emailsPerPage)

  // 필터/검색 변경 시 페이지 초기화
  useEffect(() => {
    setEmailPage(1)
  }, [emailFilter, emailSearch, relatedEmailIds])

  // 위키 검색 필터 적용
  const filteredWikiNotes = wikiSearch.trim()
    ? wikiNotes.filter((note) => {
        const searchLower = wikiSearch.toLowerCase()
        return (
          note.title.toLowerCase().includes(searchLower) ||
          note.content.toLowerCase().includes(searchLower)
        )
      })
    : wikiNotes

  // 위키 페이지네이션 계산
  const totalWikiPages = Math.ceil(filteredWikiNotes.length / WIKI_PER_PAGE)
  const paginatedWikiNotes = filteredWikiNotes.slice((wikiPage - 1) * WIKI_PER_PAGE, wikiPage * WIKI_PER_PAGE)

  // 위키 검색 변경 시 페이지 초기화
  useEffect(() => {
    setWikiPage(1)
  }, [wikiSearch])

  return (
    <ProtectedPage pagePath="/etf/etc">
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalAum}</CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingETFs ? (
              <div className="flex items-end justify-between animate-pulse">
                <div className="space-y-2">
                  <div className="h-7 w-28 bg-slate-300 rounded" />
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                </div>
                <div className="h-10 w-24 bg-slate-200 rounded" />
              </div>
            ) : (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatAUM(totalAUM, 'USD')}</div>
                  <p className="text-xs text-muted-foreground">{t.etf.etfCount.replace('{count}', String(etfs.length))}</p>
                </div>
                <Sparkline data={historicalData.map(d => ({ date: d.date, value: d.totalAum }))} id="aum" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalMonthlyFee}</CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <DollarSign className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingETFs ? (
              <div className="flex items-end justify-between animate-pulse">
                <div className="space-y-2">
                  <div className="h-7 w-24 bg-slate-300 rounded" />
                  <div className="h-3 w-36 bg-slate-200 rounded" />
                </div>
                <div className="h-10 w-24 bg-slate-200 rounded" />
              </div>
            ) : (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatAUM(totalMonthlyFee, 'USD')}</div>
                  <p className="text-xs text-muted-foreground">{t.etf.feeFormula}</p>
                </div>
                <Sparkline data={historicalData.map(d => ({ date: d.date, value: d.totalMonthlyFee }))} id="fee" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-100 dark:bg-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalRemainingFee}</CardTitle>
            <div className="rounded-lg bg-white/50 dark:bg-white/10 p-2">
              <PiggyBank className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingETFs ? (
              <div className="flex items-end justify-between animate-pulse">
                <div className="space-y-2">
                  <div className="h-7 w-28 bg-slate-300 rounded" />
                  <div className="h-3 w-40 bg-slate-200 rounded" />
                </div>
                <div className="h-10 w-24 bg-slate-200 rounded" />
              </div>
            ) : (
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold">{formatAUM(totalRemainingFee, 'USD')}</div>
                  <p className="text-xs text-muted-foreground">{t.etf.remainingFeeDesc}</p>
                </div>
                <Sparkline data={historicalData.map(d => ({ date: d.date, value: d.totalRemainingFee }))} id="remaining" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ETF List Table */}
      <Card className="bg-slate-100 dark:bg-slate-800">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>{t.etf.title}</CardTitle>
            <CardDescription>{t.etf.etcDescription}</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={loadETFData}
              disabled={isLoadingETFs}
              className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingETFs ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                setEditingETF(null)
                setIsModalOpen(true)
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t.etf.addEtf}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingETFs ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.symbol}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.fundName}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.listingDate}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.aum}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.monthFlow}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.monthlyFee}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.remainingFee}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.date}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-200 dark:border-slate-700 last:border-0 animate-pulse whitespace-nowrap">
                      <td className="py-3 pr-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-32 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3 pr-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <div className="h-6 w-6 bg-slate-200 rounded" />
                          <div className="h-6 w-6 bg-slate-200 rounded" />
                          <div className="h-6 w-6 bg-slate-200 rounded" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : etfs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t.etf.noData}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.symbol}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.fundName}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.listingDate}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.aum}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.monthFlow}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.monthlyFee}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.remainingFee}</th>
                    <th className="pb-3 pr-4 font-medium">{t.etf.columns.date}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {etfs.map((etf) => (
                    <tr key={etf.id} className="border-b border-slate-200 dark:border-slate-700 last:border-0 whitespace-nowrap">
                      <td className="py-3 pr-4 font-mono font-medium">{etf.symbol}</td>
                      <td className="py-3 pr-4 text-sm max-w-[200px] truncate" title={etf.fundName}>
                        {etf.fundUrl ? (
                          <a
                            href={etf.fundUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {etf.fundName}
                          </a>
                        ) : (
                          etf.fundName
                        )}
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">{etf.listingDate || '-'}</td>
                      <td className="py-3 pr-4">{formatAUM(etf.aum, etf.currency)}</td>
                      <td className={`py-3 pr-4 ${(etf.flow || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatFlow(etf.flow, etf.currency)}
                      </td>
                      <td className="py-3 pr-4 font-medium">{formatAUM(etf.totalMonthlyFee, etf.currency)}</td>
                      <td className="py-3 pr-4">
                        {etf.remainingFee !== null ? (
                          <span title={t.etf.remainingMonths.replace('{months}', String(etf.remainingMonths))}>
                            {formatAUM(etf.remainingFee, etf.currency)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-sm text-muted-foreground">{etf.date || '-'}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingETF(etf)
                              setIsModalOpen(true)
                            }}
                            className="rounded p-1 hover:bg-slate-200 cursor-pointer"
                            title={t.etf.actions.edit}
                          >
                            <Pencil className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                          <button
                            onClick={() => {
                              setDocumentETF(etf)
                              setIsDocModalOpen(true)
                            }}
                            className="rounded p-1 hover:bg-slate-200 cursor-pointer"
                            title={t.etf.actions.documents}
                          >
                            <Archive className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                          <button onClick={() => handleDeleteETF(etf)} className="rounded p-1 hover:bg-slate-200 cursor-pointer" title={t.etf.actions.delete}>
                            <Trash2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice & Work Wiki Section - Side by Side */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Invoice Section */}
        <Card className="bg-slate-100 dark:bg-slate-800 w-full lg:w-1/2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                {t.invoice.title}
              </CardTitle>
              <CardDescription>{t.invoice.description}</CardDescription>
            </div>
            <button
              onClick={openNewInvoiceModal}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t.invoice.create}</span>
            </button>
          </CardHeader>
          <CardContent>
            {(() => {
              const totalPages = Math.ceil(invoices.length / INVOICES_PER_PAGE)
              const paginatedInvoices = invoices.slice(
                (invoicePage - 1) * INVOICES_PER_PAGE,
                invoicePage * INVOICES_PER_PAGE
              )
              return (
                <>
                  <div className="space-y-2">
                    {isLoadingInvoices ? (
                      <div className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                      </div>
                    ) : invoices.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm">{t.invoice.noInvoices}</p>
                        <p className="text-xs">{t.invoice.createHint}</p>
                      </div>
                    ) : (
                      paginatedInvoices.map((invoice) => {
                  const effectiveStatus = getEffectiveInvoiceStatus(invoice)
                  const statusStyle = INVOICE_STATUS_COLORS[effectiveStatus]
                  const StatusIcon = statusStyle.icon
                  const firstItem = (invoice.line_items as LineItem[])[0]
                  return (
                    <div key={invoice.id} className="rounded-lg bg-white dark:bg-slate-700 p-3">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Receipt className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-sm">{firstItem?.description || invoice.invoice_no}</p>
                            <p className="text-xs text-muted-foreground">
                              발행일: {formatInvoiceDateUtil(invoice.invoice_date)} · ${invoice.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs flex items-center gap-1 ${statusStyle.bg} ${statusStyle.text}`}>
                            <StatusIcon className="h-3 w-3" />
                            {getInvoiceStatusLabel(effectiveStatus)}
                          </span>
                          {expandedInvoice === invoice.id ? (
                            <ChevronUp className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                      {expandedInvoice === invoice.id && (
                        <div className="mt-2 pt-2 border-t border-slate-100 space-y-2">
                          {/* 항목 상세 - 여러 항목이 있을 때만 표시 */}
                          {(invoice.line_items as LineItem[]).length > 1 && (
                            <div className="text-xs text-muted-foreground space-y-1">
                              {(invoice.line_items as LineItem[]).map((item, idx) => (
                                <div key={idx}>{item.description} - ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              ))}
                            </div>
                          )}
                          {/* 메모 - 있을 때만 표시 */}
                          {invoice.notes && (
                            <p className="text-xs text-muted-foreground">{invoice.notes}</p>
                          )}

                          {/* 액션 버튼 */}
                          <div className="flex flex-wrap gap-2">
                            {/* 수정 버튼 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); startEditInvoice(invoice) }}
                              className="flex items-center gap-1 rounded bg-slate-200 dark:bg-slate-600 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                              수정
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownloadPdf(invoice.id) }}
                              className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium hover:bg-slate-200 cursor-pointer"
                            >
                              <Download className="h-3 w-3" />
                              PDF
                            </button>
                            {effectiveStatus !== 'paid' && effectiveStatus !== 'cancelled' && (
                              <>
                                {/* ETC 발송 버튼 */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendInvoice(invoice.id, 'etc') }}
                                  disabled={isSendingInvoice?.id === invoice.id && isSendingInvoice?.type === 'etc'}
                                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 cursor-pointer ${
                                    invoice.sent_to_etc_at
                                      ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                      : 'bg-blue-600 text-white hover:bg-blue-700'
                                  }`}
                                >
                                  {isSendingInvoice?.id === invoice.id && isSendingInvoice?.type === 'etc' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : invoice.sent_to_etc_at ? (
                                    <Check className="h-3 w-3" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  ETC 발송
                                </button>
                                {/* 은행 발송 버튼 */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSendInvoice(invoice.id, 'bank') }}
                                  disabled={isSendingInvoice?.id === invoice.id && isSendingInvoice?.type === 'bank'}
                                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 cursor-pointer ${
                                    invoice.sent_to_bank_at
                                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                      : 'bg-amber-600 text-white hover:bg-amber-700'
                                  }`}
                                >
                                  {isSendingInvoice?.id === invoice.id && isSendingInvoice?.type === 'bank' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : invoice.sent_to_bank_at ? (
                                    <Building className="h-3 w-3" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  은행 발송
                                </button>
                                {/* 입금확인 버튼 - 최소 하나 발송 완료 시 */}
                                {(invoice.sent_to_etc_at || invoice.sent_to_bank_at) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleUpdateInvoiceStatus(invoice.id, 'paid') }}
                                    className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer"
                                  >
                                    <Check className="h-3 w-3" />
                                    입금확인
                                  </button>
                                )}
                              </>
                            )}
                            {/* 삭제 버튼 - 미발송 상태에서만 */}
                            {!invoice.sent_to_etc_at && !invoice.sent_to_bank_at && effectiveStatus !== 'paid' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(invoice.id) }}
                                className="flex items-center gap-1 rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-200 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                                {t.common.delete}
                              </button>
                            )}
                          </div>

                          {/* 발송 정보 - 한 줄로 표시 */}
                          <div className="flex flex-wrap gap-3 text-xs">
                            <span className="text-muted-foreground">{invoice.invoice_no}</span>
                            <span className={invoice.sent_to_etc_at ? 'text-blue-600' : 'text-muted-foreground'}>
                              ETC 이메일: {invoice.sent_to_etc_at
                                ? new Date(invoice.sent_to_etc_at).toLocaleDateString('ko-KR')
                                : '미발송'}
                            </span>
                            <span className={invoice.sent_to_bank_at ? 'text-amber-600' : 'text-muted-foreground'}>
                              은행 이메일: {invoice.sent_to_bank_at
                                ? new Date(invoice.sent_to_bank_at).toLocaleDateString('ko-KR')
                                : '미발송'}
                            </span>
                            <span className={invoice.paid_at ? 'text-emerald-600' : 'text-muted-foreground'}>
                              입금: {invoice.paid_at
                                ? new Date(invoice.paid_at).toLocaleDateString('ko-KR')
                                : '미확인'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            {/* Pagination controls */}
            {invoices.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  <span className="hidden sm:inline">{t.invoice.showingRange
                    .replace('{total}', String(invoices.length))
                    .replace('{start}', String((invoicePage - 1) * INVOICES_PER_PAGE + 1))
                    .replace('{end}', String(Math.min(invoicePage * INVOICES_PER_PAGE, invoices.length)))}</span>
                  <span className="sm:hidden">{invoices.length}개 중 {(invoicePage - 1) * INVOICES_PER_PAGE + 1}-{Math.min(invoicePage * INVOICES_PER_PAGE, invoices.length)}</span>
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setInvoicePage(1)}
                      disabled={invoicePage === 1}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      «
                    </button>
                    <button
                      onClick={() => setInvoicePage(p => Math.max(1, p - 1))}
                      disabled={invoicePage === 1}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ‹
                    </button>
                    <span className="px-2 py-1 text-xs font-medium">
                      {invoicePage}/{totalPages}
                    </span>
                    <button
                      onClick={() => setInvoicePage(p => Math.min(totalPages, p + 1))}
                      disabled={invoicePage === totalPages}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => setInvoicePage(totalPages)}
                      disabled={invoicePage === totalPages}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )
      })()}
        </CardContent>
        </Card>

        {/* Invoice Creation Modal */}
        {isInvoiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setIsInvoiceModalOpen(false); resetInvoiceForm() }} />
            <div className="relative bg-white dark:bg-slate-800 rounded-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden p-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h2 className="text-lg font-semibold">{editingInvoice ? '인보이스 수정' : t.invoice.new}</h2>
                <button
                  onClick={() => { setIsInvoiceModalOpen(false); resetInvoiceForm() }}
                  className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
                {/* Invoice Date */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{t.invoice.invoiceDate}</label>
                  <input
                    type="date"
                    value={invoiceFormDate}
                    onChange={(e) => setInvoiceFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
                  />
                </div>

                {/* Attention */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{t.invoice.attention}</label>
                  <input
                    type="text"
                    value={invoiceFormAttention}
                    onChange={(e) => setInvoiceFormAttention(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
                  />
                </div>

                {/* Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-500">{t.invoice.items}</label>
                    <button
                      type="button"
                      onClick={addFormItem}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      {t.invoice.addItem}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {invoiceFormItems.map((item, index) => (
                      <div key={item.id} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">{t.invoice.itemNumber.replace('{number}', String(index + 1))}</span>
                          {invoiceFormItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeFormItem(item.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {/* Item Type */}
                        <select
                          value={item.itemType}
                          onChange={(e) => updateFormItem(item.id, { itemType: e.target.value as InvoiceItemType })}
                          className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                        >
                          {ITEM_TEMPLATES.map((template) => (
                            <option key={template.type} value={template.type}>
                              {template.label}
                            </option>
                          ))}
                        </select>
                        {/* Month/Year for preset types */}
                        {item.itemType !== 'custom' && (
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={item.month}
                              onChange={(e) => updateFormItem(item.id, { month: parseInt(e.target.value) })}
                              className="px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                            >
                              {MONTH_NAMES.map((name, idx) => (
                                <option key={idx} value={idx}>{name}</option>
                              ))}
                            </select>
                            <select
                              value={item.year}
                              onChange={(e) => updateFormItem(item.id, { year: parseInt(e.target.value) })}
                              className="px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                            >
                              {[2024, 2025, 2026, 2027].map((year) => (
                                <option key={year} value={year}>{year}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {/* Custom Description */}
                        {item.itemType === 'custom' && (
                          <input
                            type="text"
                            value={item.customDesc}
                            onChange={(e) => updateFormItem(item.id, { customDesc: e.target.value })}
                            placeholder={t.invoice.itemDescription}
                            className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                          />
                        )}
                        {/* Preview */}
                        {item.itemType !== 'custom' && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-600 px-2 py-1 rounded">
                            {getItemDescription(item)}
                          </div>
                        )}
                        {/* Amount */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-500">$</span>
                          <input
                            type="text"
                            value={(() => {
                              if (!item.amount) return ''
                              const parts = item.amount.split('.')
                              const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                              return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart
                            })()}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9.]/g, '')
                              // 소수점이 여러 개인 경우 첫 번째만 유지
                              const parts = value.split('.')
                              const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : value
                              updateFormItem(item.id, { amount: cleaned })
                            }}
                            placeholder="2,083.33"
                            className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Total */}
                  {invoiceFormItems.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <span className="text-sm font-medium">{t.invoice.total}</span>
                      <span className="text-sm font-bold">
                        ${invoiceFormItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{t.invoice.notes}</label>
                  <textarea
                    value={invoiceFormNotes}
                    onChange={(e) => setInvoiceFormNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                {editingInvoice ? (
                  <button
                    onClick={() => {
                      if (confirm(t.invoice.deleteConfirm)) {
                        handleDeleteInvoice(editingInvoice.id)
                        setIsInvoiceModalOpen(false)
                        resetInvoiceForm()
                      }
                    }}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    {t.common.delete}
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsInvoiceModalOpen(false); resetInvoiceForm() }}
                    className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    onClick={handleSaveInvoice}
                    disabled={isSavingInvoice}
                    className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingInvoice && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t.common.save}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Work Wiki Section */}
        <Card className="bg-slate-100 dark:bg-slate-800 w-full lg:w-1/2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                {t.wiki.title}
              </CardTitle>
              <CardDescription>{t.wiki.description}</CardDescription>
            </div>
            <button
              onClick={() => setIsAddingNote(true)}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t.invoice.create}</span>
            </button>
          </CardHeader>
          <CardContent>
            {/* 검색 입력 */}
            <div className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  value={wikiSearch}
                  onChange={(e) => setWikiSearch(e.target.value)}
                  placeholder={t.wiki.searchPlaceholder}
                  className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-1.5 text-sm pl-8 outline-none transition-colors focus:bg-slate-50 dark:focus:bg-slate-600"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                {wikiSearch && (
                  <button
                    onClick={() => setWikiSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {wikiSearch && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t.wiki.searchCount.replace('{count}', String(filteredWikiNotes.length))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {/* 새 메모 추가 폼 */}
              {isAddingNote && (
                <div
                  className={`!border-0 rounded-lg p-3 transition-colors ${
                    isDraggingWiki ? 'bg-purple-50 dark:bg-purple-900/30' : 'bg-white dark:bg-slate-700'
                  }`}
                  style={{ border: 'none' }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setIsDraggingWiki(true)
                  }}
                  onDragLeave={() => setIsDraggingWiki(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDraggingWiki(false)
                    const files = Array.from(e.dataTransfer.files)
                    if (files.length > 0) {
                      setNewNoteFiles(prev => [...prev, ...files])
                    }
                  }}
                >
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">제목</label>
                      <Input
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        placeholder={t.wiki.titlePlaceholder}
                        className="!border-0 h-9"
                        style={{ border: 'none' }}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">내용</label>
                      <TiptapEditor
                        content={newNoteContent}
                        onChange={setNewNoteContent}
                        placeholder={t.wiki.contentPlaceholder}
                        minHeight="80px"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">첨부 파일</label>
                      <div className={`!border-0 rounded-lg p-2 text-center transition-colors ${
                        isDraggingWiki ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-700'
                      }`} style={{ border: 'none' }}>
                        <input
                          type="file"
                          id="wiki-file-input-etc"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || [])
                            if (files.length > 0) {
                              setNewNoteFiles(prev => [...prev, ...files])
                            }
                            e.target.value = ''
                          }}
                        />
                        <label
                          htmlFor="wiki-file-input-etc"
                          className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span>{t.wiki.fileAttach}</span>
                        </label>
                      </div>
                      {newNoteFiles.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {newNoteFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-600 rounded px-2 py-1.5">
                              <Paperclip className="h-3 w-3 text-slate-400" />
                              <span className="flex-1 truncate">{file.name}</span>
                              <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                              <button
                                onClick={() => setNewNoteFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingNote(false)
                        setNewNoteTitle('')
                        setNewNoteContent('')
                        setNewNoteFiles([])
                      }}
                    >
                      {t.common.cancel}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={(!newNoteTitle.trim() && !newNoteContent.trim() && newNoteFiles.length === 0) || isUploadingWiki}
                    >
                      {isUploadingWiki && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      {isUploadingWiki ? t.common.saving : t.common.save}
                    </Button>
                  </div>
                </div>
              )}

              {/* 위키 노트 목록 */}
              {isLoadingWiki ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                </div>
              ) : filteredWikiNotes.length === 0 && !isAddingNote ? (
                <div className="text-center py-8 text-muted-foreground">
                  <StickyNote className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">{wikiSearch ? t.wiki.noSearchResults : t.wiki.noNotes}</p>
                  <p className="text-xs">{t.wiki.addNoteHint}</p>
                </div>
              ) : filteredWikiNotes.length > 0 ? (
                paginatedWikiNotes.map((note) => (
                  <div key={note.id} className="!border-0 rounded-lg bg-white dark:bg-slate-700 p-3" style={{ border: 'none' }}>
                    {editingNote?.id === note.id ? (
                      <div className="!border-0 bg-white dark:bg-slate-700 rounded-lg p-3 -m-3" style={{ border: 'none' }}>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">제목</label>
                            <Input
                              value={editingNote.title}
                              onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                              className="!border-0 h-9"
                              style={{ border: 'none' }}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">내용</label>
                            <TiptapEditor
                              content={editingNote.content}
                              onChange={(content) => setEditingNote({ ...editingNote, content })}
                              placeholder="내용을 입력하세요..."
                              minHeight="80px"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 mb-1 block">첨부 파일</span>
                            <label
                              htmlFor={`wiki-file-input-edit-${note.id}`}
                              className={`!border-0 rounded-lg p-2 text-center transition-colors cursor-pointer block ${
                                isDraggingWiki ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-600'
                              }`}
                              style={{ border: 'none' }}
                            >
                              <input
                                type="file"
                                id={`wiki-file-input-edit-${note.id}`}
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files || [])
                                  if (files.length > 0) {
                                    setNewNoteFiles(prev => [...prev, ...files])
                                  }
                                  e.target.value = ''
                                }}
                              />
                              <span className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                                <Paperclip className="h-3 w-3" />
                                <span>{t.wiki.fileAttach}</span>
                              </span>
                            </label>
                            {editingNote.attachments && editingNote.attachments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-slate-400">기존 첨부파일:</p>
                                {editingNote.attachments.map((att, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
                                    <Paperclip className="h-3 w-3 text-slate-400" />
                                    <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">{att.name}</a>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newAttachments = editingNote.attachments?.filter((_, i) => i !== idx) || []
                                        setEditingNote({ ...editingNote, attachments: newAttachments })
                                      }}
                                      className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {newNoteFiles.length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-slate-400">새 첨부파일:</p>
                                {newNoteFiles.map((file, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
                                    <Paperclip className="h-3 w-3 text-slate-400" />
                                    <span className="flex-1 truncate">{file.name}</span>
                                    <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
                                    <button
                                      onClick={() => setNewNoteFiles(files => files.filter((_, i) => i !== idx))}
                                      className="text-slate-400 hover:text-red-500"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm(t.wiki.deleteConfirm)) {
                                handleDeleteNote(editingNote.id)
                                setEditingNote(null)
                              }
                            }}
                          >
                            {t.common.delete}
                          </Button>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingNote(null)}
                            >
                              {t.common.cancel}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateNote(editingNote)}
                            >
                              {t.common.save}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {note.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
                            <p className="font-medium text-sm">{note.title}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleTogglePin(note)}
                              className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer ${note.is_pinned ? 'text-amber-500' : 'text-slate-400'}`}
                            >
                              <Pin className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingNote(note)
                              }}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-400 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "wiki-content mt-1 text-slate-600 dark:text-slate-400 overflow-hidden",
                            !expandedNotes.has(note.id) && "max-h-[4.5rem]"
                          )}
                          dangerouslySetInnerHTML={{ __html: note.content?.startsWith('<') ? note.content : plainTextToHtml(note.content || '') }}
                        />
                        {note.content && (note.content.length > 150 || note.content.split('\n').length > 3) && (
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedNotes)
                              if (newExpanded.has(note.id)) {
                                newExpanded.delete(note.id)
                              } else {
                                newExpanded.add(note.id)
                              }
                              setExpandedNotes(newExpanded)
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mt-1"
                          >
                            {expandedNotes.has(note.id) ? '접기' : '펼치기'}
                          </button>
                        )}
                        {/* 첨부파일 표시 */}
                        {note.attachments && note.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {note.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300"
                              >
                                <Paperclip className="h-2.5 w-2.5" />
                                <span>{att.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          작성 {new Date(note.created_at).toLocaleDateString('ko-KR')}
                          {note.updated_at !== note.created_at && ` · 수정 ${new Date(note.updated_at).toLocaleDateString('ko-KR')}`}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              ) : null}
            </div>

            {/* 페이지네이션 */}
            {filteredWikiNotes.length > 0 && (
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 mt-3">
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  <span className="hidden sm:inline">{t.wiki.showingRange
                    .replace('{total}', String(filteredWikiNotes.length))
                    .replace('{start}', String((wikiPage - 1) * WIKI_PER_PAGE + 1))
                    .replace('{end}', String(Math.min(wikiPage * WIKI_PER_PAGE, filteredWikiNotes.length)))}</span>
                  <span className="sm:hidden">{filteredWikiNotes.length}개 중 {(wikiPage - 1) * WIKI_PER_PAGE + 1}-{Math.min(wikiPage * WIKI_PER_PAGE, filteredWikiNotes.length)}</span>
                </p>
                {totalWikiPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setWikiPage(1)}
                      disabled={wikiPage === 1}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      «
                    </button>
                    <button
                      onClick={() => setWikiPage(p => Math.max(1, p - 1))}
                      disabled={wikiPage === 1}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ‹
                    </button>
                    <span className="px-2 py-1 text-xs font-medium">
                      {wikiPage}/{totalWikiPages}
                    </span>
                    <button
                      onClick={() => setWikiPage(p => Math.min(totalWikiPages, p + 1))}
                      disabled={wikiPage === totalWikiPages}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => setWikiPage(totalWikiPages)}
                      disabled={wikiPage === totalWikiPages}
                      className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Section - Full Width, 2 Columns */}
      <Card className="bg-slate-100 dark:bg-slate-800">
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t.gmail.title}
                {syncStatus.isConnected ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Gmail · {t.gmail.watchLabel}: {gmailLabel}
                {syncStatus.lastSyncAt && (
                  <span className="ml-2">· {formatRelativeTime(syncStatus.lastSyncAt, t)}</span>
                )}
              </CardDescription>
            </div>
            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={syncEmails}
                disabled={isSyncing || !syncStatus.isConnected}
                className="flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleAnalyzeEmails}
                disabled={isAnalyzing || !syncStatus.isConnected}
                className="flex items-center justify-center gap-2 rounded-lg bg-purple-100 dark:bg-purple-900/50 px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800/50 disabled:opacity-50 cursor-pointer"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{isAnalyzing ? t.gmail.analyzing : t.gmail.aiAnalysis}</span>
              </button>
              <button
                onClick={() => setShowGmailSettings(!showGmailSettings)}
                className="flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setComposeMode('new')
                  setComposeOriginalEmail(null)
                  setIsComposeOpen(true)
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
              >
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">{t.gmail.newEmail}</span>
              </button>
            </div>
          </div>

          {/* Gmail 설정 모달 */}
          {showGmailSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowGmailSettings(false)} />
              <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-base">{t.gmail.settings}</h4>
                  <button
                    onClick={() => setShowGmailSettings(false)}
                    className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.gmail.connectionStatus}</span>
                    <div className="flex items-center gap-1.5">
                      {syncStatus.isConnected ? (
                        <>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {t.gmail.connected}
                          </span>
                          <button
                            onClick={handleGmailDisconnect}
                            className="text-xs px-2 py-0.5 rounded-full text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors"
                          >
                            {t.gmail.disconnect}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            {t.gmail.notConnected}
                          </span>
                          <button
                            onClick={handleGmailConnect}
                            disabled={isConnecting}
                            className="text-xs bg-slate-900 text-white px-2.5 py-0.5 rounded-full hover:bg-slate-800 disabled:opacity-50 transition-colors"
                          >
                            {isConnecting ? t.gmail.connecting : t.gmail.connect}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.gmail.watchLabel}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        className="font-mono bg-slate-100 px-2 py-1 rounded text-xs w-24 border border-slate-200 focus:outline-none focus:border-slate-400"
                        placeholder="ETC"
                      />
                      <button
                        onClick={handleLabelSave}
                        disabled={labelInput === gmailLabel}
                        className="text-xs bg-slate-900 text-white px-2.5 py-1 rounded hover:bg-slate-800 disabled:opacity-50 transition-colors"
                      >
                        {t.common.save}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t.gmail.totalEmails}</span>
                    <span className="font-medium">{syncStatus.totalEmails}</span>
                  </div>

                  {/* AI 컨텍스트 설정 */}
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setShowAiContextSettings(!showAiContextSettings)}
                      className="flex items-center justify-between w-full text-left"
                    >
                      <span className="font-medium">{t.gmail.aiContextSettings}</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAiContextSettings ? 'rotate-180' : ''}`} />
                    </button>
                    {showAiContextSettings && (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-xs">{t.gmail.aiContextEnabled}</span>
                          <button
                            onClick={() => setAiContextEnabled(!aiContextEnabled)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${aiContextEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${aiContextEnabled ? 'translate-x-5' : ''}`} />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">
                            {t.gmail.aiContextDescription}
                          </label>
                          <textarea
                            value={aiContextText}
                            onChange={(e) => setAiContextText(e.target.value)}
                            placeholder={t.gmail.aiContextPlaceholder}
                            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-slate-300"
                          />
                        </div>
                        <button
                          onClick={handleSaveAiContext}
                          disabled={isSavingAiContext}
                          className="w-full text-xs bg-slate-900 text-white px-3 py-2 rounded hover:bg-slate-800 disabled:opacity-50"
                        >
                          {isSavingAiContext ? t.common.saving : t.common.save}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column: Search, Filter Buttons & Email List */}
            <div className="w-full lg:w-1/2">
              {/* 검색 입력 */}
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    placeholder={t.header.searchPlaceholder}
                    className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  {emailSearch && (
                    <button
                      onClick={() => setEmailSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {emailSearch && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.gmail.searchResultCount.replace('{count}', String(filteredEmails.length))}
                  </p>
                )}
                {relatedEmailIds.length > 0 && (
                  <div className="flex items-center justify-between mt-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700">
                      {t.gmail.showingRelatedEmails.replace('{count}', String(relatedEmailIds.length))}
                    </p>
                    <button
                      onClick={clearRelatedFilter}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      {t.gmail.clearRelatedFilter}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-1 mb-4 flex-wrap">
                <button
                  onClick={() => setEmailFilter('all')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                    emailFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-600'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                  )}
                >
                  {t.gmail.filterAll}
                </button>
                {availableCategories.map((category) => {
                  const color = getCategoryColor(category, availableCategories)
                  return (
                    <button
                      key={category}
                      onClick={() => setEmailFilter(category)}
                      className={cn(
                        'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                        emailFilter === category
                          ? `${color.button} text-white`
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      )}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>

              <div className="space-y-2">
                {!syncStatus.isConnected ? (
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                    <p className="text-muted-foreground mb-4">{t.gmail.notConnectedMessage}</p>
                    <button
                      onClick={handleGmailConnect}
                      disabled={isConnecting}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t.gmail.connecting}
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4" />
                          {t.gmail.connect}
                        </>
                      )}
                    </button>
                  </div>
                ) : filteredEmails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {isSyncing ? t.gmail.syncing : t.gmail.noEmails}
                  </div>
                ) : (
                  <>
                    {paginatedEmails.map((email) => (
                      <div
                        key={email.id}
                        className="rounded-lg bg-white dark:bg-slate-700 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600"
                        onClick={() => setSelectedEmail(email)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <Mail
                              className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                                email.direction === 'outbound' ? 'text-blue-500' : 'text-slate-400'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              {/* 카테고리 배지 (제목 위) */}
                              {email.category && (
                                <div className="flex flex-wrap gap-1 mb-1">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(email.category, availableCategories).bg} ${getCategoryColor(email.category, availableCategories).text}`}>
                                    {email.category}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{email.subject}</p>
                                {email.attachments && email.attachments.length > 0 && (
                                  <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                                )}
                              </div>
                              {/* 보낸사람, 받는사람, 참조 */}
                              <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                <p className="truncate">
                                  <span className="text-slate-400">{t.gmail.from}:</span> {email.fromName || email.from}
                                </p>
                                <p className="truncate">
                                  <span className="text-slate-400">{t.gmail.to}:</span> {email.to}
                                </p>
                                {email.cc && (
                                  <p className="truncate">
                                    <span className="text-slate-400">{t.gmail.cc}:</span> {email.cc}
                                  </p>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {email.direction === 'outbound' ? t.gmail.outbound : t.gmail.inbound} · {formatDate(email.date)}
                              </p>
                              {/* 본문 미리보기 */}
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                {email.body.replace(/\n+/g, ' ').trim() || t.gmail.noContent}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* 페이지네이션 */}
                    {filteredEmails.length > 0 && (
                      <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
                        <div className="flex items-center gap-2">
                          <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                            {t.gmail.showingRange.replace('{total}', String(filteredEmails.length)).replace('{start}', String((emailPage - 1) * emailsPerPage + 1)).replace('{end}', String(Math.min(emailPage * emailsPerPage, filteredEmails.length)))}
                          </p>
                          <p className="sm:hidden text-xs text-muted-foreground whitespace-nowrap">
                            {filteredEmails.length}개 중 {(emailPage - 1) * emailsPerPage + 1}-{Math.min(emailPage * emailsPerPage, filteredEmails.length)}
                          </p>
                          <div className="relative">
                            <select
                              value={emailsPerPage}
                              onChange={(e) => {
                                setEmailsPerPage(Number(e.target.value))
                                setEmailPage(1)
                              }}
                              className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                            >
                              <option value={5}>5개</option>
                              <option value={10}>10개</option>
                              <option value={25}>25개</option>
                              <option value={50}>50개</option>
                              <option value={100}>100개</option>
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
                          </div>
                        </div>
                        {totalEmailPages > 1 && (
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setEmailPage(1)} disabled={emailPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              <ChevronsLeft className="h-4 w-4" />
                            </button>
                            <button onClick={() => setEmailPage(p => Math.max(1, p - 1))} disabled={emailPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="px-2 sm:px-3 py-1 text-xs font-medium">{emailPage}/{totalEmailPages}</span>
                            <button onClick={() => setEmailPage(p => Math.min(totalEmailPages, p + 1))} disabled={emailPage === totalEmailPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <button onClick={() => setEmailPage(totalEmailPages)} disabled={emailPage === totalEmailPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                              <ChevronsRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Column: AI Analysis */}
            <div className="w-full lg:w-1/2">
            {/* AI Analysis Panel */}
            {showAiAnalysis && aiAnalysis ? (
              <div className="rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-800 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-purple-900 dark:text-purple-200 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {t.gmail.aiAnalysis}
                    <span className="text-xs text-purple-600 dark:text-purple-400 font-normal">
                      ({t.gmail.analysisScope.replace('{days}', '30')})
                    </span>
                  </h4>
                  <button
                    onClick={() => setShowAiAnalysis(false)}
                    className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Overall Summary */}
                <div className="bg-white dark:bg-slate-700 rounded-lg p-3 mb-4">
                  <h5 className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{t.gmail.overallSummary}</h5>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{aiAnalysis.overallSummary}</p>
                </div>

                {/* Categories Carousel */}
                {aiAnalysis.categories.length > 0 && (() => {
                  const currentIndex = Math.min(categorySlideIndex, aiAnalysis.categories.length - 1)
                  const cat = aiAnalysis.categories[currentIndex]
                  const color = getCategoryColor(cat.category, availableCategories)

                  return (
                    <div>
                      {/* Navigation Header */}
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => setCategorySlideIndex(Math.max(0, currentIndex - 1))}
                          disabled={currentIndex === 0}
                          className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </button>

                        {/* Dot Indicators */}
                        <div className="flex items-center gap-1">
                          {aiAnalysis.categories.map((c, idx) => (
                            <button
                              key={c.category}
                              onClick={() => setCategorySlideIndex(idx)}
                              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                idx === currentIndex ? 'bg-purple-600 dark:bg-purple-400' : 'bg-purple-300 dark:bg-purple-700 hover:bg-purple-400 dark:hover:bg-purple-500'
                              }`}
                            />
                          ))}
                        </div>

                        <button
                          onClick={() => setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))}
                          disabled={currentIndex === aiAnalysis.categories.length - 1}
                          className="p-1 rounded hover:bg-white/50 dark:hover:bg-slate-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </button>
                      </div>

                      {/* Category Card */}
                      <div
                        className="bg-white dark:bg-slate-700 rounded-lg p-3 cursor-grab active:cursor-grabbing select-none"
                        style={{
                          transform: isDragging ? `translateX(${dragDeltaX}px)` : 'translateX(0)',
                          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
                        }}
                        onTouchStart={(e) => {
                          setDragStartX(e.touches[0].clientX)
                          setIsDragging(true)
                          setDragDeltaX(0)
                        }}
                        onTouchMove={(e) => {
                          if (dragStartX === null) return
                          const diff = e.touches[0].clientX - dragStartX
                          setDragDeltaX(diff)
                        }}
                        onTouchEnd={(e) => {
                          if (dragStartX === null) return
                          const diff = e.changedTouches[0].clientX - dragStartX
                          if (diff > 50) {
                            setCategorySlideIndex(Math.max(0, currentIndex - 1))
                          } else if (diff < -50) {
                            setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))
                          }
                          setDragStartX(null)
                          setDragDeltaX(0)
                          setIsDragging(false)
                        }}
                        onMouseDown={(e) => {
                          setDragStartX(e.clientX)
                          setIsDragging(true)
                          setDragDeltaX(0)
                        }}
                        onMouseMove={(e) => {
                          if (dragStartX === null || !isDragging) return
                          const diff = e.clientX - dragStartX
                          setDragDeltaX(diff)
                        }}
                        onMouseUp={(e) => {
                          if (dragStartX === null) return
                          const diff = e.clientX - dragStartX
                          if (diff > 50) {
                            setCategorySlideIndex(Math.max(0, currentIndex - 1))
                          } else if (diff < -50) {
                            setCategorySlideIndex(Math.min(aiAnalysis.categories.length - 1, currentIndex + 1))
                          }
                          setDragStartX(null)
                          setDragDeltaX(0)
                          setIsDragging(false)
                        }}
                        onMouseLeave={() => {
                          if (isDragging) {
                            setDragStartX(null)
                            setDragDeltaX(0)
                            setIsDragging(false)
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
                            {cat.category}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{cat.emailCount} emails</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">{currentIndex + 1}/{aiAnalysis.categories.length}</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{cat.summary}</p>

                        {/* Recent Topics */}
                        {cat.recentTopics && cat.recentTopics.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1">
                            {cat.recentTopics.map((topic, idx) => (
                              <span key={idx} className="px-1.5 py-px bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded text-[10px]">
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Issues */}
                        {cat.issues.length > 0 && (
                          <div className="mb-3">
                            <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {t.gmail.issues}
                            </h6>
                            <div className="space-y-2">
                              {cat.issues.map((issue, idx) => (
                                <div key={idx} className="bg-slate-50 dark:bg-slate-600 rounded p-2">
                                  <div className="flex items-start gap-2 mb-1">
                                    <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(issue.priority)}`}>
                                      {getPriorityLabel(issue.priority)}
                                    </span>
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{issue.title}</span>
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-300">{issue.description}</p>
                                  {issue.relatedEmailIds.length > 0 && (
                                    <button
                                      onClick={() => showRelatedEmails(issue.relatedEmailIds)}
                                      className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline mt-1 flex items-center gap-1 cursor-pointer"
                                    >
                                      <Mail className="h-3 w-3" />
                                      {t.gmail.relatedEmails.replace('{count}', String(issue.relatedEmailIds.length))}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Todos - DB에서 가져온 savedTodos 사용 */}
                        {(() => {
                          const categoryTodos = savedTodos.filter(t => t.category === cat.category)
                          const incompleteTodos = categoryTodos.filter(t => !t.completed)
                          const completedTodos = categoryTodos
                            .filter(t => t.completed)
                            .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
                            .slice(0, 3)
                          const displayTodos = [...incompleteTodos, ...completedTodos]

                          return displayTodos.length > 0 ? (
                            <div>
                              <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                <ListTodo className="h-3 w-3" />
                                {t.gmail.todoList}
                                <span className="text-slate-400 dark:text-slate-500 font-normal">
                                  ({incompleteTodos.length}{completedTodos.length > 0 ? ` + ${t.gmail.completedCount.replace('{count}', String(completedTodos.length))}` : ''})
                                </span>
                              </h6>
                              <div className="space-y-2">
                                {displayTodos.map((todo) => (
                                  <div key={todo.id} className={`bg-slate-50 dark:bg-slate-600 rounded p-2 flex items-start gap-2 ${todo.completed ? 'opacity-60' : ''}`}>
                                    <input
                                      type="checkbox"
                                      checked={todo.completed}
                                      onChange={() => handleTodoToggle(todo.id, todo.completed)}
                                      className="mt-1 rounded flex-shrink-0 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(todo.priority)}`}>
                                          {getPriorityLabel(todo.priority)}
                                        </span>
                                        <span className={`text-xs text-slate-700 dark:text-slate-200 ${todo.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                          {todo.task}
                                        </span>
                                      </div>
                                      {todo.due_date && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.gmail.dueDate}: {todo.due_date}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : cat.todos.length > 0 ? (
                            <div>
                              <h6 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                <ListTodo className="h-3 w-3" />
                                {t.gmail.todoList}
                                <span className="text-slate-400 dark:text-slate-500 font-normal">({t.gmail.syncing2})</span>
                              </h6>
                              <div className="space-y-2">
                                {cat.todos.map((todo, idx) => (
                                  <div key={idx} className="bg-slate-50 dark:bg-slate-600 rounded p-2 flex items-start gap-2 opacity-50">
                                    <input
                                      type="checkbox"
                                      className="mt-1 rounded flex-shrink-0"
                                      disabled
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap flex-shrink-0 ${getPriorityColor(todo.priority)}`}>
                                          {getPriorityLabel(todo.priority)}
                                        </span>
                                        <span className="text-xs text-slate-700 dark:text-slate-200">{todo.task}</span>
                                      </div>
                                      {todo.dueDate && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t.gmail.dueDate}: {todo.dueDate}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null
                        })()}

                        {cat.issues.length === 0 && cat.todos.length === 0 && savedTodos.filter(t => t.category === cat.category).length === 0 && (
                          <p className="text-xs text-slate-400 italic">{t.gmail.noIssues}</p>
                        )}
                      </div>
                    </div>
                  )
                })()}

                <p className="text-xs text-purple-400 mt-3 text-right">
                  {t.gmail.generated}: {new Date(aiAnalysis.generatedAt).toLocaleString(locale)}
                </p>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 text-purple-200" />
                <p className="mb-2">{t.gmail.noAnalysis}</p>
                <button
                  onClick={handleAnalyzeEmails}
                  disabled={isAnalyzing || !syncStatus.isConnected}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-100 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isAnalyzing ? t.gmail.analyzing : t.gmail.analyzeEmails}
                </button>
              </div>
            )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ETF Modal */}
      <ETFModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingETF(null)
        }}
        onSave={handleSaveETF}
        editData={editingETF}
        isSaving={isSaving}
        t={t}
      />

      {/* Document Modal */}
      <DocumentModal
        isOpen={isDocModalOpen}
        onClose={() => {
          setIsDocModalOpen(false)
          setDocumentETF(null)
        }}
        etf={documentETF}
        t={t}
      />

      {/* Email Detail Modal */}
      <EmailDetailModal
        email={selectedEmail}
        onClose={() => setSelectedEmail(null)}
        onReply={(mode) => {
          setComposeMode(mode)
          setComposeOriginalEmail(selectedEmail)
          setSelectedEmail(null)
          setIsComposeOpen(true)
        }}
        categories={availableCategories}
        t={t}
      />

      {/* Compose Email Modal */}
      <ComposeEmailModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false)
          setComposeOriginalEmail(null)
          setComposeInitialData(undefined)
          setComposeInitialAttachments(undefined)
          setPendingInvoiceSend(null)
        }}
        mode={composeMode}
        originalEmail={composeOriginalEmail}
        initialData={composeInitialData}
        initialAttachments={composeInitialAttachments}
        onSendSuccess={handleInvoiceEmailSent}
        t={t}
      />
    </div>
    </ProtectedPage>
  )
}
