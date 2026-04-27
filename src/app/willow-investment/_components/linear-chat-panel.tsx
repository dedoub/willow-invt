'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { t } from './linear-tokens'
import { LIcon } from './linear-icons'
import { notifyAgentDataChange } from '@/hooks/use-agent-refresh'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/* ── Types ── */

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

interface LinearChatPanelProps {
  open: boolean
  onClose: () => void
}

/* ── Page context ── */

const PAGE_CONTEXT: Record<string, string> = {
  '/willow-investment/mgmt': '윌로우인베스트먼트 - 사업관리 — 일정(willow_mgmt_schedules), 현금관리(willow_mgmt_cash), 이메일',
  '/willow-investment/invest': '윌로우인베스트먼트 - 투자관리 — 포트폴리오, 매매기록(stock_trades), 종목리서치(stock_research), 소형주스크리닝(smallcap_screening), 부동산',
  '/willow-investment/wiki': '윌로우인베스트먼트 - 업무위키 — wiki_notes, 파일첨부',
  '/willow-investment/management': '윌로우인베스트먼트 - 사업관리 — 클라이언트, 프로젝트, 마일스톤, 일정, 메모, 현금관리(willow_mgmt_cash), 투자리서치, 부동산, 이메일, 업무위키',
}

const QUICK_SUGGESTIONS: Record<string, string[]> = {
  '/willow-investment/mgmt': ['이번 달 현금흐름 요약', '이번 주 일정', '최근 거래 내역', '비용 분석'],
  '/willow-investment/invest': ['포트폴리오 현황', '최근 매매 기록', '종목 리서치 현황', '부동산 시세'],
  '/willow-investment/wiki': ['최근 위키 노트', '위키 검색', '새 노트 작성'],
}

const FALLBACK_SUGGESTIONS = ['윌로우 경영 대시보드', '이번 달 현금흐름', '이번 주 일정']

/* ── Component ── */

