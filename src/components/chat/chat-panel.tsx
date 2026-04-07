'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { X, Send, Paperclip, MessageSquare, User, Loader2, FileSpreadsheet, FileText, Trash2, Plus, History, ChevronLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { notifyAgentDataChange } from '@/hooks/use-agent-refresh'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: Array<{ name: string; size: number; type: string }>
  tool_calls?: Array<{ name: string; args: unknown; result: unknown }>
  created_at: string
}

interface ChatSession {
  id: string
  title: string
  updated_at: string
}

interface ChatPanelProps {
  open: boolean
  onClose: () => void
}

const PAGE_CONTEXT: Record<string, string> = {
  '/': '대시보드 메인',
  '/etf/akros': 'ETF/Index - 아크로스 — ETF 상품, 세금계산서(akros_tax_invoices), 이메일 분석, TODO, 업무위키',
  '/etf/etc': 'ETF/Index - ETC — ETF 상품(etf_products), 인보이스(willow_invoices), 이메일 분석, TODO, 업무위키',
  '/tensoftworks/projects': '텐소프트웍스 - 프로젝트 — 프로젝트 관리, 태스크, 일정',
  '/tensoftworks/management': '텐소프트웍스 - 경영관리 — 클라이언트, 프로젝트, 마일스톤, 일정, 메모, 현금관리(tensw_mgmt_cash), 매출관리(tensw_mgmt_sales), 대출관리(tensw_mgmt_loans), 이메일, 업무위키',
  '/willow-investment/management': '윌로우인베스트먼트 - 사업관리 — 클라이언트, 프로젝트, 마일스톤, 일정, 메모, 현금관리(willow_mgmt_cash), 투자리서치(stock_research, stock_trades, smallcap_screening), 부동산, 이메일, 업무위키',
  '/others/ryuha-study': '류하 학습관리 — 과목, 교재, 챕터, 일정, 과제(ryuha_homework_items), 메모, 수첩, 신체기록',
  '/admin/users': '관리자 - 사용자 관리',
}

