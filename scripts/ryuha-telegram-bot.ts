import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { runAgentTurn, AgentAbortError, type AgentThreadEvent, type CodexProgress } from './lib/agent-cli'
import { getAgentThread, markAgentThreadFailed, shortThreadId, upsertAgentThread } from './lib/agents/thread-registry'
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'
import { getRuntimeLogContext, installRuntimeConsoleCapture, installRuntimeProcessMonitor, recordRuntimeEvent } from './lib/runtime-logs'

// ============================================================
// Config
// ============================================================
const BOT_TOKEN = process.env.RYUHA_TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const MAX_HISTORY = 15
const MAX_PROMPT_HISTORY = 10
const POLL_INTERVAL = 1500
const MESSAGE_BATCH_DELAY = 1000
const LOG_DIR = join(__dirname, 'logs')
const LOCK_FILE = join(LOG_DIR, 'ryuha-bot.lock')
const OFFSET_FILE = join(LOG_DIR, 'ryuha-bot.offset')
const ALLOWED_USERS_FILE = join(LOG_DIR, 'ryuha-bot-users.json')
const BOT_TEXT_LOG_FILE = join(LOG_DIR, 'ryuha-bot.log')
const BOT_RUNTIME_JSONL_FILE = join(LOG_DIR, 'ryuha-bot.runtime.jsonl')
const BOT_THREAD_REGISTRY_FILE = join(LOG_DIR, 'ryuha-agent-threads.json')
const REG_CODE = '공부시작2026'
const MAX_USERS = 2
const CONTEXT_CACHE_TTL = 15 * 1000
const TELEGRAM_RETRY_FALLBACK_MS = 1000
const TELEGRAM_RETRY_CAP_MS = 3 * 60 * 1000
const TYPING_MIN_INTERVAL_MS = 6000
const PROGRESS_EDIT_MIN_INTERVAL_MS = 2500
const RINA_WORKSPACE_KEY = 'rina-learning'
const RINA_WORKSPACE_LABEL = 'Rina Learning'
const RYUHA_DASHBOARD_STRUCTURE = `## 류하 학습관리 구조
- 일정: 학교, 학원, 숙제, 기타 일정
- 숙제: 일정과 연결된 해야 할 일과 마감
- 과목/교재/챕터: 과목별 학습 진도
- 메모: 날짜별 짧은 기록
- 수첩 노트: 기억해둘 내용, 일기, 공부 메모
- 체형 기록: 키와 몸무게 변화

질문을 받으면 먼저 "일정 / 숙제 / 진도 / 수첩 / 생활기록 / 일반 대화" 중 어디에 속하는지 파악하고,
관련 데이터가 있으면 그 축을 우선 참고해 답해.`

installRuntimeConsoleCapture({ botKey: 'rina-bot', jsonlPath: BOT_RUNTIME_JSONL_FILE })
installRuntimeProcessMonitor({ botKey: 'rina-bot', jsonlPath: BOT_RUNTIME_JSONL_FILE })
recordRuntimeEvent({
  botKey: 'rina-bot',
  jsonlPath: BOT_RUNTIME_JSONL_FILE,
  source: 'process_boot',
  message: 'runtime logging enabled',
  details: {
    textLog: BOT_TEXT_LOG_FILE,
    structuredLog: BOT_RUNTIME_JSONL_FILE,
  },
})

// 허용된 chat_id 목록
let allowedChatIds: number[] = []

function loadAllowedUsers() {
  try {
    if (existsSync(ALLOWED_USERS_FILE)) {
      allowedChatIds = JSON.parse(readFileSync(ALLOWED_USERS_FILE, 'utf-8'))
    }
  } catch { allowedChatIds = [] }
}

function saveAllowedUsers() {
  writeFileSync(ALLOWED_USERS_FILE, JSON.stringify(allowedChatIds))
}

function isAllowedUser(chatId: number): boolean {
  return allowedChatIds.includes(chatId)
}

// 메시지 배칭
const messageBatchBuffer: Map<number, { messages: string[]; timer: ReturnType<typeof setTimeout>; lastMessageId: number }> = new Map()

// 처리 중 메시지 취소
const processingAbort: Map<number, AbortController> = new Map()
const inFlightText: Map<number, string> = new Map()

interface ProgressMessageState {
  messageId: number
  startedAt: number
  replyToMessageId?: number
  lastRendered: string
}

const progressMessages = new Map<number, ProgressMessageState>()
const typingCooldownUntilByChat = new Map<number, number>()
const lastTypingAtByChat = new Map<number, number>()
const progressCooldownUntilByChat = new Map<number, number>()
const lastProgressRenderAtByChat = new Map<number, number>()

let contextCache: { value: string; updatedAt: number } | null = null
let contextCachePromise: Promise<string> | null = null

function invalidateContextCache() {
  contextCache = null
  contextCachePromise = null
}

function getKstDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getKstClock(date = new Date()): { hour: number; minute: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: string) => parts.find(part => part.type === type)?.value || '00'
  return {
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    dateStr: `${pick('year')}-${pick('month')}-${pick('day')}`,
  }
}

function formatProgressElapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  return sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`
}

function buildProgressMessage(opts: {
  percent: number
  stage: string
  current: string
  startedAt: number
  recent?: string[]
  meta?: string[]
}): string {
  const lines = [
    `⏳ 처리현황 ${Math.max(0, Math.min(100, Math.round(opts.percent)))}%`,
    `단계: ${opts.stage}`,
    `현재: ${opts.current}`,
  ]
  const recent = (opts.recent || []).filter(Boolean).slice(-4)
  if (recent.length) {
    lines.push('최근:')
    for (const item of recent) lines.push(`- ${item}`)
  }
  const meta = [`경과 ${formatProgressElapsed(opts.startedAt)}`, ...((opts.meta || []).filter(Boolean))]
  lines.push(meta.join(' · '))
  return lines.join('\n').slice(0, 4000)
}

function getInteractiveTaskScope(_userText: string): string {
  return 'interactive-main'
}

function getScheduledTaskScope(tag: string): string {
  return `scheduled-${tag}`
}

// ============================================================
// Process lock
// ============================================================
function acquireLock(): boolean {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      try {
        process.kill(lockPid, 0)
        console.error(`[lock] 봇이 이미 실행 중 (PID: ${lockPid})`)
        return false
      } catch {
        console.log(`[lock] stale lock 정리 (PID ${lockPid})`)
      }
    }
    writeFileSync(LOCK_FILE, String(process.pid))
    return true
  } catch (err) {
    console.error('[lock] error:', err)
    return false
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (lockPid === process.pid) unlinkSync(LOCK_FILE)
    }
  } catch { /* ignore */ }
}

// ============================================================
// Persistent offset
// ============================================================
function loadOffset(): number {
  try {
    if (existsSync(OFFSET_FILE)) {
      return parseInt(readFileSync(OFFSET_FILE, 'utf-8').trim(), 10) || 0
    }
  } catch { /* ignore */ }
  return 0
}

function saveOffset(offset: number) {
  try { writeFileSync(OFFSET_FILE, String(offset)) } catch { /* ignore */ }
}

const processingMessages = new Set<number>()

// ============================================================
// Telegram API helpers
// ============================================================
async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) {
    const err = new Error(`Telegram API error: ${json.description || 'unknown'}`)
    ;(err as any).telegramError = json
    throw err
  }
  return json
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getTelegramRetryAfterMs(err: unknown): number | null {
  const retryAfterSec = Number((err as { telegramError?: { parameters?: { retry_after?: number } } })?.telegramError?.parameters?.retry_after)
  if (!Number.isFinite(retryAfterSec) || retryAfterSec <= 0) return null
  return Math.min(TELEGRAM_RETRY_CAP_MS, Math.max(TELEGRAM_RETRY_FALLBACK_MS, retryAfterSec * 1000))
}

function isChatCoolingDown(cooldowns: Map<number, number>, chatId: number): boolean {
  return (cooldowns.get(chatId) || 0) > Date.now()
}

function noteChatCooldown(cooldowns: Map<number, number>, chatId: number, err: unknown): number | null {
  const retryMs = getTelegramRetryAfterMs(err)
  if (!retryMs) return null
  const until = Date.now() + retryMs
  if (until > (cooldowns.get(chatId) || 0)) cooldowns.set(chatId, until)
  return retryMs
}

function startTypingPulse(chatId: number, intervalMs = TYPING_MIN_INTERVAL_MS): () => void {
  void sendTyping(chatId)
  const timer = setInterval(() => { void sendTyping(chatId) }, intervalMs)
  return () => clearInterval(timer)
}

async function editMessage(chatId: number, messageId: number, text: string) {
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4000),
    })
  } catch (err) {
    noteChatCooldown(progressCooldownUntilByChat, chatId, err)
  }
}

async function deleteMsg(chatId: number, messageId: number) {
  await tg('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {})
}

async function sendMessage(chatId: number, text: string, maxRetries = 2) {
  const normalized = normalizeTelegramOutboundText(text)
  const chunks = splitTelegramMessage(normalized, 4000)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    let sent = false
    for (let attempt = 0; attempt <= maxRetries && !sent; attempt++) {
      try {
        const res = await tg('sendMessage', {
          chat_id: chatId,
          text: markdownToTelegramHtml(chunk),
          parse_mode: 'HTML',
        })
        if (res.result?.message_id) {
          sent = true
          console.log(`[send] chunk ${i + 1}/${chunks.length} (id: ${res.result.message_id})`)
        }
      } catch (mdErr) {
        const htmlRetryMs = getTelegramRetryAfterMs(mdErr)
        if (htmlRetryMs && attempt < maxRetries) {
          console.warn(`[send] rate limit wait ${htmlRetryMs}ms (chunk ${i + 1}/${chunks.length})`)
          await sleep(htmlRetryMs)
          continue
        }
        try {
          const res = await tg('sendMessage', { chat_id: chatId, text: chunk })
          if (res.result?.message_id) {
            sent = true
            console.log(`[send] plain text chunk ${i + 1}/${chunks.length}`)
          }
        } catch (plainErr) {
          console.error(`[send] fail chunk ${i + 1}, attempt ${attempt + 1}:`, plainErr)
          if (attempt < maxRetries) {
            await sleep(getTelegramRetryAfterMs(plainErr) ?? getTelegramRetryAfterMs(mdErr) ?? 1000 * (attempt + 1))
          }
        }
      }
    }
    if (!sent) console.error(`[send] final fail chunk ${i + 1}/${chunks.length}`)
  }
}

async function sendTyping(chatId: number) {
  const now = Date.now()
  if (isChatCoolingDown(typingCooldownUntilByChat, chatId)) return
  if (now - (lastTypingAtByChat.get(chatId) || 0) < TYPING_MIN_INTERVAL_MS) return
  lastTypingAtByChat.set(chatId, now)
  try {
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
  } catch (err) {
    if (noteChatCooldown(typingCooldownUntilByChat, chatId, err)) return
    console.warn(`[typing] failed for ${chatId}:`, err)
  }
}

async function setReaction(chatId: number, messageId: number, emoji: string) {
  try {
    await tg('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }],
    })
  } catch { /* 리액션 실패해도 무시 */ }
}

async function sendMessageWithButtons(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  const normalized = normalizeTelegramOutboundText(text)
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      await tg('sendMessage', {
        chat_id: chatId,
        text: markdownToTelegramHtml(normalized),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      })
      return
    } catch (mdErr) {
      const htmlRetryMs = getTelegramRetryAfterMs(mdErr)
      if (htmlRetryMs && attempt < 2) {
        await sleep(htmlRetryMs)
        continue
      }
      try {
        await tg('sendMessage', {
          chat_id: chatId,
          text: normalized,
          reply_markup: { inline_keyboard: buttons },
        })
        return
      } catch (e) {
        if (attempt < 2) await sleep(getTelegramRetryAfterMs(e) ?? getTelegramRetryAfterMs(mdErr) ?? 1000)
        else console.error('[sendButtons] fail:', e)
      }
    }
  }
}

async function ensureProgressMessage(
  chatId: number,
  initialText: string,
  opts?: { replyToMessageId?: number; startedAt?: number }
): Promise<ProgressMessageState | null> {
  const existing = progressMessages.get(chatId)
  if (existing) {
    if (opts?.replyToMessageId) existing.replyToMessageId = opts.replyToMessageId
    if (opts?.startedAt && opts.startedAt < existing.startedAt) existing.startedAt = opts.startedAt
    return existing
  }

  if (isChatCoolingDown(progressCooldownUntilByChat, chatId)) return null

  let res
  try {
    res = await tg('sendMessage', {
      chat_id: chatId,
      text: initialText,
      ...(opts?.replyToMessageId ? { reply_to_message_id: opts.replyToMessageId } : {}),
    })
  } catch (err) {
    if (noteChatCooldown(progressCooldownUntilByChat, chatId, err)) return null
    throw err
  }
  const state: ProgressMessageState = {
    messageId: res?.result?.message_id,
    startedAt: opts?.startedAt ?? Date.now(),
    replyToMessageId: opts?.replyToMessageId,
    lastRendered: initialText,
  }
  progressMessages.set(chatId, state)
  lastProgressRenderAtByChat.set(chatId, Date.now())
  return state
}

async function renderProgressMessage(
  chatId: number,
  text: string,
  opts?: { replyToMessageId?: number; startedAt?: number }
) {
  if (isChatCoolingDown(progressCooldownUntilByChat, chatId)) return
  const state = await ensureProgressMessage(chatId, text, opts)
  if (!state) return
  if (state.lastRendered === text) return
  const now = Date.now()
  if (now - (lastProgressRenderAtByChat.get(chatId) || 0) < PROGRESS_EDIT_MIN_INTERVAL_MS) return
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: state.messageId,
      text: text.slice(0, 4000),
    })
    state.lastRendered = text
    lastProgressRenderAtByChat.set(chatId, now)
  } catch (err) {
    noteChatCooldown(progressCooldownUntilByChat, chatId, err)
  }
}

function getProgressStartedAt(chatId: number): number | null {
  return progressMessages.get(chatId)?.startedAt ?? null
}

async function closeProgressMessage(chatId: number, opts?: { finalText?: string; lingerMs?: number }) {
  const state = progressMessages.get(chatId)
  if (!state) return
  progressMessages.delete(chatId)

  if (opts?.finalText) {
    try { await editMessage(chatId, state.messageId, opts.finalText) } catch { /* ignore */ }
  }
  if (opts?.lingerMs) {
    await new Promise(r => setTimeout(r, opts.lingerMs))
  }
  await deleteMsg(chatId, state.messageId)
}

async function updateQueuedProgress(
  chatId: number,
  opts: {
    messageCount: number
    replyToMessageId?: number
    phase: 'queued' | 'merged' | 'restart' | 'starting'
    startedAt?: number
  }
) {
  const startedAt = opts.startedAt ?? getProgressStartedAt(chatId) ?? Date.now()
  const currentByPhase = {
    queued: `메시지 ${opts.messageCount}개를 받았어. ${Math.round(MESSAGE_BATCH_DELAY / 1000)}초 동안 같이 묶어볼게!`,
    merged: `추가 메시지를 합쳐서 한 번에 정리 중이야. (${opts.messageCount}개)`,
    restart: `새 메시지가 와서 다시 묶는 중이야. (${opts.messageCount}개)`,
    starting: `배칭을 마치고 본격 처리 시작! (${opts.messageCount}개)`,
  } as const
  const noteByPhase = {
    queued: '접수 완료',
    merged: `메시지 ${opts.messageCount}개 묶는 중`,
    restart: '새 입력 반영 중',
    starting: '처리 시작',
  } as const
  const percentByPhase = { queued: 10, merged: 12, restart: 14, starting: 18 } as const

  await renderProgressMessage(chatId, buildProgressMessage({
    percent: percentByPhase[opts.phase],
    stage: opts.phase === 'starting' ? '처리 시작' : '접수/배칭',
    current: currentByPhase[opts.phase],
    startedAt,
    recent: [noteByPhase[opts.phase]],
    meta: [`입력 ${opts.messageCount}개`, opts.phase !== 'starting' ? `배칭 ${Math.round(MESSAGE_BATCH_DELAY / 1000)}초` : '곧 답변 시작'],
  }), {
    replyToMessageId: opts.replyToMessageId,
    startedAt,
  })
}

async function answerCallbackQuery(callbackQueryId: string) {
  await tg('answerCallbackQuery', { callback_query_id: callbackQueryId }).catch(() => {})
}

// ============================================================
// Conversation history (Supabase)
// ============================================================
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

async function getConversation(chatId: number): Promise<Message[]> {
  const { data, error } = await supabase
    .from('telegram_conversations')
    .select('messages')
    .eq('chat_id', chatId)
    .eq('bot_type', 'ryuha')
    .maybeSingle()
  if (error) {
    console.error(`[getConversation] DB error for chatId ${chatId}:`, error.message)
    return []
  }
  return data?.messages || []
}

// 대화 저장 락 (동시 저장 레이스 컨디션 방지)
const conversationLocks = new Map<number, Promise<void>>()
async function withConversationLock<T>(chatId: number, fn: () => Promise<T>): Promise<T> {
  const existing = conversationLocks.get(chatId) || Promise.resolve()
  let releaseLock: () => void
  const newLock = new Promise<void>(r => { releaseLock = r })
  conversationLocks.set(chatId, newLock)
  try {
    await existing
    return await fn()
  } finally {
    releaseLock!()
  }
}

async function saveConversation(chatId: number, messages: Message[]) {
  const { error } = await supabase
    .from('telegram_conversations')
    .upsert({
      chat_id: chatId,
      bot_type: 'ryuha',
      messages: messages.slice(-MAX_HISTORY),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id,bot_type' })
  if (error) {
    console.error(`[saveConversation] DB error for chatId ${chatId}:`, error.message)
  }
}

// ============================================================
// System Prompt
// ============================================================
function buildSystemPrompt(context: string, history: Message[], runtimeContext: string): string {
  const now = new Date()
  const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const historyForPrompt = history.slice(-MAX_PROMPT_HISTORY)

  const historyText = historyForPrompt.length > 0
    ? historyForPrompt.map(m => {
        const t = new Date(m.timestamp)
        const tStr = t.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        return `[${tStr}] ${m.role === 'user' ? '류하' : '봇'}: ${m.content.slice(0, 300)}`
      }).join('\n')
    : '(첫 대화)'

  return `너는 류하의 학습 도우미 "공부친구"야.
