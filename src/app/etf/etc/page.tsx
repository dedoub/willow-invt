'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n'
import { gmailService, ParsedEmail, EmailSyncStatus } from '@/lib/gmail'
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
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Settings,
  Loader2,
  X,
  Calendar,
  Archive,
  Download,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'

const dummyInvoices = [
  { id: 1, month: '2024-12', amount: 3078834, status: 'sent', sentAt: '2025-01-05' },
  { id: 2, month: '2024-11', amount: 2945000, status: 'paid', sentAt: '2024-12-05' },
  { id: 3, month: '2024-10', amount: 3120500, status: 'paid', sentAt: '2024-11-05' },
]

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
    platform_min_fee: 0,
    platform_fee_percent: 0,
    pm_min_fee: 0,
    pm_fee_percent: 0,
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
        platform_min_fee: editData.platformMinFee,
        platform_fee_percent: editData.platformFeePercent,
        pm_min_fee: editData.pmMinFee,
        pm_fee_percent: editData.pmFeePercent,
        currency: editData.currency,
        notes: editData.notes || '',
      })
    } else {
      setFormData({
        symbol: '',
        fund_name: '',
        fund_url: '',
        listing_date: '',
        platform_min_fee: 0,
        platform_fee_percent: 0,
        pm_min_fee: 0,
        pm_fee_percent: 0,
        currency: 'USD',
        notes: '',
      })
    }
  }, [editData, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{editData ? t.etf.editEtf : t.etf.addEtf}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.symbol} *</label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder={t.etf.form.symbolPlaceholder}
              disabled={!!editData}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.fundName} *</label>
            <input
              type="text"
              value={formData.fund_name}
              onChange={(e) => setFormData({ ...formData, fund_name: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder={t.etf.form.fundNamePlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.fundUrl}</label>
            <input
              type="url"
              value={formData.fund_url}
              onChange={(e) => setFormData({ ...formData, fund_url: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.listingDate}</label>
            <input
              type="date"
              value={formData.listing_date}
              onChange={(e) => setFormData({ ...formData, listing_date: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          {/* Platform Fee Section */}
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-700">{t.etf.form.platform}</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t.etf.form.minFee}</label>
                <input
                  type="number"
                  value={formData.platform_min_fee}
                  onChange={(e) => setFormData({ ...formData, platform_min_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t.etf.form.feeRatio}</label>
                <input
                  type="number"
                  value={formData.platform_fee_percent}
                  onChange={(e) => setFormData({ ...formData, platform_fee_percent: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  step="0.001"
                  placeholder={t.etf.form.feeRatioPlaceholder}
                />
              </div>
            </div>
          </div>

          {/* PM Fee Section */}
          <div className="rounded-lg border border-slate-200 p-3">
            <label className="block text-sm font-semibold mb-2 text-slate-700">{t.etf.form.pm}</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t.etf.form.minFee}</label>
                <input
                  type="number"
                  value={formData.pm_min_fee}
                  onChange={(e) => setFormData({ ...formData, pm_min_fee: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">{t.etf.form.feeRatio}</label>
                <input
                  type="number"
                  value={formData.pm_fee_percent}
                  onChange={(e) => setFormData({ ...formData, pm_fee_percent: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  step="0.001"
                  placeholder={t.etf.form.feeRatioPlaceholder}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.currency}</label>
            <select
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="USD">USD</option>
              <option value="KRW">KRW</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t.etf.form.notes}</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={() => onSave(formData)}
            disabled={isSaving || !formData.symbol || !formData.fund_name}
            className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : editData ? t.common.edit : t.etf.addEtf}
          </button>
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
      <div className="w-full max-w-lg rounded-xl bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">{t.documents.title.replace('{symbol}', etf.symbol)}</h3>
            <p className="text-sm text-muted-foreground">{etf.fundName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
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
            className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
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
                    className="rounded p-1.5 hover:bg-slate-200 disabled:opacity-50"
                    title={t.etf.actions.download}
                  >
                    {downloadingFile === doc.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 text-slate-600" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(doc.name)}
                    className="rounded p-1.5 hover:bg-slate-200"
                    title={t.common.delete}
                  >
                    <Trash2 className="h-4 w-4 text-slate-600" />
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
            className="w-full rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {t.documents.close}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ETCPage() {
  const { t } = useI18n()
  const [etfs, setEtfs] = useState<ETFDisplayData[]>([])
  const [isLoadingETFs, setIsLoadingETFs] = useState(true)
  const [emailFilter, setEmailFilter] = useState<'all' | 'fee' | 'product'>('all')
  const [expandedInvoice, setExpandedInvoice] = useState<number | null>(null)

  // Modal 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingETF, setEditingETF] = useState<ETFDisplayData | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 문서 모달 상태
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [documentETF, setDocumentETF] = useState<ETFDisplayData | null>(null)

  // Gmail 관련 상태
  const [emails, setEmails] = useState<ParsedEmail[]>([])
  const [syncStatus, setSyncStatus] = useState<EmailSyncStatus>({
    lastSyncAt: null,
    totalEmails: 0,
    newEmailsCount: 0,
    isConnected: false,
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [showGmailSettings, setShowGmailSettings] = useState(false)

  // 히스토리컬 데이터
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([])

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

  // Gmail 초기화
  useEffect(() => {
    const initGmail = async () => {
      const isConnected = await gmailService.checkConnection()
      if (isConnected) {
        gmailService.startPolling('ETC-Bank', 5 * 60 * 1000)
        await syncEmails()
      }
    }
    initGmail()
    return () => {
      gmailService.stopPolling()
    }
  }, [])

  const syncEmails = async () => {
    setIsSyncing(true)
    try {
      const fetchedEmails = await gmailService.fetchEmailsByLabel('ETC-Bank')
      setEmails(fetchedEmails)
      setSyncStatus(gmailService.getSyncStatus())
    } catch (error) {
      console.error('Failed to sync emails:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const filteredEmails = emailFilter === 'all' ? emails : emails.filter((email) => email.type === emailFilter)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalAum}</CardTitle>
            <div className="rounded-lg bg-white/50 p-2">
              <TrendingUp className="h-4 w-4 text-slate-600" />
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

        <Card className="bg-slate-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalMonthlyFee}</CardTitle>
            <div className="rounded-lg bg-white/50 p-2">
              <DollarSign className="h-4 w-4 text-slate-600" />
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

        <Card className="bg-slate-100">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.etf.totalRemainingFee}</CardTitle>
            <div className="rounded-lg bg-white/50 p-2">
              <Calendar className="h-4 w-4 text-slate-600" />
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
      <Card className="bg-slate-100">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>{t.etf.title}</CardTitle>
            <CardDescription>{t.etf.description}</CardDescription>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={loadETFData}
              disabled={isLoadingETFs}
              className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingETFs ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                setEditingETF(null)
                setIsModalOpen(true)
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t.etf.addEtf}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingETFs ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">{t.etf.columns.symbol}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.fundName}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.listingDate}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.aum}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.monthFlow}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.monthlyFee}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.remainingFee}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.date}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-slate-200 last:border-0 animate-pulse">
                      <td className="py-3"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-32 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">{t.etf.columns.symbol}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.fundName}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.listingDate}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.aum}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.monthFlow}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.monthlyFee}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.remainingFee}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.date}</th>
                    <th className="pb-3 font-medium">{t.etf.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {etfs.map((etf) => (
                    <tr key={etf.id} className="border-b border-slate-200 last:border-0">
                      <td className="py-3 font-mono font-medium">{etf.symbol}</td>
                      <td className="py-3 text-sm max-w-[200px] truncate" title={etf.fundName}>
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
                      <td className="py-3 text-sm text-muted-foreground">{etf.listingDate || '-'}</td>
                      <td className="py-3">{formatAUM(etf.aum, etf.currency)}</td>
                      <td className={`py-3 ${(etf.flow || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatFlow(etf.flow, etf.currency)}
                      </td>
                      <td className="py-3 font-medium">{formatAUM(etf.totalMonthlyFee, etf.currency)}</td>
                      <td className="py-3">
                        {etf.remainingFee !== null ? (
                          <span title={t.etf.remainingMonths.replace('{months}', String(etf.remainingMonths))}>
                            {formatAUM(etf.remainingFee, etf.currency)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">{etf.date || '-'}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingETF(etf)
                              setIsModalOpen(true)
                            }}
                            className="rounded p-1 hover:bg-slate-200"
                            title={t.etf.actions.edit}
                          >
                            <Pencil className="h-4 w-4 text-slate-600" />
                          </button>
                          <button
                            onClick={() => {
                              setDocumentETF(etf)
                              setIsDocModalOpen(true)
                            }}
                            className="rounded p-1 hover:bg-slate-200"
                            title={t.etf.actions.documents}
                          >
                            <Archive className="h-4 w-4 text-slate-600" />
                          </button>
                          <button onClick={() => handleDeleteETF(etf)} className="rounded p-1 hover:bg-slate-200" title={t.etf.actions.delete}>
                            <Trash2 className="h-4 w-4 text-slate-600" />
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

      {/* Invoice & Email Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Invoice Section */}
        <Card className="bg-slate-100">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>인보이스</CardTitle>
              <CardDescription>월별 수수료 인보이스 관리</CardDescription>
            </div>
            <button className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <FileText className="h-4 w-4" />
              인보이스 생성
            </button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dummyInvoices.map((invoice) => (
                <div key={invoice.id} className="rounded-lg bg-white p-3">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="font-medium">{invoice.month} 인보이스</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(invoice.amount, 'KRW')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {invoice.status === 'paid' ? '입금완료' : '발송완료'}
                      </span>
                      {expandedInvoice === invoice.id ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </div>
                  {expandedInvoice === invoice.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex gap-2">
                        <button className="flex items-center gap-1 rounded bg-slate-100 px-3 py-1.5 text-xs font-medium hover:bg-slate-200">
                          <FileText className="h-3 w-3" />
                          PDF 다운로드
                        </button>
                        <button className="flex items-center gap-1 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                          <Send className="h-3 w-3" />
                          이메일 재발송
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">발송일: {invoice.sentAt}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Email Section */}
        <Card className="bg-slate-100">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  이메일 커뮤니케이션
                  {syncStatus.isConnected ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                </CardTitle>
                <CardDescription>
                  Gmail 연동 · 라벨: ETC-Bank
                  {syncStatus.lastSyncAt && (
                    <span className="ml-2">· {formatRelativeTime(syncStatus.lastSyncAt, t)}</span>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={syncEmails}
                  disabled={isSyncing}
                  className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setShowGmailSettings(!showGmailSettings)}
                  className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  <Mail className="h-4 w-4" />
                  새 이메일
                </button>
              </div>
            </div>

            {showGmailSettings && (
              <div className="mt-4 rounded-lg bg-white p-4">
                <h4 className="font-medium text-sm mb-3">Gmail 연동 설정</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">연결 상태</span>
                    <span className={syncStatus.isConnected ? 'text-emerald-600' : 'text-amber-600'}>
                      {syncStatus.isConnected ? '연결됨' : '연결 필요'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">감시 라벨</span>
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">ETC-Bank</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">총 이메일</span>
                    <span>{syncStatus.totalEmails}개</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              {[
                { key: 'all', label: '전체' },
                { key: 'fee', label: '수수료' },
                { key: 'product', label: '상품' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setEmailFilter(tab.key as 'all' | 'fee' | 'product')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    emailFilter === tab.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredEmails.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {isSyncing ? '이메일을 불러오는 중...' : '이메일이 없습니다'}
                </div>
              ) : (
                filteredEmails.map((email) => (
                  <div key={email.id} className="rounded-lg bg-white p-3 cursor-pointer hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Mail
                          className={`h-5 w-5 mt-0.5 ${
                            email.direction === 'outbound' ? 'text-blue-500' : 'text-slate-400'
                          }`}
                        />
                        <div>
                          <p className="font-medium text-sm">{email.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {email.direction === 'outbound' ? '발신' : '수신'} · {formatDate(email.date)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          email.type === 'fee' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {email.type === 'fee' ? '수수료' : '상품'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
    </div>
  )
}