// Page-contextual quick suggestions
const QUICK_SUGGESTIONS: Record<string, string[]> = {
  '/': ['이번 주 주요 일정 알려줘', '전체 미수금 현황', '오늘 메모 정리'],
  '/etf/akros': ['이번 달 세금계산서 현황', '미처리 TODO 확인', 'AUM 추이 분석'],
  '/etf/etc': ['ETF 상품별 수수료 비교', '미발행 인보이스 확인', '예약발송 이메일 상태'],
  '/tensoftworks/management': ['이번 달 매출 현황', '미수금 정리', '대출 상환 스케줄', '현금흐름 요약'],
  '/willow-investment/management': ['현금관리 이번 달 요약', '부동산 실거래가 vs 매도호가', '포트폴리오 종목 현황', '투자리서치 최신 스캔'],
  '/others/ryuha-study': ['이번 주 수업 일정', '미완료 숙제 확인', '신체기록 추이'],
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const pathname = usePathname()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [showSessionList, setShowSessionList] = useState(false)
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat-panel-width')
      return saved ? parseInt(saved, 10) : 400
    }
    return 400
  })
  const isResizing = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)

  // Load messages for a specific session
  const loadSession = useCallback(async (sid: string) => {
    setIsLoadingHistory(true)
    try {
      const msgRes = await fetch(`/api/chat?sessionId=${sid}`)
      const msgData = await msgRes.json()
      const dbMessages: ChatMessage[] = (msgData.messages || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
        attachments: (m.attachments as ChatMessage['attachments']) || undefined,
        tool_calls: (m.tool_calls as ChatMessage['tool_calls']) || undefined,
        created_at: m.created_at as string,
      }))
      setMessages(dbMessages)
      setSessionId(sid)
      setShowSessionList(false)
    } catch (e) {
      console.error('Failed to load session:', e)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  // Load latest session and messages from DB on open
  useEffect(() => {
    if (!open || initialLoadDone.current) return
    initialLoadDone.current = true

    const loadLatestSession = async () => {
      setIsLoadingHistory(true)
      try {
        const sessRes = await fetch('/api/chat')
        const sessData = await sessRes.json()
        const sessionList: ChatSession[] = sessData.sessions || []
        setSessions(sessionList)

        if (sessionList.length > 0) {
          const latest = sessionList[0]
          await loadSession(latest.id)
        }
      } catch (e) {
        console.error('Failed to load chat history:', e)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    loadLatestSession()
  }, [open, loadSession])

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = panelWidth
    let latestWidth = startWidth

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const delta = startX - e.clientX
      latestWidth = Math.min(Math.max(startWidth + delta, 320), 800)
      setPanelWidth(latestWidth)
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('chat-panel-width', String(latestWidth))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleNewChat = () => {
    setMessages([])
    setSessionId(null)
    setInput('')
    setFiles([])
    setShowSessionList(false)
    initialLoadDone.current = true
  }

  const handleShowSessions = async () => {
    if (showSessionList) {
      setShowSessionList(false)
      return
    }
    try {
      const res = await fetch('/api/chat')
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch { /* ignore */ }
    setShowSessionList(true)
  }

  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return
    if (isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input || '(파일 첨부)',
      attachments: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    const currentFiles = files
    setInput('')
    setFiles([])
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('message', currentInput)
      formData.append('currentPage', pathname)
      formData.append('pageContext', PAGE_CONTEXT[pathname] || pathname)
      if (sessionId) formData.append('sessionId', sessionId)

      for (const file of currentFiles) {
        formData.append('files', file)
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId)
        // Refresh session list so new session appears
        fetch('/api/chat').then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {})
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        tool_calls: data.toolCalls,
        created_at: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMessage])

      // Notify page components if agent performed mutations
      if (data.toolCalls && data.toolCalls.length > 0) {
        const MUTATION_TOOLS = ['insert_data', 'update_data', 'delete_data', 'upsert_data']
        const mutatedTables = data.toolCalls
          .filter((tc: { name: string; args: Record<string, unknown> }) => MUTATION_TOOLS.includes(tc.name))
          .map((tc: { name: string; args: Record<string, unknown> }) => tc.args?.table as string)
          .filter(Boolean)
        if (mutatedTables.length > 0) {
          notifyAgentDataChange(mutatedTables)
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const getFileIcon = (name: string) => {
    if (name.match(/\.(xlsx?|csv)$/i)) return <FileSpreadsheet className="h-3.5 w-3.5" />
    if (name.match(/\.pdf$/i)) return <FileText className="h-3.5 w-3.5" />
    return <FileText className="h-3.5 w-3.5" />
  }

  if (!open) return null

  return (
    <div className="flex h-full" style={{ width: panelWidth }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="w-1 hover:w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
      />
    <div className="flex flex-col h-full flex-1 min-w-0 bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-16 bg-background border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          {showSessionList ? (
            <button onClick={() => setShowSessionList(false)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <MessageSquare className="h-5 w-5 text-emerald-600" />
          )}
          <span className="font-semibold text-sm">{showSessionList ? '대화 기록' : '에이전트'}</span>
          {!showSessionList && <span className="text-xs text-slate-400">Gemini 2.5</span>}
        </div>
        <div className="flex items-center gap-1">
          {!showSessionList && (
            <button onClick={handleShowSessions} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700" title="대화 기록">
              <History className="h-4 w-4" />
            </button>
          )}
          <button onClick={handleNewChat} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700" title="새 대화">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Session list view */}
      {showSessionList ? (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {sessions.length === 0 && (
              <p className="text-center py-8 text-xs text-slate-400">대화 기록이 없습니다</p>
            )}
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                  s.id === sessionId && 'bg-slate-100 dark:bg-slate-800'
                )}
              >
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(s.updated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <>
      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {isLoadingHistory && (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
              <p className="text-sm">대화 불러오는 중...</p>
            </div>
          )}
          {!isLoadingHistory && messages.length === 0 && (
            <div className="py-8">
              <div className="text-center text-slate-400 mb-6">
                <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium mb-1">무엇을 도와드릴까요?</p>
                <p className="text-xs">데이터 조회, 분석, 등록, 파일 처리 등<br />모든 섹션을 관리할 수 있어요</p>
              </div>
              {/* Quick suggestions */}
              {(QUICK_SUGGESTIONS[pathname] || QUICK_SUGGESTIONS['/']).map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(suggestion); textareaRef.current?.focus() }}
                  className="w-full text-left text-xs px-3 py-2 mb-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <span className="text-emerald-500 mr-1.5">→</span>{suggestion}
                </button>
              ))}
            </div>
          )}
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <div className="flex gap-2 items-start">
              <div className="rounded-full p-1.5 bg-emerald-100 dark:bg-emerald-900/50 flex-shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* File preview */}
      {files.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded px-2 py-1 text-xs">
              {getFileIcon(file.name)}
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 bg-background border-t flex-shrink-0">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv,.pdf,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0 mb-0.5"
            title="파일 첨부"
          >
            <Paperclip className="h-4 w-4 text-slate-400" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지 입력..."
            rows={1}
            className="flex-1 resize-none rounded-lg px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && files.length === 0)}
            className="flex-shrink-0 mb-0.5"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
        </>
      )}
    </div>
    </div>
  )
}

// Message bubble component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2 items-start', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'rounded-full p-1.5 flex-shrink-0',
        isUser
          ? 'bg-slate-200 dark:bg-slate-700'
          : 'bg-emerald-100 dark:bg-emerald-900/50'
      )}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
          : <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        }
      </div>
      <div className={cn(
        'rounded-lg px-3 py-2 max-w-[80%] text-sm',
        isUser
          ? 'bg-slate-200 dark:bg-slate-700'
          : 'bg-white dark:bg-slate-800'
      )}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-1.5 space-y-1">
            {message.attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                <FileSpreadsheet className="h-3 w-3" />
                <span className="truncate">{att.name}</span>
              </div>
            ))}
          </div>
        )}
        {/* Content */}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="chat-markdown break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {/* Tool calls indicator */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <div className="text-xs text-slate-400 space-y-0.5">
              {message.tool_calls.map((tc, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span>{formatToolCall(tc)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatToolCall(tc: { name: string; args: unknown; result: unknown }): string {
  const args = tc.args as Record<string, unknown> | undefined
  const result = tc.result as Record<string, unknown> | undefined
  const table = args?.table as string || ''
  const count = result?.count as number | undefined
  const inserted = result?.inserted as number | undefined
  const error = result?.error as string | undefined

  const actionMap: Record<string, string> = {
    list_tables: '테이블 목록',
    query_data: '조회',
    insert_data: '추가',
    update_data: '수정',
    delete_data: '삭제',
    upsert_data: 'upsert',
    count_data: '건수',
    analyze_data: '분석',
  }
  const action = actionMap[tc.name] || tc.name

  if (error) return `${action} 실패`

  // Build descriptive string
  const parts = [action]
  if (table) parts.push(table.replace(/_/g, '_'))
  if (count !== undefined) parts.push(`${count}건`)
  if (inserted !== undefined) parts.push(`${inserted}건`)

  return parts.join(' · ')
}