류하는 초등학생이야. 친근한 친구처럼 반말로 대화해.

오늘 날짜: ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
현재 시각: ${timeStr}
(중요: 날짜를 말할 때는 반드시 위 "오늘 날짜"를 기준으로 해. 추측하지 마.)

## 성격 & 말투
- 밝고 에너지 넘치는 친구 느낌
- 이모지를 자연스럽게 섞어서 사용 (과하지 않게)
- 류하의 말에 공감하고 리액션해줘 ("오 대박!", "진짜?", "멋지다!")
- 짧은 메시지에는 짧게, 긴 질문에는 자세하게 답해
- 류하가 힘들어하면 응원해주고, 잘하면 신나게 칭찬해줘
- 공부 외 잡담(게임, 친구, 취미 등)에도 자연스럽게 대화해
- 류하가 뭔가 재미있는 걸 말하면 같이 재미있어해줘

## 역할
1. **학습 매니저**: 일정, 숙제, 교재 진도 관리
2. **응원단**: 공부하면 칭찬, 완료하면 축하 🎉
3. **공부 도우미**: 모르는 거 물어보면 초등학생 눈높이에 맞게 설명
4. **생활 친구**: 체형 기록, 일상 대화도 OK
5. **수첩 관리**: 류하 수첩에 기록 추가/조회/수정 (기억해둘 것, 메모, 일기 등)

## 현재 학습관리 화면 구조
${RYUHA_DASHBOARD_STRUCTURE}

## MCP 도구
류하가 일정/숙제/교재/체형 관련 요청을 하면 MCP 도구를 사용해.
도구 이름은 모두 ryuha_ 접두사.

### 일정 관리
- ryuha_list_schedules: 일정 조회 (start_date, end_date)
- ryuha_create_schedule: 일정 추가 (title, schedule_date 필수, type: 'school'|'academy'|'homework'|'etc')
- ryuha_update_schedule: 일정 수정/완료 (is_completed: true)
- ryuha_delete_schedule: 일정 삭제

### 숙제 관리
- ryuha_list_homework: 숙제 목록 (schedule_id로 필터)
- ryuha_create_homework: 숙제 추가 (schedule_id, content, deadline)
- ryuha_update_homework: 숙제 완료 (is_completed: true)
- ryuha_delete_homework: 숙제 삭제

