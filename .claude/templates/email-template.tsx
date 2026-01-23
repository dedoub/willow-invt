/**
 * 이메일 커뮤니케이션 섹션 템플릿
 *
 * Gmail 연동 이메일 목록, 검색, 필터, 페이지네이션, AI 분석 패널을 포함합니다.
 *
 * 주요 구성:
 * 1. 검색창 (필터 배지 위)
 * 2. 카테고리 필터 배지 (rounded-full)
 * 3. 이메일 목록 (카테고리 배지는 제목 위)
 * 4. 페이지네이션 (5개, 10개, 25개, 50개, 100개)
 * 5. AI 분석 패널 또는 이메일 상세
 * 6. Gmail 미연결 상태
 * 7. 이메일 빈 상태
 * 8. 새 이메일 작성 모달 (ComposeEmailModal)
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Mail,
  Search,
  X,
  Paperclip,
  Loader2,
  RefreshCw,
  Sparkles,
  Send,
  Plus,
  FileText,
} from 'lucide-react'

// ============================================
// 타입 정의
// ============================================

interface Email {
  id: string
  subject: string
  from: string
  fromName?: string
  to: string
  cc?: string
  date: string
  body: string
  direction: 'inbound' | 'outbound'
  category?: string
  categories?: string[]
  attachments?: { name: string; url: string }[]
}

// AIAnalysis 타입은 실제 구현 시 필요에 따라 정의
// interface AIAnalysis {
//   summary: string
//   categories: { name: string; count: number }[]
//   todos: { id: string; text: string; completed: boolean }[]
// }

// ============================================
// 색상 헬퍼 함수
// ============================================

const CATEGORY_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400', button: 'bg-blue-600' },
  { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-700 dark:text-purple-400', button: 'bg-purple-600' },
  { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-400', button: 'bg-green-600' },
  { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400', button: 'bg-amber-600' },
  { bg: 'bg-pink-100 dark:bg-pink-900/50', text: 'text-pink-700 dark:text-pink-400', button: 'bg-pink-600' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-700 dark:text-cyan-400', button: 'bg-cyan-600' },
  { bg: 'bg-orange-100 dark:bg-orange-900/50', text: 'text-orange-700 dark:text-orange-400', button: 'bg-orange-600' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/50', text: 'text-indigo-700 dark:text-indigo-400', button: 'bg-indigo-600' },
]

function getCategoryColor(category: string, allCategories: string[]) {
  const index = allCategories.indexOf(category)
  if (index === -1) return CATEGORY_COLORS[0]
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length]
}

// ============================================
// 날짜 포맷 함수
// ============================================

function formatEmailDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '어제'
  } else if (diffDays < 7) {
    return `${diffDays}일 전`
  } else {
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }
}

// ============================================
// 1. 검색창 컴포넌트
// ============================================

interface EmailSearchProps {
  value: string
  onChange: (value: string) => void
  resultCount?: number
  placeholder?: string
}

export function EmailSearch({ value, onChange, resultCount, placeholder = '이메일 검색...' }: EmailSearchProps) {
  return (
    <div className="mb-4">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {value && resultCount !== undefined && (
        <p className="text-xs text-muted-foreground mt-1">
          {resultCount}개 검색됨
        </p>
      )}
    </div>
  )
}

// ============================================
// 2. 카테고리 필터 배지
// ============================================

interface EmailFilterBadgesProps {
  filter: string
  setFilter: (filter: string) => void
  categories: string[]
}

export function EmailFilterBadges({ filter, setFilter, categories }: EmailFilterBadgesProps) {
  return (
    <div className="flex gap-1 mb-4 flex-wrap">
      <button
        onClick={() => setFilter('all')}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-full transition-colors',
          filter === 'all'
            ? 'bg-slate-900 text-white dark:bg-slate-600'
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
        )}
      >
        전체
      </button>
      {categories.map((category) => {
        const color = getCategoryColor(category, categories)
        return (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-full transition-colors',
              filter === category
                ? `${color.button} text-white`
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            )}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}

// ============================================
// 3. 이메일 목록 아이템
// ============================================

interface EmailListItemProps {
  email: Email
  isSelected: boolean
  onClick: () => void
  allCategories: string[]
}

export function EmailListItem({ email, isSelected, onClick, allCategories }: EmailListItemProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white dark:bg-slate-700 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600',
        isSelected && 'ring-2 ring-blue-500'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Mail
            className={cn(
              'h-5 w-5 mt-0.5 flex-shrink-0',
              email.direction === 'outbound' ? 'text-blue-500' : 'text-slate-400'
            )}
          />
          <div className="min-w-0 flex-1">
            {/* 카테고리 배지 (제목 위) */}
            {(email.categories?.length || email.category) && (
              <div className="flex flex-wrap gap-1 mb-1">
                {(email.categories || (email.category ? [email.category] : [])).map((cat, idx) => {
                  const color = getCategoryColor(cat, allCategories)
                  return (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}
                    >
                      {cat}
                    </span>
                  )
                })}
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm truncate">{email.subject || '(제목 없음)'}</p>
              {email.attachments && email.attachments.length > 0 && (
                <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
              <p className="truncate">
                <span className="text-slate-400">보낸사람:</span> {email.fromName || email.from}
              </p>
              <p className="truncate">
                <span className="text-slate-400">받는사람:</span> {email.to}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {email.direction === 'outbound' ? '발신' : '수신'} · {formatEmailDate(email.date)}
            </p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {email.body?.replace(/\n+/g, ' ').trim() || '(내용 없음)'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 4. 페이지네이션
// ============================================

interface EmailPaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (count: number) => void
}

export function EmailPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
}: EmailPaginationProps) {
  const startIndex = (currentPage - 1) * itemsPerPage + 1
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems)

  if (totalItems === 0) return null

  return (
    <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
      <div className="flex items-center gap-2">
        <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
          총 {totalItems}개 중 {startIndex}-{endIndex}
        </p>
        <p className="sm:hidden text-xs text-muted-foreground whitespace-nowrap">
          {totalItems}개 중 {startIndex}-{endIndex}
        </p>
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5"
        >
          <option value={5}>5개</option>
          <option value={10}>10개</option>
          <option value={25}>25개</option>
          <option value={50}>50개</option>
          <option value={100}>100개</option>
        </select>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          <span className="px-2 sm:px-3 py-1 text-xs font-medium">
            {currentPage}/{totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ›
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================
// 5. AI 분석 카테고리 배지
// ============================================

interface AICategoryBadgeProps {
  category: string
  allCategories: string[]
}

export function AICategoryBadge({ category, allCategories }: AICategoryBadgeProps) {
  const color = getCategoryColor(category, allCategories)
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text}`}>
      {category}
    </span>
  )
}

// ============================================
// 6. Gmail 미연결 상태
// ============================================

interface GmailNotConnectedProps {
  onConnect: () => void
  isConnecting: boolean
}

export function GmailNotConnected({ onConnect, isConnecting }: GmailNotConnectedProps) {
  return (
    <div className="text-center py-8">
      <Mail className="h-12 w-12 mx-auto mb-3 text-slate-300" />
      <p className="text-muted-foreground mb-4">Gmail 계정을 연결하여 이메일을 확인하세요.</p>
      <button
        onClick={onConnect}
        disabled={isConnecting}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            연결 중...
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Gmail 연결
          </>
        )}
      </button>
    </div>
  )
}

// ============================================
// 7. 이메일 빈 상태
// ============================================

interface EmailEmptyStateProps {
  isSyncing?: boolean
}

export function EmailEmptyState({ isSyncing }: EmailEmptyStateProps) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      {isSyncing ? (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          이메일 동기화 중...
        </div>
      ) : (
        '이메일이 없습니다.'
      )}
    </div>
  )
}

// ============================================
// 8. 새 이메일 작성 모달
// ============================================

/**
 * 새 이메일 작성 모달 스타일 가이드:
 *
 * 모달 구조:
 * - Container: p-6 (전체 패딩)
 * - Header: pb-4 border-b (하단 패딩 + 테두리)
 * - Body: py-4 px-1 -mx-1 (스크롤바 처리)
 * - Footer: pt-4 border-t (상단 패딩 + 테두리)
 *
 * Input 스타일:
 * - bg-slate-100 dark:bg-slate-700 (border 없음)
 *
 * Label 스타일:
 * - text-xs text-slate-500 mb-1 block
 *
 * Button 스타일:
 * - Cancel: bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
 * - Send: bg-slate-900 dark:bg-slate-600 hover:bg-slate-800 dark:hover:bg-slate-500
 *
 * Error 스타일:
 * - bg-red-50 dark:bg-red-900/20 (border 없음)
 */

type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

interface ComposeEmailData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

interface ComposeEmailModalProps {
  isOpen: boolean
  onClose: () => void
  mode: ComposeMode
  originalEmail?: Email | null
  initialData?: Partial<ComposeEmailData>
  onSendSuccess?: () => void
}

export function ComposeEmailModal({
  isOpen,
  onClose,
  mode,
  originalEmail,
  initialData,
  onSendSuccess,
}: ComposeEmailModalProps) {
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

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen && originalEmail) {
      const replyPrefix = mode === 'forward' ? 'Fwd: ' : 'Re: '
      const subjectHasPrefix =
        originalEmail.subject.startsWith('Re:') || originalEmail.subject.startsWith('Fwd:')
      const newSubject = subjectHasPrefix ? originalEmail.subject : replyPrefix + originalEmail.subject
      const quotedBody = `\n\n-------- Original Message --------\nFrom: ${originalEmail.fromName || originalEmail.from}\nDate: ${originalEmail.date}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body}`

      if (mode === 'reply') {
        setFormData({ to: originalEmail.from, cc: '', bcc: '', subject: newSubject, body: quotedBody })
      } else if (mode === 'replyAll') {
        const ccRecipients = originalEmail.to?.split(',').map((e) => e.trim()).filter((e) => e) || []
        setFormData({
          to: originalEmail.from,
          cc: ccRecipients.join(', '),
          bcc: '',
          subject: newSubject,
          body: quotedBody,
        })
      } else if (mode === 'forward') {
        setFormData({ to: '', cc: '', bcc: '', subject: newSubject, body: quotedBody })
      }
    } else if (isOpen && mode === 'new') {
      setFormData({
        to: initialData?.to || '',
        cc: initialData?.cc || '',
        bcc: initialData?.bcc || '',
        subject: initialData?.subject || '',
        body: initialData?.body || '',
      })
    }
    setAttachments([])
    setError(null)
  }, [isOpen, mode, originalEmail, initialData])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setAttachments((prev) => [...prev, ...Array.from(files)])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const handleSend = async () => {
    if (!formData.to.trim()) {
      setError('받는 사람을 입력하세요.')
      return
    }
    if (!formData.subject.trim()) {
      setError('제목을 입력하세요.')
      return
    }
    setIsSending(true)
    setError(null)
    try {
      // API 호출 로직
      // await sendEmail(formData, attachments)
      onSendSuccess?.()
      onClose()
    } catch {
      setError('이메일 전송에 실패했습니다.')
    } finally {
      setIsSending(false)
    }
  }

  const getTitle = () => {
    switch (mode) {
      case 'reply':
        return '답장'
      case 'replyAll':
        return '전체 답장'
      case 'forward':
        return '전달'
      default:
        return '새 이메일'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 max-h-[90vh] flex flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-lg font-semibold">{getTitle()}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 px-1 -mx-1">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 mb-1 block">받는 사람 *</label>
            <input
              type="email"
              value={formData.to}
              onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">참조</label>
            <input
              type="text"
              value={formData.cc}
              onChange={(e) => setFormData({ ...formData, cc: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="cc@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">숨은 참조</label>
            <input
              type="text"
              value={formData.bcc}
              onChange={(e) => setFormData({ ...formData, bcc: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="bcc@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">제목 *</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm"
              placeholder="이메일 제목"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">내용</label>
            <textarea
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              className="w-full rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm min-h-[200px] font-mono"
              placeholder="이메일 내용을 입력하세요..."
            />
          </div>

          {/* 첨부파일 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-500">첨부파일</label>
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
                파일 추가
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
              취소
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
              보내기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 9. 전체 이메일 커뮤니케이션 섹션 예시
// ============================================

export function EmailCommunicationSection() {
  // 상태
  const [emails] = useState<Email[]>([]) // 실제 데이터로 대체
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [emailFilter, setEmailFilter] = useState('all')
  const [emailSearch, setEmailSearch] = useState('')
  const [emailPage, setEmailPage] = useState(1)
  const [emailsPerPage, setEmailsPerPage] = useState(5)
  const [isConnected] = useState(true)
  const [isConnecting] = useState(false)
  const [isSyncing] = useState(false)

  // 카테고리 목록 추출
  const availableCategories = useMemo(() => {
    const categories = new Set<string>()
    emails.forEach((email) => {
      if (email.category) categories.add(email.category)
      email.categories?.forEach((cat) => categories.add(cat))
    })
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [emails])

  // 필터링된 이메일
  const filteredEmails = useMemo(() => {
    let result = emails

    // 카테고리 필터
    if (emailFilter !== 'all') {
      result = result.filter(
        (e) => e.category === emailFilter || e.categories?.includes(emailFilter)
      )
    }

    // 검색 필터
    if (emailSearch.trim()) {
      const search = emailSearch.toLowerCase()
      result = result.filter(
        (e) =>
          e.subject?.toLowerCase().includes(search) ||
          e.from?.toLowerCase().includes(search) ||
          e.to?.toLowerCase().includes(search) ||
          e.body?.toLowerCase().includes(search)
      )
    }

    return result
  }, [emails, emailFilter, emailSearch])

  // 페이지네이션
  const totalPages = Math.ceil(filteredEmails.length / emailsPerPage)
  const paginatedEmails = filteredEmails.slice(
    (emailPage - 1) * emailsPerPage,
    emailPage * emailsPerPage
  )

  const handleConnect = () => {
    // Gmail 연결 로직
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5" />
          이메일 커뮤니케이션
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8">
            <RefreshCw className="h-4 w-4 mr-1" />
            동기화
          </Button>
          <Button size="sm" className="h-8">
            <Sparkles className="h-4 w-4 mr-1" />
            AI 분석
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* 좌측: 이메일 목록 */}
          <div className="w-full lg:w-1/2">
            {/* 검색창 */}
            <EmailSearch
              value={emailSearch}
              onChange={setEmailSearch}
              resultCount={emailSearch ? filteredEmails.length : undefined}
            />

            {/* 필터 배지 */}
            <EmailFilterBadges
              filter={emailFilter}
              setFilter={setEmailFilter}
              categories={availableCategories}
            />

            {/* 이메일 목록 */}
            <div className="space-y-2">
              {!isConnected ? (
                <GmailNotConnected onConnect={handleConnect} isConnecting={isConnecting} />
              ) : filteredEmails.length === 0 ? (
                <EmailEmptyState isSyncing={isSyncing} />
              ) : (
                <>
                  {paginatedEmails.map((email) => (
                    <EmailListItem
                      key={email.id}
                      email={email}
                      isSelected={selectedEmail?.id === email.id}
                      onClick={() => setSelectedEmail(email)}
                      allCategories={availableCategories}
                    />
                  ))}
                  <EmailPagination
                    currentPage={emailPage}
                    totalPages={totalPages}
                    totalItems={filteredEmails.length}
                    itemsPerPage={emailsPerPage}
                    onPageChange={setEmailPage}
                    onItemsPerPageChange={(count) => {
                      setEmailsPerPage(count)
                      setEmailPage(1)
                    }}
                  />
                </>
              )}
            </div>
          </div>

          {/* 우측: AI 분석 또는 이메일 상세 */}
          <div className="w-full lg:w-1/2">
            {selectedEmail ? (
              <div className="rounded-lg bg-white dark:bg-slate-700 p-4">
                <h3 className="font-medium mb-2">{selectedEmail.subject}</h3>
                <div className="text-xs text-muted-foreground space-y-1 mb-4">
                  <p>보낸사람: {selectedEmail.fromName || selectedEmail.from}</p>
                  <p>받는사람: {selectedEmail.to}</p>
                  <p>{formatEmailDate(selectedEmail.date)}</p>
                </div>
                <div className="text-sm whitespace-pre-wrap">{selectedEmail.body}</div>
              </div>
            ) : (
              <div className="rounded-lg bg-white dark:bg-slate-700 p-4 text-center text-muted-foreground">
                이메일을 선택하세요
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