export function LinearChatPanel({ open, onClose }: LinearChatPanelProps) {
  const pathname = usePathname()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [progressSteps, setProgressSteps] = useState<string[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [showSessionList, setShowSessionList] = useState(false)

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('linear-chat-width')
      return saved ? parseInt(saved, 10) : 380
    }
    return 380
  })
  const isResizing = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialLoadDone = useRef(false)

  /* ── Load session ── */

  const loadSession = useCallback(async (sid: string) => {
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/chat?sessionId=${sid}`)
      const data = await res.json()
      setMessages((data.messages || []).map(mapMsg))
      setSessionId(sid)
      setShowSessionList(false)
    } catch (e) { console.error('Load session failed:', e) }
    finally { setIsLoadingHistory(false) }
  }, [])

  useEffect(() => {
    if (!open || initialLoadDone.current) return
    initialLoadDone.current = true
    ;(async () => {
      setIsLoadingHistory(true)
      try {
        const res = await fetch('/api/chat')
        const data = await res.json()
        const list: ChatSession[] = data.sessions || []
        setSessions(list)
        if (list.length > 0) await loadSession(list[0].id)
      } catch { /* ignore */ }
      finally { setIsLoadingHistory(false) }
    })()
  }, [open, loadSession])

  /* ── Resize ── */

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = panelWidth
    let latest = startW
    const move = (e: MouseEvent) => {
      if (!isResizing.current) return
      latest = Math.min(Math.max(startW + (startX - e.clientX), 320), 700)
      setPanelWidth(latest)
    }
    const up = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('linear-chat-width', String(latest))
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [panelWidth])

  /* ── Scroll ── */

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])
  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  /* ── Auto-resize textarea ── */

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px' }
  }, [input])

  /* ── Actions ── */

  const handleNewChat = () => {
    setMessages([]); setSessionId(null); setInput(''); setFiles([]); setShowSessionList(false)
    initialLoadDone.current = true
  }

  const handleShowSessions = async () => {
    if (showSessionList) { setShowSessionList(false); return }
    try { const r = await fetch('/api/chat'); const d = await r.json(); setSessions(d.sessions || []) } catch { /* */ }
    setShowSessionList(true)
  }

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0) || isLoading) return
    const fullMessage = input || '(파일 첨부)'
    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user', content: fullMessage,
      attachments: files.map(f => ({ name: f.name, size: f.size, type: f.type })),
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    const curInput = fullMessage; const curFiles = files
    setInput(''); setFiles([]); setIsLoading(true); setProgressSteps([])

    try {
      const form = new FormData()
      form.append('message', curInput)
      form.append('currentPage', pathname)
      form.append('pageContext', PAGE_CONTEXT[pathname] || pathname)
      if (sessionId) form.append('sessionId', sessionId)
      for (const f of curFiles) form.append('files', f)

      const res = await fetch('/api/chat', { method: 'POST', body: form })
      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneData: { message: string; sessionId: string; toolCalls: Array<{ name: string; args: unknown; result: unknown }> } | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const ln of lines) {
          if (!ln.trim()) continue
          try {
            const evt = JSON.parse(ln)
            if (evt.type === 'progress') {
              if (evt.sessionId && !sessionId) setSessionId(evt.sessionId)
              setProgressSteps(prev => [...prev, evt.step])
            } else if (evt.type === 'done') {
              doneData = evt
            } else if (evt.type === 'error') {
              throw new Error(evt.error)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }

      if (!doneData) throw new Error('No response received')

      if (doneData.sessionId && !sessionId) {
        setSessionId(doneData.sessionId)
        fetch('/api/chat').then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {})
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant', content: doneData.message,
        tool_calls: doneData.toolCalls, created_at: new Date().toISOString(),
      }])

      if (doneData.toolCalls?.length > 0) {
        const MUT = ['insert_data', 'update_data', 'delete_data', 'upsert_data']
        const tables = doneData.toolCalls
          .filter(tc => MUT.includes(tc.name))
          .map(tc => (tc.args as Record<string, unknown>)?.table as string).filter(Boolean)
        if (tables.length > 0) notifyAgentDataChange(tables)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: `오류: ${err instanceof Error ? err.message : 'Unknown'}`,
        created_at: new Date().toISOString(),
      }])
    } finally { setIsLoading(false); setProgressSteps([]) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend() }
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  if (!open) return null

  const suggestions = QUICK_SUGGESTIONS[pathname] || FALLBACK_SUGGESTIONS

  return (
    <div style={{ display: 'flex', height: '100%', width: panelWidth, flexShrink: 0 }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          width: 3, cursor: 'col-resize', flexShrink: 0,
          background: 'transparent', transition: 'background .15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = t.neutrals.line)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      />

      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: t.neutrals.card, borderLeft: `1px solid ${t.neutrals.line}`,
      }}>
        {/* Header */}
        <div style={{
          height: 52, padding: '0 16px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${t.neutrals.line}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showSessionList ? (
              <button onClick={() => setShowSessionList(false)} style={iconBtnStyle}>
                <LIcon name="chevronLeft" size={14} stroke={2} />
              </button>
            ) : (
              <span style={{ fontSize: 12, color: t.brand[600] }}>✦</span>
            )}
            <span style={{ fontSize: 13, fontWeight: t.weight.semibold, fontFamily: t.font.sans, color: t.neutrals.text }}>
              {showSessionList ? '대화 기록' : 'Gemini 2.5'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!showSessionList && (
              <button onClick={handleShowSessions} style={iconBtnStyle} title="대화 기록">
                <LIcon name="history" size={14} stroke={1.8} />
              </button>
            )}
            <button onClick={handleNewChat} style={iconBtnStyle} title="새 대화">
              <LIcon name="plus" size={14} stroke={2} />
            </button>
            <button onClick={onClose} style={iconBtnStyle} title="닫기">
              <LIcon name="x" size={14} stroke={2} />
            </button>
          </div>
        </div>

        {/* Session list */}
        {showSessionList ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {sessions.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 12, color: t.neutrals.subtle }}>
                대화 기록이 없습니다
              </div>
            )}
            {sessions.map(s => (
              <button key={s.id} onClick={() => loadSession(s.id)} style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 2,
                borderRadius: t.radius.md, border: 'none', cursor: 'pointer',
                background: s.id === sessionId ? t.neutrals.inner : 'transparent',
                fontFamily: t.font.sans,
              }}>
                <div style={{ fontSize: 12.5, fontWeight: t.weight.medium, color: t.neutrals.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 10.5, fontFamily: t.font.mono, color: t.neutrals.subtle, marginTop: 2 }}>
                  {new Date(s.updated_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {isLoadingHistory && (
                <div style={{ textAlign: 'center', padding: '48px 0', color: t.neutrals.subtle }}>
                  <div style={{ fontSize: 12 }}>대화 불러오는 중...</div>
                </div>
              )}

              {!isLoadingHistory && messages.length === 0 && (
                <div style={{ padding: '32px 0' }}>
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>✦</div>
                    <div style={{ fontSize: 13, fontWeight: t.weight.medium, color: t.neutrals.text, marginBottom: 4 }}>
                      무엇을 도와드릴까요?
                    </div>
                    <div style={{ fontSize: 11, color: t.neutrals.muted, lineHeight: 1.5 }}>
                      데이터 조회, 분석, 등록, 파일 처리 등
                    </div>
                  </div>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setInput(s); textareaRef.current?.focus() }} style={{
                      width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 4,
                      borderRadius: t.radius.md, border: 'none', cursor: 'pointer',
                      background: t.neutrals.inner, fontSize: 12, fontFamily: t.font.sans,
                      color: t.neutrals.muted, transition: 'background .12s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.brand[50])}
                      onMouseLeave={e => (e.currentTarget.style.background = t.neutrals.inner)}
                    >
                      <span style={{ color: t.brand[600], marginRight: 6, fontSize: 10 }}>→</span>{s}
                    </button>
                  ))}
                </div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {isLoading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12 }}>
                  <AgentAvatar />
                  <div style={{
                    padding: '8px 12px', borderRadius: t.radius.md,
                    background: t.neutrals.inner, fontSize: 12, color: t.neutrals.subtle,
                    display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120,
                  }}>
                    {progressSteps.length === 0
                      ? <span>생각하는 중...</span>
                      : progressSteps.map((step, i) => (
                        <span key={i} style={{
                          opacity: i === progressSteps.length - 1 ? 1 : 0.5,
                          fontSize: 11.5, lineHeight: 1.5, fontFamily: t.font.sans,
                          transition: 'opacity .2s',
                        }}>{step}</span>
                      ))
                    }
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File preview */}
            {files.length > 0 && (
              <div style={{ padding: '0 16px 6px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {files.map((file, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                    borderRadius: t.radius.sm, background: t.neutrals.inner, fontSize: 11,
                  }}>
                    <LIcon name="file" size={12} stroke={1.8} color={t.neutrals.subtle} />
                    <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.neutrals.text }}>
                      {file.name}
                    </span>
                    <button onClick={() => removeFile(i)} style={{ ...iconBtnSmStyle, color: t.neutrals.subtle }}>
                      <LIcon name="x" size={10} stroke={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${t.neutrals.line}`, flexShrink: 0 }}>
              <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.txt"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
              />
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <button onClick={() => fileInputRef.current?.click()} style={{ ...iconBtnStyle, marginBottom: 1 }} title="파일 첨부">
                  <LIcon name="paperclip" size={14} stroke={1.8} color={t.neutrals.subtle} />
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="메시지 입력..."
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', padding: '8px 10px',
                    borderRadius: t.radius.md, border: 'none', outline: 'none',
                    background: t.neutrals.inner, color: t.neutrals.text,
                    fontSize: 12.5, fontFamily: t.font.sans, lineHeight: 1.5,
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || (!input.trim() && files.length === 0)}
                  style={{
                    width: 30, height: 30, borderRadius: t.radius.md, border: 'none',
                    cursor: isLoading || (!input.trim() && files.length === 0) ? 'default' : 'pointer',
                    background: (input.trim() || files.length > 0) ? t.brand[600] : t.neutrals.inner,
                    color: (input.trim() || files.length > 0) ? '#fff' : t.neutrals.subtle,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginBottom: 1, transition: 'all .15s',
                  }}
                >
                  <LIcon name="send" size={13} stroke={2} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function AgentAvatar() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: t.radius.pill, flexShrink: 0,
      background: t.brand[50], color: t.brand[700],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11,
    }}>✦</div>
  )
}