### 교재 & 진도
- ryuha_list_subjects: 과목 목록
- ryuha_list_textbooks: 교재 목록 (subject_id로 필터)
- ryuha_list_chapters: 챕터 목록 (textbook_id로 필터)
- ryuha_update_chapter: 챕터 상태 변경 (status: pending/in_progress/completed)
- ryuha_create_subject/textbook/chapter: 새로 추가

### 체형 기록
- ryuha_list_body_records: 기록 조회
- ryuha_create_body_record: 기록 추가 (record_date, height_cm, weight_kg)

### 메모
- ryuha_list_memos: 메모 조회 (start_date, end_date)
- ryuha_upsert_memo: 메모 작성 (memo_date, content)

### 류하 수첩 (노트)
- ryuha_list_notes: 수첩 노트 목록 조회 (category, search로 필터)
- ryuha_create_note: 수첩에 새 노트 작성 (title, content 필수)
- ryuha_update_note: 수첩 노트 수정 (id 필수)
- ryuha_delete_note: 수첩 노트 삭제 (id 필수)

## Supabase 직접 접근
ryuha_* MCP 도구로 안 되는 복잡한 작업은 Supabase MCP 도구로 직접 DB에 접근할 수 있어.
- mcp__supabase__execute_sql: SQL 직접 실행 (SELECT/INSERT/UPDATE/DELETE)
- mcp__supabase__list_tables: 테이블 목록 확인

**주요 테이블**: ryuha_schedules, ryuha_homework_items, ryuha_subjects, ryuha_textbooks, ryuha_chapters, ryuha_body_records, ryuha_notes
**주의**: ryuha_* 테이블만 접근할 것. 다른 테이블은 건드리지 마.

## 응답 규칙
1. 텔레그램 메시지니까 짧고 읽기 쉽게!
2. 한 번에 너무 많은 정보 쏟아내지 마. 핵심만.
3. 일정/숙제 완료하면 크게 칭찬! 🎉🥳
4. 숙제 마감이 가까우면 부드럽게 알려줘 (절대 압박 X)
5. **일정 알려줄 때 시간도 같이 알려줘** (예: "3시 30분 대치해법수학")
6. **학원 일정을 알려줄 때 관련 과제 완료여부도 체크** (예: "✅ 숙제 완료!" or "📝 숙제 아직 안 했어")
7. 여러 메시지로 나눌 때: \\n---SPLIT---\\n 사용
8. 선택지를 줄 때 버튼 제안:
\`\`\`buttons
[["오늘 일정 보기", "오늘 일정 알려줘"], ["숙제 확인", "숙제 뭐 있어?"]]
\`\`\`
9. 도구 실행 결과를 그대로 보여주지 마. 자연스럽게 요약해서 전달해.
10. 날짜는 "3월 30일 (일)" 형태로 읽기 쉽게.
11. 내부 오류를 고칠 때는 아래 "봇 런타임 로그"를 먼저 참고하되, 류하에게는 기술 로그를 길게 설명하지 마.

## 현재 학습 현황
${context}

## 봇 런타임 로그
${runtimeContext}

## 최근 대화
${historyText}`
}

// ============================================================
// Context builder
// ============================================================
async function buildContext(): Promise<string> {
  const cached = contextCache
  if (cached && Date.now() - cached.updatedAt < CONTEXT_CACHE_TTL) {
    return cached.value
  }
  if (contextCachePromise) {
    return contextCachePromise
  }

  contextCachePromise = (async () => {
    const today = new Date()
    const todayStr = getKstDateString(today)
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    const weekEndStr = getKstDateString(weekEnd)

    const parts: string[] = []

    // 오늘 & 이번주 일정
    try {
      const { data: schedules } = await supabase
        .from('ryuha_schedules')
        .select('*, subject:ryuha_subjects(*)')
        .gte('schedule_date', todayStr)
        .lte('schedule_date', weekEndStr)
        .order('schedule_date')
        .order('start_time')

      if (schedules?.length) {
        const todaySchedules = schedules.filter(s => s.schedule_date === todayStr)
        const upcomingSchedules = schedules.filter(s => s.schedule_date !== todayStr)

        if (todaySchedules.length) {
          parts.push(`### 오늘 일정 (${todayStr})`)
          for (const s of todaySchedules) {
            const status = s.is_completed ? '✅' : '⬜'
            const time = s.start_time ? ` ${s.start_time}` : ''
            const subject = s.subject?.name ? ` [${s.subject.name}]` : ''
            parts.push(`${status}${time}${subject} ${s.title}`)
          }
        } else {
          parts.push(`### 오늘 일정: 없음`)
        }

        if (upcomingSchedules.length) {
          parts.push(`\n### 이번주 예정`)
          for (const s of upcomingSchedules.slice(0, 10)) {
            const status = s.is_completed ? '✅' : '⬜'
            const subject = s.subject?.name ? ` [${s.subject.name}]` : ''
            parts.push(`${status} ${s.schedule_date}${subject} ${s.title}`)
          }
        }
      } else {
        parts.push('### 오늘 & 이번주 일정: 없음')
      }
    } catch (e) {
      console.error('[context] schedules error:', e)
    }

    // 미완료 숙제
    try {
      const { data: homework } = await supabase
        .from('ryuha_homework_items')
        .select('*, schedule:ryuha_schedules(title, subject:ryuha_subjects(name))')
        .eq('is_completed', false)
        .gte('deadline', todayStr)
        .order('deadline')
        .limit(10)

      if (homework?.length) {
        parts.push(`\n### 미완료 숙제`)
        for (const h of homework) {
          const subjectName = h.schedule?.subject?.name || ''
          parts.push(`⬜ [${h.deadline}]${subjectName ? ` ${subjectName}` : ''}: ${h.content}`)
        }
      }
    } catch (e) {
      console.error('[context] homework error:', e)
    }

    // 과목별 진도
    try {
      const { data: subjects } = await supabase
        .from('ryuha_subjects')
        .select('id, name')
        .order('order_index')

      const { data: chapters } = await supabase
        .from('ryuha_chapters')
        .select('textbook_id, status, textbook:ryuha_textbooks(subject_id)')

      if (subjects?.length && chapters?.length) {
        parts.push(`\n### 과목별 진도`)
        for (const subj of subjects) {
          const subjChapters = chapters.filter((c: any) => c.textbook?.subject_id === subj.id)
          const completed = subjChapters.filter(c => c.status === 'completed').length
          const total = subjChapters.length
          if (total > 0) {
            const pct = Math.round((completed / total) * 100)
            parts.push(`${subj.name}: ${completed}/${total} (${pct}%)`)
          }
        }
      }
    } catch (e) {
      console.error('[context] progress error:', e)
    }

    // 최근 체형 기록
    try {
      const { data: records } = await supabase
        .from('ryuha_body_records')
        .select('*')
        .order('record_date', { ascending: false })
        .limit(3)

      if (records?.length) {
        parts.push(`\n### 최근 체형 기록`)
        for (const r of records) {
          const height = r.height_cm ? `키 ${r.height_cm}cm` : ''
          const weight = r.weight_kg ? `몸무게 ${r.weight_kg}kg` : ''
          parts.push(`${r.record_date}: ${[height, weight].filter(Boolean).join(', ')}`)
        }
      }
    } catch (e) {
      console.error('[context] body records error:', e)
    }

    // 최근 수첩 노트
    try {
      const { data: notes } = await supabase
        .from('ryuha_notes')
        .select('id, title, category, is_pinned, updated_at')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(5)

      if (notes?.length) {
        parts.push(`\n### 류하 수첩 (최근 노트)`)
        for (const n of notes) {
          const pin = n.is_pinned ? '📌 ' : ''
          const cat = n.category && n.category !== '메모' ? ` [${n.category}]` : ''
          parts.push(`${pin}${n.title}${cat} (${n.updated_at?.split('T')[0]})`)
        }
      }
    } catch (e) {
      console.error('[context] notebook notes error:', e)
    }

    const value = parts.join('\n') || '(데이터 없음)'
    contextCache = { value, updatedAt: Date.now() }
    return value
  })()

  try {
    return await contextCachePromise
  } finally {
    contextCachePromise = null
  }
}

// ============================================================
// Claude CLI
// ============================================================
const RYUHA_MCP_TOOLS = 'mcp__claude_ai_willow-dashboard__ryuha_*'
const SUPABASE_MCP_TOOLS = 'mcp__supabase__*'

function runRinaTurn(prompt: string, options?: {
  noTools?: boolean
  onProgress?: (p: CodexProgress) => void
  signal?: AbortSignal
  threadId?: string | null
  onThreadEvent?: (event: AgentThreadEvent) => void
}) {
  return runAgentTurn(prompt, {
    runner: 'sdk',
    allowedTools: options?.noTools ? undefined : [RYUHA_MCP_TOOLS, SUPABASE_MCP_TOOLS],
    backend: 'codex',
    onProgress: options?.onProgress,
    signal: options?.signal,
    threadId: options?.threadId,
    onThreadEvent: options?.onThreadEvent,
    cwd: process.cwd(),
  })
}

// ============================================================
// Response parsing (buttons, split)
// ============================================================
function parseResponse(text: string): { messages: string[]; buttons?: { text: string; callback_data: string }[][] } {
  let buttons: { text: string; callback_data: string }[][] | undefined

  // Extract buttons
  const btnMatch = text.match(/```buttons\n([\s\S]*?)```/)
  if (btnMatch) {
    try {
      const parsed = JSON.parse(btnMatch[1])
      if (Array.isArray(parsed)) {
        buttons = parsed.map((row: any) => {
          if (Array.isArray(row) && row.length === 2) {
            return [{ text: row[0], callback_data: row[1] }]
          }
          return row
        })
      }
    } catch { /* ignore parse error */ }
    text = text.replace(/```buttons\n[\s\S]*?```/, '').trim()
  }

  // Split messages
  const messages = text.split(/\n---SPLIT---\n/).map(m => m.trim()).filter(Boolean)

  return { messages: messages.length ? messages : [''], buttons }
}