function UserAvatar() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: t.radius.pill, flexShrink: 0,
      background: t.neutrals.inner, color: t.neutrals.muted,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <LIcon name="user" size={12} stroke={2} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      marginBottom: 14, flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      {isUser ? <UserAvatar /> : <AgentAvatar />}
      <div style={{ maxWidth: '82%', minWidth: 0 }}>
        <div style={{
          padding: '8px 12px', borderRadius: t.radius.md,
          background: isUser ? t.neutrals.inner : t.neutrals.page,
          fontSize: 12.5, lineHeight: 1.6, fontFamily: t.font.sans,
          color: t.neutrals.text,
        }}>
          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {message.attachments.map((att, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: t.neutrals.subtle }}>
                  <LIcon name="file" size={11} stroke={1.8} color={t.neutrals.subtle} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
          ) : (
            <div className="linear-chat-md" style={{ wordBreak: 'break-word' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}

          {/* Tool calls */}
          {message.tool_calls && message.tool_calls.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.neutrals.line}` }}>
              {message.tool_calls.map((tc, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: t.neutrals.subtle, marginBottom: 2 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 999, background: t.brand[400], flexShrink: 0 }} />
                  <span style={{ fontFamily: t.font.mono }}>{formatToolCall(tc)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ── */

function mapMsg(m: Record<string, unknown>): ChatMessage {
  return {
    id: m.id as string, role: m.role as 'user' | 'assistant', content: m.content as string,
    attachments: (m.attachments as ChatMessage['attachments']) || undefined,
    tool_calls: (m.tool_calls as ChatMessage['tool_calls']) || undefined,
    created_at: m.created_at as string,
  }
}

function formatToolName(name: string): string {
  if (name.startsWith('willow_')) return '윌로우 ' + name.replace('willow_', '').replace(/_/g, ' ')
  if (name.startsWith('tensw_todo_')) return '텐SW프로젝트 ' + name.replace('tensw_todo_', '').replace(/_/g, ' ')
  if (name.startsWith('tensw_')) return '텐SW ' + name.replace('tensw_', '').replace(/_/g, ' ')
  if (name.startsWith('akros_')) return '아크로스 ' + name.replace('akros_', '').replace(/_/g, ' ')
  if (name.startsWith('etc_')) return 'ETC ' + name.replace('etc_', '').replace(/_/g, ' ')
  if (name.startsWith('gmail_')) return '이메일 ' + name.replace('gmail_', '').replace(/_/g, ' ')
  if (name.startsWith('ryuha_')) return '류하 ' + name.replace('ryuha_', '').replace(/_/g, ' ')
  if (name.startsWith('invest_')) return '투자 ' + name.replace('invest_', '').replace(/_/g, ' ')
  if (name.startsWith('re_')) return '부동산 ' + name.replace('re_', '').replace(/_/g, ' ')
  if (name.startsWith('wiki_')) return '위키 ' + name.replace('wiki_', '').replace(/_/g, ' ')
  const map: Record<string, string> = {
    list_tables: '테이블 목록', query_data: '조회', insert_data: '추가',
    update_data: '수정', delete_data: '삭제', upsert_data: '저장',
    count_data: '건수', analyze_data: '분석', save_memory: '메모리 저장',
    delete_memory: '메모리 삭제',
  }
  return map[name] || name
}

function formatToolCall(tc: { name: string; args: unknown; result: unknown }): string {
  const args = tc.args as Record<string, unknown> | undefined
  const result = tc.result as Record<string, unknown> | undefined
  const error = result?.error as string | undefined
  const label = formatToolName(tc.name)
  if (error) return `${label} · 실패`
  const data = result?.data
  const count = Array.isArray(data) ? data.length : (result?.count as number | undefined)
  const table = args?.table as string || ''
  const parts = [label]
  if (table) parts.push(table)
  if (count !== undefined) parts.push(`${count}건`)
  return parts.join(' · ')
}

const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: t.radius.sm, border: 'none',
  background: 'transparent', color: t.neutrals.muted, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}

const iconBtnSmStyle: React.CSSProperties = {
  width: 16, height: 16, borderRadius: 2, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