// ============================================================
// Message handler
// ============================================================
async function handleMessage(chatId: number, userText: string, abortSignal?: AbortSignal, lastMessageId?: number) {
  console.log(`[msg] ${chatId}: ${userText.slice(0, 100)}`)
  recordRuntimeEvent({
    botKey: 'rina-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    source: 'message_received',
    message: `message received from ${chatId}`,
    details: {
      chatId,
      lastMessageId,
      textPreview: userText.slice(0, 240),
    },
  })
  const workspacePath = process.cwd()
  const taskScope = getInteractiveTaskScope(userText)
  let activeThreadId: string | null = null
  try {
    const progressStart = getProgressStartedAt(chatId) ?? Date.now()
    if (lastMessageId) {
      void setReaction(chatId, lastMessageId, '❤️')
    }
    void sendTyping(chatId)

    const progressLines: string[] = []
    let progressPercent = 18
    let progressStage = '처리 시작'
    let progressCurrent = '메시지 내용을 정리하고 있어.'
    let progressMeta: string[] = []

    const syncProgress = async () => {
      await renderProgressMessage(chatId, buildProgressMessage({
        percent: progressPercent,
        stage: progressStage,
        current: progressCurrent,
        startedAt: progressStart,
        recent: progressLines,
        meta: progressMeta,
      }), {
        replyToMessageId: lastMessageId,
        startedAt: progressStart,
      })
    }

    const addProgress = async (
      line: string,
      opts?: { percent?: number; stage?: string; current?: string; meta?: string[] }
    ) => {
      if (opts?.percent != null) progressPercent = opts.percent
      if (opts?.stage) progressStage = opts.stage
      if (opts?.current) progressCurrent = opts.current
      if (opts?.meta) progressMeta = opts.meta
      progressLines.push(line)
      if (progressLines.length > 4) progressLines.shift()
      await syncProgress()
    }

    await syncProgress()
    await addProgress('일정 · 숙제 · 진도 · 최근 대화를 읽는 중', {
      percent: 28,
      stage: '컨텍스트 로드',
      current: '학습 현황과 대화 맥락을 모으고 있어.',
    })

    const [context, history, runtimeContext] = await Promise.all([
      buildContext(),
      getConversation(chatId),
      getRuntimeLogContext({
        botLabel: 'Rina',
        botKey: 'rina-bot',
        jsonlPath: BOT_RUNTIME_JSONL_FILE,
        textLogPath: BOT_TEXT_LOG_FILE,
      }),
    ])

    if (abortSignal?.aborted) return

    const historyForPrompt = history.slice(-MAX_PROMPT_HISTORY)
    await addProgress(`대화기록 ${historyForPrompt.length}건 확인`, {
      percent: 38,
      stage: '맥락 정리',
      current: '질문과 연결될 일정/숙제 흐름을 정리하고 있어.',
    })
    const existingThread = getAgentThread(BOT_THREAD_REGISTRY_FILE, {
      botKey: 'rina-bot',
      chatId,
      workspaceKey: RINA_WORKSPACE_KEY,
      taskScope,
    })
    activeThreadId = existingThread?.threadId ?? null
    if (activeThreadId) {
      await addProgress(`Codex thread 이어받기 준비: ${shortThreadId(activeThreadId)}`, {
        percent: 42,
        stage: '맥락 정리',
        current: '이전에 하던 학습 대화 흐름을 이어받을 준비를 하고 있어.',
      })
    }

    const systemPrompt = buildSystemPrompt(context, historyForPrompt, runtimeContext)
    const fullPrompt = `${systemPrompt}\n\n---\n류하: ${userText}`
    await addProgress(`프롬프트 ${(fullPrompt.length / 1000).toFixed(0)}K자 준비`, {
      percent: 48,
      stage: '프롬프트 구성',
      current: '리나가 바로 답할 수 있게 입력을 정리했어.',
    })

    if (abortSignal?.aborted) return

    let codexCmds = 0
    let codexTools = 0
    const codexFiles = new Set<string>()
    let liveActivity = '🤖 리나가 답을 만드는 중이야.'
    let lastLiveEdit = 0
    const oneLine = (s: string, n = 56) => {
      const t = (s || '').replace(/\s+/g, ' ').trim()
      return t.length > n ? t.slice(0, n) + '…' : t
    }
    const pushLive = (force = false) => {
      const now = Date.now()
      if (!force && now - lastLiveEdit < 1800) return
      lastLiveEdit = now
      progressPercent = Math.max(progressPercent, 62)
      progressStage = '에이전트 실행'
      progressCurrent = liveActivity
      progressMeta = [
        codexCmds ? `명령 ${codexCmds}` : '',
        codexFiles.size ? `파일 ${codexFiles.size}` : '',
        codexTools ? `도구 ${codexTools}` : '',
        activeThreadId ? `thread ${shortThreadId(activeThreadId)}` : '',
      ].filter(Boolean)
      void syncProgress()
    }
    const onCodexProgress = (p: CodexProgress) => {
      if (p.phase !== 'item_started' && p.phase !== 'item_completed') return
      switch (p.itemType) {
        case 'command_execution':
          if (p.phase === 'item_started') codexCmds++
          progressPercent = Math.max(progressPercent, 68)
          liveActivity = `⚙️ ${oneLine(p.command || '명령 실행 중')}`
          break
        case 'mcp_tool_call':
          codexTools++
          progressPercent = Math.max(progressPercent, 76)
          liveActivity = `🔧 ${oneLine(p.text || p.command || '학습 도구 확인 중')}`
          break
        case 'web_search':
          codexTools++
          progressPercent = Math.max(progressPercent, 74)
          liveActivity = `🔍 ${oneLine(p.text || '검색 중')}`
          break
        case 'file_change':
          for (const file of p.files || []) codexFiles.add(file)
          progressPercent = Math.max(progressPercent, 80)
          liveActivity = `✏️ ${oneLine((p.files || []).join(', ') || '파일 정리 중')}`
          break
        case 'agent_message':
          progressPercent = Math.max(progressPercent, 84)
          liveActivity = `💬 ${oneLine(p.text || '답을 정리하는 중')}`
          break
        case 'reasoning':
          progressPercent = Math.max(progressPercent, 64)
          liveActivity = '🤔 질문을 이해하고 답을 정리하는 중이야.'
          break
        default:
          if (p.itemType) liveActivity = `⏳ ${p.itemType}`
      }
      pushLive()
    }

    await addProgress('리나가 실제 작업 시작', {
      percent: 58,
      stage: '에이전트 실행',
      current: '도구를 보면서 답변을 만들고 있어.',
    })

    const liveTimer = setInterval(() => { void pushLive(true) }, 3000)
    const stopTyping = startTypingPulse(chatId)
    let response = ''
    let responseBackend = 'codex-sdk'
    try {
      const responseTurn = await runRinaTurn(fullPrompt, {
        onProgress: onCodexProgress,
        signal: abortSignal,
        threadId: activeThreadId,
        onThreadEvent: (event) => {
          activeThreadId = event.threadId
          upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
            botKey: 'rina-bot',
            chatId,
            workspaceKey: RINA_WORKSPACE_KEY,
            workspacePath,
            taskScope,
            threadId: event.threadId,
            status: 'active',
            lastUserMessage: userText,
          })
          recordRuntimeEvent({
            botKey: 'rina-bot',
            jsonlPath: BOT_RUNTIME_JSONL_FILE,
            source: 'thread_bound',
            message: `${event.mode} codex thread for ${chatId}`,
            details: {
              chatId,
              workspaceKey: RINA_WORKSPACE_KEY,
              workspaceLabel: RINA_WORKSPACE_LABEL,
              workspacePath,
              taskScope,
              threadId: event.threadId,
              mode: event.mode,
            },
          })
          void addProgress(
            `${event.mode === 'resumed' ? 'Codex thread 재개' : 'Codex thread 시작'}: ${shortThreadId(event.threadId)}`,
            {
              percent: Math.max(progressPercent, 60),
              stage: '에이전트 실행',
              current: event.mode === 'resumed'
                ? '이전에 이어서 학습 대화를 계속 정리하고 있어.'
                : '새 학습 대화 thread를 열고 답을 만들고 있어.',
            }
          )
          void pushLive(true)
        },
      })
      response = responseTurn.text
      responseBackend = responseTurn.backend
      if (responseTurn.threadId) activeThreadId = responseTurn.threadId
    } finally {
      clearInterval(liveTimer)
      stopTyping()
    }

    if (activeThreadId) {
      upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'rina-bot',
        chatId,
        workspaceKey: RINA_WORKSPACE_KEY,
        workspacePath,
        taskScope,
        threadId: activeThreadId,
        status: 'active',
        lastUserMessage: userText,
        lastSummary: response.slice(0, 400),
        countRun: true,
      })
    }

    if (abortSignal?.aborted) return

    invalidateContextCache()
    await addProgress(`응답 ${(response.length / 1000).toFixed(1)}K자 생성`, {
      percent: 90,
      stage: '응답 정리',
      current: '버튼과 메시지 묶음을 정리하고 있어.',
      meta: [
        codexCmds ? `명령 ${codexCmds}` : '',
        codexFiles.size ? `파일 ${codexFiles.size}` : '',
        codexTools ? `도구 ${codexTools}` : '',
        activeThreadId ? `thread ${shortThreadId(activeThreadId)}` : '',
        `백엔드 ${responseBackend}`,
      ].filter(Boolean),
    })

    const { messages, buttons } = parseResponse(response)
    await addProgress(`메시지 ${messages.length}개로 정리`, {
      percent: 96,
      stage: '응답 전송',
      current: '텔레그램으로 답을 보내는 중이야.',
    })

    // Send messages
    for (let i = 0; i < messages.length; i++) {
      if (!messages[i]) continue
      if (i === messages.length - 1 && buttons) {
        await sendMessageWithButtons(chatId, messages[i], buttons)
      } else {
        await sendMessage(chatId, messages[i])
      }
    }

    // Save conversation (락으로 보호)
    const now = new Date().toISOString()
    await withConversationLock(chatId, async () => {
      const freshHistory = await getConversation(chatId)
      freshHistory.push({ role: 'user', content: userText, timestamp: now })
      freshHistory.push({ role: 'assistant', content: response.slice(0, 1000), timestamp: now })
      await saveConversation(chatId, freshHistory)
    })

    await closeProgressMessage(chatId, {
      finalText: buildProgressMessage({
        percent: 100,
        stage: '완료',
        current: '답변 전송까지 끝났어.',
        startedAt: progressStart,
        recent: [...progressLines, `응답 ${messages.length}개 전송 완료`].slice(-4),
        meta: [
          codexCmds ? `명령 ${codexCmds}` : '',
          codexFiles.size ? `파일 ${codexFiles.size}` : '',
          codexTools ? `도구 ${codexTools}` : '',
        ].filter(Boolean),
      }),
      lingerMs: 1200,
    })
    recordRuntimeEvent({
      botKey: 'rina-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'message_completed',
      message: `message handled for ${chatId}`,
      details: {
        chatId,
        durationMs: Date.now() - progressStart,
        workspaceKey: RINA_WORKSPACE_KEY,
        workspaceLabel: RINA_WORKSPACE_LABEL,
        workspacePath,
        taskScope,
        threadId: activeThreadId,
        responseCount: messages.length,
        codexCommands: codexCmds,
        codexFiles: Array.from(codexFiles),
        codexTools,
        backend: responseBackend,
        replyPreview: response.slice(0, 240),
      },
    })

  } catch (err) {
    if (abortSignal?.aborted || err instanceof AgentAbortError) {
      console.log(`[msg] ${chatId}: abort -> 재배칭 run으로 넘김`)
      return
    }
    if (activeThreadId) {
      markAgentThreadFailed(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'rina-bot',
        chatId,
        workspaceKey: RINA_WORKSPACE_KEY,
        taskScope,
      }, err instanceof Error ? err.message : String(err))
    }
    console.error('[handle] error:', err)
    recordRuntimeEvent({
      botKey: 'rina-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      level: 'error',
      source: 'message_error',
      message: `message handling failed for ${chatId}`,
      details: {
        chatId,
        durationMs: Date.now() - (getProgressStartedAt(chatId) ?? Date.now()),
        workspaceKey: RINA_WORKSPACE_KEY,
        workspaceLabel: RINA_WORKSPACE_LABEL,
        workspacePath,
        taskScope,
        threadId: activeThreadId,
        textPreview: userText.slice(0, 240),
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      },
    })
    invalidateContextCache()
    await closeProgressMessage(chatId, {
      finalText: buildProgressMessage({
        percent: 100,
        stage: '오류',
        current: '처리 중 문제가 생겨서 여기서 멈췄어.',
        startedAt: getProgressStartedAt(chatId) ?? Date.now(),
        recent: [err instanceof Error ? err.message.slice(0, 60) : '알 수 없는 오류'],
      }),
      lingerMs: 1500,
    })
    await sendMessage(chatId, '앗, 잠깐 오류가 났어 😅 다시 한번 말해줄래?')
  }
}

// ============================================================
// Batch handler
// ============================================================
function onNewMessage(chatId: number, text: string, messageId: number) {
  // 진행 중인 처리 취소
  const existingAbort = processingAbort.get(chatId)
  if (existingAbort) {
    existingAbort.abort()
  }

  const existing = messageBatchBuffer.get(chatId)
  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push(text)
    existing.lastMessageId = messageId
    void updateQueuedProgress(chatId, {
      messageCount: existing.messages.length,
      replyToMessageId: messageId,
      phase: existingAbort ? 'restart' : 'merged',
    })
    existing.timer = setTimeout(() => flushBatch(chatId), MESSAGE_BATCH_DELAY)
  } else {
    const timer = setTimeout(() => flushBatch(chatId), MESSAGE_BATCH_DELAY)
    messageBatchBuffer.set(chatId, { messages: [text], timer, lastMessageId: messageId })
    void updateQueuedProgress(chatId, {
      messageCount: 1,
      replyToMessageId: messageId,
      phase: existingAbort ? 'restart' : 'queued',
      startedAt: Date.now(),
    })
  }
}

async function flushBatch(chatId: number) {
  const batch = messageBatchBuffer.get(chatId)
  if (!batch) return
  messageBatchBuffer.delete(chatId)

  // 이전 abort된 메시지 합치기
  const previousText = inFlightText.get(chatId)
  inFlightText.delete(chatId)

  let combinedText = batch.messages.join('\n')
  if (previousText) {
    combinedText = `${previousText}\n${combinedText}`
  }

  const ac = new AbortController()
  processingAbort.set(chatId, ac)
  inFlightText.set(chatId, combinedText)

  try {
    await updateQueuedProgress(chatId, {
      messageCount: combinedText.split('\n').filter(Boolean).length,
      replyToMessageId: batch.lastMessageId,
      phase: 'starting',
    })
    await handleMessage(chatId, combinedText, ac.signal, batch.lastMessageId)
  } catch (err) {
    if (!ac.signal.aborted) {
      console.error('[flush] error:', err)
    }
  } finally {
    if (processingAbort.get(chatId) === ac) {
      processingAbort.delete(chatId)
    }
    if (inFlightText.get(chatId) === combinedText) {
      inFlightText.delete(chatId)
    }
  }
}

// ============================================================
// Daily greeting & reminders (아침 인사 + 저녁 알람)
// ============================================================
let lastGreetingDate = ''
let lastEveningDate = ''

async function sendScheduledMessage(chatId: number, prompt: string, tag: string) {
  const workspacePath = process.cwd()
  const taskScope = getScheduledTaskScope(tag)
  let activeThreadId = getAgentThread(BOT_THREAD_REGISTRY_FILE, {
    botKey: 'rina-bot',
    chatId,
    workspaceKey: RINA_WORKSPACE_KEY,
    taskScope,
  })?.threadId ?? null
  try {
    const responseTurn = await runRinaTurn(prompt, {
      noTools: true,
      threadId: activeThreadId,
      onThreadEvent: (event) => {
        activeThreadId = event.threadId
        upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
          botKey: 'rina-bot',
          chatId,
          workspaceKey: RINA_WORKSPACE_KEY,
          workspacePath,
          taskScope,
          threadId: event.threadId,
          status: 'active',
          lastUserMessage: `[${tag}] scheduled prompt`,
        })
        recordRuntimeEvent({
          botKey: 'rina-bot',
          jsonlPath: BOT_RUNTIME_JSONL_FILE,
          source: 'scheduled_thread_bound',
          message: `${tag} thread ${event.mode} for ${chatId}`,
          details: {
            chatId,
            tag,
            workspaceKey: RINA_WORKSPACE_KEY,
            workspaceLabel: RINA_WORKSPACE_LABEL,
            workspacePath,
            taskScope,
            threadId: event.threadId,
            mode: event.mode,
          },
        })
      },
    })
    const response = responseTurn.text
    if (responseTurn.threadId) activeThreadId = responseTurn.threadId
    if (activeThreadId) {
      upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'rina-bot',
        chatId,
        workspaceKey: RINA_WORKSPACE_KEY,
        workspacePath,
        taskScope,
        threadId: activeThreadId,
        status: 'active',
        lastUserMessage: `[${tag}] scheduled prompt`,
        lastSummary: response.slice(0, 400),
        countRun: true,
      })
    }
    const { messages, buttons } = parseResponse(response)
    for (let i = 0; i < messages.length; i++) {
      if (!messages[i]) continue
      if (i === messages.length - 1 && buttons) {
        await sendMessageWithButtons(chatId, messages[i], buttons)
      } else {
        await sendMessage(chatId, messages[i])
      }
    }

    await withConversationLock(chatId, async () => {
      const history = await getConversation(chatId)
      history.push({ role: 'assistant', content: `[${tag}] ${response.slice(0, 500)}`, timestamp: new Date().toISOString() })
      await saveConversation(chatId, history)
    })
    recordRuntimeEvent({
      botKey: 'rina-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'scheduled_message_completed',
      message: `${tag} message sent`,
      details: {
        chatId,
        tag,
        workspaceKey: RINA_WORKSPACE_KEY,
        workspaceLabel: RINA_WORKSPACE_LABEL,
        workspacePath,
        taskScope,
        threadId: activeThreadId,
        responseCount: messages.length,
        replyPreview: response.slice(0, 240),
      },
    })
  } catch (err) {
    if (activeThreadId) {
      markAgentThreadFailed(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'rina-bot',
        chatId,
        workspaceKey: RINA_WORKSPACE_KEY,
        taskScope,
      }, err instanceof Error ? err.message : String(err))
    }
    console.error(`[${tag}] error:`, err)
  }
}

async function checkMorningGreeting() {
  if (allowedChatIds.length === 0) return

  const now = new Date()
  const { hour, minute: min, dateStr: todayStr } = getKstClock(now)

  // 07:30~08:30 사이 한번만
  if ((hour === 7 && min >= 30) || (hour === 8 && min <= 30)) {
    if (lastGreetingDate === todayStr) return
    lastGreetingDate = todayStr

    console.log('[greeting] sending morning greeting')
    const context = await buildContext()
    const prompt = `너는 류하의 학습관리 도우미 봇 "리나(Rina)"야.
오늘 날짜: ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
현재 시각: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

오늘의 학습 현황:
${context}

아래 지시에 따라 류하에게 보낼 아침 인사 메시지 텍스트만 작성해.
- 오늘 일정이 있으면 시간과 함께 간단히 알려줘
- 학원 수업이 있으면 관련 숙제 완료 여부도 체크해서 알려줘
- 밝고 에너지 넘치게! 짧게 2-3문장으로

중요: 메시지 본문만 출력해. "전송완료", "보냈습니다" 같은 시스템 상태 정보나 설명은 절대 포함하지 마. MCP 도구도 사용하지 마.`

    for (const cid of allowedChatIds) {
      await sendScheduledMessage(cid, prompt, '아침 인사')
    }
  }
}

async function checkEveningReminder() {
  if (allowedChatIds.length === 0) return

  const now = new Date()
  const { hour, minute: min, dateStr: todayStr } = getKstClock(now)

  // 19:30~20:30 사이 한번만
  if ((hour === 19 && min >= 30) || (hour === 20 && min <= 30)) {
    if (lastEveningDate === todayStr) return
    lastEveningDate = todayStr

    console.log('[evening] sending evening reminder')
    const context = await buildContext()
    const prompt = `너는 류하의 학습관리 도우미 봇 "리나(Rina)"야.
오늘 날짜: ${now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
현재 시각: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}

오늘의 학습 현황:
${context}

아래 지시에 따라 류하에게 보낼 저녁 알람 메시지 텍스트만 작성해.
- 오늘 완료한 일정이 있으면 칭찬해줘 🎉
- 아직 안 끝낸 숙제가 있으면 부드럽게 알려줘 (압박 X)
- 내일 일정이 있으면 미리 알려줘
- 짧고 따뜻하게 2-3문장으로!

중요: 메시지 본문만 출력해. "전송완료", "보냈습니다" 같은 시스템 상태 정보나 설명은 절대 포함하지 마. MCP 도구도 사용하지 마.`

    for (const cid of allowedChatIds) {
      await sendScheduledMessage(cid, prompt, '저녁 알람')
    }
  }
}

// ============================================================
// Polling loop
// ============================================================
let offset = loadOffset()

async function poll() {
  try {
    const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message","callback_query"]`, {
      signal: AbortSignal.timeout(35000),
    })
    const json = await res.json()

    if (!json.ok || !json.result?.length) return

    for (const update of json.result) {
      offset = update.update_id + 1
      saveOffset(offset)

      if (processingMessages.has(update.update_id)) continue
      processingMessages.add(update.update_id)
      setTimeout(() => processingMessages.delete(update.update_id), 60000)

      // Callback query (버튼 클릭)
      if (update.callback_query) {
        const cb = update.callback_query
        const cbChatId = cb.message?.chat?.id
        const cbData = cb.data
        if (cbChatId && cbData) {
          await answerCallbackQuery(cb.id)
          if (!isAllowedUser(cbChatId)) continue
          onNewMessage(cbChatId, cbData, cb.message?.message_id || 0)
        }
        continue
      }

      // Text message
      if (update.message?.text) {
        const chatId = update.message.chat.id
        const text = update.message.text

        // /start + 등록코드로 사용자 등록
        if (text.startsWith('/start')) {
          const code = text.replace('/start', '').trim()
          if (isAllowedUser(chatId)) {
            await sendMessage(chatId, '안녕! 나는 리나야 📚\n\n공부 일정이나 숙제 관리를 도와줄게!\n\n"오늘 일정 알려줘", "숙제 뭐 있어?" 같이 편하게 말해줘 😊')
          } else if (code === REG_CODE && allowedChatIds.length < MAX_USERS) {
            allowedChatIds.push(chatId)
            saveAllowedUsers()
            console.log(`[reg] 사용자 등록: ${chatId} (${allowedChatIds.length}/${MAX_USERS})`)
            await sendMessage(chatId, '등록 완료! 안녕, 나는 리나야 📚\n\n공부 일정이나 숙제 관리를 도와줄게!\n\n"오늘 일정 알려줘", "숙제 뭐 있어?" 같이 편하게 말해줘 😊')
          } else {
            await sendMessage(chatId, '이 봇은 초대된 사용자만 이용할 수 있어요.')
          }
          continue
        }

        // 미등록 사용자 차단
        if (!isAllowedUser(chatId)) {
          await sendMessage(chatId, '이 봇은 초대된 사용자만 이용할 수 있어요.\n/start 등록코드 를 입력해주세요.')
          continue
        }

        onNewMessage(chatId, text, update.message.message_id)
      }
    }
  } catch (err: any) {
    if (err.name !== 'TimeoutError') {
      console.error('[poll] error:', err.message)
    }
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  if (!BOT_TOKEN) {
    console.error('RYUHA_TELEGRAM_BOT_TOKEN not set')
    process.exit(1)
  }

  if (!acquireLock()) {
    process.exit(1)
  }

  loadAllowedUsers()
  console.log(`[init] 등록된 사용자: ${allowedChatIds.length}/${MAX_USERS}`)

  process.on('SIGINT', () => { releaseLock(); process.exit(0) })
  process.on('SIGTERM', () => { releaseLock(); process.exit(0) })
  process.on('uncaughtException', (err) => {
    console.error('[fatal]', err)
    releaseLock()
    process.exit(1)
  })

  console.log('🎓 류하 공부친구 봇 시작!')
  recordRuntimeEvent({
    botKey: 'rina-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    source: 'startup_ready',
    message: 'ryuha bot ready',
    details: {
      pid: process.pid,
      allowedUsers: allowedChatIds.length,
    },
  })

  // 아침 인사 + 저녁 알람 체크 (30분 간격)
  setInterval(checkMorningGreeting, 30 * 60 * 1000)
  setInterval(checkEveningReminder, 30 * 60 * 1000)
  checkMorningGreeting()
  checkEveningReminder()

  // Polling loop
  while (true) {
    await poll()
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
}

main()
