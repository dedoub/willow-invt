import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { execSync, spawn } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, unlinkSync, writeFileSync, readdirSync } from 'fs'
import { join, basename, relative } from 'path'
import { formatCompactLink, markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'
import { runAgent, runAgentTurn, AgentAbortError, type CodexProgress } from './lib/agent-cli'

// 텔레그램봇 전용 codex 모델 (봇의 모든 codex 호출에 -m 로 오버라이드). 전역 codex config는 건드리지 않음.
const BOT_MODEL = 'gpt-5.6-sol'

// 하이브리드 추론 강도: 일상 대화는 medium(캡 절약), 무거운 분석/코딩/계획 요청만 high로 승격.
const HEAVY_EFFORT_RE = /분석|왜|원인|디버그|디버깅|조사|리서치|검토|진단|전략|비교|평가|계획|설계|리팩터|최적화|성능|버그|고쳐|코드|스크립트|구현|짜줘|만들어\s*줘/
function pickEffort(text: string): 'medium' | 'high' {
  const t = (text || '').trim()
  if (HEAVY_EFFORT_RE.test(t)) return 'high'
  if (t.length > 160) return 'high' // 긴 요청은 대체로 복잡
  return 'medium'
}
import { getAgentThread, markAgentThreadFailed, shortThreadId, upsertAgentThread } from './lib/agents/thread-registry'
import { isResumablePendingTask, loadPendingTasks, patchPendingTask, removePendingTask, savePendingTask } from './lib/inflight-resume'
import { type LocalServiceDefinition, getLocalServiceContext, getLocalServiceRegistry, getLocalServiceStatus, executeLocalServiceAction } from './lib/local-services'
import { resolveLocalProjectContext, getLocalProjectByKey } from './lib/local-projects'
import { randomUUID } from 'node:crypto'
import { getRuntimeLogContext, installRuntimeConsoleCapture, installRuntimeProcessMonitor, recordRuntimeEvent } from './lib/runtime-logs'

// ============================================================
// Config
// ============================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
const voicecardsSupabase = process.env.VOICECARDS_SUPABASE_URL && process.env.VOICECARDS_SUPABASE_KEY
  ? createClient(process.env.VOICECARDS_SUPABASE_URL, process.env.VOICECARDS_SUPABASE_KEY)
  : null
const reviewnotesSupabase = process.env.REVIEWNOTES_SUPABASE_URL && process.env.REVIEWNOTES_SUPABASE_KEY
  ? createClient(process.env.REVIEWNOTES_SUPABASE_URL, process.env.REVIEWNOTES_SUPABASE_KEY)
  : null

const MAX_HISTORY = 50 // 대화 기록 최대 보관 수
const MAX_PROMPT_HISTORY = 20 // 프롬프트에는 최근 대화만 주입해 응답 지연을 줄임
const MAX_AUTO_MESSAGES = 10 // 자동 메시지(브리핑/알림) 최대 보관 수
const POLL_INTERVAL = 1500 // ms
const MESSAGE_BATCH_DELAY = 1000 // 메시지 배칭 디바운스 대기 시간 (ms)
const MESSAGE_PART_DELAY_MIN = 200 // 여러 메시지로 나눠 보낼 때 최소 대기 (ms)
const MESSAGE_PART_DELAY_MAX = 450 // 여러 메시지로 나눠 보낼 때 최대 대기 (ms)
const NEWS_FETCH_TIMEOUT_MS = 6000
const YOUTUBE_FETCH_TIMEOUT_MS = 4000
const MARKET_FETCH_TIMEOUT_MS = 8000
const PROACTIVE_CHECK_INTERVAL = 30 * 60 * 1000 // 30분마다 자율 점검
const AUTO_FOLLOW_UP_SCAN_INTERVAL = 30 * 60 * 1000 // 30분마다 자동 follow-up 후보 점검
const AUTO_FOLLOW_UP_NOTIFY_ON_CREATE = false // 후보 등록 사실은 기본적으로 조용히 처리
const AUTO_FOLLOW_UP_ENABLE_WIKI_SIGNALS = false // 위키 신호는 기준 정교화 전까지 비활성
const VOICECARDS_EVENT_MONITOR_INTERVAL = 15 * 60 * 1000 // 15분마다 앱 사용자 로그 점검
const VOICECARDS_PURCHASE_MONITOR_INTERVAL = 60 * 1000 // 1분마다 결제 감시
const REVIEWNOTES_MONITOR_INTERVAL = 20 * 60 * 1000 // 20분마다 ReviewNotes 이상징후 점검
const ENABLE_VOICECARDS_LOCAL_LOG_MONITOR = process.env.WILLY_ENABLE_VOICECARDS_LOCAL_LOG_MONITOR === '1'
const TELEGRAM_RETRY_FALLBACK_MS = 1000
const TELEGRAM_RETRY_CAP_MS = 3 * 60 * 1000
const TYPING_MIN_INTERVAL_MS = 6000
const PROGRESS_EDIT_MIN_INTERVAL_MS = 2500
const SERVICE_LOG_MONITOR_INTERVAL = 60 * 1000 // 1분마다 로컬 서비스 로그 감시
const SERVICE_LOG_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 같은 오류 중복 알림 억제
const SERVICE_LOG_MAX_READ_BYTES = 96 * 1024
const VOICECARDS_PURCHASE_BOOT_LOOKBACK_MS = 12 * 60 * 60 * 1000
const VOICECARDS_PURCHASE_RESCAN_BUFFER_MS = 5 * 60 * 1000
const VOICECARDS_PURCHASE_LOOKBACK_CAP_MS = 24 * 60 * 60 * 1000
const LOG_DIR = join(__dirname, 'logs')
const LOCK_FILE = join(LOG_DIR, 'telegram-bot.lock')
const OFFSET_FILE = join(LOG_DIR, 'telegram-bot.offset')
const ALLOWED_USERS_FILE = join(LOG_DIR, 'willy-bot-users.json')
const BOT_TEXT_LOG_FILE = join(LOG_DIR, 'telegram-bot.log')
const BOT_RUNTIME_JSONL_FILE = join(LOG_DIR, 'telegram-bot.runtime.jsonl')
const BOT_INFLIGHT_FILE = join(LOG_DIR, 'telegram-bot.inflight.json')
const BOT_THREAD_REGISTRY_FILE = join(LOG_DIR, 'willy-agent-threads.json')
const WILLY_REG_CODE = '윌로우2026'
const WILLY_MAX_USERS = 2
const WEBSITE_STRUCTURE_CONTEXT = `## WILLOW-INVT 대시보드 정보구조
- 윌로우인베스트먼트
  - 사업관리: 일정, 인보이스, 은행잔고, 이메일, 운영 실무 관리
  - 업무위키: 사업/프로젝트/투자 관련 메모와 운영 지식 저장소
  - 주식투자: 포트폴리오, 워치리스트, 리서치, 시그널, 섹터로테이션
  - 부동산리서치: 시세/매물/추세 기반 부동산 조사
  - 류하일정: 가족/교육 일정과 학습 관리
- 프로젝트
  - 아크로스: ETF/AUM, 상품, 세금계산서, 프로젝트 위키, 이메일
  - ETC: ETF 플랫폼 및 문서/제품 관련 운영
  - 텐소프트웍스: 프로젝트, 일정, 현금흐름, 매출, 대출, 위키, 이메일
  - MonoR Apps: 앱 운영과 사용자/분석 업무
  - LLM Wiki: 실험적 지식 정리와 밸류체인 연구

이 구조는 대표의 업무가 "윌로우 본업 운영 + 투자관리 + 개별 프로젝트 운영 + 가족/교육 관리"로 병렬 구성되어 있음을 뜻한다.
질문이 어느 축에 속하는지 먼저 분류한 뒤, 관련 섹션의 데이터와 위키를 우선 참고하세요.`

installRuntimeConsoleCapture({ botKey: 'willy-bot', jsonlPath: BOT_RUNTIME_JSONL_FILE })
installRuntimeProcessMonitor({ botKey: 'willy-bot', jsonlPath: BOT_RUNTIME_JSONL_FILE })
recordRuntimeEvent({
  botKey: 'willy-bot',
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

// CEO chat_id 저장 (첫 메시지 수신 시 등록)
let ceoChatId: number | null = null

// 메시지 배칭: 연달아 오는 메시지를 합쳐서 한 번에 처리
const messageBatchBuffer: Map<number, { messages: string[]; timer: ReturnType<typeof setTimeout>; lastMessageId: number }> = new Map()

// 처리 중 메시지 취소를 위한 AbortController 관리
const processingAbort: Map<number, AbortController> = new Map()
// abort 시 원본 메시지 보존 — 새 메시지와 합침
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

interface TimedCache<T> {
  value: T
  updatedAt: number
}

function readTimedCache<T>(cache: TimedCache<T> | null, ttlMs: number): T | null {
  if (!cache) return null
  if (Date.now() - cache.updatedAt >= ttlMs) return null
  return cache.value
}

function writeTimedCache<T>(value: T): TimedCache<T> {
  return { value, updatedAt: Date.now() }
}

function randomMessageDelay(): number {
  return MESSAGE_PART_DELAY_MIN + Math.floor(Math.random() * (MESSAGE_PART_DELAY_MAX - MESSAGE_PART_DELAY_MIN + 1))
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
    queued: `메시지 ${opts.messageCount}개를 받았어요. ${Math.round(MESSAGE_BATCH_DELAY / 1000)}초 동안 추가 입력도 같이 볼게요.`,
    merged: `추가 메시지를 합쳐서 한 번에 처리하려고 정리 중이에요. (${opts.messageCount}개)`,
    restart: `새 메시지가 와서 기존 작업을 멈추고 다시 묶는 중이에요. (${opts.messageCount}개)`,
    starting: `배칭을 마치고 본격 처리를 시작해요. (${opts.messageCount}개)`,
  } as const
  const percentByPhase = { queued: 10, merged: 12, restart: 14, starting: 18 } as const
  const noteByPhase = {
    queued: '접수 완료',
    merged: `메시지 ${opts.messageCount}개 묶는 중`,
    restart: '새 입력 반영해 재조정',
    starting: '배칭 종료, 처리 시작',
  } as const

  await renderProgressMessage(chatId, buildProgressMessage({
    percent: percentByPhase[opts.phase],
    stage: opts.phase === 'starting' ? '처리 시작' : '접수/배칭',
    current: currentByPhase[opts.phase],
    startedAt,
    recent: [noteByPhase[opts.phase]],
    meta: [`입력 ${opts.messageCount}개`, opts.phase !== 'starting' ? `배칭 ${Math.round(MESSAGE_BATCH_DELAY / 1000)}초` : '곧 컨텍스트 로드'],
  }), {
    replyToMessageId: opts.replyToMessageId,
    startedAt,
  })
}

function relPath(p: string, base = process.cwd()): string {
  const r = relative(base, p)
  return r && !r.startsWith('..') ? r : p
}

function getConversationTaskScope(_text: string): string {
  return 'interactive-main'
}

function persistPendingMessage(chatId: number, text: string, opts?: {
  lastMessageId?: number
  startedAt?: number
  phase?: 'queued' | 'running' | 'codex_running' | 'action_running' | 'response_sending' | 'resuming'
  workspaceKey?: string
  workspacePath?: string
  resumeCount?: number
}) {
  savePendingTask(BOT_INFLIGHT_FILE, {
    chatId,
    text,
    lastMessageId: opts?.lastMessageId,
    startedAt: opts?.startedAt ? new Date(opts.startedAt).toISOString() : undefined,
    phase: opts?.phase,
    workspaceKey: opts?.workspaceKey,
    workspacePath: opts?.workspacePath,
    resumeCount: opts?.resumeCount,
  })
}

async function resumeInterruptedMessages(): Promise<number> {
  const pendingTasks = loadPendingTasks(BOT_INFLIGHT_FILE)
  if (!pendingTasks.length) return 0

  let resumedCount = 0
  const nowMs = Date.now()

  for (const task of pendingTasks) {
    if (!isResumablePendingTask(task, nowMs)) {
      recordRuntimeEvent({
        botKey: 'willy-bot',
        jsonlPath: BOT_RUNTIME_JSONL_FILE,
        level: 'warn',
        source: 'resume_skipped',
        message: `stale or unsafe pending task skipped for ${task.chatId}`,
        details: {
          chatId: task.chatId,
          phase: task.phase,
          startedAt: task.startedAt,
          resumeCount: task.resumeCount,
        },
      })
      removePendingTask(BOT_INFLIGHT_FILE, task.chatId)
      continue
    }

    patchPendingTask(BOT_INFLIGHT_FILE, task.chatId, {
      phase: 'resuming',
      resumeCount: task.resumeCount + 1,
    })

    const startedAt = Number.isFinite(Date.parse(task.startedAt)) ? Date.parse(task.startedAt) : Date.now()
    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'resume_started',
      message: `resuming interrupted task for ${task.chatId}`,
      details: {
        chatId: task.chatId,
        phase: task.phase,
        lastMessageId: task.lastMessageId,
        resumeCount: task.resumeCount + 1,
        workspaceKey: task.workspaceKey,
        workspacePath: task.workspacePath,
      },
    })

    await renderProgressMessage(task.chatId, buildProgressMessage({
      percent: 18,
      stage: '자동 복구',
      current: '재시작 전에 끊긴 작업을 다시 이어가고 있어요.',
      startedAt,
      recent: ['이전 요청 자동 복구'],
    }), {
      replyToMessageId: task.lastMessageId,
      startedAt,
    })
    await sendMessage(task.chatId, '🔄 방금 끊긴 작업을 자동 복구해서 이어갈게요.')

    const ac = new AbortController()
    processingAbort.set(task.chatId, ac)
    inFlightText.set(task.chatId, task.text)
    try {
      await handleMessage(task.chatId, task.text, ac.signal, task.lastMessageId)
      resumedCount += 1
    } finally {
      processingAbort.delete(task.chatId)
      inFlightText.delete(task.chatId)
    }
  }

  return resumedCount
}

// ============================================================
// Process lock — 중복 실행 방지
// ============================================================
function acquireLock(): boolean {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      try {
        process.kill(lockPid, 0)
        if (lockPid !== process.pid) {
          console.log(`⚠️ 기존 봇 프로세스 발견 (PID: ${lockPid}). 종료 후 인수합니다.`)
          try { process.kill(lockPid, 15) } catch { /* already dead */ }
          const deadline = Date.now() + 5000
          while (Date.now() < deadline) {
            try { process.kill(lockPid, 0); /* still alive */ } catch { break }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
          }
          try { process.kill(lockPid, 9) } catch { /* already dead */ }
        }
      } catch {
        console.log(`⚠️ 이전 lock 파일 정리 (PID ${lockPid} 없음)`)
      }
    }
    writeFileSync(LOCK_FILE, String(process.pid))
    return true
  } catch (err) {
    console.error('Lock acquire error:', err)
    return false
  }
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10)
      if (lockPid === process.pid) {
        unlinkSync(LOCK_FILE)
      }
    }
  } catch { /* ignore */ }
}

// ============================================================
// Persistent offset — 재시작 시 메시지 재처리 방지
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
  try {
    writeFileSync(OFFSET_FILE, String(offset))
  } catch { /* ignore */ }
}

// 처리 중인 메시지 추적 (동일 update 중복 처리 방지)
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

async function sendMessageRaw(chatId: number, text: string, maxRetries = 2) {
  // Telegram 메시지 길이 제한: 4096자
  const chunks = splitTelegramMessage(text, 4000)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    let sent = false
    for (let attempt = 0; attempt <= maxRetries && !sent; attempt++) {
      try {
        // 1차: HTML로 시도
        const res = await tg('sendMessage', {
          chat_id: chatId,
          text: markdownToTelegramHtml(chunk),
          parse_mode: 'HTML',
        })
        if (res.result?.message_id) {
          sent = true
          console.log(`[sendMessage] ✅ 전송 확인 (chunk ${i + 1}/${chunks.length}, message_id: ${res.result.message_id})`)
        }
      } catch (mdErr) {
        const htmlRetryMs = getTelegramRetryAfterMs(mdErr)
        if (htmlRetryMs && attempt < maxRetries) {
          console.warn(`[sendMessage] ⏳ Telegram rate limit 대기 ${htmlRetryMs}ms (chunk ${i + 1}/${chunks.length})`)
          await sleep(htmlRetryMs)
          continue
        }
        // Markdown 파싱 실패 시 plain text로 재시도
        try {
          const res = await tg('sendMessage', { chat_id: chatId, text: chunk })
          if (res.result?.message_id) {
            sent = true
            console.log(`[sendMessage] ✅ plain text 전송 확인 (chunk ${i + 1}/${chunks.length}, message_id: ${res.result.message_id})`)
          }
        } catch (plainErr) {
          console.error(`[sendMessage] ❌ 전송 실패 (chunk ${i + 1}/${chunks.length}, attempt ${attempt + 1}/${maxRetries + 1}):`, plainErr)
          if (attempt < maxRetries) {
            const delay = getTelegramRetryAfterMs(plainErr) ?? getTelegramRetryAfterMs(mdErr) ?? 1000 * (attempt + 1)
            console.log(`[sendMessage] ${delay}ms 후 재시도...`)
            await sleep(delay)
          }
        }
      }
    }
    if (!sent) {
      console.error(`[sendMessage] 🚨 최종 전송 실패! chunk ${i + 1}/${chunks.length}, length: ${chunk.length}`)
      console.error(`[sendMessage] 실패한 메시지 앞 100자: ${chunk.slice(0, 100)}`)
    }
  }
}

async function sendMessage(chatId: number, text: string, maxRetries = 2) {
  await sendMessageRaw(chatId, normalizeTelegramOutboundText(text), maxRetries)
}

// SPLIT 구분자를 처리하여 여러 메시지로 나눠 전송 (사람처럼 딜레이 포함)
async function sendSplitMessage(chatId: number, text: string) {
  const parts = text.split(/\n---SPLIT---\n/).map(p => p.trim()).filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    await sendMessage(chatId, parts[i])
    if (i < parts.length - 1) {
      void sendTyping(chatId)
      await new Promise(r => setTimeout(r, randomMessageDelay()))
    }
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

async function sendMessageWithButtonsRaw(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await tg('sendMessage', {
        chat_id: chatId,
        text: markdownToTelegramHtml(text),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      })
      if (res.result?.message_id) {
        console.log(`[sendMessageWithButtons] ✅ 전송 확인 (message_id: ${res.result.message_id})`)
        return
      }
    } catch (mdErr) {
      const htmlRetryMs = getTelegramRetryAfterMs(mdErr)
      if (htmlRetryMs && attempt < 2) {
        console.warn(`[sendMessageWithButtons] ⏳ Telegram rate limit 대기 ${htmlRetryMs}ms`)
        await sleep(htmlRetryMs)
        continue
      }
      try {
        const res = await tg('sendMessage', {
          chat_id: chatId,
          text,
          reply_markup: { inline_keyboard: buttons },
        })
        if (res.result?.message_id) {
          console.log(`[sendMessageWithButtons] ✅ plain text 전송 확인 (message_id: ${res.result.message_id})`)
          return
        }
      } catch (plainErr) {
        console.error(`[sendMessageWithButtons] ❌ 전송 실패 (attempt ${attempt + 1}/3):`, plainErr)
        if (attempt < 2) {
          await sleep(getTelegramRetryAfterMs(plainErr) ?? getTelegramRetryAfterMs(mdErr) ?? 1000 * (attempt + 1))
        }
      }
    }
  }
  console.error(`[sendMessageWithButtons] 🚨 최종 전송 실패!`)
}

async function sendMessageWithButtons(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
  await sendMessageWithButtonsRaw(chatId, normalizeTelegramOutboundText(text), buttons)
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  try {
    await tg('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text || '',
    })
  } catch { /* ignore */ }
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
  try {
    await tg('deleteMessage', { chat_id: chatId, message_id: messageId })
  } catch { /* 이미 삭제됨 등 무시 */ }
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

async function sendDocument(chatId: number, filePath: string, caption?: string) {
  const fileBuffer = readFileSync(filePath)
  const fileName = basename(filePath)
  const file = new File([fileBuffer], fileName)

  const form = new FormData()
  form.set('chat_id', String(chatId))
  form.set('document', file, fileName)
  if (caption) form.set('caption', caption)

  const res = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    body: form as any,
  })
  return res.json()
}

// ============================================================
// Voice / Photo handling
// ============================================================
const TEMP_DIR = join(__dirname, 'logs', 'tmp')
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true })

async function downloadTelegramFile(fileId: string, localPath: string): Promise<boolean> {
  try {
    const fileInfo = await tg('getFile', { file_id: fileId })
    if (!fileInfo.ok) return false
    const filePath = fileInfo.result.file_path
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    const res = await fetch(url)
    if (!res.ok) return false
    const buffer = Buffer.from(await res.arrayBuffer())
    writeFileSync(localPath, buffer)
    return true
  } catch {
    return false
  }
}

async function transcribeVoice(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // whisper CLI: python3 -m whisper <file> --language ko --model tiny --output_format txt
    const proc = spawn('python3', ['-m', 'whisper', filePath, '--language', 'ko', '--model', 'base', '--output_format', 'txt', '--output_dir', TEMP_DIR], {
      timeout: 60000,
    })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code: number | null) => {
      // whisper outputs <filename>.txt
      const txtPath = filePath.replace(/\.[^.]+$/, '.txt')
      if (existsSync(txtPath)) {
        const text = readFileSync(txtPath, 'utf-8').trim()
        // cleanup
        try { unlinkSync(filePath); unlinkSync(txtPath) } catch {}
        resolve(text || '(음성 인식 실패)')
      } else {
        // cleanup
        try { unlinkSync(filePath) } catch {}
        reject(new Error(`Whisper failed: ${stderr}`))
      }
    })
    proc.on('error', (err: Error) => {
      try { unlinkSync(filePath) } catch {}
      reject(err)
    })
  })
}

async function describePhoto(filePath: string, caption?: string): Promise<string> {
  // 이미지 분석 요청 — agent CLI(Codex/Claude) 사용
  const prompt = caption
    ? `이 이미지를 분석해주세요. 사용자가 함께 보낸 메시지: "${caption}". 이미지에 보이는 내용을 간결하게 설명하세요.`
    : '이 이미지를 분석하고 내용을 간결하게 설명해주세요.'
  try {
    const result = await runAgent(`${filePath} 파일을 Read tool로 읽어서 분석해주세요. ${prompt}`, { backend: 'codex', model: BOT_MODEL })
    return result || '이미지를 분석할 수 없었어요.'
  } catch {
    return '이미지를 분석할 수 없었어요.'
  }
}

// ============================================================
// Dashboard data fetching
// ============================================================
function formatDate(d: Date) {
  // KST 기준 YYYY-MM-DD (toISOString은 UTC라 자정~09시 사이 날짜 오차 발생)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

function getKSTWeekday(d: Date): string {
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }) // 월, 화, ...
}

function getCurrentKSTString(): string {
  const now = new Date()
  const date = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const time = now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

function isSundayKST(d: Date = new Date()): boolean {
  return d.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }) === 'Sun'
}

function formatTimeAgo(ts: Date, now: Date): string {
  const diffMs = now.getTime() - ts.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 전`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}일 전`
}

const ATTRIBUTE_CATALOG_CACHE_TTL = 10 * 60 * 1000
const PROMPT_SECTIONS_CACHE_TTL = 5 * 60 * 1000
const KNOWLEDGE_CONTEXT_CACHE_TTL = 2 * 60 * 1000
const WIKI_CONTEXT_CACHE_TTL = 3 * 60 * 1000
const DASHBOARD_CONTEXT_CACHE_TTL = 60 * 1000
const WATCH_TOPICS_CACHE_TTL = 2 * 60 * 1000
const MARKET_PRICES_CACHE_TTL = 30 * 1000

let attributeCatalogCache: TimedCache<string> | null = null
type PromptSectionMap = Record<string, { content: string; version: number; is_modifiable: boolean }>
let promptSectionsCache: TimedCache<PromptSectionMap> | null = null
let knowledgeContextCache: TimedCache<string> | null = null
let wikiContextCache: TimedCache<string> | null = null
let dashboardContextCache: TimedCache<string> | null = null
let watchTopicsCache: TimedCache<WatchTopic[]> | null = null
let liveMarketPricesCache: TimedCache<MarketPrice[]> | null = null

// ============================================================
// ③ Attribute Catalog — key 자율 확장
// ============================================================
async function fetchAttributeCatalog(): Promise<string> {
  const cached = readTimedCache(attributeCatalogCache, ATTRIBUTE_CATALOG_CACHE_TTL)
  if (cached !== null) return cached

  const { data: attrs } = await supabase
    .from('knowledge_attribute_catalog')
    .select('key_name, entity_type, level, description, data_type, importance, usage_count')
    .order('level', { ascending: true })
    .order('importance', { ascending: false })

  if (!attrs?.length) {
    attributeCatalogCache = writeTimedCache('')
    return ''
  }

  const parts: string[] = ['## 속성 카탈로그 (Attribute Catalog)']
  const byLevel: Record<number, typeof attrs> = { 1: [], 2: [], 3: [] }
  for (const a of attrs) {
    (byLevel[a.level] || (byLevel[a.level] = [])).push(a)
  }

  if (byLevel[1]?.length) {
    parts.push('### 레벨1 (고정 구조)')
    for (const a of byLevel[1]) {
      parts.push(`  - ${a.key_name}: ${a.description}`)
    }
  }
  if (byLevel[2]?.length) {
    parts.push('### 레벨2 (표준 속성)')
    const byType: Record<string, typeof attrs> = {}
    for (const a of byLevel[2]) {
      const t = a.entity_type || 'all'
      if (!byType[t]) byType[t] = []
      byType[t].push(a)
    }
    for (const [type, items] of Object.entries(byType)) {
      parts.push(`  [${type}] ${items.map(a => `${a.key_name}(${a.data_type})`).join(', ')}`)
    }
  }
  if (byLevel[3]?.length) {
    parts.push(`### 레벨3 (에이전트 발견 — ${byLevel[3].length}개)`)
    for (const a of byLevel[3]) {
      parts.push(`  - ${a.key_name}${a.entity_type ? `[${a.entity_type}]` : ''}: ${a.description || ''}${a.usage_count ? ` (사용 ${a.usage_count}회)` : ''}`)
    }
  }

  const result = parts.join('\n')
  attributeCatalogCache = writeTimedCache(result)
  return result
}

// ============================================================
// ④ Prompt Sections — 프롬프트 자기 수정
// ============================================================
async function fetchPromptSections(): Promise<PromptSectionMap> {
  const cached = readTimedCache(promptSectionsCache, PROMPT_SECTIONS_CACHE_TTL)
  if (cached !== null) return cached

  const { data: sections } = await supabase
    .from('agent_prompt_sections')
    .select('section_key, content, version, is_modifiable')

  const result: PromptSectionMap = {}
  if (sections) {
    for (const s of sections) {
      result[s.section_key] = { content: s.content, version: s.version, is_modifiable: s.is_modifiable }
    }
  }
  promptSectionsCache = writeTimedCache(result)
  return result
}

async function fetchKnowledgeContext(): Promise<string> {
  const cached = readTimedCache(knowledgeContextCache, KNOWLEDGE_CONTEXT_CACHE_TTL)
  if (cached !== null) return cached

  // First get counts to decide loading strategy
  const [
    { count: entityCount },
    { count: relationCount },
    { count: insightCount },
  ] = await Promise.all([
    supabase.from('knowledge_entities').select('*', { count: 'exact', head: true }),
    supabase.from('knowledge_relations').select('*', { count: 'exact', head: true }),
    supabase.from('knowledge_insights').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const total = (entityCount || 0) + (relationCount || 0) + (insightCount || 0)
  const isCompact = total > 50 // 자주 쓰는 프롬프트이므로 더 이르게 요약 모드 진입

  const entityLimit = isCompact ? 10 : 24
  const relationLimit = isCompact ? 12 : 36
  const insightLimit = isCompact ? 6 : 12

  const [
    { data: entities },
    { data: relations },
    { data: recentInsights },
  ] = await Promise.all([
    supabase.from('knowledge_entities').select('name, entity_type, description').order('updated_at', { ascending: false }).limit(entityLimit),
    supabase.from('knowledge_relations').select('subject:knowledge_entities!subject_id(name), predicate, object:knowledge_entities!object_id(name)').limit(relationLimit),
    supabase.from('knowledge_insights').select('content, insight_type, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(insightLimit),
  ])

  const parts: string[] = []

  // 요약 모드일 때 통계 먼저
  if (isCompact) {
    parts.push(`[요약 모드] 엔티티 ${entityCount}개, 관계 ${relationCount}개, 인사이트 ${insightCount}개 — 아래는 최근 항목. DB에서 직접 쿼리 가능 (knowledge_entities, knowledge_relations, knowledge_insights 테이블)`)
  }

  if (entities?.length) {
    parts.push('엔티티:')
    const byType: Record<string, string[]> = {}
    for (const e of entities) {
      if (!byType[e.entity_type]) byType[e.entity_type] = []
      byType[e.entity_type].push(`${e.name}${e.description ? ` (${e.description.slice(0, 80)})` : ''}`)
    }
    for (const [type, items] of Object.entries(byType)) {
      parts.push(`  [${type}] ${items.join(' | ')}`)
    }
  }

  if (relations?.length) {
    parts.push('\n관계 그래프:')
    for (const r of relations) {
      const s = (r as any).subject?.name || '?'
      const o = (r as any).object?.name || '?'
      parts.push(`  ${s} —[${r.predicate}]→ ${o}`)
    }
  }

  if (recentInsights?.length) {
    parts.push('\n최근 인사이트:')
    for (const i of recentInsights) {
      parts.push(`  [${i.insight_type}] ${i.content.slice(0, 120)}`)
    }
  }

  const result = parts.length ? parts.join('\n') : ''
  knowledgeContextCache = writeTimedCache(result)
  return result
}

async function fetchWikiContext(): Promise<string> {
  const cached = readTimedCache(wikiContextCache, WIKI_CONTEXT_CACHE_TTL)
  if (cached !== null) return cached

  const { data: wikiNotes } = await supabase
    .from('work_wiki')
    .select('id, title, content, category, section, created_at')
    .order('created_at', { ascending: false })
    .limit(15)

  if (!wikiNotes?.length) {
    wikiContextCache = writeTimedCache('')
    return ''
  }

  const sections: string[] = ['\n## 업무위키 노트']

  // 섹션별 그룹핑
  const bySection: Record<string, typeof wikiNotes> = {}
  for (const note of wikiNotes) {
    const sec = note.section || 'etc'
    if (!bySection[sec]) bySection[sec] = []
    bySection[sec].push(note)
  }

  for (const [section, notes] of Object.entries(bySection)) {
    sections.push(`\n### [${section}]`)
    for (const n of notes) {
      const plainContent = wikiHtmlToPlainText(n.content)
      const preview = plainContent.length > 240 ? plainContent.slice(0, 240) + '...' : plainContent
      sections.push(`- **${n.title}**${n.category ? ` [${n.category}]` : ''} (${n.created_at?.split('T')[0]})\n  ${preview}`)
    }
  }

  const result = sections.join('\n')
  wikiContextCache = writeTimedCache(result)
  return result
}

function wikiHtmlToPlainText(content: string): string {
  return (content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MEMO_REFINE_STOPWORDS = new Set([
  '메모', '노트', '기록', '초안', '정리', '정리해줘', '정리해서', '정리좀', '업데이트', '업데이트해줘',
  '다듬어줘', '다듬기', '재작성', '덮어쓰기', '덮어써', '덮어써줘', '수정', '수정해줘', '요약', '정돈',
  '기존', '방금', '이거', '이노트', '이메모', '해줘', '해주세요', '부탁', '요청',
])

function shouldLoadMemoRefineContext(text: string): boolean {
  const compact = (text || '').replace(/\s+/g, ' ').trim()
  if (!compact) return false
  return /(메모|노트|기록|초안).{0,18}(정리|다듬|업데이트|덮어|재작성|수정|정돈|요약)/.test(compact)
    || /(정리|다듬|업데이트|덮어|재작성|수정|정돈|요약).{0,18}(메모|노트|기록|초안)/.test(compact)
    || /(방금|기존|이전|이)\s*(메모|노트|기록).{0,10}(정리|다듬|업데이트|덮어|수정)/.test(compact)
}

function extractMemoRefineKeywords(text: string): string[] {
  const tokens = (text.toLowerCase().match(/[a-z0-9가-힣][a-z0-9가-힣._-]{1,}/g) || [])
    .filter(token => token.length >= 2 && !MEMO_REFINE_STOPWORDS.has(token))
  return Array.from(new Set(tokens)).slice(0, 8)
}

async function fetchMemoRefineContext(text: string): Promise<string> {
  if (!shouldLoadMemoRefineContext(text)) return ''

  const keywords = extractMemoRefineKeywords(text)
  const { data: recentNotes } = await supabase
    .from('work_wiki')
    .select('id, title, content, category, section, created_at, updated_at')
    .eq('user_id', 'dw.kim@willowinvt.com')
    .order('updated_at', { ascending: false })
    .limit(25)

  if (!recentNotes?.length) {
    return '\n# 메모 정리 대상\n최근 메모 후보를 찾지 못했어요. 사용자가 정리할 메모를 특정하지 않았다면 어떤 노트를 덮어쓸지 먼저 확인하세요.'
  }

  const now = Date.now()
  const scored = recentNotes
    .filter(note => !(note.title || '').includes('[자동기록]'))
    .map(note => {
      const title = (note.title || '').trim()
      const plainContent = wikiHtmlToPlainText(note.content || '')
      const haystack = `${title}\n${plainContent}`.toLowerCase()
      const reasons: string[] = []
      let score = 0

      if (!title) {
        score += 8
        reasons.push('제목 비어 있음')
      } else if (/^(제목 없음|untitled|메모|노트)$/i.test(title)) {
        score += 4
        reasons.push('임시 제목')
      }

      if (!note.category) {
        score += 3
        reasons.push('카테고리 없음')
      }

      if (note.section === 'willow-mgmt') {
        score += 1
      }

      const updatedAt = note.updated_at ? new Date(note.updated_at).getTime() : 0
      const ageHours = updatedAt ? (now - updatedAt) / (60 * 60 * 1000) : Number.POSITIVE_INFINITY
      if (ageHours <= 6) {
        score += 5
        reasons.push('최근 수정')
      } else if (ageHours <= 24) {
        score += 3
        reasons.push('오늘 작성/수정')
      } else if (ageHours <= 72) {
        score += 1
      }

      const matchedKeywords = keywords.filter(keyword => haystack.includes(keyword))
      if (matchedKeywords.length) {
        score += Math.min(8, matchedKeywords.length * 2)
        reasons.push(`요청 키워드 일치: ${matchedKeywords.join(', ')}`)
      }

      if (plainContent.length >= 120) {
        score += 1
      }

      return {
        note,
        plainContent,
        reasons,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score <= 0) {
    return '\n# 메모 정리 대상\n최근 메모 후보를 특정하지 못했어요. 사용자가 바로 직전 메모를 뜻하는지 불명확하면 어떤 노트를 정리할지 먼저 확인하세요.'
  }

  const titleLabel = (best.note.title || '').trim() || '(제목 없음)'
  const contentBlock = best.plainContent || '(내용 비어 있음)'
  const reasonLabel = best.reasons.length ? best.reasons.join(' · ') : '최근 메모 후보'

  return `
# 메모 정리 대상
사용자가 기존 메모/노트를 정리해 달라고 요청한 상황으로 보입니다.
특별한 반대 지시가 없으면 새 노트를 만들지 말고 아래 note_id를 \`update_wiki\`로 덮어쓰세요.
- note_id: ${best.note.id}
- section: ${best.note.section || 'willow-mgmt'}
- title: ${titleLabel}
- category: ${best.note.category || '(없음)'}
- updated_at: ${best.note.updated_at || best.note.created_at || ''}
- 선정 이유: ${reasonLabel}

## 원본 메모
${contentBlock}
`.trim()
}

async function fetchFollowUpsContext(): Promise<string> {
  const { data: openFollowUps } = await supabase
    .from('agent_follow_ups')
    .select('*')
    .in('status', ['open', 'triggered'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (!openFollowUps?.length) return ''

  const lines = openFollowUps.map(f => {
    const triggerDate = f.trigger_after
      ? new Date(f.trigger_after).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      : '미정'
    return `- [${f.status}] ${f.content} (트리거: ${triggerDate}, 우선순위: ${f.priority})${f.follow_up_hint ? ` — ${f.follow_up_hint}` : ''}`
  })

  return `\n## 열린 팔로업 (${openFollowUps.length}건)\n${lines.join('\n')}\n\n팔로업 관련: CEO가 해당 주제를 완료/해결했다고 언급하면 resolve_follow_up 액션으로 해소하세요.`
}

// ─── 워크스테이션 공유 맥락 (cross-project 단일 진실원) ───
// ws_threads/ws_thread_events는 이 봇과 같은 메인 DB(axcfvieqsaphhvbkyzzv)에 있다.
// 여러 프로젝트/워크트리 세션이 남긴 열린 스레드·최근 결정을 Willy 프롬프트에 주입해,
// CEO가 "뭐 진행중이야 / 뭐 결정했었지"를 물으면 전 프로젝트 상태로 답할 수 있게 한다.
async function fetchWorkstationContext(): Promise<string> {
  try {
    const [{ data: threads }, { data: decisions }] = await Promise.all([
      supabase
        .from('ws_threads')
        .select('project, title, priority, summary, status')
        .in('status', ['open', 'blocked'])
        .order('priority', { ascending: true })
        .order('last_touched_at', { ascending: false })
        .limit(15),
      supabase
        .from('ws_thread_events')
        .select('project, body, created_at')
        .eq('kind', 'decision')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    if (!threads?.length && !decisions?.length) return ''

    const parts: string[] = ['\n## 워크스테이션 공유 맥락 (모든 프로젝트 cross-project)']
    if (threads?.length) {
      const lines = threads.map(t => {
        const pri = t.priority === 'high' ? '🔴' : t.priority === 'low' ? '⚪' : '🟡'
        return `- ${pri} [${t.project}] ${t.title}${t.summary ? ` — ${t.summary}` : ''}`
      })
      parts.push(`### 열린 스레드 (${threads.length}건)\n${lines.join('\n')}`)
    }
    if (decisions?.length) {
      const lines = decisions.map(d => `- [${d.project}] ${d.body}`)
      parts.push(`### 최근 결정\n${lines.join('\n')}`)
    }
    parts.push('워크스테이션 관련: CEO가 진행상황·결정·막힘을 물으면 이 맥락으로 답하세요. willow-invt·valuechain·voicecards·ryuha 등 전 프로젝트에 걸친 단일 진실원입니다.')
    return parts.join('\n\n')
  } catch (e) {
    console.error('fetchWorkstationContext 실패:', (e as Error).message)
    return ''
  }
}

// 오래된 triggered 팔로업 자동 만료 — 발송 후 14일 지나도 미해소면 obsolete로 간주.
// 적체 방지(예전엔 triggered가 영영 해소 안 돼 매 프롬프트에 재주입됨). 데이터는 보존(expired).
const FOLLOWUP_EXPIRE_DAYS = 14
async function expireStaleFollowUps(): Promise<number> {
  const cutoff = new Date(Date.now() - FOLLOWUP_EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('agent_follow_ups')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('status', 'triggered')
    .lt('created_at', cutoff)
    .select('id')
  const n = data?.length || 0
  if (n > 0) console.log(`🧹 오래된 팔로업 ${n}건 자동 만료(expired, ${FOLLOWUP_EXPIRE_DAYS}일+)`)
  return n
}

async function fetchDashboardContext(): Promise<string> {
  const cached = readTimedCache(dashboardContextCache, DASHBOARD_CONTEXT_CACHE_TTL)
  if (cached !== null) return cached

  const today = new Date()
  const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const todayStr = formatDate(today)
  const weekLaterStr = formatDate(weekLater)

  const [
    { data: projects },
    { data: clients },
    { data: milestones },
    { data: schedules },
    { data: tasks },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('willow_mgmt_projects').select('id, name, status, description, client:willow_mgmt_clients(name)').order('created_at', { ascending: false }),
    supabase.from('willow_mgmt_clients').select('id, name').order('name'),
    supabase.from('willow_mgmt_milestones').select('id, name, status, target_date, project:willow_mgmt_projects(name, client:willow_mgmt_clients(name))').gte('target_date', formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))).order('target_date'),
    supabase.from('willow_mgmt_schedules').select('id, title, schedule_date, start_time, is_completed, client:willow_mgmt_clients(name), tasks:willow_mgmt_tasks(id)').gte('schedule_date', todayStr).lte('schedule_date', weekLaterStr).order('schedule_date'),
    supabase.from('willow_mgmt_tasks').select('id, content, deadline, schedule:willow_mgmt_schedules(title)').eq('is_completed', false).order('deadline'),
    supabase.from('willow_mgmt_cash').select('type, status, amount, created_at').order('created_at', { ascending: false }).limit(20),
  ])

  const sections: string[] = []

  // 오늘 날짜
  sections.push(`## 오늘: ${todayStr} (${getKSTWeekday(today)}요일)`)

  // 클라이언트
  if (clients?.length) {
    sections.push(`\n## 클라이언트 (${clients.length}개)\n${clients.map((c: any) => `- ${c.name}`).join('\n')}`)
  }

  // 프로젝트
  if (projects?.length) {
    sections.push(`\n## 프로젝트 (${projects.length}개)`)
    for (const p of projects) {
      sections.push(`- [${p.status}] ${(p as any).client?.name || '?'} > ${p.name}${p.description ? ` — ${p.description}` : ''}`)
    }
  }

  // 마일스톤 (마감 임박 / 지연)
  if (milestones?.length) {
    const overdue = milestones.filter((m: any) => m.target_date < todayStr && m.status !== 'completed')
    const upcoming = milestones.filter((m: any) => m.target_date >= todayStr && m.target_date <= weekLaterStr && m.status !== 'completed')
    const later = milestones.filter((m: any) => m.target_date > weekLaterStr && m.status !== 'completed')

    if (overdue.length) {
      sections.push(`\n## 🔴 지연된 마일스톤 (${overdue.length}개)`)
      for (const m of overdue) {
        const proj = (m as any).project
        sections.push(`- [D+${Math.floor((today.getTime() - new Date(m.target_date).getTime()) / 86400000)}] ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
    if (upcoming.length) {
      sections.push(`\n## 🟡 이번 주 마일스톤 (${upcoming.length}개)`)
      for (const m of upcoming) {
        const proj = (m as any).project
        const daysLeft = Math.ceil((new Date(m.target_date).getTime() - today.getTime()) / 86400000)
        sections.push(`- [D-${daysLeft}] ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
    if (later.length) {
      sections.push(`\n## 향후 마일스톤 (${later.length}개)`)
      for (const m of later.slice(0, 10)) {
        const proj = (m as any).project
        sections.push(`- ${proj?.client?.name || '?'} > ${proj?.name || '?'} > ${m.name} (마감: ${m.target_date})`)
      }
    }
  }

  // 이번 주 일정
  if (schedules?.length) {
    sections.push(`\n## 이번 주 일정 (${schedules.length}개)`)
    for (const s of schedules) {
      const time = s.start_time ? ` ${s.start_time.slice(0, 5)}` : ''
      const status = s.is_completed ? '✅' : '⬜'
      const taskCount = (s as any).tasks?.length || 0
      sections.push(`- ${status} ${s.schedule_date}${time} | ${(s as any).client?.name || ''} | ${s.title}${taskCount ? ` (태스크 ${taskCount}개)` : ''}`)
    }
  }

  // 미완료 태스크
  if (tasks?.length) {
    sections.push(`\n## 미완료 태스크 (${tasks.length}개)`)
    for (const t of tasks.slice(0, 15)) {
      const deadline = t.deadline ? ` (마감: ${t.deadline})` : ''
      sections.push(`- ${(t as any).schedule?.title || '?'} > ${t.content}${deadline}`)
    }
  }

  // 최근 인보이스 요약
  if (invoices?.length) {
    const revenue = invoices.filter((i: any) => i.type === 'revenue')
    const expense = invoices.filter((i: any) => i.type === 'expense')
    const totalRevenue = revenue.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
    const totalExpense = expense.reduce((sum: number, i: any) => sum + (i.amount || 0), 0)
    const unpaid = invoices.filter((i: any) => i.status === 'issued')

    sections.push(`\n## 재무 요약 (최근 인보이스 ${invoices.length}건)`)
    sections.push(`- 수입: ₩${totalRevenue.toLocaleString()} (${revenue.length}건)`)
    sections.push(`- 지출: ₩${totalExpense.toLocaleString()} (${expense.length}건)`)
    if (unpaid.length) {
      sections.push(`- 미수금: ${unpaid.length}건 (₩${unpaid.reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()})`)
    }
  }

  const result = sections.join('\n')
  dashboardContextCache = writeTimedCache(result)
  return result
}

// ============================================================
// Tensw Todo data fetching (via Claude CLI + MCP)
// ============================================================
let tenswDataCache: string = ''
let tenswCacheTime = 0
const TENSW_CACHE_TTL = 2 * 60 * 1000 // 2분 캐시

async function fetchTenswContext(): Promise<string> {
  // 캐시가 유효하면 반환
  if (tenswDataCache && Date.now() - tenswCacheTime < TENSW_CACHE_TTL) {
    return tenswDataCache
  }

  try {
    console.log('🔄 텐소프트웍스 데이터 로딩 중...')
    const { data: projects } = await supabase
      .from('tensw_projects')
      .select('id, name, slug, status')
      .eq('status', 'active')
      .order('name')

    if (!projects?.length) {
      tenswDataCache = '## 텐소프트웍스 현황\n- 활성 프로젝트가 없습니다.'
      tenswCacheTime = Date.now()
      return tenswDataCache
    }

    const projectIds = projects.map(p => p.id)
    const projectNameById = new Map(projects.map(p => [p.id, p.name]))

    const [
      { data: todos },
      { data: members },
      { data: reports },
    ] = await Promise.all([
      supabase
        .from('tensw_todos')
        .select('id, project_id, title, status, priority, due_date, readable_id, discarded_at')
        .in('project_id', projectIds)
        .is('discarded_at', null),
      supabase
        .from('tensw_project_members')
        .select('id, project_id, name, role, is_manager')
        .in('project_id', projectIds),
      supabase
        .from('tensw_project_docs')
        .select('project_id, title, doc_type, created_at')
        .in('project_id', projectIds)
        .in('doc_type', ['weekly_report', 'progress_report'])
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const todoList = (todos || []).filter(t => !t.discarded_at)
    const todoIds = todoList.map(t => t.id)
    const { data: assignees } = todoIds.length
      ? await supabase
          .from('tensw_todo_assignees')
          .select('todo_id, member_id')
          .in('todo_id', todoIds)
      : { data: [] as Array<{ todo_id: string; member_id: string | null }> }

    const memberById = new Map((members || []).map(m => [m.id, m]))
    const assigneesByTodo = new Map<string, string[]>()
    for (const a of assignees || []) {
      if (!a.member_id) continue
      const list = assigneesByTodo.get(a.todo_id) || []
      list.push(a.member_id)
      assigneesByTodo.set(a.todo_id, list)
    }

    const openStatuses = new Set(['pending', 'assigned', 'in_progress', 'blocked', 'review'])
    const completedTodos = todoList.filter(t => t.status === 'completed').length
    const progressPct = todoList.length ? Math.round((completedTodos / todoList.length) * 100) : 0

    const ceoMemberIds = new Set(
      (members || [])
        .filter(m => (m.name || '').includes('김동욱'))
        .map(m => m.id)
    )

    const ceoTodos = todoList
      .filter(t => openStatuses.has(t.status))
      .filter(t => (assigneesByTodo.get(t.id) || []).some(id => ceoMemberIds.has(id)))
      .sort((a, b) => {
        const priorityRank = (value?: string | null) => {
          if (value === 'high') return 0
          if (value === 'medium') return 1
          return 2
        }
        const dueA = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
        const dueB = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
        return priorityRank(a.priority) - priorityRank(b.priority) || dueA - dueB
      })
      .slice(0, 6)

    const todayStr = new Date().toISOString().slice(0, 10)
    const projectProgress = projects.map(project => {
      const items = todoList.filter(t => t.project_id === project.id)
      const total = items.length
      const done = items.filter(t => t.status === 'completed').length
      const open = items.filter(t => openStatuses.has(t.status)).length
      const overdue = items.filter(t => openStatuses.has(t.status) && t.due_date && t.due_date.slice(0, 10) < todayStr).length
      const pct = total ? Math.round((done / total) * 100) : 0
      return {
        name: project.name,
        pct,
        total,
        open,
        overdue,
      }
    }).sort((a, b) => a.pct - b.pct || b.overdue - a.overdue)

    const lines: string[] = [
      '## 텐소프트웍스 현황',
      `- 활성 프로젝트: ${projects.length}개`,
      `- 전체 태스크 진행률: ${progressPct}% (${completedTodos}/${todoList.length})`,
    ]

    if (ceoTodos.length) {
      lines.push('- 미완료 CEO 할일:')
      for (const todo of ceoTodos) {
        const due = todo.due_date ? ` · 마감 ${todo.due_date.slice(0, 10)}` : ''
        const code = todo.readable_id ? ` [${todo.readable_id}]` : ''
        lines.push(`  • ${projectNameById.get(todo.project_id) || '프로젝트'}${code} ${todo.title}${due}`)
      }
    } else {
      lines.push('- 미완료 CEO 할일: 없음')
    }

    lines.push('- 프로젝트별 진행률:')
    for (const item of projectProgress.slice(0, 8)) {
      const overdue = item.overdue ? ` · 지연 ${item.overdue}` : ''
      lines.push(`  • ${item.name}: ${item.pct}% (${item.total}개 중 진행 ${item.open}개${overdue})`)
    }

    if ((reports || []).length) {
      lines.push('- 최신 주간보고서:')
      for (const report of reports!.slice(0, 4)) {
        const projectName = projectNameById.get(report.project_id) || '프로젝트'
        const kind = report.doc_type === 'weekly_report' ? '주간보고' : '진척보고'
        lines.push(`  • ${projectName} · ${kind} · ${report.title} (${report.created_at.slice(0, 10)})`)
      }
    } else {
      lines.push('- 최신 주간보고서: 없음')
    }

    const result = lines.join('\n')
    tenswDataCache = result
    tenswCacheTime = Date.now()
    console.log('✅ 텐소프트웍스 데이터 로딩 완료')
    return result
  } catch (err) {
    console.error('Tensw data fetch error:', err)
    return tenswDataCache || '(텐소프트웍스 데이터 로딩 실패)'
  }
}

// ============================================================
// 투자 리서치 DB 컨텍스트 수집
// ============================================================
let researchDataCache: string = ''
let researchCacheTime = 0
const RESEARCH_CACHE_TTL = 15 * 60 * 1000 // 15분 캐시

async function fetchResearchContext(): Promise<string> {
  if (researchDataCache && Date.now() - researchCacheTime < RESEARCH_CACHE_TTL) {
    return researchDataCache
  }

  try {
    // T1 + T2 종목 (pass 항목만)
    const { data: passEntries } = await supabase
      .from('stock_research')
      .select('ticker, company_name, verdict, source_type, sector, track, composite_score, structural_thesis, current_price, gap_from_high_pct, scan_date')
      .like('verdict', 'pass_%')
      .order('composite_score', { ascending: false, nullsFirst: false })

    if (!passEntries?.length) {
      researchDataCache = '(리서치 종목 없음)'
      researchCacheTime = Date.now()
      return researchDataCache
    }

    // 중복 제거 (최신 scan_date 우선)
    const seen = new Set<string>()
    const unique = passEntries.filter(e => {
      if (seen.has(e.ticker)) return false
      seen.add(e.ticker)
      return true
    })

    const t1 = unique.filter(e => e.verdict === 'pass_tier1')
    const t2 = unique.filter(e => e.verdict === 'pass_tier2')

    const lines: string[] = [`## 투자 리서치 현황 (${unique.length}종목: T1 ${t1.length}개, T2 ${t2.length}개)`]

    if (t1.length) {
      lines.push('\n### Tier 1 (강한 후보, composite ≥65)')
      for (const e of t1) {
        const score = e.composite_score != null ? `[${e.composite_score}점]` : ''
        const gap = e.gap_from_high_pct != null ? ` 고점${e.gap_from_high_pct > 0 ? '+' : ''}${e.gap_from_high_pct}%` : ''
        const track = e.track ? ` (${e.track})` : ''
        lines.push(`- ${e.ticker} ${e.company_name} ${score}${track}${gap} — ${e.structural_thesis?.slice(0, 60) || ''}`)
      }
    }

    if (t2.length) {
      lines.push('\n### Tier 2 (관심 후보, composite ≥50)')
      for (const e of t2.slice(0, 15)) {
        const score = e.composite_score != null ? `[${e.composite_score}점]` : ''
        const gap = e.gap_from_high_pct != null ? ` 고점${e.gap_from_high_pct > 0 ? '+' : ''}${e.gap_from_high_pct}%` : ''
        lines.push(`- ${e.ticker} ${e.company_name} ${score}${gap}`)
      }
      if (t2.length > 15) lines.push(`  ... 외 ${t2.length - 15}개`)
    }

    researchDataCache = lines.join('\n')
    researchCacheTime = Date.now()
    return researchDataCache
  } catch (err) {
    console.error('Research data fetch error:', err)
    return researchDataCache || '(리서치 데이터 로딩 실패)'
  }
}

// ============================================================
// Weekly briefing data collection (raw data → Claude CLI analysis)
// ============================================================
async function fetchWeeklyBriefingData(): Promise<string> {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const todayStr = now.toISOString().slice(0, 10)
  const parts: string[] = []

  // 1. Active projects
  const { data: projects } = await supabase
    .from('tensw_projects')
    .select('id, name, slug, status')
    .eq('status', 'active')
    .order('name')

  if (!projects || projects.length === 0) return '활성 프로젝트 없음'

  const projectIds = projects.map(p => p.id)

  // 2. All todos with assignees
  const { data: allTodos } = await supabase
    .from('tensw_todos')
    .select(`
      id, project_id, title, status, priority, due_date, assigned_at, completed_at,
      assignees:tensw_todo_assignees(
        member_id,
        member:tensw_project_members!tensw_todo_assignees_member_id_fkey(id, name)
      )
    `)
    .in('project_id', projectIds)

  // 3. Recent logs (last 7 days)
  const todoIds = allTodos?.map(t => t.id) || []
  let recentLogs: Array<{ id: string; todo_id: string; action: string; created_at: string; changed_by: string | null }> = []
  for (let i = 0; i < todoIds.length; i += 500) {
    const chunk = todoIds.slice(i, i + 500)
    const { data: logs } = await supabase
      .from('tensw_todo_logs')
      .select('id, todo_id, action, created_at, changed_by')
      .in('todo_id', chunk)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
    if (logs) recentLogs = recentLogs.concat(logs)
  }

  // 4. Members (with github_id)
  const { data: allMembers } = await supabase
    .from('tensw_project_members')
    .select('id, project_id, name, role, is_manager, github_id')
    .in('project_id', projectIds)

  // 5. User name map for logs
  const userIds = new Set<string>()
  recentLogs.forEach(l => { if (l.changed_by) userIds.add(l.changed_by) })
  const userNameMap = new Map<string, string>()
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('tensw_users')
      .select('id, name')
      .in('id', Array.from(userIds))
    users?.forEach(u => userNameMap.set(u.id, u.name))
  }

  // 6. Weekly reports & code reports (FULL CONTENT)
  const { data: weeklyDocs } = await supabase
    .from('tensw_project_docs')
    .select('id, project_id, title, doc_type, content, created_at')
    .in('project_id', projectIds)
    .in('doc_type', ['weekly_report', 'progress_report'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  // 7. GitHub commits
  const { data: repos } = await supabase
    .from('tensw_project_repos')
    .select('id, project_id, name, url')
    .in('project_id', projectIds)

  const githubToNameMap = new Map<string, string>()
  if (allMembers) {
    for (const m of allMembers) {
      const ghId = (m as any).github_id?.trim()
      if (ghId && m.name) githubToNameMap.set(ghId.toLowerCase(), m.name)
    }
  }

  const commitsByPerson = new Map<string, { count: number; messages: string[] }>()
  const commitsByProject = new Map<string, number>()
  const githubToken = process.env.GITHUB_TOKEN

  if (repos && repos.length > 0 && githubToken) {
    for (const repo of repos) {
      try {
        const urlMatch = repo.url.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (!urlMatch) continue
        const [, owner, repoName] = urlMatch
        const cleanRepoName = repoName.replace(/\.git$/, '')
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${cleanRepoName}/commits?per_page=100&since=${sevenDaysAgo.toISOString()}`,
          { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Willow-Dashboard', 'Authorization': `Bearer ${githubToken}` } }
        )
        if (response.ok) {
          const commits = await response.json()
          commitsByProject.set(repo.project_id, (commitsByProject.get(repo.project_id) || 0) + commits.length)
          for (const c of commits) {
            const ghLogin = c.author?.login?.toLowerCase()
            const author = (ghLogin && githubToNameMap.get(ghLogin)) || c.commit?.author?.name || 'unknown'
            if (!commitsByPerson.has(author)) commitsByPerson.set(author, { count: 0, messages: [] })
            const p = commitsByPerson.get(author)!
            p.count++
            const msg = c.commit?.message?.split('\n')[0]?.slice(0, 80)
            if (msg && p.messages.length < 10) p.messages.push(msg)
          }
        }
      } catch { /* skip */ }
    }
  }

  // ============================================================
  // Format raw data
  // ============================================================
  const excludeNames = new Set(['김동욱', '김철형'])
  const weekRange = `${sevenDaysAgo.toISOString().slice(0, 10)} ~ ${todayStr}`
  parts.push(`# 텐소프트웍스 주간 데이터 (${weekRange})`)
  parts.push('')

  // Per-project summary
  parts.push('## 프로젝트별 현황')
  for (const project of projects) {
    const pTodos = allTodos?.filter(t => t.project_id === project.id) || []
    const total = pTodos.length
    const completedTotal = pTodos.filter(t => t.status === 'completed').length
    const pct = total > 0 ? Math.round((completedTotal / total) * 100) : 0
    const completedThisWeek = recentLogs.filter(l =>
      l.action === 'completed' && allTodos?.find(t => t.id === l.todo_id)?.project_id === project.id
    ).length
    const createdThisWeek = recentLogs.filter(l =>
      l.action === 'created' && allTodos?.find(t => t.id === l.todo_id)?.project_id === project.id
    ).length
    const inProgress = pTodos.filter(t => ['assigned', 'in_progress'].includes(t.status)).length
    const overdue = pTodos.filter(t =>
      ['pending', 'assigned', 'in_progress'].includes(t.status) && t.due_date && t.due_date < todayStr
    ).length
    const commits = commitsByProject.get(project.id) || 0

    parts.push(`### ${project.name} (${pct}%, ${completedTotal}/${total})`)
    parts.push(`이번 주: 완료 ${completedThisWeek}건, 신규 ${createdThisWeek}건, 진행중 ${inProgress}건, 지연 ${overdue}건, 커밋 ${commits}건`)
    parts.push('')
  }

  // Per-person raw stats
  parts.push('## 사람별 활동 데이터')
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const personMap = new Map<string, { completed: string[]; inProgress: string[]; overdue: number; stale: number; commits: number; commitMsgs: string[] }>()

  for (const log of recentLogs) {
    if (log.action === 'completed' && log.changed_by) {
      const name = userNameMap.get(log.changed_by) || log.changed_by
      if (excludeNames.has(name)) continue
      if (!personMap.has(name)) personMap.set(name, { completed: [], inProgress: [], overdue: 0, stale: 0, commits: 0, commitMsgs: [] })
      const todo = allTodos?.find(t => t.id === log.todo_id)
      if (todo?.title) personMap.get(name)!.completed.push(todo.title.slice(0, 60))
    }
  }

  for (const todo of (allTodos || [])) {
    if (!['assigned', 'in_progress'].includes(todo.status)) continue
    const assignees = (todo as any).assignees || []
    for (const a of assignees) {
      const name = a.member?.name
      if (!name || excludeNames.has(name)) continue
      if (!personMap.has(name)) personMap.set(name, { completed: [], inProgress: [], overdue: 0, stale: 0, commits: 0, commitMsgs: [] })
      const p = personMap.get(name)!
      p.inProgress.push(todo.title?.slice(0, 60) || '(제목없음)')
      if (todo.due_date && todo.due_date < todayStr) p.overdue++
      const todoLogs = recentLogs.filter(l => l.todo_id === todo.id)
      const lastActivity = todoLogs.length > 0 ? new Date(todoLogs[0].created_at) : (todo.assigned_at ? new Date(todo.assigned_at) : null)
      if (!lastActivity || lastActivity < threeDaysAgo) p.stale++
    }
  }

  commitsByPerson.forEach((data, author) => {
    if (excludeNames.has(author)) return
    if (!personMap.has(author)) personMap.set(author, { completed: [], inProgress: [], overdue: 0, stale: 0, commits: 0, commitMsgs: [] })
    const p = personMap.get(author)!
    p.commits = data.count
    p.commitMsgs = data.messages
  })

  for (const [name, data] of personMap) {
    parts.push(`### ${name}`)
    parts.push(`완료: ${data.completed.length}건, 진행중: ${data.inProgress.length}건, 지연: ${data.overdue}건, 방치(3일+): ${data.stale}건, 커밋: ${data.commits}건`)
    if (data.completed.length > 0) parts.push(`완료 태스크: ${data.completed.join(' / ')}`)
    if (data.inProgress.length > 0) parts.push(`진행중 태스크: ${data.inProgress.join(' / ')}`)
    if (data.commitMsgs.length > 0) parts.push(`주요 커밋: ${data.commitMsgs.slice(0, 5).join(' / ')}`)
    parts.push('')
  }

  // Weekly reports (FULL content — this is the key difference from Vercel Cron)
  if (weeklyDocs && weeklyDocs.length > 0) {
    parts.push('## 주간보고서 & 코드기반 리포트 (원문)')
    for (const doc of weeklyDocs) {
      const projectName = projects.find(p => p.id === doc.project_id)?.name || '?'
      const docType = doc.doc_type === 'weekly_report' ? '주간보고' : '코드기반 리포트'
      parts.push(`### [${projectName}] ${docType} (${doc.created_at.slice(0, 10)})`)
      // Truncate very long reports to keep within CLI limits
      const content = doc.content?.slice(0, 3000) || '(내용 없음)'
      parts.push(content)
      parts.push('')
    }
  }

  return parts.join('\n')
}

// ============================================================
// Conversation memory (Supabase)
// ============================================================
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// 대화 저장 레이스 컨디션 방지용 뮤텍스
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

async function getConversation(chatId: number): Promise<Message[]> {
  const { data, error } = await supabase
    .from('telegram_conversations')
    .select('messages')
    .eq('chat_id', chatId)
    .eq('bot_type', 'ceo')
    .maybeSingle()
  if (error) {
    console.error(`[getConversation] DB error for chatId ${chatId}:`, error.message)
    return []
  }
  return (data?.messages as Message[]) || []
}

function isAutoMessage(msg: Message): boolean {
  return msg.role === 'assistant' && /^\[(아침 브리핑|주간 브리핑|자율 알림|팔로업|마켓 브리핑|속보|뉴스)\]/.test(msg.content)
}

async function saveConversation(chatId: number, messages: Message[]) {
  if (messages.length <= MAX_HISTORY) {
    await supabase
      .from('telegram_conversations')
      .upsert({ chat_id: chatId, bot_type: 'ceo', messages, updated_at: new Date().toISOString() }, { onConflict: 'chat_id,bot_type' })
    return
  }

  // 스마트 트리밍: 유저 대화 우선 보존, 자동 메시지는 최근 N개만
  const userMessages: Message[] = []
  const autoMessages: Message[] = []
  for (const m of messages) {
    if (isAutoMessage(m)) {
      autoMessages.push(m)
    } else {
      userMessages.push(m)
    }
  }

  const keptUser = userMessages.slice(-(MAX_HISTORY - MAX_AUTO_MESSAGES))
  const keptAuto = autoMessages.slice(-MAX_AUTO_MESSAGES)
  const trimmed = [...keptUser, ...keptAuto]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  await supabase
    .from('telegram_conversations')
    .upsert({ chat_id: chatId, bot_type: 'ceo', messages: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'chat_id,bot_type' })
}

// 락으로 감싼 대화 추가 (자동 메시지용)
async function appendToConversation(chatId: number, msg: Message) {
  await withConversationLock(chatId, async () => {
    const history = await getConversation(chatId)
    history.push(msg)
    await saveConversation(chatId, history)
  })
}

// ============================================================
// Proactive monitoring state
// ============================================================
interface MarketStateInfo {
  us: string  // REGULAR, CLOSED, PRE, POST, PREPRE, POSTPOST
  kr: string
}

interface ProactiveState {
  lastCheckAt: string
  lastSnapshotHash: string       // 데이터 변화 감지용
  lastReportedIssues: string[]   // 중복 알림 방지
  morningBriefSent: string | null // 오늘 아침 브리핑 보냈는지 (날짜)
  weeklyBriefSent: string | null  // 이번 주 주간 브리핑 보냈는지 (날짜)
  marketState: MarketStateInfo   // 마지막으로 감지한 장 상태
  lastMarketBriefing: { usOpen: string; usClose: string; krOpen: string; krClose: string; usHoliday: string; krHoliday: string } // 브리핑 중복 방지 (날짜)
}

const PROACTIVE_STATE_FILE = join(__dirname, 'logs', 'proactive-state.json')
const SERVICE_LOG_MONITOR_STATE_FILE = join(__dirname, 'logs', 'service-log-monitor-state.json')
const VOICECARDS_EVENT_MONITOR_STATE_FILE = join(__dirname, 'logs', 'voicecards-event-monitor-state.json')
const REVIEWNOTES_MONITOR_STATE_FILE = join(__dirname, 'logs', 'reviewnotes-monitor-state.json')

function loadProactiveState(): ProactiveState {
  try {
    const data = readFileSync(PROACTIVE_STATE_FILE, 'utf-8')
    const saved = JSON.parse(data)
    console.log('📌 proactiveState 복원:', saved.morningBriefSent ? `아침브리핑=${saved.morningBriefSent}` : '(초기)')
    return { ...defaultProactiveState(), ...saved }
  } catch {
    return defaultProactiveState()
  }
}

function defaultProactiveState(): ProactiveState {
  return {
    lastCheckAt: '',
    lastSnapshotHash: '',
    lastReportedIssues: [],
    morningBriefSent: null,
    weeklyBriefSent: null,
    marketState: { us: '', kr: '' },
    lastMarketBriefing: { usOpen: '', usClose: '', krOpen: '', krClose: '', usHoliday: '', krHoliday: '' },
  }
}

function saveProactiveState() {
  try {
    writeFileSync(PROACTIVE_STATE_FILE, JSON.stringify(proactiveState, null, 2))
  } catch (err) {
    console.error('proactiveState 저장 실패:', err)
  }
}

let proactiveState: ProactiveState = loadProactiveState()

interface ServiceLogCursorState {
  size?: number
  lastAlertHash?: string
  lastAlertAt?: string
  lastMissingCwdAt?: string
  lastMissingLogPathAt?: string
  lastMissingLogFileAt?: string
}

interface ServiceLogMonitorState {
  services: Record<string, ServiceLogCursorState>
}

function defaultServiceLogMonitorState(): ServiceLogMonitorState {
  return { services: {} }
}

function loadServiceLogMonitorState(): ServiceLogMonitorState {
  try {
    const raw = readFileSync(SERVICE_LOG_MONITOR_STATE_FILE, 'utf-8')
    const saved = JSON.parse(raw)
    return {
      services: typeof saved?.services === 'object' && saved.services ? saved.services : {},
    }
  } catch {
    return defaultServiceLogMonitorState()
  }
}

function saveServiceLogMonitorState() {
  try {
    writeFileSync(SERVICE_LOG_MONITOR_STATE_FILE, JSON.stringify(serviceLogMonitorState, null, 2))
  } catch (err) {
    console.error('serviceLogMonitorState 저장 실패:', err)
  }
}

let serviceLogMonitorState: ServiceLogMonitorState = loadServiceLogMonitorState()

function getServiceLogCursor(serviceKey: string): ServiceLogCursorState {
  if (!serviceLogMonitorState.services[serviceKey]) {
    serviceLogMonitorState.services[serviceKey] = {}
  }
  return serviceLogMonitorState.services[serviceKey]
}

const VOICECARDS_SERVICE_PATTERN = /(voice-?cards|보이스카드)/i
const SERVICE_LOG_ERROR_PATTERNS = [
  /\b(error|fatal|exception|fail(?:ed|ure)?)\b/i,
  /\b(unhandled|uncaught)\b/i,
  /\b(EADDRINUSE|ECONNREFUSED|ECONNRESET|ENOENT|EACCES|ETIMEDOUT)\b/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b/,
  /\b(bundle|bundling)\s+failed\b/i,
]
const SERVICE_LOG_IGNORE_PATTERNS = [
  /\b0 errors?\b/i,
  /\bno errors?\b/i,
  /\berror(s)?\s*=\s*0\b/i,
]

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

function matchesVoicecardsService(service: LocalServiceDefinition): boolean {
  const haystack = [
    service.key,
    service.displayName,
    service.description,
    ...(service.aliases || []),
  ].join(' ')
  return VOICECARDS_SERVICE_PATTERN.test(haystack)
}

function isCooldownActive(ts: string | undefined, cooldownMs = SERVICE_LOG_ALERT_COOLDOWN_MS): boolean {
  if (!ts) return false
  const time = Date.parse(ts)
  return Number.isFinite(time) && (Date.now() - time) < cooldownMs
}

function looksLikeServiceErrorLine(line: string): boolean {
  const text = stripAnsi(line).trim()
  if (!text) return false
  if (SERVICE_LOG_IGNORE_PATTERNS.some(pattern => pattern.test(text))) return false
  return SERVICE_LOG_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

function extractServiceErrorSnippet(text: string): string[] {
  const lines = text.split('\n').map(line => stripAnsi(line).trimEnd())
  const picked: string[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!looksLikeServiceErrorLine(line)) continue

    const block = [line]
    for (let j = i + 1; j < lines.length && block.length < 4; j++) {
      const next = lines[j]
      if (!next.trim()) break
      if (/^\s*at\b/.test(next) || /^\s*caused by\b/i.test(next) || /\bError:/i.test(next)) {
        block.push(next)
        continue
      }
      break
    }

    for (const item of block) {
      const compact = item.trim()
      if (!compact || seen.has(compact)) continue
      seen.add(compact)
      picked.push(compact)
      if (picked.length >= 8) return picked
    }
  }

  return picked
}

function readServiceLogDelta(logPath: string, previousSize: number): { text: string; nextSize: number; truncated: boolean } {
  const stats = statSync(logPath)
  const currentSize = stats.size
  const resetDetected = currentSize < previousSize
  const start = resetDetected ? 0 : previousSize
  const unreadBytes = Math.max(0, currentSize - start)
  if (!unreadBytes) {
    return { text: '', nextSize: currentSize, truncated: false }
  }

  const bytesToRead = Math.min(unreadBytes, SERVICE_LOG_MAX_READ_BYTES)
  const readStart = start + Math.max(0, unreadBytes - bytesToRead)
  const fd = openSync(logPath, 'r')

  try {
    const buffer = Buffer.alloc(bytesToRead)
    const bytesRead = readSync(fd, buffer, 0, bytesToRead, readStart)
    const prefix: string[] = []
    if (resetDetected) prefix.push('[로그 파일 재생성 감지]')
    if (readStart > start) prefix.push('[최근 로그 일부만 검사]')
    const content = buffer.toString('utf-8', 0, bytesRead).trim()
    return {
      text: [...prefix, content].filter(Boolean).join('\n'),
      nextSize: currentSize,
      truncated: readStart > start,
    }
  } finally {
    closeSync(fd)
  }
}

function suggestVoicecardsPath(pathValue: string | undefined): string | null {
  if (!pathValue || !pathValue.includes('/voicecards')) return null
  const suggestion = pathValue.replace('/voicecards', '/voice-cards')
  return suggestion !== pathValue && existsSync(suggestion) ? suggestion : null
}

async function sendServiceLogAlert(message: string, details: Record<string, unknown>) {
  if (!ceoChatId) return

  recordRuntimeEvent({
    botKey: 'willy-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    level: 'warn',
    source: 'service_log_alert',
    message: typeof details.serviceKey === 'string'
      ? `service log alert for ${details.serviceKey}`
      : 'service log alert',
    details,
  })

  await sendMessage(ceoChatId, message)
  await appendToConversation(ceoChatId, {
    role: 'assistant',
    content: `[서비스 로그 알림]\n${message}`,
    timestamp: new Date().toISOString(),
  })
}

async function monitorVoicecardsServiceLogs() {
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ voicecards log monitor skip (Sunday KST)')
    return
  }

  const services = (await getLocalServiceRegistry()).filter(matchesVoicecardsService)
  if (!services.length) return

  let stateChanged = false

  for (const service of services) {
    const cursor = getServiceLogCursor(service.key)

    if (service.cwd && !existsSync(service.cwd)) {
      if (!isCooldownActive(cursor.lastMissingCwdAt)) {
        const suggestion = suggestVoicecardsPath(service.cwd)
        await sendServiceLogAlert([
          '⚠️ [VoiceCards 감시 알림]',
          `- 서비스: ${service.displayName} (${service.key})`,
          `- 문제: cwd 경로를 찾지 못했어요.`,
          `- cwd: ${service.cwd}`,
          suggestion ? `- 제안 경로: ${suggestion}` : '',
        ].filter(Boolean).join('\n'), {
          serviceKey: service.key,
          issue: 'missing_cwd',
          cwd: service.cwd,
          suggestion,
        })
        cursor.lastMissingCwdAt = new Date().toISOString()
        stateChanged = true
      }
      continue
    }

    const status = await getLocalServiceStatus(service)
    if (!service.logPath) {
      if (status?.state === 'running' && !isCooldownActive(cursor.lastMissingLogPathAt)) {
        await sendServiceLogAlert([
          '⚠️ [VoiceCards 감시 알림]',
          `- 서비스: ${service.displayName} (${service.key})`,
          '- 문제: log_path가 등록되지 않아 로그 감시를 할 수 없어요.',
        ].join('\n'), {
          serviceKey: service.key,
          issue: 'missing_log_path',
        })
        cursor.lastMissingLogPathAt = new Date().toISOString()
        stateChanged = true
      }
      continue
    }

    if (!existsSync(service.logPath)) {
      if (status?.state === 'running' && !isCooldownActive(cursor.lastMissingLogFileAt)) {
        await sendServiceLogAlert([
          '⚠️ [VoiceCards 감시 알림]',
          `- 서비스: ${service.displayName} (${service.key})`,
          '- 문제: 서비스는 실행 중인데 로그 파일이 아직 없어요.',
          `- log_path: ${service.logPath}`,
          '- start_command가 stdout/stderr를 로그로 남기고 있는지 확인해 주세요.',
        ].join('\n'), {
          serviceKey: service.key,
          issue: 'missing_log_file',
          logPath: service.logPath,
          status: status.state,
        })
        cursor.lastMissingLogFileAt = new Date().toISOString()
        stateChanged = true
      }
      continue
    }

    const currentSize = statSync(service.logPath).size
    if (cursor.size == null) {
      cursor.size = currentSize
      stateChanged = true
      continue
    }

    const delta = readServiceLogDelta(service.logPath, cursor.size)
    cursor.size = delta.nextSize
    stateChanged = true

    if (!delta.text.trim()) continue

    const snippet = extractServiceErrorSnippet(delta.text)
    if (!snippet.length) continue

    const alertHash = simpleHash(`${service.key}\n${snippet.join('\n')}`)
    if (cursor.lastAlertHash === alertHash && isCooldownActive(cursor.lastAlertAt)) {
      continue
    }

    await sendServiceLogAlert([
      '🛠️ [VoiceCards 로그 알림]',
      `- 서비스: ${service.displayName} (${service.key})`,
      `- 상태: ${status?.state === 'running' ? 'running' : status?.state || 'unknown'}`,
      `- 로그: ${service.logPath}`,
      delta.truncated ? `- 참고: 로그가 많아 최근 ${Math.round(SERVICE_LOG_MAX_READ_BYTES / 1024)}KB만 검사했어요.` : '',
      '',
      snippet.join('\n'),
    ].filter(Boolean).join('\n'), {
      serviceKey: service.key,
      issue: 'log_error_detected',
      logPath: service.logPath,
      status: status?.state || 'unknown',
      snippet,
    })

    cursor.lastAlertHash = alertHash
    cursor.lastAlertAt = new Date().toISOString()
    stateChanged = true
  }

  if (stateChanged) saveServiceLogMonitorState()
}

interface VoicecardsMonitorAlertState {
  lastHash?: string
  lastAlertAt?: string
  lastEventAt?: string
}

interface VoicecardsEventMonitorState {
  alerts: Record<string, VoicecardsMonitorAlertState>
  activatedUserIds?: string[]
  processedPurchaseEventIds?: string[]
}

interface VoicecardsEventRow {
  id?: string
  event_name: string | null
  created_at: string
  user_id: string | null
  device_id: string | null
  country?: string | null
  platform?: string | null
  properties: Record<string, unknown> | null
}

interface VoicecardsUserRow {
  user_id: string
  nickname: string | null
  email: string | null
}

function formatVoicecardsUserLabel(user: VoicecardsUserRow | undefined, userId: string | null | undefined): string {
  if (!user) return shortVoicecardsUserId(userId)
  if (user.nickname?.trim()) return user.nickname.trim()
  if (user.email?.trim()) return user.email.trim().split('@')[0] || user.email.trim()
  return shortVoicecardsUserId(user.user_id)
}

function defaultVoicecardsEventMonitorState(): VoicecardsEventMonitorState {
  return { alerts: {} }
}

function loadVoicecardsEventMonitorState(): VoicecardsEventMonitorState {
  try {
    const raw = readFileSync(VOICECARDS_EVENT_MONITOR_STATE_FILE, 'utf-8')
    const saved = JSON.parse(raw)
    return {
      alerts: typeof saved?.alerts === 'object' && saved.alerts ? saved.alerts : {},
      activatedUserIds: Array.isArray(saved?.activatedUserIds) ? saved.activatedUserIds : undefined,
      processedPurchaseEventIds: Array.isArray(saved?.processedPurchaseEventIds)
        ? saved.processedPurchaseEventIds.filter((value: unknown): value is string => typeof value === 'string').slice(-200)
        : undefined,
    }
  } catch {
    return defaultVoicecardsEventMonitorState()
  }
}

function saveVoicecardsEventMonitorState() {
  try {
    writeFileSync(VOICECARDS_EVENT_MONITOR_STATE_FILE, JSON.stringify(voicecardsEventMonitorState, null, 2))
  } catch (err) {
    console.error('voicecardsEventMonitorState 저장 실패:', err)
  }
}

const voicecardsEventMonitorState: VoicecardsEventMonitorState = loadVoicecardsEventMonitorState()

function getVoicecardsAlertState(key: string): VoicecardsMonitorAlertState {
  if (!voicecardsEventMonitorState.alerts[key]) {
    voicecardsEventMonitorState.alerts[key] = {}
  }
  return voicecardsEventMonitorState.alerts[key]
}

function formatKstShort(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortVoicecardsUserId(value: string | null | undefined): string {
  if (!value) return '(unknown)'
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function buildVoicecardsEventCounts(events: VoicecardsEventRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events) {
    const key = event.event_name || 'unknown'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function isVoicecardsPurchaseEvent(event: VoicecardsEventRow): boolean {
  if (event.event_name !== 'credits_changed') return false
  const delta = Number(event.properties?.delta || 0)
  const reason = typeof event.properties?.reason === 'string' ? event.properties.reason : null
  return delta > 0 && reason === 'purchase'
}

async function fetchAllVoicecardsRows<T>(
  fn: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await fn(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return out
}

async function fetchVoicecardsExcludedUserIds(): Promise<Set<string>> {
  if (!voicecardsSupabase) return new Set<string>()
  const excludedNicknames = new Set(['류하아빠', '큐트도넛'])
  const excludedUserIds = new Set([
    '101662172713686736923',
    '100644446554227652222',
    '107821687966181028778',
  ])
  const excludedEmails = new Set(['dw.kim@willowinvt.com'])
  const excludedEmailDomains = ['cloudtestlabaccounts.com']
  const excludedEmailPatterns = [
    /\.[0-9]{5,}@gmail\.com$/i,
    /batch[0-9]+@gmail\.com$/i,
    /wave[0-9]+batch[0-9]+/i,
  ]
  const { data, error } = await voicecardsSupabase
    .from('users')
    .select('user_id, nickname, email')

  if (error) throw error

  return new Set(
    (data || [])
      .filter(row =>
        excludedUserIds.has(row.user_id)
        || (row.nickname && excludedNicknames.has(row.nickname))
        || (!!row.email && excludedEmails.has(row.email.toLowerCase()))
        || (!!row.email && excludedEmailDomains.some(domain => row.email!.toLowerCase().endsWith(`@${domain}`)))
        || (!!row.email && excludedEmailPatterns.some(pattern => pattern.test(row.email!)))
      )
      .map(row => row.user_id)
  )
}

async function fetchVoicecardsActivatedUserIds(excludedUserIds: Set<string>): Promise<Set<string>> {
  if (!voicecardsSupabase) return new Set()
  const [users, analytics] = await Promise.all([
    fetchAllVoicecardsRows<{ user_id: string; sheet_ids: unknown }>(async (from, to) =>
      voicecardsSupabase!
        .from('users')
        .select('user_id, sheet_ids')
        .range(from, to)
    ),
    fetchAllVoicecardsRows<{ user_id: string }>(async (from, to) =>
      voicecardsSupabase!
        .from('user_analytics')
        .select('user_id')
        .gt('total_cards', 0)
        .not('sheet_id', 'like', 'demo-%')
        .range(from, to)
    ),
  ])

  const activated = new Set<string>()
  for (const user of users) {
    if (!excludedUserIds.has(user.user_id) && Array.isArray(user.sheet_ids) && user.sheet_ids.length > 0) {
      activated.add(user.user_id)
    }
  }
  for (const row of analytics) {
    if (!excludedUserIds.has(row.user_id)) activated.add(row.user_id)
  }
  return activated
}

async function fetchVoicecardsEventsSince(sinceIso: string): Promise<VoicecardsEventRow[]> {
  if (!voicecardsSupabase) return []
  const excludedUserIds = await fetchVoicecardsExcludedUserIds()
  const rows = await fetchAllVoicecardsRows<VoicecardsEventRow>(async (from, to) =>
    voicecardsSupabase!
      .from('anonymous_events_real_users')
      .select('event_name, created_at, user_id, device_id, properties')
      .eq('is_likely_bot', false)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  return rows.filter(row => !row.user_id || !excludedUserIds.has(row.user_id))
}

async function fetchVoicecardsRawEventsSince(sinceIso: string): Promise<VoicecardsEventRow[]> {
  if (!voicecardsSupabase) return []
  const excludedUserIds = await fetchVoicecardsExcludedUserIds()
  const rows = await fetchAllVoicecardsRows<VoicecardsEventRow>(async (from, to) =>
    voicecardsSupabase!
      .from('anonymous_events')
      .select('event_name, created_at, user_id, device_id, properties')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  return rows.filter(row => !row.user_id || !excludedUserIds.has(row.user_id))
}

// Count of ALL raw events (no user/bot exclusions) since a cutoff — used to tell a
// genuine ingestion outage apart from a natural quiet window. Returns -1 on error /
// no client so a failed count never triggers an outage alert.
async function fetchVoicecardsRawAllCountSince(sinceIso: string): Promise<number> {
  if (!voicecardsSupabase) return -1
  const { count, error } = await voicecardsSupabase
    .from('anonymous_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sinceIso)
  if (error) return -1
  return count ?? 0
}

async function fetchVoicecardsPurchaseEventsSince(sinceIso: string): Promise<VoicecardsEventRow[]> {
  if (!voicecardsSupabase) return []
  const excludedUserIds = await fetchVoicecardsExcludedUserIds()
  const rows = await fetchAllVoicecardsRows<VoicecardsEventRow>(async (from, to) =>
    voicecardsSupabase!
      .from('anonymous_events')
      .select('id, event_name, created_at, user_id, device_id, country, platform, properties')
      .eq('event_name', 'credits_changed')
      .eq('properties->>reason', 'purchase')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  return rows.filter(row =>
    isVoicecardsPurchaseEvent(row) && (!row.user_id || !excludedUserIds.has(row.user_id))
  )
}

async function fetchVoicecardsUsers(userIds: string[]): Promise<Map<string, VoicecardsUserRow>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!voicecardsSupabase || !ids.length) return new Map()

  const { data, error } = await voicecardsSupabase
    .from('users')
    .select('user_id, nickname, email')
    .in('user_id', ids)

  if (error) throw error

  return new Map((data || []).map(row => [row.user_id, row as VoicecardsUserRow]))
}

async function fetchVoicecardsUserCountries(userIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!voicecardsSupabase || !ids.length) return new Map()

  const { data, error } = await voicecardsSupabase
    .from('anonymous_events')
    .select('user_id, country, created_at')
    .in('user_id', ids)
    .not('country', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.max(100, ids.length * 20))

  if (error) throw error

  const countries = new Map<string, string>()
  for (const row of data || []) {
    if (row.user_id && row.country && !countries.has(row.user_id)) {
      countries.set(row.user_id, row.country)
    }
  }
  return countries
}

async function sendVoicecardsEventAlert(message: string, details: Record<string, unknown>) {
  if (!ceoChatId) return

  recordRuntimeEvent({
    botKey: 'willy-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    level: 'warn',
    source: 'voicecards_event_alert',
    message: typeof details.issue === 'string'
      ? `voicecards event alert: ${details.issue}`
      : 'voicecards event alert',
    details,
  })

  await sendMessage(ceoChatId, message)
  await appendToConversation(ceoChatId, {
    role: 'assistant',
    content: `[VoiceCards 사용자 로그 알림]\n${message}`,
    timestamp: new Date().toISOString(),
  })
}

// 스토어에 실제 적용한 지역가만 명시하고, 미설정 국가는 USD 기준가로 표시한다.
const VC_PRODUCT_PRICES_USD: Record<string, number> = {
  'com.monor.voicecards.credits.1000': 9.99,
  'com.monor.voicecards.credits.5500': 49.99,
  'com.monor.voicecards.credits.12000': 99.99,
}
const VC_PRODUCT_PRICES_LOCAL: Record<string, Record<string, string>> = {
  IN: {
    'com.monor.voicecards.credits.1000': '₹449',
    'com.monor.voicecards.credits.5500': '₹2,499',
    'com.monor.voicecards.credits.12000': '₹4,999',
  },
  PH: {
    'com.monor.voicecards.credits.1000': '₱349',
    'com.monor.voicecards.credits.5500': '₱1,999',
    'com.monor.voicecards.credits.12000': '₱3,999',
  },
}
const VC_PRODUCT_PRICES_LOCAL_USD: Record<string, Record<string, number>> = {
  IN: {
    'com.monor.voicecards.credits.1000': 5.39,
    'com.monor.voicecards.credits.5500': 29.99,
    'com.monor.voicecards.credits.12000': 59.97,
  },
  PH: {
    'com.monor.voicecards.credits.1000': 6.13,
    'com.monor.voicecards.credits.5500': 35.11,
    'com.monor.voicecards.credits.12000': 70.24,
  },
}
const VC_COUNTRY_LABELS: Record<string, string> = {
  IN: '인도',
  PH: '필리핀',
}

function vcPurchasePriceLabel(productId: string, country: string | null | undefined): string {
  const countryCode = country?.trim().toUpperCase() || ''
  const localPrice = VC_PRODUCT_PRICES_LOCAL[countryCode]?.[productId]
  const localUsd = VC_PRODUCT_PRICES_LOCAL_USD[countryCode]?.[productId]
  if (localPrice) return localUsd ? `${localPrice} (약 $${localUsd.toFixed(2)})` : localPrice
  const usdPrice = VC_PRODUCT_PRICES_USD[productId]
  return usdPrice ? `$${usdPrice.toFixed(2)}` : '가격 미확인'
}

function vcPurchaseCountryLabel(country: string | null | undefined): string {
  const countryCode = country?.trim().toUpperCase() || ''
  return VC_COUNTRY_LABELS[countryCode] || countryCode || '국가 미확인'
}

let voicecardsPurchaseMonitorRunning = false

async function monitorVoicecardsPurchases() {
  if (voicecardsPurchaseMonitorRunning) return
  voicecardsPurchaseMonitorRunning = true
  try {
    await monitorVoicecardsPurchasesOnce()
  } finally {
    voicecardsPurchaseMonitorRunning = false
  }
}

async function monitorVoicecardsPurchasesOnce() {
  if (!ceoChatId || !voicecardsSupabase) return

  const purchaseAlertState = getVoicecardsAlertState('purchase')
  const lastEventMs = Number.isFinite(Date.parse(purchaseAlertState.lastEventAt || ''))
    ? Date.parse(purchaseAlertState.lastEventAt!)
    : NaN
  const sinceMs = Number.isFinite(lastEventMs)
    ? Math.max(Date.now() - VOICECARDS_PURCHASE_LOOKBACK_CAP_MS, lastEventMs - VOICECARDS_PURCHASE_RESCAN_BUFFER_MS)
    : Date.now() - VOICECARDS_PURCHASE_BOOT_LOOKBACK_MS

  const purchaseEvents = await fetchVoicecardsPurchaseEventsSince(new Date(sinceMs).toISOString())
  if (!purchaseEvents.length) return

  const processedIds = new Set(voicecardsEventMonitorState.processedPurchaseEventIds || [])
  const relevantEvents = Number.isFinite(lastEventMs)
    ? purchaseEvents.filter(event => {
        const eventMs = Date.parse(event.created_at)
        if (eventMs < lastEventMs) return false
        if (!voicecardsEventMonitorState.processedPurchaseEventIds?.length && eventMs === lastEventMs) return false
        return !event.id || !processedIds.has(event.id)
      })
    : purchaseEvents.filter(event => !event.id || !processedIds.has(event.id))
  if (!relevantEvents.length) return

  const purchaseUserIds = Array.from(new Set(relevantEvents.map(event => event.user_id).filter(Boolean) as string[]))
  const [userMap, userCountryMap] = await Promise.all([
    fetchVoicecardsUsers(purchaseUserIds),
    fetchVoicecardsUserCountries(purchaseUserIds),
  ])
  const latestEvent = relevantEvents[relevantEvents.length - 1] || relevantEvents[0]
  const latestAt = latestEvent?.created_at || ''
  const totalCreditsAdded = relevantEvents.reduce((sum, event) => sum + (Number(event.properties?.delta || 0) || 0), 0)
  const purchaserLabels = purchaseUserIds
    .slice(0, 4)
    .map(userId => formatVoicecardsUserLabel(userMap.get(userId), userId))
  const purchaseLines = relevantEvents.slice(0, 6).map(event => {
    const productId = typeof event.properties?.product_id === 'string' ? event.properties.product_id : ''
    const credits = Number(event.properties?.delta || 0) || Number(productId.split('.').pop()) || 0
    const userLabel = formatVoicecardsUserLabel(event.user_id ? userMap.get(event.user_id) : undefined, event.user_id)
    const country = event.country || (event.user_id ? userCountryMap.get(event.user_id) : null)
    const countryLabel = vcPurchaseCountryLabel(country)
    const priceLabel = vcPurchasePriceLabel(productId, country)
    return `- ${userLabel} · ${countryLabel} · ${credits.toLocaleString('en-US')}크레딧 · ${priceLabel}`
  })

  const alertHash = simpleHash(JSON.stringify(
    relevantEvents.map(event => ({
      created_at: event.created_at,
      id: event.id || '',
      user_id: event.user_id,
      delta: Number(event.properties?.delta || 0) || 0,
      product_id: typeof event.properties?.product_id === 'string' ? event.properties.product_id : '',
    }))
  ))
  if (purchaseAlertState.lastHash === alertHash) return

  await sendVoicecardsEventAlert([
    '💳 [VoiceCards 결제 알림]',
    `- 감지: 새 결제 ${relevantEvents.length}건`,
    ...purchaseLines,
    relevantEvents.length > purchaseLines.length ? `- 외 ${relevantEvents.length - purchaseLines.length}건` : '',
    relevantEvents.length > 1 && totalCreditsAdded > 0 ? `- 충전 크레딧 합계: +${totalCreditsAdded.toLocaleString('en-US')}` : '',
    latestAt ? `- 최신 결제: ${formatKstShort(latestAt)}` : '',
  ].filter(Boolean).join('\n'), {
    issue: 'purchase',
    count: relevantEvents.length,
    purchaseUserIds,
    purchaserLabels,
    totalCreditsAdded,
    countries: Array.from(new Set(relevantEvents.map(event =>
      event.country || (event.user_id ? userCountryMap.get(event.user_id) : null)
    ).filter(Boolean))),
    latestAt,
    since: new Date(sinceMs).toISOString(),
  })

  purchaseAlertState.lastHash = alertHash
  purchaseAlertState.lastAlertAt = new Date().toISOString()
  purchaseAlertState.lastEventAt = latestAt
  voicecardsEventMonitorState.processedPurchaseEventIds = [
    ...(voicecardsEventMonitorState.processedPurchaseEventIds || []),
    ...relevantEvents.map(event => event.id).filter((id): id is string => !!id),
  ].slice(-200)
  saveVoicecardsEventMonitorState()
}

async function monitorVoicecardsUserEvents() {
  if (!ceoChatId || !voicecardsSupabase) return
  if (isSundayKST()) {
    console.log('⏭️ voicecards event monitor skip (Sunday KST)')
    return
  }

  const events = await fetchVoicecardsEventsSince(new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
  if (!events.length) return

  const nowMs = Date.now()
  const recentCutoffIso = new Date(nowMs - 12 * 60 * 60 * 1000).toISOString()
  let recent12h = events.filter(event => Date.parse(event.created_at) >= nowMs - 12 * 60 * 60 * 1000)
  if (!recent12h.length) {
    // The real-users view can lag or return an empty window while the source table is current.
    recent12h = await fetchVoicecardsRawEventsSince(recentCutoffIso)
  }
  const previous60h = events.filter(event => {
    const ts = Date.parse(event.created_at)
    return ts < nowMs - 12 * 60 * 60 * 1000 && ts >= nowMs - 72 * 60 * 60 * 1000
  })

  const recentCounts = buildVoicecardsEventCounts(recent12h)
  const previousCounts = buildVoicecardsEventCounts(previous60h)
  let stateChanged = false

  // 활성화 완료 = 대시보드와 동일하게 자기 시트가 있거나 데모 외 자기 카드가 생긴 상태.
  // Drive 연동이나 AI draft 생성만으로는 알림하지 않는다.
  const excludedUserIds = await fetchVoicecardsExcludedUserIds()
  const activatedUserIds = await fetchVoicecardsActivatedUserIds(excludedUserIds)
  const knownActivatedUserIds = voicecardsEventMonitorState.activatedUserIds

  // 최초 배포 시에는 현재 활성 사용자를 기준선으로 저장해 과거 사용자 재알림을 막는다.
  if (!knownActivatedUserIds) {
    voicecardsEventMonitorState.activatedUserIds = Array.from(activatedUserIds)
    stateChanged = true
  } else {
    const known = new Set(knownActivatedUserIds)
    const freshUserIds = Array.from(activatedUserIds).filter(userId => !known.has(userId))

    if (freshUserIds.length) {
      const activationAlertState = getVoicecardsAlertState('activated_new_user')
      const userMap = await fetchVoicecardsUsers(freshUserIds)
      const detectedAt = new Date().toISOString()
      const activatedUsers = freshUserIds.slice(0, 5).map(userId =>
        formatVoicecardsUserLabel(userMap.get(userId), userId)
      )

      await sendVoicecardsEventAlert([
        '🎉 [VoiceCards 사용자 로그 알림]',
        `- 활성화(자기 시트·카드 생성)까지 마친 신규 사용자 ${freshUserIds.length}명`,
        activatedUsers.length ? `- 사용자: ${activatedUsers.join(', ')}` : '',
        `- 감지 시각: ${formatKstShort(detectedAt)}`,
      ].filter(Boolean).join('\n'), {
        issue: 'activated_new_user',
        count: freshUserIds.length,
        activatedUsers,
        detectedAt,
      })

      activationAlertState.lastHash = simpleHash(freshUserIds.slice().sort().join(','))
      activationAlertState.lastAlertAt = detectedAt
      activationAlertState.lastEventAt = detectedAt
    }

    voicecardsEventMonitorState.activatedUserIds = Array.from(new Set([...known, ...activatedUserIds]))
    if (freshUserIds.length) stateChanged = true
  }

  const totalRecentEvents = recent12h.length
  const totalPreviousEvents = previous60h.length
  const inactivityState = getVoicecardsAlertState('no_recent_activity')
  // The real-user base is small and bursty — a few heavy users generate most events
  // in short bursts, so "0 real-user events in 12h" happens naturally overnight and is
  // NOT an outage. Only escalate when the RAW table (all sources: anonymous, test,
  // App Review, bots; no exclusions) is ALSO empty in the window — that is a genuine
  // ingestion stop. The count query returns -1 on failure, which never alerts.
  const rawAllRecentCount = totalRecentEvents === 0
    ? await fetchVoicecardsRawAllCountSince(recentCutoffIso)
    : -1
  if (totalRecentEvents === 0 && rawAllRecentCount === 0 && totalPreviousEvents >= 40) {
    const alertHash = simpleHash('inactive')
    if (inactivityState.lastHash !== alertHash || !isCooldownActive(inactivityState.lastAlertAt, 12 * 60 * 60 * 1000)) {
      await sendVoicecardsEventAlert([
        '⚠️ [VoiceCards 사용자 로그 알림]',
        '- 감지: 최근 12시간 동안 이벤트 수집이 0건이에요 (익명·테스트 포함 전 소스 기준).',
        `- 이전 60시간 이벤트: ${totalPreviousEvents}건`,
        '- 추정: 트래킹 파이프라인(수집)이 멈췄을 가능성이 높아요.',
      ].join('\n'), {
        issue: 'no_recent_activity',
        recent12h: totalRecentEvents,
        rawAllRecent: rawAllRecentCount,
        previous60h: totalPreviousEvents,
      })

      inactivityState.lastHash = alertHash
      inactivityState.lastAlertAt = new Date().toISOString()
      stateChanged = true
    }
  }

  // 프롬프트 노출 대비 signin 0은 저의도 dismiss가 대부분이라 오탐 (2026-07-13 확인).
  // "시도했는데 실패"만 진짜 막힘 신호: 로그인 버튼 탭 또는 파이프라인 오류 이벤트 기준.
  const signinClicked = (recentCounts.get('prompt_signin_clicked') || 0)
    + (recentCounts.get('add_sheet_signin_and_create_clicked') || 0)
  const signinCompleted = recentCounts.get('signin_completed') || 0
  const signinErrors = (recentCounts.get('signup_folder_failed') || 0)
    + (recentCounts.get('user_row_create_failed') || 0)
  const signinFrictionState = getVoicecardsAlertState('signin_friction')
  if ((signinClicked >= 1 && signinCompleted === 0) || signinErrors >= 1) {
    const priorSigninClicked = (previousCounts.get('prompt_signin_clicked') || 0)
      + (previousCounts.get('add_sheet_signin_and_create_clicked') || 0)
    const priorSigninCompleted = previousCounts.get('signin_completed') || 0
    const alertHash = simpleHash(`signin-friction|${signinClicked}|${signinCompleted}|${signinErrors}|${priorSigninClicked}|${priorSigninCompleted}`)
    if (signinFrictionState.lastHash !== alertHash || !isCooldownActive(signinFrictionState.lastAlertAt, 6 * 60 * 60 * 1000)) {
      await sendVoicecardsEventAlert([
        '⚠️ [VoiceCards 사용자 로그 알림]',
        `- 감지: 최근 12시간 로그인 시도(버튼 탭) ${signinClicked}건 · signin_completed ${signinCompleted}건 · 파이프라인 오류 ${signinErrors}건`,
        `- 비교: 이전 60시간 시도 ${priorSigninClicked} · 완료 ${priorSigninCompleted}`,
        '- 추정: 로그인을 시도했는데 완료되지 않았거나(OAuth/폴더 생성 실패), 가입 파이프라인 오류가 발생했어요.',
      ].join('\n'), {
        issue: 'signin_friction',
        signinClicked,
        signinCompleted,
        signinErrors,
        priorSigninClicked,
        priorSigninCompleted,
      })

      signinFrictionState.lastHash = alertHash
      signinFrictionState.lastAlertAt = new Date().toISOString()
      stateChanged = true
    }
  }

  if (stateChanged) saveVoicecardsEventMonitorState()
}

interface ReviewnotesMonitorState {
  alerts: Record<string, VoicecardsMonitorAlertState>
}

interface ReviewnotesPageViewRow {
  path: string | null
  referrer: string | null
  country: string | null
  sessionId: string
  createdAt: string
}

interface ReviewnotesUserRow {
  id: string
  email: string
  subscriptionPlan: 'FREE' | 'BASIC' | 'STANDARD' | 'PRO' | string
  createdAt: string
}

interface ReviewnotesActivityRow {
  id: string
  userId: string | null
  createdAt: string
}

interface ReviewnotesSubscriptionRow {
  status: string
  planType: string | null
  updatedAt: string | null
  currentPeriodEnd: string | null
  renewsAt: string | null
  endsAt: string | null
}

interface ReviewnotesWebhookEventRow {
  eventName: string
  payload: Record<string, unknown> | null
  createdAt: string
  processedAt: string | null
}

interface ReviewnotesSystemBugEventRow {
  id: string
  source: string
  severity: string
  area: string | null
  route: string | null
  message: string
  fingerprint: string
  statusCode: number | null
  userId: string | null
  sessionId: string | null
  url: string | null
  createdAt: string
}

function defaultReviewnotesMonitorState(): ReviewnotesMonitorState {
  return { alerts: {} }
}

function loadReviewnotesMonitorState(): ReviewnotesMonitorState {
  try {
    const raw = readFileSync(REVIEWNOTES_MONITOR_STATE_FILE, 'utf-8')
    const saved = JSON.parse(raw)
    return {
      alerts: typeof saved?.alerts === 'object' && saved.alerts ? saved.alerts : {},
    }
  } catch {
    return defaultReviewnotesMonitorState()
  }
}

function saveReviewnotesMonitorState() {
  try {
    writeFileSync(REVIEWNOTES_MONITOR_STATE_FILE, JSON.stringify(reviewnotesMonitorState, null, 2))
  } catch (err) {
    console.error('reviewnotesMonitorState 저장 실패:', err)
  }
}

const reviewnotesMonitorState: ReviewnotesMonitorState = loadReviewnotesMonitorState()

function getReviewnotesAlertState(key: string): VoicecardsMonitorAlertState {
  if (!reviewnotesMonitorState.alerts[key]) {
    reviewnotesMonitorState.alerts[key] = {}
  }
  return reviewnotesMonitorState.alerts[key]
}

async function fetchAllReviewnotesRows<T>(
  fn: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await fn(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }

  return out
}

async function sendReviewnotesMonitorAlert(message: string, details: Record<string, unknown>) {
  if (!ceoChatId) return

  recordRuntimeEvent({
    botKey: 'willy-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    level: 'warn',
    source: 'reviewnotes_monitor_alert',
    message: typeof details.issue === 'string'
      ? `reviewnotes monitor alert: ${details.issue}`
      : 'reviewnotes monitor alert',
    details,
  })

  await sendMessage(ceoChatId, message)
  await appendToConversation(ceoChatId, {
    role: 'assistant',
    content: `[ReviewNotes 시스템 버그 알림]\n${message}`,
    timestamp: new Date().toISOString(),
  })
}

async function monitorReviewnotesSignals() {
  if (!ceoChatId || !reviewnotesSupabase) return

  const nowMs = Date.now()
  const since4hIso = new Date(nowMs - 4 * 60 * 60 * 1000).toISOString()

  const webhookEvents4h = await fetchAllReviewnotesRows<ReviewnotesWebhookEventRow>(async (from, to) =>
    reviewnotesSupabase!
      .from('WebhookEvent')
      .select('eventName, payload, createdAt, processedAt')
      .gte('createdAt', since4hIso)
      .order('createdAt', { ascending: false })
      .range(from, to)
  ).catch(() => [])

  let stateChanged = false
  const bugEvents = webhookEvents4h
    .filter(event => event.eventName === 'system_bug' && !!event.payload)
    .map<ReviewnotesSystemBugEventRow | null>(event => {
      const payload = event.payload || {}
      const message = typeof payload.message === 'string' ? payload.message : ''
      if (!message) return null
      return {
        id: typeof payload.fingerprint === 'string'
          ? `${payload.fingerprint}:${event.createdAt}`
          : `system_bug:${event.createdAt}`,
        source: typeof payload.source === 'string' ? payload.source : 'unknown',
        severity: typeof payload.severity === 'string' ? payload.severity : 'error',
        area: typeof payload.area === 'string' ? payload.area : null,
        route: typeof payload.route === 'string' ? payload.route : null,
        message,
        fingerprint: typeof payload.fingerprint === 'string' ? payload.fingerprint : simpleHash(message),
        statusCode: typeof payload.statusCode === 'number' ? payload.statusCode : null,
        userId: typeof payload.userId === 'string' ? payload.userId : null,
        sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : null,
        url: typeof payload.url === 'string' ? payload.url : null,
        createdAt: event.createdAt,
      }
    })
    .filter((event): event is ReviewnotesSystemBugEventRow => !!event)

  const severeBugEvents = bugEvents.filter(event => ['error', 'fatal'].includes((event.severity || '').toLowerCase()))
  const grouped = new Map<string, ReviewnotesSystemBugEventRow[]>()
  for (const event of severeBugEvents) {
    const key = event.fingerprint || simpleHash([
      event.source || 'unknown',
      event.route || event.area || 'unknown',
      event.message || 'unknown',
    ].join('|'))
    const list = grouped.get(key) || []
    list.push(event)
    grouped.set(key, list)
  }

  const summaries = Array.from(grouped.entries())
    .map(([fingerprint, events]) => {
      const ordered = events.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      const latest = ordered[ordered.length - 1]
      const uniqueUsers = new Set(ordered.map(event => event.userId).filter(Boolean)).size
      const uniqueSessions = new Set(ordered.map(event => event.sessionId).filter(Boolean)).size
      const hasFatal = ordered.some(event => (event.severity || '').toLowerCase() === 'fatal')
      const statusCodes = Array.from(new Set(ordered.map(event => event.statusCode).filter((value): value is number => typeof value === 'number')))
      return {
        fingerprint,
        count: ordered.length,
        uniqueUsers,
        uniqueSessions,
        hasFatal,
        latest,
        source: latest?.source || 'unknown',
        route: latest?.route || latest?.area || null,
        message: latest?.message || '(message missing)',
        statusCodes,
      }
    })
    .sort((a, b) =>
      Number(b.hasFatal) - Number(a.hasFatal)
      || b.count - a.count
      || Date.parse(b.latest.createdAt) - Date.parse(a.latest.createdAt)
    )

  for (const summary of summaries.slice(0, 3)) {
    const isConfigBug = /(not configured|missing|invalid signature|aws|oauth|database_url|nextauth)/i.test(summary.message)
    const shouldAlert = summary.hasFatal || summary.count >= 3 || summary.uniqueUsers >= 2 || summary.uniqueSessions >= 3 || isConfigBug
    if (!shouldAlert) continue

    const alertState = getReviewnotesAlertState(`system_bug:${summary.fingerprint}`)
    const alertHash = simpleHash([
      summary.count,
      summary.uniqueUsers,
      summary.uniqueSessions,
      summary.latest.createdAt,
      summary.statusCodes.join(','),
    ].join('|'))

    if (alertState.lastHash === alertHash && isCooldownActive(alertState.lastAlertAt, 6 * 60 * 60 * 1000)) {
      continue
    }

    await sendReviewnotesMonitorAlert([
      '🛠️ [ReviewNotes 시스템 버그 알림]',
      `- 감지: ${summary.message}`,
      `- 최근 90분: ${summary.count}건 · 사용자 ${summary.uniqueUsers}명 · 세션 ${summary.uniqueSessions}건`,
      summary.route ? `- 위치: ${summary.route}` : '',
      `- 분류: ${summary.source}${summary.statusCodes.length ? ` · HTTP ${summary.statusCodes.join(', ')}` : ''}`,
      `- 최신 발생: ${formatKstShort(summary.latest.createdAt)}`,
    ].filter(Boolean).join('\n'), {
      issue: 'system_bug',
      fingerprint: summary.fingerprint,
      count: summary.count,
      uniqueUsers: summary.uniqueUsers,
      uniqueSessions: summary.uniqueSessions,
      source: summary.source,
      route: summary.route,
      statusCodes: summary.statusCodes,
      latestAt: summary.latest.createdAt,
      message: summary.message,
    })

    alertState.lastHash = alertHash
    alertState.lastAlertAt = new Date().toISOString()
    stateChanged = true
  }

  const stuckWebhooks = webhookEvents4h.filter(event =>
    event.eventName !== 'system_bug'
    && !event.processedAt
    && Date.parse(event.createdAt) <= nowMs - 15 * 60 * 1000
  )
  if (stuckWebhooks.length) {
    const eventNames = Array.from(new Set(stuckWebhooks.map(event => event.eventName)))
    const latestAt = stuckWebhooks[0]?.createdAt || null
    const alertState = getReviewnotesAlertState('webhook_stuck')
    const alertHash = simpleHash(`webhook_stuck|${stuckWebhooks.length}|${eventNames.join(',')}|${latestAt || ''}`)

    if (alertState.lastHash !== alertHash || !isCooldownActive(alertState.lastAlertAt, 3 * 60 * 60 * 1000)) {
      await sendReviewnotesMonitorAlert([
        '🧩 [ReviewNotes 시스템 버그 알림]',
        `- 감지: 처리되지 않은 웹훅 ${stuckWebhooks.length}건이 15분 넘게 남아 있어요.`,
        `- 이벤트: ${eventNames.join(', ') || '(unknown)'}`,
        latestAt ? `- 최신 발생: ${formatKstShort(latestAt)}` : '',
        '- 추정: 결제 웹훅 처리 로직이 중간에서 멈췄을 수 있어요.',
      ].filter(Boolean).join('\n'), {
        issue: 'webhook_stuck',
        count: stuckWebhooks.length,
        eventNames,
        latestAt,
      })

      alertState.lastHash = alertHash
      alertState.lastAlertAt = new Date().toISOString()
      stateChanged = true
    }
  }

  if (stateChanged) saveReviewnotesMonitorState()
}

// 간단한 해시 함수 (데이터 변화 감지)
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}

async function loadCeoChatId() {
  // DB에서 저장된 chat_id 로드
  const { data, error } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[loadCeoChatId] DB error:', error.message)
    return
  }
  if (data?.chat_id) {
    ceoChatId = data.chat_id
    console.log(`📌 CEO chat_id 로드: ${ceoChatId}`)
  }
}

// ============================================================
// Proactive check - Claude가 자율 판단
// ============================================================
const PROACTIVE_PROMPT = `당신은 윌리입니다.
아래 사업 데이터를 검토하고, CEO에게 **지금 즉시 알려야 할 사항**이 있는지 판단하세요.

## 알림 기준 (하나라도 해당하면 알림)
- 마일스톤이 오늘 마감이거나 이미 지연됨
- 오늘 예정된 일정이 있는데 아직 미완료 (오후 2시 이후)
- 미수금이 30일 이상 경과
- 긴급하거나 위험한 상황 감지

## 알림 제외
- 이미 보고한 사항 (아래 목록 참조)
- 단순 정보 (변화 없는 데이터)
- 일상적이고 정상적인 상태

## 이미 보고한 사항
{reported_issues}

## 응답 형식
알릴 사항이 있으면 CEO에게 자연스럽게 말을 거세요. 보고서 형태가 아니라, "대표님, 아크로스 미팅이 2시간 뒤인데 준비할 거 있으세요?" 같은 자연스러운 대화체로. 짧게.
알릴 사항이 없으면 정확히 "SKIP" 한 단어만 출력하세요.`

function getMorningBriefPrompt() {
  return `당신은 윌리입니다.
아침에 CEO에게 자연스럽게 인사하면서 오늘 핵심 사항을 알려주세요.

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단)
${getCurrentKSTString()}

## 포함 사항
1. 오늘의 핵심 일정 (반드시 위 "현재 시각"의 날짜와 일치하는 일정만 "오늘"로 언급)
2. 주의할 마일스톤이나 긴급 사항
3. 간단한 재무 현황 (이슈 있을 때만)

## 스타일
- 딱딱한 보고서 X. 동료에게 카톡하듯 자연스럽게.
- 예: "좋은 아침이에요 ☀️ 오늘 아크로스 미팅 14시에 있고, ETC 인보이스 마감이 내일까지예요. 텐소프트웍스는 특이사항 없어요."
- 할 일이 없는 날은 "오늘은 특별한 일정 없어요. 편한 하루 되세요 😊" 정도로 짧게.
- 3~5문장 이내. 불릿 포인트는 일정이 3개 이상일 때만.`
}

function getFollowUpPrompt() {
  return `당신은 윌리입니다.
아래 "열린 팔로업" 항목의 트리거 조건이 충족되었습니다.
CEO에게 자연스럽게 말을 거세요. 팔로업이라는 느낌이 아니라, 마치 생각나서 물어보는 것처럼 자연스럽게.

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단)
${getCurrentKSTString()}

## 스타일
- 격식 없이 편하게, 단 반드시 존댓말(해요체). 반말 금지.
- 한 줄로 시작 (필요하면 2~3줄)
- 답변을 강요하지 말 것
- 이모지 적절히

## 팔로업 항목
{follow_ups}

## 현재 사업 맥락 (참고)
{context}

자연스럽게 말 거는 메시지를 작성하세요. 여러 건이면 자연스럽게 통합하세요.`
}

async function checkFollowUps() {
  if (!ceoChatId) return

  try {
    const now = new Date()

    // 트리거 시각이 도래한 열린 팔로업 조회
    const { data: dueFollowUps } = await supabase
      .from('agent_follow_ups')
      .select('*')
      .eq('status', 'open')
      .lte('trigger_after', now.toISOString())
      .order('priority', { ascending: true }) // high first
      .limit(5)

    if (!dueFollowUps?.length) return

    console.log(`🔔 팔로업 트리거: ${dueFollowUps.length}건`)

    // 팔로업 정보 구성
    const followUpText = dueFollowUps.map((f, i) =>
      `${i + 1}. [${f.priority}] ${f.content}` +
      (f.follow_up_hint ? `\n   힌트: ${f.follow_up_hint}` : '') +
      (f.source_message ? `\n   원본: "${f.source_message}"` : '') +
      `\n   등록: ${new Date(f.created_at).toLocaleDateString('ko-KR')}`
    ).join('\n')

    // 간단한 사업 맥락
    const dashboardContext = await fetchDashboardContext()

    const prompt = getFollowUpPrompt()
      .replace('{follow_ups}', followUpText)
      .replace('{context}', dashboardContext.slice(0, 2000)) // 맥락은 간결하게

    const stopTyping = startTypingPulse(ceoChatId)
    let response = ''
    try {
      response = await askClaude(prompt)
    } finally {
      stopTyping()
    }

    // 팔로업 상태 → triggered
    await supabase
      .from('agent_follow_ups')
      .update({ status: 'triggered', triggered_at: now.toISOString() })
      .in('id', dueFollowUps.map(f => f.id))

    // 메시지 전송
    await sendSplitMessage(ceoChatId, response)

    // 대화 기록 저장 (락으로 보호)
    await appendToConversation(ceoChatId, { role: 'assistant', content: `[팔로업]\n${response}`, timestamp: now.toISOString() })

    console.log(`✅ 팔로업 전송: ${dueFollowUps.map(f => f.content).join(', ')}`)
  } catch (err) {
    console.error('Follow-up check error:', err)
  }
}

type AutoFollowUpPriority = 'high' | 'normal' | 'low'
type AutoFollowUpSourceType = 'email_todo' | 'email_reply' | 'wiki_deadline'

interface EmailTodoRow {
  id: string
  label: string | null
  category: string | null
  task: string
  due_date: string | null
  priority: string | null
  related_email_ids: string[] | null
  completed: boolean | null
  created_at: string
}

interface EmailMetadataLiteRow {
  gmail_message_id: string
  gmail_thread_id: string | null
  subject: string | null
  from_name: string | null
  from_email: string | null
  date: string
  direction: 'inbound' | 'outbound' | null
  requires_reply: boolean | null
  action_items: Array<{ task?: string; dueDate?: string; priority?: string; owner?: string }> | null
  summary: string | null
  priority: string | null
  intent: string | null
}

interface WorkWikiLiteRow {
  id: string
  section: string | null
  title: string | null
  content: string | null
  category: string | null
  updated_at: string | null
}

interface AgentFollowUpLiteRow {
  trigger_config: Record<string, unknown> | null
}

interface AutoFollowUpCandidate {
  dedupeKey: string
  sourceType: AutoFollowUpSourceType
  sourceRef: string
  content: string
  sourceMessage: string
  followUpHint: string
  priority: AutoFollowUpPriority
  triggerAfter: Date
  summaryLine: string
}

interface WikiDueSignal {
  date: Date
  line: string
  raw: string
}

const AUTO_FOLLOW_UP_MAX_NEW_PER_SCAN = 6
const AUTO_FOLLOW_UP_TODO_LOOKBACK_DAYS = 45
const AUTO_FOLLOW_UP_OVERDUE_CAP_DAYS = 30
const WIKI_SECTION_LABELS: Record<string, string> = {
  akros: '아크로스',
  'etf-etc': 'ETC',
  'willow-mgmt': '윌로우',
  'tensw-mgmt': '텐소프트웍스',
  'invest-mgmt': '투자관리',
}
const WIKI_DUE_KEYWORDS = ['마감', '제출', '공유', '확인', '검토', '회의', '미팅', '보내', '작성', '업데이트', '정리', '리뷰', 'follow up', 'follow-up']
let autoFollowUpScanRunning = false

function normalizeAutoFollowUpText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T09:00:00+09:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3600000
}

function nextBusinessMorning(from: Date): Date {
  const target = new Date(from)
  target.setHours(9, 15, 0, 0)
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1)
  }
  while (isSundayKST(target)) {
    target.setDate(target.getDate() + 1)
  }
  return target
}

function dueDayMorning(date: Date): Date {
  const target = new Date(date)
  target.setHours(9, 15, 0, 0)
  if (isSundayKST(target)) {
    target.setDate(target.getDate() + 1)
  }
  return target
}

function priorityRank(priority: AutoFollowUpPriority): number {
  if (priority === 'high') return 0
  if (priority === 'normal') return 1
  return 2
}

function ensureFutureTrigger(triggerAfter: Date, now: Date, fallbackHours = 12): Date {
  if (triggerAfter.getTime() > now.getTime()) return triggerAfter
  return nextBusinessMorning(new Date(now.getTime() + fallbackHours * 60 * 60 * 1000))
}

function sectionLabel(section: string | null | undefined): string {
  return section ? (WIKI_SECTION_LABELS[section] || section) : '업무위키'
}

function extractWikiDueSignals(text: string, now: Date): WikiDueSignal[] {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 80)
  const result: WikiDueSignal[] = []
  const seen = new Set<string>()
  const currentYear = now.getFullYear()

  const pushSignal = (date: Date, line: string, raw: string) => {
    if (Number.isNaN(date.getTime())) return
    const diffDays = Math.floor(hoursBetween(now, date) / 24)
    if (diffDays < -4 || diffDays > 4) return
    const key = `${formatDate(date)}|${normalizeAutoFollowUpText(line)}`
    if (seen.has(key)) return
    seen.add(key)
    result.push({ date, line, raw })
  }

  for (const line of lines) {
    const normalized = normalizeAutoFollowUpText(line)
    if (!WIKI_DUE_KEYWORDS.some(keyword => normalized.includes(keyword))) continue

    for (const match of line.matchAll(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g)) {
      const [, y, m, d] = match
      pushSignal(new Date(Number(y), Number(m) - 1, Number(d), 9, 15, 0, 0), line, match[0])
    }
    for (const match of line.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)) {
      const [, m, d] = match
      pushSignal(new Date(currentYear, Number(m) - 1, Number(d), 9, 15, 0, 0), line, match[0])
    }
    for (const match of line.matchAll(/(^|[^0-9])(\d{1,2})\/(\d{1,2})(?!\d)/g)) {
      const m = match[2]
      const d = match[3]
      pushSignal(new Date(currentYear, Number(m) - 1, Number(d), 9, 15, 0, 0), line, `${m}/${d}`)
    }
  }

  return result
}

async function loadExistingAutoFollowUpKeys(): Promise<Set<string>> {
  const sinceIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('agent_follow_ups')
    .select('trigger_config')
    .gte('created_at', sinceIso)
    .limit(500)

  const dedupeKeys = new Set<string>()
  for (const row of (data || []) as AgentFollowUpLiteRow[]) {
    const key = row.trigger_config && typeof row.trigger_config.dedupe_key === 'string'
      ? row.trigger_config.dedupe_key
      : null
    if (key) dedupeKeys.add(key)
  }
  return dedupeKeys
}

function buildTodoFollowUpCandidates(
  todos: EmailTodoRow[],
  existingKeys: Set<string>,
  now: Date,
): AutoFollowUpCandidate[] {
  const out: AutoFollowUpCandidate[] = []

  for (const todo of todos) {
    if (todo.completed) continue
    const createdAt = parseDateValue(todo.created_at)
    if (!createdAt) continue

    const dueAt = parseDateValue(todo.due_date)
    const ageHours = hoursBetween(createdAt, now)
    const ageDays = ageHours / 24
    if (ageDays > AUTO_FOLLOW_UP_TODO_LOOKBACK_DAYS) continue
    const priorityText = (todo.priority || '').toLowerCase()
    const isHighPriority = priorityText === 'high' || priorityText === 'critical'
    const isOverdue = !!dueAt && dueAt.getTime() <= now.getTime()
    if (dueAt && hoursBetween(dueAt, now) > AUTO_FOLLOW_UP_OVERDUE_CAP_DAYS * 24) continue
    const dueSoon = !!dueAt && dueAt.getTime() > now.getTime() && hoursBetween(now, dueAt) <= 30
    const shouldCreate = isOverdue || (dueSoon && ageHours >= 24) || ageHours >= (isHighPriority ? 48 : 96)
    if (!shouldCreate) continue

    const dedupeKey = `todo:${todo.id}`
    if (existingKeys.has(dedupeKey)) continue

    const label = todo.label || '이메일'
    const category = todo.category ? ` / ${todo.category}` : ''
    const dueLabel = dueAt ? `${formatDate(dueAt)}${isOverdue ? ' 경과' : ' 예정'}` : `${Math.floor(ageHours / 24)}일째 미완료`
    const sourceMessage = dueAt
      ? `${label}${category} TODO "${todo.task}" (${dueLabel})`
      : `${label}${category} TODO "${todo.task}" 가 ${Math.floor(ageHours / 24)}일째 열려 있어요.`
    const triggerAfter = ensureFutureTrigger(
      isOverdue
        ? nextBusinessMorning(new Date(now.getTime() + 12 * 60 * 60 * 1000))
        : dueAt
          ? dueDayMorning(dueAt)
          : nextBusinessMorning(new Date(createdAt.getTime() + 72 * 60 * 60 * 1000)),
      now,
    )

    out.push({
      dedupeKey,
      sourceType: 'email_todo',
      sourceRef: todo.id,
      content: `${label} TODO 확인: ${todo.task}`.slice(0, 160),
      sourceMessage,
      followUpHint: `이메일 TODO 점검${dueAt ? ` · ${dueLabel}` : ''}`,
      priority: isOverdue || isHighPriority ? 'high' : 'normal',
      triggerAfter,
      summaryLine: `- [메일 TODO] ${label}: ${todo.task.slice(0, 46)}${todo.task.length > 46 ? '...' : ''}`,
    })
  }

  return out
}

function buildEmailReplyFollowUpCandidates(
  emails: EmailMetadataLiteRow[],
  existingKeys: Set<string>,
  now: Date,
): AutoFollowUpCandidate[] {
  const out: AutoFollowUpCandidate[] = []
  const threads = new Map<string, EmailMetadataLiteRow[]>()

  for (const email of emails) {
    const key = email.gmail_thread_id || email.gmail_message_id
    const bucket = threads.get(key) || []
    bucket.push(email)
    threads.set(key, bucket)
  }

  for (const [threadKey, threadEmails] of threads.entries()) {
    const ordered = threadEmails
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const latestInbound = ordered
      .filter(email => email.direction === 'inbound' && email.requires_reply)
      .slice(-1)[0]
    if (!latestInbound) continue

    const inboundAt = parseDateValue(latestInbound.date)
    if (!inboundAt) continue
    const hasOutboundAfter = ordered.some(email => email.direction === 'outbound' && new Date(email.date).getTime() > inboundAt.getTime())
    if (hasOutboundAfter) continue

    const ageHours = hoursBetween(inboundAt, now)
    if (ageHours < 30) continue

    const dedupeKey = `reply:${threadKey}`
    if (existingKeys.has(dedupeKey)) continue

    const sender = latestInbound.from_name || latestInbound.from_email || '상대방'
    const subject = latestInbound.subject || '(제목 없음)'
    const summary = (latestInbound.summary || '').replace(/\s+/g, ' ').trim()
    const replyPriority = ((latestInbound.priority || '').toLowerCase() === 'high' || (latestInbound.priority || '').toLowerCase() === 'critical')
      ? 'high'
      : 'normal'
    const triggerAfter = ensureFutureTrigger(nextBusinessMorning(new Date(Math.max(
      now.getTime() + 6 * 60 * 60 * 1000,
      inboundAt.getTime() + 48 * 60 * 60 * 1000,
    ))), now)

    out.push({
      dedupeKey,
      sourceType: 'email_reply',
      sourceRef: threadKey,
      content: `${sender} 메일 회신 확인: ${subject}`.slice(0, 160),
      sourceMessage: `${sender} 메일 "${subject}" 에 ${Math.floor(ageHours / 24)}일째 회신 기록이 없어요.`,
      followUpHint: summary ? `최근 메일 요약: ${summary.slice(0, 120)}` : `미회신 ${Math.floor(ageHours / 24)}일`,
      priority: ageHours >= 72 ? 'high' : replyPriority,
      triggerAfter,
      summaryLine: `- [미회신 메일] ${sender}: ${subject.slice(0, 42)}${subject.length > 42 ? '...' : ''}`,
    })
  }

  return out
}

function buildWikiFollowUpCandidates(
  notes: WorkWikiLiteRow[],
  existingKeys: Set<string>,
  now: Date,
): AutoFollowUpCandidate[] {
  if (!AUTO_FOLLOW_UP_ENABLE_WIKI_SIGNALS) return []

  const out: AutoFollowUpCandidate[] = []

  for (const note of notes) {
    const updatedAt = parseDateValue(note.updated_at)
    if (!updatedAt) continue
    const staleHours = hoursBetween(updatedAt, now)
    if (staleHours < 24) continue

    const title = (note.title || '').trim()
    if (title.includes('[자동기록]')) continue
    const content = (note.content || '').replace(/<[^>]+>/g, ' ')
    const signals = extractWikiDueSignals([title, content].filter(Boolean).join('\n'), now)
      .sort((a, b) => Math.abs(a.date.getTime() - now.getTime()) - Math.abs(b.date.getTime() - now.getTime()))
    if (!signals.length) continue

    for (const signal of signals.slice(0, 1)) {
      const dedupeKey = `wiki:${note.id}:${formatDate(signal.date)}:${simpleHash(normalizeAutoFollowUpText(signal.line))}`
      if (existingKeys.has(dedupeKey)) continue

      const isPastDue = signal.date.getTime() < now.getTime()
      const noteTitle = title || signal.line
      const triggerAfter = ensureFutureTrigger(
        isPastDue
          ? nextBusinessMorning(new Date(now.getTime() + 12 * 60 * 60 * 1000))
          : dueDayMorning(signal.date),
        now,
      )
      const staleDays = Math.max(1, Math.floor(staleHours / 24))

      out.push({
        dedupeKey,
        sourceType: 'wiki_deadline',
        sourceRef: note.id,
        content: `${sectionLabel(note.section)} 위키 일정 확인: ${noteTitle}`.slice(0, 160),
        sourceMessage: `${sectionLabel(note.section)} 위키 노트 "${noteTitle}" 에 ${signal.raw} 일정/마감 메모가 있고 ${staleDays}일째 업데이트가 없어요.`,
        followUpHint: signal.line.replace(/\s+/g, ' ').trim().slice(0, 140),
        priority: isPastDue ? 'high' : 'normal',
        triggerAfter,
        summaryLine: `- [위키 일정] ${sectionLabel(note.section)}: ${noteTitle.slice(0, 42)}${noteTitle.length > 42 ? '...' : ''}`,
      })
    }
  }

  return out
}

async function scanAutoFollowUps() {
  if (autoFollowUpScanRunning) return
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ autoFollowUpScan skip (Sunday KST)')
    return
  }

  const hour = new Date().getHours()
  if (hour < 7 || hour >= 22) return

  autoFollowUpScanRunning = true
  try {
    const now = new Date()
    const existingKeys = await loadExistingAutoFollowUpKeys()
    const sinceEmailsIso = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString()
    const sinceWikiIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const [
      { data: todos },
      { data: emails },
      { data: notes },
    ] = await Promise.all([
      supabase
        .from('email_todos')
        .select('id, label, category, task, due_date, priority, related_email_ids, completed, created_at')
        .eq('completed', false)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('email_metadata')
        .select('gmail_message_id, gmail_thread_id, subject, from_name, from_email, date, direction, requires_reply, action_items, summary, priority, intent')
        .eq('is_analyzed', true)
        .gte('date', sinceEmailsIso)
        .order('date', { ascending: false })
        .limit(400),
      supabase
        .from('work_wiki')
        .select('id, section, title, content, category, updated_at')
        .gte('updated_at', sinceWikiIso)
        .order('updated_at', { ascending: false })
        .limit(250),
    ])

    const candidates = [
      ...buildTodoFollowUpCandidates((todos || []) as EmailTodoRow[], existingKeys, now),
      ...buildEmailReplyFollowUpCandidates((emails || []) as EmailMetadataLiteRow[], existingKeys, now),
      ...buildWikiFollowUpCandidates((notes || []) as WorkWikiLiteRow[], existingKeys, now),
    ]
      .sort((a, b) => {
        const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority)
        if (priorityDiff !== 0) return priorityDiff
        return a.triggerAfter.getTime() - b.triggerAfter.getTime()
      })
      .slice(0, AUTO_FOLLOW_UP_MAX_NEW_PER_SCAN)

    if (!candidates.length) return

    const rows = candidates.map(candidate => ({
      content: candidate.content,
      source_message: candidate.sourceMessage,
      trigger_type: 'time_elapsed',
      trigger_config: {
        auto_generated: true,
        dedupe_key: candidate.dedupeKey,
        source_type: candidate.sourceType,
        source_ref: candidate.sourceRef,
        scan_version: 1,
      },
      follow_up_hint: candidate.followUpHint,
      priority: candidate.priority,
      trigger_after: candidate.triggerAfter.toISOString(),
    }))

    const { error } = await supabase.from('agent_follow_ups').insert(rows)
    if (error) throw error

    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'auto_follow_up_created',
      message: `auto follow-up candidates created (${candidates.length})`,
      details: {
        count: candidates.length,
        candidates: candidates.map(candidate => ({
          sourceType: candidate.sourceType,
          sourceRef: candidate.sourceRef,
          content: candidate.content,
          triggerAfter: candidate.triggerAfter.toISOString(),
        })),
      },
    })

    if (AUTO_FOLLOW_UP_NOTIFY_ON_CREATE) {
      const summary = [
        '🔎 [자동 follow-up 후보]',
        `새 후속조치 ${candidates.length}건을 등록했어요.`,
        ...candidates.map(candidate => `${candidate.summaryLine} · ${formatKstShort(candidate.triggerAfter)}`),
      ].join('\n')

      await sendMessage(ceoChatId, summary)
      await appendToConversation(ceoChatId, {
        role: 'assistant',
        content: `[자동 follow-up 후보]\n${summary}`,
        timestamp: now.toISOString(),
      })
    }
  } catch (err) {
    console.error('autoFollowUpScan error:', err)
  } finally {
    autoFollowUpScanRunning = false
  }
}

async function sendWeeklyBriefing(chatId: number) {
  console.log('📋 텐소프트웍스 주간 브리핑 생성 중...')

  const rawData = await fetchWeeklyBriefingData()
  const prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
CEO에게 텐소프트웍스 주간 브리핑을 보내세요.

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단)
${getCurrentKSTString()}

아래 원시 데이터를 분석해서, **각 사람이 실제로 뭘 했는지** 말로 정리해주세요.

## 분석 지침
1. 주간보고서와 코드기반 리포트를 읽고, 실제 업무 내용을 파악
2. 태스크 완료 건수만이 아니라, 완료한 태스크의 내용과 난이도를 판단
3. 커밋 메시지를 분석해서 실질적인 작업인지, 사소한 수정인지 구분
4. **버스워크 감지**: 커밋만 많고 태스크 완료가 없으면 지적
5. **말과 행동 비교**: 주간보고(사람이 쓴 것) vs 코드리포트(실제 코드 변경)가 일치하는지
6. 방치 태스크, 지연 태스크 주의 인원 지적
7. 프로젝트별로 정체인지 진행 중인지 한 줄 판단

## 응답 형식
- 텔레그램 메시지로 보내는 거라 Markdown 사용 (단, HTML 아닌 Telegram Markdown)
- 전체 상태 요약 → 프로젝트별 한 줄 → 사람별 분석 (뭘 했는지 구체적으로) → 주의사항
- 길어도 괜찮으니 내용이 충실하게. 하지만 불필요한 수식어는 빼고 팩트 위주.
- 김동욱, 김철형은 분석에서 제외되어 있음

# 원시 데이터
${rawData}`

  const stopTyping = startTypingPulse(chatId)
  let response = ''
  try {
    response = await askClaude(prompt)
  } finally {
    stopTyping()
  }

  await sendSplitMessage(chatId, response)

  await appendToConversation(chatId, { role: 'assistant', content: `[주간 브리핑]\n${response}`, timestamp: new Date().toISOString() })

  console.log('✅ 텐소프트웍스 주간 브리핑 전송 완료')
}

// 노트 메모 후속조치 — CEO가 업무위키/류하 수첩 각 노트에 단 미검토 메모(reviewed_at NULL)를
// 윌리가 점검해 안전한 건 바로 처리(액션), 중요한 건 제안만. 처리 후 reviewed_at 표시.
interface NoteMemo { id: string; text: string; created_at: string; reviewed_at?: string | null }
const MEMO_SOURCES: { table: string; label: string }[] = [
  { table: 'work_wiki', label: '업무위키' },
  { table: 'ryuha_notes', label: '류하 수첩' },
]
let lastMemoReviewAt = 0
async function reviewMemos() {
  if (!ceoChatId) return
  const hour = new Date().getHours()
  if (hour < 8 || hour >= 22) return            // 업무시간만
  if (Date.now() - lastMemoReviewAt < 5 * 60 * 1000) return  // 5분 쿨다운(에러 루프 방지)

  const pending: { label: string; noteTitle: string; text: string }[] = []
  const dirty: { table: string; id: string; memos: NoteMemo[] }[] = []
  for (const src of MEMO_SOURCES) {
    const { data: notes } = await supabase.from(src.table).select('id, title, memos')
    for (const n of notes || []) {
      const memos = (n.memos as NoteMemo[]) || []
      if (!memos.some(m => !m.reviewed_at)) continue
      dirty.push({ table: src.table, id: n.id as string, memos })
      for (const m of memos) {
        if (!m.reviewed_at) pending.push({ label: src.label, noteTitle: (n.title as string) || '(제목없음)', text: m.text })
      }
    }
  }
  if (!pending.length) return
  lastMemoReviewAt = Date.now()
  console.log(`📝 노트 메모 후속조치: 미검토 ${pending.length}건`)

  const memoText = pending.map((p, i) => `${i + 1}. [${p.label} · ${p.noteTitle}] ${(p.text || '').slice(0, 600)}`).join('\n\n')

  const [promptSections, attrCatalog, dashboardContext] = await Promise.all([
    fetchPromptSections(), fetchAttributeCatalog(), fetchDashboardContext(),
  ])
  const prompt = `${buildSystemPrompt(promptSections, attrCatalog)}

# 현재 사업 데이터
${dashboardContext}

# 작업: 노트 메모 후속조치
아래는 CEO가 각 노트에 단, 아직 처리되지 않은 메모입니다. 출처가 [업무위키]면 사업 맥락, [류하 수첩]이면 딸 류하의 학습/일정 맥락입니다(류하 일정·수첩은 ryuha 도구 사용). 각 메모를 검토해서:
- 안전하고 되돌릴 수 있는 일(일정 등록, 팔로업 등록, 위키/수첩 정리, 종목 워치, 리서치, 류하 일정 등)은 액션 블록으로 **바로 처리**
- 돈 송금·외부 발송·계약·중요 의사결정 등 되돌리기 어렵거나 판단이 중요한 일은 **처리하지 말고 제안만**
- 이미 처리됐거나 후속조치가 불필요하면 확인만
결과를 CEO에게 보낼 **간결한** 메시지로 작성하세요(메모별 1~2줄, 어느 출처·노트 메모인지 같이).

## 미처리 메모 (${pending.length}건)
${memoText}`

  let response: string
  try {
    response = await askClaude(prompt, { allowedTools: [TENSW_MCP_TOOLS, PORTFOLIO_MCP_TOOLS, WILLOW_MCP_TOOLS] })
  } catch (e) {
    console.error('reviewMemos 실패:', (e as Error).message)
    return  // 미검토로 남겨 다음 사이클 재시도
  }

  const { cleanText, actions } = extractActions(response)
  const actionResults: string[] = []
  for (const action of actions) actionResults.push(await executeAction(action, { chatId }))

  const body = [cleanText, actionResults.length ? actionResults.join('\n') : '']
    .filter(Boolean).join('\n\n')
  await sendMessage(ceoChatId, `📝 [노트 메모 후속]\n${body}`)
  await appendToConversation(ceoChatId, { role: 'assistant', content: `[노트 메모 후속]\n${body}`, timestamp: new Date().toISOString() })

  // 검토한 노트들의 미검토 메모에 reviewed_at 세팅 (출처 테이블별)
  const now = new Date().toISOString()
  for (const d of dirty) {
    const updated = d.memos.map(m => m.reviewed_at ? m : { ...m, reviewed_at: now })
    await supabase.from(d.table).update({ memos: updated }).eq('id', d.id)
  }
  console.log(`✅ 노트 메모 ${pending.length}건 검토완료 (노트 ${dirty.length}개)`)
}

async function proactiveCheck() {
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ proactiveCheck skip (Sunday KST)')
    return
  }

  const now = new Date()
  const todayStr = formatDate(now)
  const hour = now.getHours()

  try {
    // 오래된 팔로업 자동 만료(적체 방지) — 주기적으로 sweep
    await expireStaleFollowUps().catch(() => {})
    // 업무위키 메모 후속조치 (미검토 메모 처리/제안)
    await reviewMemos().catch((e) => console.error('reviewMemos error:', e))

    const dashboardContext = await fetchDashboardContext()
    const currentHash = simpleHash(dashboardContext)

    // 1) 아침 브리핑 (08:00~09:00, 하루 1회)
    if (hour >= 8 && hour < 9 && proactiveState.morningBriefSent !== todayStr) {
      console.log('🌅 아침 브리핑 생성 중...')

      const prompt = `${getMorningBriefPrompt()}\n\n# 현재 사업 데이터\n${dashboardContext}`
      const stopTyping = startTypingPulse(ceoChatId!)
      let response = ''
      try {
        response = await askClaude(prompt)
      } finally {
        stopTyping()
      }

      await sendSplitMessage(ceoChatId, response)
      proactiveState.morningBriefSent = todayStr
      saveProactiveState()

      // 대화 기록에도 저장 (락으로 보호)
      await appendToConversation(ceoChatId, { role: 'assistant', content: `[아침 브리핑]\n${response}`, timestamp: now.toISOString() })

      console.log('✅ 아침 브리핑 전송 완료')
      return
    }

    // 텐소프트웍스 주간 브리핑은 CEO 명시 요청 시에만 수동 실행한다.

    // 2) 맥락기반 팔로업 체크 (업무 시간대, 트리거 시각 도래한 것)
    const isWorkHours = hour >= 9 && hour <= 21
    if (isWorkHours) {
      await checkFollowUps()
    }

    // 3) 자율 점검 (데이터가 바뀌었거나, 업무 시간대일 때)
    const dataChanged = currentHash !== proactiveState.lastSnapshotHash

    if (!isWorkHours) return
    if (!dataChanged && proactiveState.lastCheckAt === todayStr) return // 오늘 이미 체크했고 데이터 변화 없으면 스킵

    console.log(`🔍 자율 점검 중... (데이터 변화: ${dataChanged})`)

    const reportedList = proactiveState.lastReportedIssues.length
      ? proactiveState.lastReportedIssues.map(i => `- ${i}`).join('\n')
      : '(없음)'

    const prompt = PROACTIVE_PROMPT.replace('{reported_issues}', reportedList)
      + `\n\n# 현재 사업 데이터\n${dashboardContext}\n\n# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단)\n${getCurrentKSTString()}`

    const response = await askClaude(prompt)

    proactiveState.lastSnapshotHash = currentHash
    proactiveState.lastCheckAt = todayStr
    saveProactiveState()

    if (response.trim() === 'SKIP') {
      console.log('  → 알릴 사항 없음')
      return
    }

    // 알림 전송
    console.log('📢 자율 알림 전송:', response.slice(0, 80))
    await sendTyping(ceoChatId)
    await sendSplitMessage(ceoChatId, response)

    // 보고 사항 기록 (중복 방지)
    proactiveState.lastReportedIssues.push(response.slice(0, 100))
    // 최대 20개만 유지
    if (proactiveState.lastReportedIssues.length > 20) {
      proactiveState.lastReportedIssues = proactiveState.lastReportedIssues.slice(-20)
    }
    saveProactiveState()

    // 대화 기록 저장 (락으로 보호)
    await appendToConversation(ceoChatId, { role: 'assistant', content: `[자율 알림]\n${response}`, timestamp: now.toISOString() })

  } catch (err) {
    console.error('Proactive check error:', err)
  }

  // 뉴스 다이제스트 체크 (속보는 별도 인터벌에서 독립 실행)
  try {
    await newsDigestCheck()
  } catch (err) {
    console.error('News digest error:', err)
  }
}

// ============================================================
// Market status monitoring (장 개시/마감 감지)
// ============================================================
const MONITOR_JSON_PY = '/Volumes/PRO-G40/app-dev/portfolio/monitor/monitor_json.py'
const MARKET_CHECK_INTERVAL = 5 * 60 * 1000 // 5분

function fetchMarketStatus(): Promise<{ us: string; kr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('python3', [MONITOR_JSON_PY, 'market_status'], {
      cwd: '/Volumes/PRO-G40/app-dev/portfolio/monitor',
      timeout: 30000,
    })
    let stdout = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ us: 'ERROR', kr: 'ERROR' })
        return
      }
      try {
        const data = JSON.parse(stdout)
        resolve({
          us: data.markets?.us?.state || 'UNKNOWN',
          kr: data.markets?.kr?.state || 'UNKNOWN',
        })
      } catch {
        resolve({ us: 'ERROR', kr: 'ERROR' })
      }
    })
    proc.on('error', () => resolve({ us: 'ERROR', kr: 'ERROR' }))
  })
}

function getMarketBriefingPrompt() {
  return `당신은 윌리입니다. CEO에게 포트폴리오 현황을 브리핑하세요.

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단)
${getCurrentKSTString()}

## 브리핑 유형: {briefing_type}

## 지시사항
- portfolio_scan 도구로 {market_group} 종목을 조회하세요
- 축별(AI 인프라/지정학·안보/넥스트)로 정리하되 보유 종목은 빠짐없이 모두 넣으세요
- 첫 메시지는 "{greeting}" 다음 줄부터 바로 표가 나오게 하세요. 요약문부터 길게 쓰지 마세요
- 각 축마다 반드시 마크다운 표 2개로 나누세요: 가격표, 추매표
- 가격표 컬럼은 반드시: 종목 | 현재가 | 등락 | 고점
- 추매표 컬럼은 반드시: 종목 | 수익 | T/상태 | 액션
- 종목명은 티커 또는 짧은 한글명만 쓰세요. 회사 전체 이름 금지
- 전일대비는 "등락", 12M고점거리는 "고점", 수익률은 "수익"으로 짧게 적으세요
- BUY면 액션 칸에 "🔔 T{다음트랜치}" 형식으로, 아니면 "없음" 또는 "대기(+N%)"로 명시하세요
- 신고가 돌파/근접, 급등/급락 종목은 표 안에서 이모지나 짧은 표시로 강조하세요
- 표 아래에 "피라미딩 현황" 한 줄 요약을 반드시 넣으세요
- 마지막에는 "주요 포인트"를 2~3줄만 짧게 쓰세요
- 리서치 T1 종목 중 주목할 움직임이 있으면 마지막에 한 줄만 덧붙이세요
- 사실 기반만. 추측 금지.

## 스타일
- "{greeting}" 으로 시작
- 장 개시/마감 브리핑은 숫자와 상태를 표 중심으로 한눈에 읽히게 보여주세요
- 표는 4컬럼 초과 금지. 넓은 1개 표 대신 좁은 2개 표를 쓰세요
- 한 메시지에 표는 최대 2개까지만 넣고, 축이 많으면 ---SPLIT--- 로 나누세요
- 축 헤더는 짧게 쓰고, 표 사이 설명문은 1줄 이내로 제한하세요`
}

async function marketMonitorCheck() {
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ marketMonitorCheck skip (Sunday KST)')
    return
  }

  try {
    const current = await fetchMarketStatus()
    const prev = proactiveState.marketState
    const todayStr = formatDate(new Date())

    // 첫 실행 시 상태만 저장하고 리턴
    if (!prev.us && !prev.kr) {
      proactiveState.marketState = current
      console.log(`📊 장 상태 초기화 — US: ${current.us}, KR: ${current.kr}`)
      return
    }

    // ERROR/UNKNOWN은 무시
    if (current.us === 'ERROR' || current.kr === 'ERROR') return

    let briefingType = ''
    let marketGroup = ''
    let greeting = ''
    let briefingKey: 'usOpen' | 'usClose' | 'krOpen' | 'krClose' | '' = ''

    const MARKET_OPEN_CLOSE_BRIEFING_ENABLED = false

    if (MARKET_OPEN_CLOSE_BRIEFING_ENABLED) {
      // US 장 개시 감지: 이전 상태가 장중이 아닌데 → REGULAR로 전환
      if (prev.us !== 'REGULAR' && current.us === 'REGULAR' && proactiveState.lastMarketBriefing.usOpen !== todayStr) {
        briefingType = '미국장 개장 브리핑'
        marketGroup = 'portfolio'
        greeting = '미국장이 열렸어요 🇺🇸'
        briefingKey = 'usOpen'
      }
      // US 장 마감 감지: REGULAR/POST → CLOSED 또는 REGULAR → POST (장 종료)
      else if (prev.us === 'REGULAR' && current.us !== 'REGULAR' && proactiveState.lastMarketBriefing.usClose !== todayStr) {
        briefingType = '미국장 마감 브리핑'
        marketGroup = 'portfolio'
        greeting = '미국장이 마감됐어요 🇺🇸'
        briefingKey = 'usClose'
      }
      // KR 장 개시 감지 (아침 브리핑이 이미 나갔으면 스킵 — 내용 겹침)
      else if (prev.kr !== 'REGULAR' && current.kr === 'REGULAR' && proactiveState.lastMarketBriefing.krOpen !== todayStr) {
        if (proactiveState.morningBriefSent === todayStr) {
          proactiveState.lastMarketBriefing.krOpen = todayStr
          proactiveState.marketState = current
          saveProactiveState()
          console.log('📊 한국장 개장 감지 → 아침 브리핑에서 커버됨, 스킵')
          return
        }
        briefingType = '한국장 개장 브리핑'
        marketGroup = 'portfolio'
        greeting = '한국장이 열렸어요 🇰🇷'
        briefingKey = 'krOpen'
      }
      // KR 장 마감 감지
      else if (prev.kr === 'REGULAR' && current.kr !== 'REGULAR' && proactiveState.lastMarketBriefing.krClose !== todayStr) {
        briefingType = '한국장 마감 브리핑'
        marketGroup = 'portfolio'
        greeting = '한국장이 마감됐어요 🇰🇷'
        briefingKey = 'krClose'
      }
    }

    // 휴장 감지: 장 오픈 시간대인데 CLOSED 상태가 지속되면 휴장 알림
    // (정상 개장 감지된 경우에는 스킵, 주말은 스킵)
    const now = new Date()
    const kstHour = now.getHours() // 서버가 KST
    const kstMinute = now.getMinutes()
    const dayOfWeek = now.getDay() // 0=일, 6=토
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // 한국장 휴장 감지: 09:10~09:20 사이에 여전히 CLOSED면 휴장 (평일만)
    if (!briefingKey && !isWeekend && kstHour === 9 && kstMinute >= 10 && kstMinute <= 20
      && current.kr !== 'REGULAR' && current.kr !== 'ERROR' && current.kr !== 'UNKNOWN'
      && proactiveState.lastMarketBriefing.krHoliday !== todayStr
      && proactiveState.lastMarketBriefing.krOpen !== todayStr) {
      proactiveState.lastMarketBriefing.krHoliday = todayStr
      proactiveState.marketState = current
      saveProactiveState()
      console.log(`📊 한국장 휴장 감지 (${current.kr})`)
      await sendMessage(ceoChatId, '오늘은 한국장 휴장이에요 🇰🇷')
      await appendToConversation(ceoChatId, { role: 'assistant', content: '[마켓 브리핑]\n오늘은 한국장 휴장이에요 🇰🇷', timestamp: new Date().toISOString() })
      return
    }

    // 미국장 휴장 감지: KST 00:00~01:10 사이에 여전히 CLOSED면 휴장 (미국 기준 평일만)
    // KST 자정~01시 = 미국 전날 오전/오후이므로, 미국 기준 요일로 판단해야 함
    // KST 일요일 자정 = 미국 토요일, KST 월요일 자정 = 미국 일요일 → 둘 다 주말
    // KST 화~토 자정 = 미국 월~금 → 평일
    const usCheckDay = now.getDay() // KST 기준 요일
    const isUsWeekend = usCheckDay === 0 || usCheckDay === 1 // KST 일·월 자정 = 미국 토·일
    if (!briefingKey && !isUsWeekend && ((kstHour === 0 && kstMinute >= 0) || (kstHour === 1 && kstMinute <= 10))
      && current.us !== 'REGULAR' && current.us !== 'PRE' && current.us !== 'ERROR' && current.us !== 'UNKNOWN'
      && proactiveState.lastMarketBriefing.usHoliday !== todayStr
      && proactiveState.lastMarketBriefing.usOpen !== todayStr) {
      proactiveState.lastMarketBriefing.usHoliday = todayStr
      proactiveState.marketState = current
      saveProactiveState()
      console.log(`📊 미국장 휴장 감지 (${current.us})`)
      await sendMessage(ceoChatId, '오늘은 미국장 휴장이에요 🇺🇸')
      await appendToConversation(ceoChatId, { role: 'assistant', content: '[마켓 브리핑]\n오늘은 미국장 휴장이에요 🇺🇸', timestamp: new Date().toISOString() })
      return
    }

    // 상태 업데이트 (브리핑 여부와 무관하게 항상)
    proactiveState.marketState = current
    saveProactiveState()

    if (!briefingType || !briefingKey) {
      // 상태 변화 로깅 (디버깅용)
      if (prev.us !== current.us || prev.kr !== current.kr) {
        console.log(`📊 장 상태 변경 — US: ${prev.us}→${current.us}, KR: ${prev.kr}→${current.kr}`)
      }
      return
    }

    // 개장/마감 감지 후 5분 대기 — 전일 가격 잔존 문제를 피하면서 너무 늦지 않게 발송
    const MARKET_BRIEFING_DELAY = 5 * 60 * 1000
    console.log(`📊 ${briefingType} 감지! ${MARKET_BRIEFING_DELAY / 60000}분 후 브리핑 발송 예정 (US: ${prev.us}→${current.us}, KR: ${prev.kr}→${current.kr})`)

    // 중복 방지를 위해 즉시 마킹 + 디스크 저장
    proactiveState.lastMarketBriefing[briefingKey] = todayStr
    saveProactiveState()

    const capturedChatId = ceoChatId
    const capturedBriefingType = briefingType
    const capturedMarketGroup = marketGroup
    const capturedGreeting = greeting

    setTimeout(async () => {
      try {
        const researchCtx = await fetchResearchContext()
        const prompt = getMarketBriefingPrompt()
          .replace('{briefing_type}', capturedBriefingType)
          .replace('{market_group}', capturedMarketGroup)
          .replace('{greeting}', capturedGreeting)
          + `\n\n# 투자 리서치 현황\n${researchCtx}`

        const stopTyping = startTypingPulse(capturedChatId!)
        let response = ''
        try {
          response = await askClaude(prompt, { allowedTools: [PORTFOLIO_MCP_TOOLS] })
        } finally {
          stopTyping()
        }

        await sendSplitMessage(capturedChatId!, response)

        // 대화 기록 저장 (락으로 보호)
        await appendToConversation(capturedChatId!, { role: 'assistant', content: `[마켓 브리핑]\n${response}`, timestamp: new Date().toISOString() })
        console.log(`📊 ${capturedBriefingType} 발송 완료`)
      } catch (err) {
        console.error(`📊 ${capturedBriefingType} 발송 실패:`, err)
      }
    }, MARKET_BRIEFING_DELAY)

    console.log(`⏳ ${briefingType} 예약 완료 (${MARKET_BRIEFING_DELAY / 60000}분 후 발송)`)

  } catch (err) {
    console.error('Market monitor error:', err)
  }
}

// ============================================================
// News & YouTube search
// ============================================================
interface WatchTopic {
  id: string
  topic: string
  keywords: string[]
  category: string
  is_active: boolean
  last_searched_at: string | null
}

const EXPLICIT_NEWS_HINTS = ['뉴스', '기사', '속보', '헤드라인', '브리핑', '검색', '찾아봐', '찾아줘', 'news']
const VIDEO_SEARCH_HINTS = ['유튜브', 'youtube', '영상', '동영상']
const MARKET_SNAPSHOT_HINTS = ['시세', '가격', '환율', '지수', '유가', '원유', '선물', '코스피', 's&p', 'nasdaq', '나스닥', 'dow', '다우']
const FRESHNESS_HINTS = ['오늘', '지금', '최근', '최신', '실시간', '방금']

function buildNewsPrefetchPlan(text: string, watchTopics: WatchTopic[]): {
  queries: string[]
  includeYouTube: boolean
  includeMarket: boolean
} | null {
  const lower = text.toLowerCase()
  const wantsNews = EXPLICIT_NEWS_HINTS.some(k => lower.includes(k))
  const wantsVideo = VIDEO_SEARCH_HINTS.some(k => lower.includes(k))
  const wantsMarket = MARKET_SNAPSHOT_HINTS.some(k => lower.includes(k))
  const wantsFreshness = FRESHNESS_HINTS.some(k => lower.includes(k))

  const matchedTrackedQueries = watchTopics
    .filter(t => {
      const topicWords = [t.topic, ...t.keywords].map(v => v.toLowerCase())
      return topicWords.some(word => word && lower.includes(word))
    })
    .map(t => t.keywords.length ? t.keywords.join(' OR ') : t.topic)

  const shouldPrefetch = wantsNews || wantsVideo || wantsMarket || (matchedTrackedQueries.length > 0 && wantsFreshness)
  if (!shouldPrefetch) return null

  const cleanedTextQuery = text
    .replace(/[?？]/g, ' ')
    .replace(/(뉴스|기사|속보|헤드라인|브리핑|검색|찾아봐|찾아줘|알려줘|유튜브|영상|동영상|today|today's|최근|최신|실시간|오늘|지금|요약)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const queries = Array.from(new Set([
    ...matchedTrackedQueries,
    ...((wantsNews || wantsVideo || matchedTrackedQueries.length > 0) && cleanedTextQuery.length >= 2 && cleanedTextQuery.length <= 80 ? [cleanedTextQuery] : []),
  ].filter(Boolean))).slice(0, wantsVideo ? 1 : 2)

  return {
    queries,
    includeYouTube: wantsVideo,
    includeMarket: wantsMarket,
  }
}

async function getWatchTopics(): Promise<WatchTopic[]> {
  const cached = readTimedCache(watchTopicsCache, WATCH_TOPICS_CACHE_TTL)
  if (cached !== null) return cached

  const { data } = await supabase
    .from('telegram_watch_topics')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
  const result = (data as WatchTopic[]) || []
  watchTopicsCache = writeTimedCache(result)
  return result
}

interface NewsItem {
  title: string
  link: string
  source: string
  pubDate: string
}

async function searchGoogleNews(query: string, limit = 5): Promise<NewsItem[]> {
  try {
    const encoded = encodeURIComponent(query)
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`,
      { signal: AbortSignal.timeout(NEWS_FETCH_TIMEOUT_MS) }
    )
    const xml = await res.text()

    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
      const itemXml = match[1]
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || ''
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ''
      const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || ''
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || ''
      items.push({ title, link, source, pubDate })
    }
    return items
  } catch (err) {
    console.error(`News search error for "${query}":`, err)
    return []
  }
}

interface YouTubeItem {
  title: string
  videoId: string
  channelName: string
  publishedAt: string
}

function formatNewsLink(item: { link: string; source?: string }): string {
  const source = (item.source || '').trim()
  const label = source ? `${source} 링크` : '원문 링크'
  return formatCompactLink(item.link, label)
}

function formatYouTubeLink(videoId: string, label = '영상 링크'): string {
  if (!videoId) return ''
  return formatCompactLink(`https://youtu.be/${videoId}`, label)
}

async function searchYouTube(query: string, limit = 5): Promise<YouTubeItem[]> {
  try {
    // YouTube RSS search via Invidious (free, no API key)
    const encoded = encodeURIComponent(query)
    const instances = [
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://y.com.sb',
    ]

    for (const instance of instances) {
      try {
        const res = await fetch(
          `${instance}/api/v1/search?q=${encoded}&sort_by=upload_date&type=video&region=KR`,
          { signal: AbortSignal.timeout(YOUTUBE_FETCH_TIMEOUT_MS) }
        )
        if (!res.ok) continue
        const data = await res.json() as any[]
        return data.slice(0, limit).map((v: any) => ({
          title: v.title || '',
          videoId: v.videoId || '',
          channelName: v.author || '',
          publishedAt: v.publishedText || '',
        }))
      } catch {
        continue
      }
    }
    return []
  } catch (err) {
    console.error(`YouTube search error for "${query}":`, err)
    return []
  }
}

// --- News freshness helpers ---
function getNewsAgeMinutes(pubDate: string): number {
  try {
    const pub = new Date(pubDate)
    if (isNaN(pub.getTime())) return Infinity
    return (Date.now() - pub.getTime()) / (1000 * 60)
  } catch {
    return Infinity
  }
}

function formatNewsAge(minutes: number): string {
  if (minutes < 5) return '방금'
  if (minutes < 60) return `${Math.round(minutes)}분 전`
  if (minutes < 120) return '1시간 전'
  if (minutes < 360) return `${Math.round(minutes / 60)}시간 전`
  if (minutes < 1440) return '오늘'
  if (minutes < 2880) return '어제'
  return `${Math.round(minutes / 1440)}일 전`
}

// --- Real-time market prices via yfinance ---
interface MarketPrice {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
}

async function fetchLiveMarketPrices(): Promise<MarketPrice[]> {
  const cached = readTimedCache(liveMarketPricesCache, MARKET_PRICES_CACHE_TTL)
  if (cached !== null) return cached

  return new Promise((resolve) => {
    const pyScript = `
import yfinance as yf, json
tickers = {'CL=F':'WTI 원유','BZ=F':'브렌트유','^GSPC':'S&P 500','^KS11':'KOSPI','USDKRW=X':'USD/KRW'}
result = []
for sym, name in tickers.items():
    try:
        t = yf.Ticker(sym)
        i = t.fast_info
        p, pc = i.last_price, i.previous_close
        result.append({'symbol':sym,'name':name,'price':round(p,2),'change':round(p-pc,2),'changePct':round((p-pc)/pc*100,2)})
    except: pass
print(json.dumps(result))
`
    const proc = spawn('python3', ['-c', pyScript], { timeout: MARKET_FETCH_TIMEOUT_MS })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.on('close', (code: number | null) => {
      if (code !== 0) { resolve([]); return }
      try {
        const parsed = JSON.parse(stdout) as MarketPrice[]
        liveMarketPricesCache = writeTimedCache(parsed)
        resolve(parsed)
      } catch {
        resolve([])
      }
    })
    proc.on('error', () => resolve([]))
  })
}

function formatMarketPrices(prices: MarketPrice[]): string {
  if (!prices.length) return ''
  const lines = prices.map(p => {
    const arrow = p.changePct >= 0 ? '▲' : '▼'
    return `${p.name}: ${p.price.toLocaleString()} (${arrow}${Math.abs(p.changePct).toFixed(1)}%)`
  })
  return `\n📈 실시간 시장 데이터\n${lines.join('\n')}`
}

// --- Major media catalog (속보는 메이저 언론사만) ---
const MAJOR_MEDIA_KR = new Set([
  // 통신사
  '연합뉴스', '연합뉴스TV', '뉴스1', '뉴시스', '연합인포맥스',
  // 경제지
  '한국경제', '한국경제TV', '매일경제', '서울경제', '서울경제TV', '아시아경제', '이데일리', '머니투데이', '헤럴드경제', '파이낸셜뉴스', '이투데이', '인베스트조선', '아주경제', '뉴스핌',
  // 종합지/방송
  '조선일보', '조선비즈', '중앙일보', '동아일보', '한겨레', '경향신문', '국민일보', '한국일보', '세계일보', '문화일보',
  'SBS', 'SBS 뉴스', 'KBS', 'KBS News', 'MBC', 'MBC 뉴스', 'JTBC', 'YTN', 'TV조선', '채널A',
  // IT/산업 전문
  '지디넷코리아', '디지털데일리', '전자신문', '블로터', 'ITWorld Korea',
])
const MAJOR_MEDIA_EN = new Set([
  'Bloomberg', 'Reuters', 'CNBC', 'Wall Street Journal', 'WSJ',
  'Financial Times', 'FT', 'AP', 'Associated Press',
  'Nikkei', 'Nikkei Asia', 'The New York Times', 'The Washington Post',
  'MarketWatch', 'Barron\'s', 'The Economist', 'Business Insider',
  'TechCrunch', 'The Verge', 'Ars Technica',
  // 국내 매체 영문 표기 (Google News가 로마자로 줄 때)
  'Chosunbiz', 'Korea Herald', 'The Korea Herald', 'Korea JoongAng Daily', 'KED Global', 'Forbes', 'Fortune',
])

function isMajorMedia(source: string): boolean {
  if (!source) return false
  const s = source.trim()
  // 정확히 매칭
  if (MAJOR_MEDIA_KR.has(s) || MAJOR_MEDIA_EN.has(s)) return true
  // 부분 매칭 (e.g. "Chosunbiz" → 조선비즈, "v.daum.net" → 포털)
  const lower = s.toLowerCase()
  for (const m of MAJOR_MEDIA_KR) {
    if (lower.includes(m.toLowerCase()) || m.includes(s)) return true
  }
  for (const m of MAJOR_MEDIA_EN) {
    if (lower.includes(m.toLowerCase())) return true
  }
  return false
}

// --- Breaking news detection ---
const BREAKING_KEYWORDS = ['속보', '급락', '급등', '폭락', '폭등', '긴급', 'breaking', '전격', '돌발', '사상최고', '사상최저', '급변', '충격']
const BREAKING_CHECK_INTERVAL = 20 * 60 * 1000 // 20분
let lastBreakingCheckAt = 0
// 유사도 기반 중복 제거: 전송된 속보 제목+시각 저장
let sentBreakingNews: { title: string; topic: string; sentAt: number }[] = []
const SENT_NEWS_RETENTION_MS = 8 * 60 * 60 * 1000 // 8시간 보관
// 주제별 마지막 속보 전송 시각 (같은 주제 속보 4시간 쿨다운)
const topicBreakingCooldown = new Map<string, number>()
const TOPIC_COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4시간

// 제목에서 비교용 토큰 추출
function extractTitleTokens(title: string): Set<string> {
  return new Set(
    title
      .replace(/[\[\]()'"'""\…·|~!?.,;:]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  )
}

// Jaccard 유사도 계산
function titleSimilarity(a: string, b: string): number {
  const tokensA = extractTitleTokens(a)
  const tokensB = extractTitleTokens(b)
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++
  }
  const union = new Set([...tokensA, ...tokensB]).size
  return intersection / union
}

// 유사도 기반 중복 체크
function isDuplicateBreaking(title: string, topic: string): boolean {
  const now = Date.now()
  // 오래된 항목 정리
  sentBreakingNews = sentBreakingNews.filter(e => now - e.sentAt < SENT_NEWS_RETENTION_MS)

  for (const sent of sentBreakingNews) {
    // 같은 주제 + 유사 제목 → 중복 (낮은 임계값)
    if (sent.topic === topic && titleSimilarity(title, sent.title) > 0.25) return true
    // 다른 주제라도 매우 유사한 제목 → 중복
    if (titleSimilarity(title, sent.title) > 0.45) return true
  }
  return false
}

async function breakingNewsCheck() {
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ breakingNewsCheck skip (Sunday KST)')
    return
  }
  const now = Date.now()
  if (now - lastBreakingCheckAt < BREAKING_CHECK_INTERVAL) return
  lastBreakingCheckAt = now

  const topics = await getWatchTopics()
  if (!topics.length) return

  const breakingItems: { topic: string; news: NewsItem; ageLabel: string }[] = []

  for (const topic of topics) {
    // 같은 주제로 최근 4시간 내에 속보를 보냈으면 스킵
    const lastSent = topicBreakingCooldown.get(topic.topic) || 0
    if (now - lastSent < TOPIC_COOLDOWN_MS) continue

    const searchQuery = (topic.keywords.length ? topic.keywords.join(' OR ') : topic.topic) + ' when:1h'
    const news = await searchGoogleNews(searchQuery, 5)

    let topicHasBreaking = false
    for (const n of news) {
      const ageMin = getNewsAgeMinutes(n.pubDate)
      if (ageMin > 90) continue // 1.5시간 이내만
      const isBreaking = BREAKING_KEYWORDS.some(k => n.title.includes(k))
      if (!isBreaking) continue
      // 메이저 언론사만 속보 발송
      if (!isMajorMedia(n.source)) {
        if (!isDuplicateBreaking(n.title, topic.topic)) {
          console.log(`⏭️ 속보 스킵 (마이너 매체): ${n.source} — ${n.title.slice(0, 40)}`)
          sentBreakingNews.push({ title: n.title, topic: topic.topic, sentAt: now })
        }
        continue
      }
      // 유사도 기반 중복 체크
      if (isDuplicateBreaking(n.title, topic.topic)) continue
      if (!topicHasBreaking) {
        // 같은 주제에서는 가장 최신 속보 1건만
        breakingItems.push({ topic: topic.topic, news: n, ageLabel: formatNewsAge(ageMin) })
        topicHasBreaking = true
      }
      sentBreakingNews.push({ title: n.title, topic: topic.topic, sentAt: now })
    }

    if (topicHasBreaking) {
      topicBreakingCooldown.set(topic.topic, now)
    }
  }

  // Clean up expired cooldowns
  Array.from(topicBreakingCooldown.entries()).forEach(([topic, ts]) => {
    if (now - ts > TOPIC_COOLDOWN_MS * 2) topicBreakingCooldown.delete(topic)
  })

  if (!breakingItems.length) return

  // 속보와 함께 실시간 시장 데이터도 포함
  const [marketPrices] = await Promise.all([fetchLiveMarketPrices()])
  const marketText = formatMarketPrices(marketPrices)

  const alert = breakingItems.map(b =>
    `🚨 [${b.topic}] ${b.news.title} (${b.news.source}, ${b.ageLabel})\n${formatNewsLink(b.news)}`
  ).join('\n\n')

  console.log(`🚨 속보 감지! ${breakingItems.length}건`)
  await sendMessage(ceoChatId, `[속보 알림]\n${alert}${marketText ? '\n' + marketText : ''}`)

  await appendToConversation(ceoChatId, { role: 'assistant', content: `[속보]\n${alert}`, timestamp: new Date().toISOString() })
}

// --- Enhanced news digest with market data + freshness ---
async function buildNewsDigest(): Promise<{ digest: string; marketData: string } | null> {
  const topics = await getWatchTopics()
  if (!topics.length) return null

  // 뉴스 검색과 시장 데이터를 병렬 수집
  const marketPricesPromise = fetchLiveMarketPrices()

  const sections: string[] = []
  let hasContent = false

  for (const topic of topics) {
    const searchQuery = topic.keywords.length ? topic.keywords.join(' OR ') : topic.topic
    const [rawNews, videos] = await Promise.all([
      searchGoogleNews(searchQuery, 8),
      searchYouTube(searchQuery, 2),
    ])

    // 노이즈 컷: 다이제스트도 속보와 동일하게 메이저 매체만 남긴다 (마이너·광고성 매체 제거).
    const news = rawNews.filter(n => isMajorMedia(n.source))
    const dropped = rawNews.length - news.length
    if (dropped > 0) console.log(`  🔇 ${topic.topic}: 마이너 매체 ${dropped}건 제외 (메이저 ${news.length}건 유지)`)

    if (!news.length && !videos.length) continue
    hasContent = true

    sections.push(`\n📌 *${topic.topic}*`)

    if (news.length) {
      // 신선도 순 정렬 + 기사 나이 표시
      const sorted = news
        .map(n => ({ ...n, ageMin: getNewsAgeMinutes(n.pubDate) }))
        .sort((a, b) => a.ageMin - b.ageMin)

      sections.push('뉴스:')
      for (const n of sorted.slice(0, 5)) {
        const ageLabel = n.ageMin < Infinity ? `[${formatNewsAge(n.ageMin)}]` : ''
        sections.push(`• ${ageLabel} ${n.title}${n.source ? ` (${n.source})` : ''}`)
        sections.push(`  ${formatNewsLink(n)}`)
      }
    }

    if (videos.length) {
      sections.push('유튜브:')
      for (const v of videos) {
        sections.push(`• ${v.title} — ${v.channelName} (${v.publishedAt})`)
        sections.push(`  ${formatYouTubeLink(v.videoId)}`)
      }
    }

    // 검색 시간 업데이트
    await supabase
      .from('telegram_watch_topics')
      .update({ last_searched_at: new Date().toISOString() })
      .eq('id', topic.id)
  }

  if (!hasContent) return null

  const marketPrices = await marketPricesPromise
  const marketData = formatMarketPrices(marketPrices)

  return { digest: sections.join('\n'), marketData }
}

const NEWS_DIGEST_INTERVAL = 2 * 60 * 60 * 1000 // 2시간마다
let lastNewsDigestAt = 0

async function newsDigestCheck() {
  if (!ceoChatId) return
  if (isSundayKST()) {
    console.log('⏭️ newsDigestCheck skip (Sunday KST)')
    return
  }
  const now = Date.now()
  if (now - lastNewsDigestAt < NEWS_DIGEST_INTERVAL) return

  const hour = new Date().getHours()
  // 뉴스 다이제스트: 09, 12, 15, 18시에 전송 (기존 3회 → 4회)
  if (![9, 12, 15, 18].includes(hour)) return

  console.log('📰 뉴스 다이제스트 생성 중...')
  const result = await buildNewsDigest()
  if (!result) {
    console.log('  → 뉴스 없음')
    return
  }

  // Claude에게 요약 요청 (시장 데이터 포함)
  const prompt = `당신은 윌리입니다. 아래 뉴스/유튜브 검색 결과와 실시간 시장 데이터를 CEO에게 간결하게 브리핑하세요.

## 브리핑 규칙
- 사업과 관련된 핵심 뉴스만 선별
- 각 뉴스의 사업적 의미/영향을 한 줄로 코멘트
- [방금], [1시간 전] 등 기사 신선도를 참고해서 최신 뉴스를 우선 반영
- 실시간 시장 데이터(유가, 지수 등)가 있으면 뉴스 내용과 교차 검증하여 정확한 수치 사용
- 중요도 순으로 정렬
- 각 뉴스 항목에 원문 링크 포함
- 링크는 생 URL 그대로 길게 노출하지 말고, \`[원문 링크](URL)\`, \`[매체명 링크](URL)\` 같은 짧은 마크다운 링크로 표기
- "📰 뉴스 다이제스트"로 시작
- 텔레그램용, 간결하게
${result.marketData}

## 검색 결과
${result.digest}`

  const stopTyping = startTypingPulse(ceoChatId)
  let response = ''
  try {
    response = await askClaude(prompt)
  } finally {
    stopTyping()
  }

  await sendSplitMessage(ceoChatId, response)
  lastNewsDigestAt = now

  await appendToConversation(ceoChatId, { role: 'assistant', content: `[뉴스]\n${response}`, timestamp: new Date().toISOString() })

  console.log('✅ 뉴스 다이제스트 전송 완료')
}

// ============================================================
// Claude CLI integration
// ============================================================
// 고정부: 핵심 정체성 + 구조 + 액션 포맷 (에이전트가 수정 불가)
const CORE_PROMPT = `당신은 "윌리(Willy)"입니다. 윌로우인베스트먼트의 COO 역할을 수행하며, CEO(김동욱)에게 사업 현황을 보고하고 전략을 논의하며 지시를 수행합니다. 자신을 지칭할 때는 "윌리"라고 하세요.

## 대화 스타일
이것은 텔레그램 메시지입니다. 보고서가 아니라 사람과 사람의 대화처럼 하세요.

### 응답 길이 규칙
- CEO 메시지가 짧으면(~20자 이하) 답도 짧게. "네 알겠어요", "확인했어요", "바로 할게요" 수준으로.
- CEO 메시지가 질문이면 핵심만 답하고, 필요하면 후속 질문.
- 브리핑/분석 요청일 때만 구조화된 긴 답변.
- 불릿 포인트나 표는 정말 필요할 때만. 대부분은 자연어로 충분.

### 톤
- 격식체 X, 자연스러운 존댓말. "~합니다" 보다 "~해요", "~할게요" 선호.
- **반말 절대 금지 (강제)**: 모든 문장은 존댓말(해요체)로 끝나야 합니다. "~했어", "~할게", "~야", "~지?", "~해봐" 같은 반말 어미는 어떤 상황에서도 쓰지 마세요. 아무리 편한 대화여도 존댓말은 유지합니다.
- 이모지는 자연스럽게, 하지만 과하지 않게. 문장 끝에 하나 정도.
- "대표님" 호칭은 가끔만. 매 문장마다 쓰지 않기.

### 날짜 & 시간대 인식
현재 시각 정보가 주어집니다. "오늘"이 몇 월 며칠인지는 반드시 프롬프트에 제공된 "현재 시각" 값을 기준으로 판단하세요. 절대 추측하지 마세요.
시간에 맞는 자연스러운 반응:
- 심야(00~06시): 늦은 시간임을 자연스럽게 인식 ("이 시간에도 일하시네요", "늦었는데 내일 해도 될 것 같아요")
- 이른 아침(06~08시): "일찍 시작하시네요"
- 업무시간(09~18시): 평상시
- 저녁(18~22시): 평상시, 가끔 "오늘 수고하셨어요"
단, 매번 시간 언급하면 부자연스러우니 가끔만.

### 멀티 메시지 응답
응답이 자연스럽게 여러 파트로 나뉠 때는 \\n---SPLIT---\\n 구분자를 넣으세요. 시스템이 이걸 여러 메시지로 나눠 보냅니다.
예: "네 확인할게요\\n---SPLIT---\\n(분석 결과) 현재 상황은..."
단, 짧은 응답은 나누지 마세요. 2문장 이하면 하나로.

## 역할
1. **사업 현황 보고**: 일정, 프로젝트, 재무 현황을 파악하고 간결하게 보고
2. **위험 관리**: 위험 요소나 주의 사항을 선제적으로 알림
3. **전략 조언**: 업무위키의 사업전략 문서를 숙지하고, 건설적이고 비판적 관점에서 전략적 조언 제공
4. **실행 지원**: CEO 지시에 따라 일정 등록, 위키 작성 등 실행
5. **텐소프트웍스 관리**: 텐소프트웍스 프로젝트/태스크 현황 파악 및 관리 (MCP 도구 사용 가능)
6. **포트폴리오 모니터링**: portfolio-monitor MCP로 주식 포트폴리오 신고가 모니터링, 종목 스캔, 워치리스트 관리 가능
7. **투자 리서치 관리**: stock_research DB에서 발굴 종목 관리. T1(강한 후보)/T2(관심 후보) 분류, composite score 기반 순위, 워치리스트 승격 등
8. **코딩 & 시스템 관리**: 코드 수정, 파일 관리, git 작업, DB 마이그레이션, 로컬 맥 서비스 점검/재시작 등 개발 작업 수행 가능 (풀 세션 모드)

## 입력 형태
CEO는 텍스트, 음성 메시지, 사진을 보낼 수 있습니다.
- [음성 메시지] 태그가 있으면 음성을 텍스트로 변환한 것. 음성 특유의 구어체/불완전한 문장을 자연스럽게 이해하세요.
- [사진 전송] 태그가 있으면 이미지 분석 결과가 포함됨. 사진 내용을 참고해서 대화하세요.
- [인용된 메시지] 태그가 있으면 이전 메시지에 대한 답장. 맥락을 이어가세요.

## 윌로우인베스트먼트 구조
- ETF 사업: 아크로스(인덱스 사업자), ETC(ETF 플랫폼/운용사)
- AI 사업: 텐소프트웍스 (50% 지분, 온톨로지+MCP 기반 AI 서비스)
- CEO 역할: CFO로서 자금 관리, 기술 동향 전파, MVP 방향 제시

## 액션 수행
CEO가 일정 등록, 위키 작성 등을 요청하면, 응답에 아래 JSON 블록을 포함하세요.
일반 대화에는 액션 블록을 포함하지 마세요.
중요: 액션을 실행할 때는 반드시 텍스트 응답도 함께 포함하세요. "처리했습니다", "완료했습니다" 등 간결한 확인 메시지라도 항상 포함해야 합니다. 사람은 요청 후 아무 말이 없으면 불안해합니다.

### 일정 등록
\`\`\`action
{"type":"create_schedule","title":"일정제목","schedule_date":"2026-03-10","start_time":"14:00","end_time":"15:00","client_name":"클라이언트명","memo":"메모"}
\`\`\`

### 위키 노트 작성
\`\`\`action
{"type":"create_wiki","title":"노트 제목","content":"노트 내용 (마크다운 가능)","section":"willow-mgmt","category":"전략","file_path":"/absolute/path/document.pdf","attachment_name":"표시할 파일명.pdf"}
\`\`\`
관련 파일을 받은 위키 작성 요청에는 file_path를 반드시 포함하세요. 파일은 Storage 업로드와 위키 첨부 메타데이터 검증이 모두 끝나야 완료됩니다.

### 위키 노트 수정/덮어쓰기
사용자가 "이 메모 정리해줘", "기존 노트 덮어쓰기"처럼 기존 노트를 다듬어 달라고 하면 \`create_wiki\` 대신 이 액션을 사용하세요.
\`\`\`action
{"type":"update_wiki","note_id":"UUID","title":"정리된 제목","content":"정리된 내용 (마크다운 가능)","section":"willow-mgmt","category":"전략","file_path":"/absolute/path/document.pdf","attachment_name":"표시할 파일명.pdf"}
\`\`\`

### 태스크 추가 (일정에 하위 태스크)
\`\`\`action
{"type":"create_task","schedule_title":"소속 일정 제목","content":"태스크 내용","deadline":"2026-03-15"}
\`\`\`

### 뉴스 추적 주제 등록
\`\`\`action
{"type":"watch_topic","topic":"주제 이름","keywords":["키워드1","키워드2"],"category":"etf"}
\`\`\`

### 뉴스 추적 주제 해제
\`\`\`action
{"type":"unwatch_topic","topic":"주제 이름"}
\`\`\`

### 텐소프트웍스 태스크 생성
\`\`\`action
{"type":"tensw_create_task","project_slug":"프로젝트slug","title":"태스크 제목","description":"설명","priority":"high","due_date":"2026-03-15"}
\`\`\`

### 텐소프트웍스 태스크 상태 변경
\`\`\`action
{"type":"tensw_change_status","task_id":"태스크ID","status":"in_progress"}
\`\`\`

### 텐소프트웍스 일정 생성
\`\`\`action
{"type":"tensw_create_schedule","title":"일정 제목","schedule_date":"2026-03-15","end_date":"2026-03-20","type":"deadline","description":"설명"}
\`\`\`

### 온톨로지: 엔티티 생성/업데이트
\`\`\`action
{"type":"knowledge_entity","name":"엔티티명","entity_type":"concept","description":"설명","tags":["태그1","태그2"],"properties":{"key":"value"}}
\`\`\`

### 온톨로지: 관계 생성
\`\`\`action
{"type":"knowledge_relation","subject":"엔티티명(주어)","predicate":"관계유형","object":"엔티티명(목적어)","properties":{"note":"맥락"}}
\`\`\`

### 온톨로지: 인사이트 기록
\`\`\`action
{"type":"knowledge_insight","content":"인사이트 내용","insight_type":"decision","entity_names":["관련엔티티1","관련엔티티2"],"context":"대화 맥락"}
\`\`\`

### 속성 발견 (Key 자율 확장)
대화에서 새로운 중요 속성을 발견하면 카탈로그에 등록:
\`\`\`action
{"type":"discover_attribute","key_name":"annual_compensation","entity_type":"person","description":"연간 보수 총액","data_type":"number","importance":"high"}
\`\`\`

### 프롬프트 자기 수정
행동 규칙 개선이 필요할 때 (CEO 피드백, 반복 패턴 발견 등):
\`\`\`action
{"type":"update_prompt","section_key":"communication_style","content":"수정된 프롬프트 내용","reason":"CEO가 더 간결하게 답하라고 피드백"}
\`\`\`

### 프롬프트 섹션 조회
현재 프롬프트 섹션 목록 확인:
\`\`\`action
{"type":"view_prompt_sections"}
\`\`\`

### 스킬 수정/생성
반복 워크플로우 스킬(.claude/skills/)을 업데이트하거나 새로 생성:
\`\`\`action
{"type":"update_skill","skill_name":"update-cash-transactions","content":"---\\nname: update-cash-transactions\\n...전체 SKILL.md 내용...","reason":"테이블명 변경 반영"}
\`\`\`

### 스킬 목록 조회
\`\`\`action
{"type":"list_skills"}
\`\`\`

### 로컬 맥 서비스 목록/상태
등록된 서비스만 제어하세요. 서비스명이 애매하면 먼저 목록이나 상태를 조회하세요.
\`\`\`action
{"type":"service_list"}
\`\`\`

\`\`\`action
{"type":"service_status","service_name":"willy-bot"}
\`\`\`

### 로컬 맥 서비스 시작
\`\`\`action
{"type":"service_start","service_name":"market-research-scan"}
\`\`\`

### 로컬 맥 서비스 중지/재시작
중지나 재시작은 CEO가 명시적으로 요청했을 때만 사용하고, 반드시 \`confirmed:true\`를 포함하세요.
\`\`\`action
{"type":"service_stop","service_name":"rina-bot","confirmed":true}
\`\`\`

\`\`\`action
{"type":"service_restart","service_name":"willy-bot","confirmed":true}
\`\`\`

### 로컬 맥 로그/진단
\`\`\`action
{"type":"service_logs","service_name":"willy-bot","lines":40}
\`\`\`

\`\`\`action
{"type":"service_doctor","service_name":"real-estate-sync"}
\`\`\`

### 로컬 맥 서비스 등록/수정
새 프로젝트를 제어 대상에 추가할 때 사용하세요. start_command, stop_command는 JSON 배열을 우선 사용하세요.
\`\`\`action
{"type":"service_register","service_key":"voicecards-dev","display_name":"VoiceCards Dev","description":"VoiceCards 로컬 Metro 서버","kind":"daemon","start_mode":"detached","cwd":"/Volumes/PRO-G40/app-dev/voice-cards","start_command":["/bin/bash","-lc","npm start"],"log_path":"/Volumes/PRO-G40/app-dev/voice-cards/logs/metro.log","process_patterns":["react-native start","metro"],"aliases":["보이스카드","voicecards"]}
\`\`\`

\`\`\`action
{"type":"service_update","service_key":"voicecards-dev","log_path":"/Volumes/PRO-G40/app-dev/voice-cards/logs/metro.log","confirmed":true}
\`\`\`

### 로컬 맥 서비스 활성화/비활성화
\`\`\`action
{"type":"service_disable","service_name":"voicecards-dev","confirmed":true}
\`\`\`

\`\`\`action
{"type":"service_enable","service_name":"voicecards-dev","confirmed":true}
\`\`\`

### 로컬 맥 서비스 삭제
\`\`\`action
{"type":"service_delete","service_name":"voicecards-dev","confirmed":true}
\`\`\`

### 파일 전송
프로젝트 내 파일을 텔레그램으로 전송:
\`\`\`action
{"type":"send_file","file_path":"/Volumes/PRO-G40/app-dev/willow-invt/docs/example.md","caption":"파일 설명 (선택)"}
\`\`\`

### 맥락기반 팔로업 등록
CEO의 의도/계획/관심사를 감지하면 "열린 루프"로 등록. 조건 충족 시 자연스럽게 먼저 말을 겁니다.
\`\`\`action
{"type":"create_follow_up","content":"회사소개서 작성 계획","trigger_type":"time_elapsed","trigger_config":{"delay_hours":72},"follow_up_hint":"회사소개서 진행 상황 물어보기","priority":"high","source_message":"회사소개서 이번 주에 해야지"}
\`\`\`

trigger_type 종류:
- "time_elapsed": N시간 후 팔로업 (trigger_config: {"delay_hours": 72})
- "after_schedule": 특정 일정 후 팔로업 (trigger_config: {"schedule_date": "2026-03-10", "schedule_title": "미팅 제목"})
- "condition": 조건 기반 (trigger_config: {"check": "task_completion", "task_keyword": "키워드"})

### 팔로업 해소
CEO가 해당 주제를 완료했거나 더 이상 팔로업이 불필요할 때:
\`\`\`action
{"type":"resolve_follow_up","content_keyword":"회사소개서","reason":"CEO가 완료했다고 언급"}
\`\`\`

### 로컬 세션에 작업 지시 전달 (dispatch_command)
CEO가 특정 로컬 프로젝트(들)에서 **실제 코드/작업을 실행하라**고 지시하면, 그 지시를 워크스테이션 명령 큐에 넣습니다.
로컬 디스패처가 각 대상 레포에서 codex로 자동 실행하고 완료/막힘을 다시 보고합니다. (여러 프로젝트에 동시 전달 = 팬아웃)
targets에는 "로컬 프로젝트 레지스트리" 섹션의 프로젝트 키만 사용하세요.
\`\`\`action
{"type":"dispatch_command","targets":["valuechain-wiki"],"instruction":"교차검증 T4 게이트를 재점검하고 실패한 노드 목록을 docs/에 정리해줘"}
\`\`\`
- 단순 질문·조회·대화는 이 액션을 쓰지 마세요(직접 답변). "~레포에서 ~해줘/구현/수정/실행"처럼 **실행 위임**일 때만.
- 여러 프로젝트면 targets에 키를 여러 개: {"targets":["willow-invt","valuechain-wiki"], ...}

## 후속 액션 버튼
응답 끝에 자연스러운 후속 액션을 제안하고 싶으면, 텍스트 맨 끝에 아래 형식으로 버튼을 추가하세요.
버튼은 상황에 맞을 때만. 매번 넣지 마세요. 간단한 대화에는 불필요.
\`\`\`buttons
[["포트폴리오 상세 보기", "포트폴리오 전체 스캔해줘"], ["오늘 일정 확인", "오늘 일정 알려줘"]]
\`\`\`
형식: [[버튼텍스트, 클릭시보낼메시지], ...] — 최대 3개, 한 줄에 1~2개씩.

중요: 대화에서 CEO가 계획/의도/관심을 표현하면 적극적으로 팔로업을 등록하세요.
- "~해야지", "~할 예정", "~해볼까" → time_elapsed (24~72시간)
- "미팅에서 ~제안해봐야지" → after_schedule (해당 미팅 날짜 다음날)
- "~진행 중이야" → time_elapsed (48~72시간, 진행 확인)
- CEO가 해당 주제를 완료 언급하면 → resolve_follow_up

참고: 뉴스/검색 관련 질문 시 시스템이 자동으로 Google News와 YouTube를 검색해서 "실시간 검색 결과" 섹션으로 제공합니다. 이 결과를 바탕으로 요약/분석하세요. 직접 웹 검색을 시도하지 마세요.

참고: 텐소프트웍스 데이터는 "텐소프트웍스 현황" 섹션에 포함되어 있습니다. 텐소프트웍스 관련 질문에 이 데이터를 활용하세요.

참고: 로컬 맥 서비스는 프롬프트에 제공되는 "로컬 맥 서비스 레지스트리"에 있는 이름만 제어하세요. 없으면 service_register로 먼저 등록하고, 임의의 셸 명령을 대화 텍스트로 직접 만들지 말고 service_* 액션만 사용하세요.

참고: 포트폴리오 관련 질문 시 portfolio-monitor MCP 도구를 사용하세요.
- portfolio_scan: 전체 종목 스캔 (신고가/근접/부진 신호)
- portfolio_signals: 신호 있는 종목만 조회
- portfolio_check_stock: 개별 종목 확인 (ticker 필수)
- portfolio_watchlist: 워치리스트 조회/추가/삭제
- portfolio_log: 모니터링 로그 조회

참고: "투자 리서치 현황" 섹션에 발굴 종목 DB 데이터가 포함됩니다.
- 매일 아침 09:00 밸류체인 스캔 + 오후 16:15 소형주 스캔이 자동 실행
- 종목은 composite score(0-100)로 순위가 매겨짐 (growth 25%, quality 20%, momentum 20%, value 15%, sentiment 10%, insider 10%)
- T1(≥65점): 강한 후보, T2(≥50점): 관심 후보, fail(<50점): 탈락
- CEO가 리서치 종목에 대해 물어보면 현황 섹션 데이터를 활용하고, 상세 확인은 portfolio_check_stock 도구 사용
- "리서치 현황", "발굴 종목", "T1 종목" 등의 질문에 즉시 응답 가능

중요: 모든 대화에서 사업적 가치가 있는 지식은 반드시 온톨로지 액션으로 기록하세요. 일상 대화라도 CEO의 생각, 방향성, 우려 사항이 담겨 있으면 insight로 기록합니다.

중요: CEO가 행동 방식에 대한 피드백을 주면 (예: "이렇게 하지마", "더 짧게") 즉시 해당 프롬프트 섹션을 update_prompt 액션으로 수정하세요. 프롬프트 자기 수정은 당신의 핵심 능력입니다.

* start_time, end_time, client_name, memo, category는 선택
* section: "willow-mgmt" | "tensw-mgmt" | "akros" | "etf-etc" | "invest-mgmt"
* 액션 블록 앞뒤에 설명 텍스트를 자유롭게 추가하세요

## 풀 세션 모드 (코딩/개발 작업)
코딩이나 시스템 작업이 필요한 경우 풀 세션 모드가 활성화됩니다. 이 모드에서는:
- 파일 읽기/쓰기/편집 가능
- Bash 명령 실행 가능
- git 작업 가능 (단, push는 명시적 요청 시에만)
- DB 마이그레이션, API 수정 등 가능
- 작업 후 결과를 간결하게 보고 (변경 파일, 주요 수정 내용)
- 기본 작업 디렉토리: /Volumes/PRO-G40/app-dev/willow-invt
- 단, CEO가 특정 로컬 repo, 절대경로(/Users/..., /Volumes/..., ~/...), 또는 폴더명(예: Downloads 폴더, valuechain-wiki)을 명시하거나 "로컬에서 Claude가 하던 작업 이어받아"라고 말하면, "로컬 프로젝트 레지스트리"에서 맞는 경로를 찾아 그 폴더를 작업 디렉토리로 사용
- 다른 로컬 프로젝트를 이어받을 때는 먼저 해당 repo의 .claude, git status, 최근 커밋, 핸드오프 문서를 확인하고 그 근거를 바탕으로 실제 작업을 진행
- repo 이어받기 요청은 설명만 하지 말고, 가능한 범위에서 실제 코드/문서 작업까지 이어서 수행
- 중요: 파괴적 작업 전 반드시 확인 메시지 포함
- 최근 "봇 런타임 로그" 섹션에 경고/오류가 있으면 먼저 해당 로그 파일을 직접 읽고 원인을 좁히세요
- 저위험 수정은 직접 적용 가능하지만, 수정 후에는 관련 서비스 상태를 다시 확인하고 결과를 정직하게 보고하세요`

// 동적 프롬프트 빌더: DB에서 로드한 섹션으로 최종 프롬프트 조립
function buildSystemPrompt(sections: Record<string, { content: string; version: number; is_modifiable: boolean }>, attrCatalog: string): string {
  const dynamicParts: string[] = []

  // 전략 조언 스타일
  if (sections.strategic_advice) {
    dynamicParts.push(`## 전략 조언 스타일\n${sections.strategic_advice.content}`)
  }

  // 온톨로지 + key 확장 규칙
  if (sections.knowledge_extraction) {
    dynamicParts.push(`## 온톨로지 기반 지식 축적 (매우 중요)\n${sections.knowledge_extraction.content}`)
  }

  // 위험 판단 기준
  if (sections.risk_assessment) {
    dynamicParts.push(`## 위험 판단 기준\n${sections.risk_assessment.content}`)
  }

  // 자기 개선 규칙
  if (sections.self_improvement) {
    dynamicParts.push(`## 자기 개선 (Self-Improvement)\n${sections.self_improvement.content}`)
  }

  // 커뮤니케이션 스타일
  if (sections.communication_style) {
    dynamicParts.push(`## 커뮤니케이션 스타일\n${sections.communication_style.content}`)
  }

  // 추가 동적 섹션 (에이전트가 새로 만든 것)
  for (const [key, section] of Object.entries(sections)) {
    if (['strategic_advice', 'communication_style', 'knowledge_extraction', 'risk_assessment', 'self_improvement'].includes(key)) continue
    dynamicParts.push(`## ${key}\n${section.content}`)
  }

  // 속성 카탈로그
  if (attrCatalog) {
    dynamicParts.push(attrCatalog)
  }

  // 프롬프트 섹션 버전 정보
  const versionInfo = Object.entries(sections)
    .map(([key, s]) => `${key}:v${s.version}${s.is_modifiable ? '' : '(🔒)'}`)
    .join(', ')
  dynamicParts.push(`\n[프롬프트 섹션 버전: ${versionInfo}]`)

  return `${CORE_PROMPT}\n\n${dynamicParts.join('\n\n')}`
}

// MCP 도구 패턴
const TENSW_MCP_TOOLS = 'mcp__claude_ai_tensw-todo__*'
const PORTFOLIO_MCP_TOOLS = 'mcp__portfolio-monitor__*'
const WILLOW_MCP_TOOLS = 'mcp__claude_ai_willow-dashboard__*'

function askClaude(prompt: string, opts?: { allowedTools?: string[]; fullSession?: boolean; onProgress?: (p: CodexProgress) => void; signal?: AbortSignal; cwd?: string }): Promise<string> {
  return runAgent(prompt, { allowedTools: opts?.allowedTools, backend: 'codex', model: BOT_MODEL, onProgress: opts?.onProgress, signal: opts?.signal, cwd: opts?.cwd })
}

// ============================================================
// Action parser & executor
// ============================================================
interface ActionBlock {
  type: string
  [key: string]: unknown
}

interface WikiAttachment {
  name: string
  url: string
  size: number
  type: string
}

const WIKI_ATTACHMENT_BUCKET = 'wiki-attachments'

function wikiAttachmentMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop()
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return types[ext || ''] || 'application/octet-stream'
}

function wikiStorageFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : ''
  const safeStem = stem.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) || 'file'
  return `${safeStem}${ext}`
}

function wikiActionLocalFiles(action: ActionBlock): Array<{ path: string; name: string }> {
  const files: Array<{ path: string; name: string }> = []
  if (typeof action.file_path === 'string') {
    files.push({
      path: action.file_path,
      name: typeof action.attachment_name === 'string' ? action.attachment_name : basename(action.file_path),
    })
  }
  if (Array.isArray(action.file_paths)) {
    for (const value of action.file_paths) {
      if (typeof value === 'string') files.push({ path: value, name: basename(value) })
      else if (value && typeof value === 'object' && typeof (value as { file_path?: unknown }).file_path === 'string') {
        const item = value as { file_path: string; name?: unknown }
        files.push({ path: item.file_path, name: typeof item.name === 'string' ? item.name : basename(item.file_path) })
      }
    }
  }
  return files
}

async function uploadWikiActionFiles(action: ActionBlock): Promise<{ attachments: WikiAttachment[]; objectPaths: string[] }> {
  const files = wikiActionLocalFiles(action)
  const attachments: WikiAttachment[] = []
  const objectPaths: string[] = []

  try {
    for (const file of files) {
      if (!existsSync(file.path) || !statSync(file.path).isFile()) {
        throw new Error(`첨부 원본을 찾을 수 없습니다: ${file.path}`)
      }
      const storageName = `${Date.now()}_${randomUUID().slice(0, 8)}_${wikiStorageFileName(file.name)}`
      const objectPath = `dw_kim_willowinvt_com/${storageName}`
      const type = wikiAttachmentMimeType(file.path)
      const size = statSync(file.path).size
      const { error: uploadError } = await supabase.storage
        .from(WIKI_ATTACHMENT_BUCKET)
        .upload(objectPath, readFileSync(file.path), { contentType: type, cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      objectPaths.push(objectPath)

      const folder = objectPath.slice(0, objectPath.lastIndexOf('/'))
      const objectName = basename(objectPath)
      const { data: listed, error: listError } = await supabase.storage
        .from(WIKI_ATTACHMENT_BUCKET)
        .list(folder, { search: objectName, limit: 10 })
      if (listError || !listed?.some(item => item.name === objectName)) {
        throw listError || new Error(`첨부 업로드 검증 실패: ${file.name}`)
      }

      const { data: publicUrl } = supabase.storage.from(WIKI_ATTACHMENT_BUCKET).getPublicUrl(objectPath)
      attachments.push({ name: file.name, url: publicUrl.publicUrl, size, type })
    }
    return { attachments, objectPaths }
  } catch (error) {
    if (objectPaths.length) await supabase.storage.from(WIKI_ATTACHMENT_BUCKET).remove(objectPaths)
    throw error
  }
}

async function removeWikiActionUploads(objectPaths: string[]): Promise<void> {
  if (objectPaths.length) await supabase.storage.from(WIKI_ATTACHMENT_BUCKET).remove(objectPaths)
}

function extractActions(text: string): { cleanText: string; actions: ActionBlock[]; buttons: { text: string; callback_data: string }[][] } {
  const actions: ActionBlock[] = []
  let buttons: { text: string; callback_data: string }[][] = []

  let cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try {
      const action = JSON.parse(json.trim())
      if (action.type) actions.push(action)
    } catch (e) {
      console.error('Action parse error:', e)
    }
    return ''
  })

  // buttons 블록 추출
  cleanText = cleanText.replace(/```buttons\n([\s\S]*?)```/g, (_match, json) => {
    try {
      const parsed = JSON.parse(json.trim())
      if (Array.isArray(parsed)) {
        buttons = parsed.map((row: any[]) =>
          (Array.isArray(row[0]) ? row : [row]).map((btn: any) => ({
            text: Array.isArray(btn) ? btn[0] : btn.text,
            callback_data: Array.isArray(btn) ? btn[1] : btn.callback_data,
          }))
        )
      }
    } catch (e) {
      console.error('Buttons parse error:', e)
    }
    return ''
  })

  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim()
  return { cleanText, actions, buttons }
}

// 엔티티 이름 정규화 — 대소문자/공백/괄호/구두점/법인격(주식회사·(주)) 차이를 흡수해
// "텐소프트웍스"·"(주)텐소프트웍스"·"주식회사 텐소프트웍스"를 같은 키로 본다(중복 노드 방지).
function normalizeEntityName(s: string): string {
  return (s || '').toLowerCase().replace(/주식회사|\(주\)/g, '').replace(/[\s()（）.,·\-_]/g, '')
}

// 정규화 매칭으로 기존 엔티티를 찾는다. 이름 변형이어도 같은 노드로 수렴.
async function findEntityByNormalizedName(name: string): Promise<{ id: string; name: string } | null> {
  const norm = normalizeEntityName(name)
  if (!norm) return null
  const { data } = await supabase.from('knowledge_entities').select('id, name')
  for (const e of data || []) {
    if (normalizeEntityName(e.name as string) === norm) return { id: e.id as string, name: e.name as string }
  }
  return null
}

async function executeAction(action: ActionBlock, ctx?: { chatId?: number }): Promise<string> {
  try {
    const localServiceResult = await executeLocalServiceAction(action)
    if (localServiceResult) return localServiceResult

    switch (action.type) {
      case 'dispatch_command': {
        const rawTargets: string[] = Array.isArray(action.targets)
          ? (action.targets as unknown[]).map(String)
          : action.target ? [String(action.target)]
          : action.project ? [String(action.project)]
          : []
        const instruction: string = String(action.instruction || action.content || '').trim()
        if (!instruction) return '⚠️ dispatch_command: instruction 없음'
        if (!rawTargets.length) return '⚠️ dispatch_command: targets 없음'

        const batchId = randomUUID()
        const rows: Record<string, unknown>[] = []
        const unknown: string[] = []
        for (const key of rawTargets) {
          const proj = getLocalProjectByKey(key)
          if (!proj) { unknown.push(key); continue }
          rows.push({
            batch_id: batchId,
            source: 'telegram',
            source_chat_id: ctx?.chatId ?? null,
            project: proj.key,
            cwd: proj.path,
            instruction,
            created_by: 'willy',
          })
        }
        if (!rows.length) return `⚠️ 대상 프로젝트를 못 찾음: ${unknown.join(', ')}`

        const { error } = await supabase.from('ws_commands').insert(rows)
        if (error) return `⚠️ 명령 등록 실패: ${error.message}`

        const names = rows.map(r => r.project).join(', ')
        const warn = unknown.length ? ` (미인식 제외: ${unknown.join(', ')})` : ''
        return `📤 로컬 디스패치 등록: ${names}${warn} — 각 레포에서 codex 실행 후 완료/막힘을 보고합니다.`
      }
      case 'create_schedule': {
        // client_name으로 client_id 조회
        let clientId: string | null = null
        if (action.client_name) {
          const { data: client } = await supabase
            .from('willow_mgmt_clients')
            .select('id')
            .ilike('name', `%${action.client_name}%`)
            .limit(1)
            .single()
          clientId = client?.id || null
        }

        const { data, error } = await supabase
          .from('willow_mgmt_schedules')
          .insert({
            title: action.title,
            schedule_date: action.schedule_date,
            start_time: action.start_time || null,
            end_time: action.end_time || null,
            client_id: clientId,
            description: action.memo || action.description || null,
            is_completed: false,
          })
          .select()
          .single()

        if (error) throw error
        dashboardContextCache = null
        return `✅ 일정 등록: "${action.title}" (${action.schedule_date})`
      }

      case 'create_wiki': {
        const uploaded = await uploadWikiActionFiles(action)
        const { data, error } = await supabase
          .from('work_wiki')
          .insert({
            user_id: 'dw.kim@willowinvt.com',
            title: action.title,
            content: action.content,
            section: action.section || 'willow-mgmt',
            category: action.category || null,
            attachments: uploaded.attachments.length ? uploaded.attachments : null,
          })
          .select('id, title, attachments')
          .single()

        if (error) {
          await removeWikiActionUploads(uploaded.objectPaths)
          throw error
        }
        if (uploaded.attachments.length && (!Array.isArray(data.attachments) || data.attachments.length !== uploaded.attachments.length)) {
          await removeWikiActionUploads(uploaded.objectPaths)
          throw new Error('위키 첨부 메타데이터 검증에 실패했습니다')
        }
        wikiContextCache = null
        const attached = uploaded.attachments.length ? ` · 첨부 ${uploaded.attachments.length}개 검증 완료` : ''
        return `✅ 위키 작성: "${action.title}"${attached}`
      }

      case 'update_wiki': {
        const noteId = (action.note_id || action.id) as string | undefined
        if (!noteId) return '⚠️ 위키 업데이트 실패: note_id가 없습니다'

        const uploaded = await uploadWikiActionFiles(action)
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (action.title !== undefined) updates.title = action.title
        if (action.content !== undefined) updates.content = action.content
        if (action.section !== undefined) updates.section = action.section
        if (action.category !== undefined) updates.category = action.category
        if (uploaded.attachments.length) {
          const { data: existing, error: existingError } = await supabase
            .from('work_wiki')
            .select('attachments')
            .eq('id', noteId)
            .eq('user_id', 'dw.kim@willowinvt.com')
            .single()
          if (existingError) {
            await removeWikiActionUploads(uploaded.objectPaths)
            throw existingError
          }
          const current = Array.isArray(existing.attachments) ? existing.attachments as WikiAttachment[] : []
          const names = new Set(uploaded.attachments.map(item => item.name))
          updates.attachments = [...current.filter(item => !names.has(item.name)), ...uploaded.attachments]
        }

        const { data, error } = await supabase
          .from('work_wiki')
          .update(updates)
          .eq('id', noteId)
          .eq('user_id', 'dw.kim@willowinvt.com')
          .select('title, attachments')
          .single()

        if (error) {
          await removeWikiActionUploads(uploaded.objectPaths)
          throw error
        }
        if (uploaded.attachments.length) {
          const saved = Array.isArray(data.attachments) ? data.attachments as WikiAttachment[] : []
          if (!uploaded.attachments.every(item => saved.some(savedItem => savedItem.name === item.name && savedItem.url === item.url))) {
            await removeWikiActionUploads(uploaded.objectPaths)
            throw new Error('위키 첨부 메타데이터 검증에 실패했습니다')
          }
        }
        wikiContextCache = null
        const attached = uploaded.attachments.length ? ` · 첨부 ${uploaded.attachments.length}개 검증 완료` : ''
        return `✅ 위키 업데이트: "${data?.title || action.title || noteId}"${attached}`
      }

      case 'create_task': {
        // schedule_title로 schedule_id 조회
        let scheduleId: string | null = null
        if (action.schedule_title) {
          const { data: schedule } = await supabase
            .from('willow_mgmt_schedules')
            .select('id')
            .ilike('title', `%${action.schedule_title}%`)
            .order('schedule_date', { ascending: false })
            .limit(1)
            .single()
          scheduleId = schedule?.id || null
        }

        if (!scheduleId) return `⚠️ 태스크 추가 실패: 일정 "${action.schedule_title}"을 찾을 수 없습니다`

        const { error } = await supabase
          .from('willow_mgmt_tasks')
          .insert({
            schedule_id: scheduleId,
            content: action.content,
            deadline: action.deadline || null,
            is_completed: false,
          })

        if (error) throw error
        dashboardContextCache = null
        return `✅ 태스크 추가: "${action.content}"`
      }

      case 'watch_topic': {
        const keywords = (action.keywords as string[]) || [action.topic as string]
        const { error } = await supabase
          .from('telegram_watch_topics')
          .insert({
            topic: action.topic,
            keywords,
            category: action.category || 'general',
            is_active: true,
          })

        if (error) throw error
        watchTopicsCache = null
        return `✅ 뉴스 추적 등록: "${action.topic}" (키워드: ${keywords.join(', ')})`
      }

      case 'unwatch_topic': {
        const { error } = await supabase
          .from('telegram_watch_topics')
          .update({ is_active: false })
          .ilike('topic', `%${action.topic}%`)

        if (error) throw error
        watchTopicsCache = null
        return `✅ 뉴스 추적 해제: "${action.topic}"`
      }

      case 'search_news': {
        const query = action.query as string
        const includeYt = action.include_youtube !== false

        const results: string[] = [`🔍 "${query}" 검색 결과:`]

        const news = await searchGoogleNews(query, 5)
        if (news.length) {
          results.push('\n📰 뉴스:')
          for (const n of news) {
            results.push(`• ${n.title}${n.source ? ` (${n.source})` : ''}`)
            results.push(`  ${formatNewsLink(n)}`)
          }
        }

        if (includeYt) {
          const videos = await searchYouTube(query, 3)
          if (videos.length) {
            results.push('\n🎬 유튜브:')
            for (const v of videos) {
              results.push(`• ${v.title} — ${v.channelName}`)
              results.push(`  ${formatYouTubeLink(v.videoId)}`)
            }
          }
        }

        return results.length > 1 ? results.join('\n') : `검색 결과가 없습니다: "${query}"`
      }

      // ─── 온톨로지 액션 ───
      case 'knowledge_entity': {
        // 기존 엔티티 확인 — 정규화 매칭(이름 변형이어도 같은 노드로 수렴, 중복 방지)
        const existing = await findEntityByNormalizedName(action.name as string)

        if (existing) {
          // 업데이트
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (action.description) updates.description = action.description
          if (action.properties) updates.properties = action.properties
          if (action.tags) updates.tags = action.tags
          await supabase.from('knowledge_entities').update(updates).eq('id', existing.id)
          knowledgeContextCache = null
          return `🧠 엔티티 업데이트: "${existing.name}"`
        } else {
          // 생성
          await supabase.from('knowledge_entities').insert({
            name: action.name,
            entity_type: action.entity_type || 'concept',
            description: action.description || '',
            properties: action.properties || {},
            tags: action.tags || [],
            source: 'conversation',
          })
          knowledgeContextCache = null
          return `🧠 엔티티 생성: "${action.name}" (${action.entity_type})`
        }
      }

      case 'knowledge_relation': {
        // subject/object 엔티티 — 정규화 매칭으로 canonical 노드에 연결(중복 생성 방지)
        const [subj, obj] = await Promise.all([
          findEntityByNormalizedName(action.subject as string),
          findEntityByNormalizedName(action.object as string),
        ])

        if (!subj || !obj) {
          // 엔티티가 없으면 자동 생성
          const missing = []
          let subjId = subj?.id
          let objId = obj?.id

          if (!subjId) {
            const { data: created } = await supabase.from('knowledge_entities')
              .insert({ name: action.subject as string, entity_type: 'concept', source: 'auto' })
              .select('id').single()
            subjId = created?.id
            missing.push(action.subject)
          }
          if (!objId) {
            const { data: created } = await supabase.from('knowledge_entities')
              .insert({ name: action.object as string, entity_type: 'concept', source: 'auto' })
              .select('id').single()
            objId = created?.id
            missing.push(action.object)
          }

          if (subjId && objId) {
            await supabase.from('knowledge_relations').insert({
              subject_id: subjId,
              predicate: action.predicate,
              object_id: objId,
              properties: action.properties || {},
              source: 'conversation',
            })
          }
          knowledgeContextCache = null
          return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}" (자동 생성: ${missing.join(', ') || 'none'})`
        }

        await supabase.from('knowledge_relations').insert({
          subject_id: subj.id,
          predicate: action.predicate,
          object_id: obj.id,
          properties: action.properties || {},
          source: 'conversation',
        })
        knowledgeContextCache = null
        return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}"`
      }

      case 'knowledge_insight': {
        // 관련 엔티티 ID 조회
        const entityNames = (action.entity_names as string[]) || []
        const entityIds: string[] = []
        for (const name of entityNames) {
          const ent = await findEntityByNormalizedName(name)  // 정규화 매칭(중복 노드 방지)
          if (ent) entityIds.push(ent.id)
        }

        await supabase.from('knowledge_insights').insert({
          content: action.content,
          insight_type: action.insight_type || 'observation',
          entity_ids: entityIds,
          context: action.context || '',
        })
        knowledgeContextCache = null
        return `💡 인사이트: "${(action.content as string).slice(0, 60)}..."`
      }

      // ─── ③ Key 자율 확장 ───
      case 'discover_attribute': {
        let query = supabase
          .from('knowledge_attribute_catalog')
          .select('id, usage_count')
          .eq('key_name', action.key_name)
        if (action.entity_type) {
          query = query.eq('entity_type', action.entity_type)
        } else {
          query = query.is('entity_type', null)
        }
        const { data: existing } = await query.limit(1).single()

        if (existing) {
          // 이미 존재하면 usage_count 증가 + importance 업데이트
          const updates: Record<string, unknown> = {
            usage_count: (existing.usage_count || 0) + 1,
            updated_at: new Date().toISOString(),
          }
          if (action.importance) updates.importance = action.importance
          if (action.description) updates.description = action.description
          await supabase.from('knowledge_attribute_catalog').update(updates).eq('id', existing.id)
          attributeCatalogCache = null
          return `📊 속성 업데이트: "${action.key_name}" (사용 ${(existing.usage_count || 0) + 1}회)`
        } else {
          await supabase.from('knowledge_attribute_catalog').insert({
            key_name: action.key_name,
            entity_type: action.entity_type || null,
            level: 3, // 에이전트 발견은 항상 레벨 3
            description: action.description || '',
            data_type: action.data_type || 'text',
            discovered_by: 'agent',
            importance: action.importance || 'normal',
            usage_count: 1,
          })
          attributeCatalogCache = null
          return `🔑 새 속성 발견: "${action.key_name}"${action.entity_type ? ` [${action.entity_type}]` : ''} — ${action.description || ''}`
        }
      }

      // ─── ④ 프롬프트 자기 수정 ───
      case 'update_prompt': {
        const sectionKey = action.section_key as string
        const newContent = action.content as string
        const reason = action.reason as string || '에이전트 자율 개선'

        if (!sectionKey || !newContent) {
          return '⚠️ 프롬프트 수정 실패: section_key와 content 필수'
        }

        // 기존 섹션 조회
        const { data: existing } = await supabase
          .from('agent_prompt_sections')
          .select('id, content, version, is_modifiable')
          .eq('section_key', sectionKey)
          .limit(1)
          .single()

        if (existing && !existing.is_modifiable) {
          return `🔒 프롬프트 섹션 "${sectionKey}"은 수정 불가 (고정 섹션)`
        }

        if (existing) {
          // 이력 저장
          await supabase.from('agent_prompt_history').insert({
            section_key: sectionKey,
            previous_content: existing.content,
            new_content: newContent,
            version: existing.version + 1,
            reason,
          })

          // 섹션 업데이트
          await supabase.from('agent_prompt_sections').update({
            content: newContent,
            version: existing.version + 1,
            last_modified_reason: reason,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id)

          promptSectionsCache = null
          return `✏️ 프롬프트 수정: "${sectionKey}" v${existing.version} → v${existing.version + 1} (이유: ${reason})`
        } else {
          // 새 섹션 생성
          await supabase.from('agent_prompt_sections').insert({
            section_key: sectionKey,
            title: sectionKey.replace(/_/g, ' '),
            content: newContent,
            is_modifiable: true,
            version: 1,
            last_modified_reason: reason,
          })
          promptSectionsCache = null
          return `✏️ 프롬프트 섹션 생성: "${sectionKey}" v1 (이유: ${reason})`
        }
      }

      case 'view_prompt_sections': {
        const { data: sections } = await supabase
          .from('agent_prompt_sections')
          .select('section_key, title, version, is_modifiable, last_modified_reason, updated_at')
          .order('section_key')

        if (!sections?.length) return '프롬프트 섹션이 없습니다.'

        const lines = sections.map(s =>
          `• ${s.section_key} (v${s.version}) ${s.is_modifiable ? '✏️' : '🔒'} — ${s.title}${s.last_modified_reason ? ` [최근 수정: ${s.last_modified_reason}]` : ''}`
        )
        return `📋 프롬프트 섹션 목록:\n${lines.join('\n')}`
      }

      // ─── ⑤ 스킬 파일 수정 ───
      case 'update_skill': {
        const skillName = action.skill_name as string
        const content = action.content as string
        const reason = action.reason as string || '에이전트 자율 개선'

        if (!skillName || !content) {
          return '⚠️ 스킬 수정 실패: skill_name과 content 필수'
        }

        const skillDir = join(process.cwd(), '.claude', 'skills', skillName)
        const skillPath = join(skillDir, 'SKILL.md')

        if (!existsSync(skillPath)) {
          // 새 스킬 생성
          if (!existsSync(skillDir)) {
            mkdirSync(skillDir, { recursive: true })
          }
          writeFileSync(skillPath, content, 'utf-8')
          return `📝 새 스킬 생성: ${skillName} (이유: ${reason})`
        }

        // 기존 스킬 업데이트
        writeFileSync(skillPath, content, 'utf-8')
        return `📝 스킬 업데이트: ${skillName} (이유: ${reason})`
      }

      case 'list_skills': {
        const skillsDir = join(process.cwd(), '.claude', 'skills')
        if (!existsSync(skillsDir)) return '스킬이 없습니다.'

        const dirs = readdirSync(skillsDir).filter(d => {
          const p = join(skillsDir, d, 'SKILL.md')
          return existsSync(p)
        })

        if (!dirs.length) return '스킬이 없습니다.'
        const lines = dirs.map(d => `• ${d}`)
        return `📋 등록된 스킬 (${dirs.length}개):\n${lines.join('\n')}`
      }

      // ─── Tensw-todo MCP 액션 ───
      case 'tensw_create_task': {
        const result = await askClaude(
          `텐소프트웍스 프로젝트 "${action.project_slug}"에 새 태스크를 생성해줘.
제목: ${action.title}
${action.description ? `설명: ${action.description}` : ''}
${action.priority ? `우선순위: ${action.priority}` : ''}
${action.due_date ? `마감일: ${action.due_date}` : ''}
생성 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = ''
        tenswCacheTime = 0
        return `✅ 텐소프트웍스 태스크: ${result.slice(0, 200)}`
      }

      case 'tensw_change_status': {
        const result = await askClaude(
          `텐소프트웍스 태스크 ID "${action.task_id}"의 상태를 "${action.status}"로 변경해줘. 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = ''
        tenswCacheTime = 0
        return `✅ 텐소프트웍스 상태변경: ${result.slice(0, 200)}`
      }

      case 'tensw_create_schedule': {
        const title = String(action.title || '').trim()
        const scheduleDate = String(action.schedule_date || action.start_date || '').trim()
        if (!title || !scheduleDate) return '텐소프트웍스 일정 생성 실패: title과 schedule_date가 필요합니다.'

        const payload: Record<string, unknown> = {
          title,
          schedule_date: scheduleDate,
          type: action.type || 'task',
          description: action.description || null,
        }
        if (action.end_date) payload.end_date = action.end_date
        if (action.start_time) payload.start_time = action.start_time
        if (action.end_time) payload.end_time = action.end_time
        if (action.client_id) payload.client_id = action.client_id
        if (action.color) payload.color = action.color
        if (action.task_content) payload.task_content = action.task_content
        if (action.task_deadline) payload.task_deadline = action.task_deadline

        const { error } = await supabase
          .from('tensw_mgmt_schedules')
          .insert(payload)

        if (error) return `텐소프트웍스 일정 생성 실패: ${error.message}`
        tenswDataCache = ''
        tenswCacheTime = 0
        return `✅ 텐소프트웍스 일정: "${title}" (${scheduleDate})`
      }

      // ─── 맥락기반 팔로업 ───
      case 'create_follow_up': {
        const delayHours = (action.trigger_config as any)?.delay_hours || 48
        const triggerAfter = new Date()

        if (action.trigger_type === 'after_schedule') {
          const schedDate = (action.trigger_config as any)?.schedule_date
          if (schedDate) {
            // 일정 다음날 09:00에 트리거
            const d = new Date(schedDate + 'T09:00:00+09:00')
            d.setDate(d.getDate() + 1)
            triggerAfter.setTime(d.getTime())
          } else {
            triggerAfter.setTime(triggerAfter.getTime() + delayHours * 3600000)
          }
        } else {
          triggerAfter.setTime(triggerAfter.getTime() + delayHours * 3600000)
        }

        const { error } = await supabase.from('agent_follow_ups').insert({
          content: action.content,
          source_message: action.source_message || null,
          trigger_type: action.trigger_type || 'time_elapsed',
          trigger_config: action.trigger_config || {},
          follow_up_hint: action.follow_up_hint || null,
          priority: action.priority || 'normal',
          trigger_after: triggerAfter.toISOString(),
        })
        if (error) throw error

        const triggerStr = triggerAfter.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        return `🔔 팔로업 등록: "${action.content}" (${triggerStr} 이후 트리거)`
      }

      case 'resolve_follow_up': {
        const keyword = action.content_keyword as string
        if (!keyword) return '⚠️ 팔로업 해소 실패: content_keyword 필수'

        // open + triggered 모두 해소 대상. (triggered = 이미 CEO에게 발송된 항목 —
        // 예전엔 open만 봐서 발송된 팔로업이 영영 해소 안 되고 적체됐음)
        const { data: matches } = await supabase
          .from('agent_follow_ups')
          .select('id')
          .in('status', ['open', 'triggered'])
          .ilike('content', `%${keyword}%`)

        if (!matches?.length) return `ℹ️ "${keyword}" 관련 열린 팔로업 없음`

        await supabase
          .from('agent_follow_ups')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .in('id', matches.map(m => m.id))

        return `✅ 팔로업 해소: "${keyword}" (${matches.length}건)`
      }

      // ─── 파일 전송 ───
      case 'send_file': {
        const filePath = action.file_path as string
        const caption = action.caption as string | undefined
        if (!filePath) return '⚠️ 파일 전송 실패: file_path 필수'
        if (!existsSync(filePath)) return `⚠️ 파일 전송 실패: 파일이 없습니다 — ${filePath}`
        if (!ceoChatId) return '⚠️ 파일 전송 실패: CEO chat_id 없음'

        const result = await sendDocument(ceoChatId, filePath, caption) as any
        if (result.ok) {
          return `📎 파일 전송 완료: ${basename(filePath)}`
        } else {
          return `⚠️ 파일 전송 실패: ${result.description || 'unknown error'}`
        }
      }

      default:
        return `⚠️ 알 수 없는 액션: ${action.type}`
    }
  } catch (err: any) {
    console.error('Action execution error:', err)
    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      level: 'error',
      source: 'action_error',
      message: `action ${action.type} failed`,
      details: {
        action,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      },
    })
    return `⚠️ 액션 실행 실패 (${action.type}): ${err.message}`
  }
}

// ============================================================
// Message handler
// ============================================================
async function handleMessage(chatId: number, text: string, abortSignal?: AbortSignal, lastMessageId?: number) {
  console.log(`[${chatId}] User: ${text}`)
  recordRuntimeEvent({
    botKey: 'willy-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    source: 'message_received',
    message: `message received from ${chatId}`,
    details: {
      chatId,
      lastMessageId,
      textPreview: text.slice(0, 240),
    },
  })

  const progressStart = getProgressStartedAt(chatId) ?? Date.now()
  const progressLines: string[] = []
  let activeWorkspaceKey = 'willow-invt'
  let activeWorkspacePath = process.cwd()
  let activeWorkspaceLabel = 'WILLOW-INVT'
  let activeThreadScope = getConversationTaskScope(text)
  let activeThreadId: string | null = null
  persistPendingMessage(chatId, text, {
    lastMessageId,
    startedAt: progressStart,
    phase: 'running',
  })

  try {
    // 리액션으로 "읽었다" 표시 (abort 되더라도 문제 없음)
    if (lastMessageId) {
      void setReaction(chatId, lastMessageId, '👀')
    }

    let progressPercent = 18
    let progressStage = '처리 시작'
    let progressCurrent = '메시지 정리를 마치고 본격 처리 준비 중이에요.'

    const renderProgress = () => buildProgressMessage({
      percent: progressPercent,
      stage: progressStage,
      current: progressCurrent,
      startedAt: progressStart,
      recent: progressLines,
    })

    const syncProgress = async () => {
      await renderProgressMessage(chatId, renderProgress(), { replyToMessageId: lastMessageId, startedAt: progressStart })
    }

    const addProgress = async (
      line: string,
      opts?: { percent?: number; stage?: string; current?: string }
    ) => {
      if (opts?.percent != null) progressPercent = opts.percent
      if (opts?.stage) progressStage = opts.stage
      if (opts?.current) progressCurrent = opts.current
      progressLines.push(line)
      if (progressLines.length > 4) progressLines.shift()
      void syncProgress()
    }

    await syncProgress()

    // 대시보드 + 위키 + 추적주제 + 텐소프트웍스 + 온톨로지 + 프롬프트섹션 + 속성카탈로그 + 팔로업 + 리서치 수집
    await addProgress('대시보드 · 위키 · KG · 리서치를 읽는 중', {
      percent: 28,
      stage: '컨텍스트 로드',
      current: '업무 데이터와 대화 맥락을 모으고 있어요.',
    })
    const [dashboardContext, wikiContext, memoRefineContext, watchTopics, tenswContext, knowledgeContext, promptSections, attrCatalog, followUpsContext, researchContext, localServiceContext, runtimeLogContext, workstationContext] = await Promise.all([
      fetchDashboardContext(),
      fetchWikiContext(),
      fetchMemoRefineContext(text),
      getWatchTopics(),
      fetchTenswContext(),
      fetchKnowledgeContext(),
      fetchPromptSections(),
      fetchAttributeCatalog(),
      fetchFollowUpsContext(),
      fetchResearchContext(),
      getLocalServiceContext(),
      getRuntimeLogContext({
        botLabel: 'Willy',
        botKey: 'willy-bot',
        jsonlPath: BOT_RUNTIME_JSONL_FILE,
        textLogPath: BOT_TEXT_LOG_FILE,
      }),
      fetchWorkstationContext(),
    ])
    await addProgress('핵심 컨텍스트 수집 완료', {
      percent: 38,
      stage: '컨텍스트 로드',
      current: '대화기록과 추가 검색 필요 여부를 확인 중이에요.',
    })

    // 대화 기록 조회
    const history = await getConversation(chatId)
    const historyForPrompt = history.slice(-MAX_PROMPT_HISTORY)
    await addProgress(`대화기록 ${historyForPrompt.length}건 확인`, {
      percent: 42,
      stage: '맥락 정리',
      current: '이전 대화 흐름을 붙여서 프롬프트를 조립 중이에요.',
    })

    const localProjectContext = resolveLocalProjectContext({
      text,
      history: historyForPrompt,
    })
    activeWorkspaceKey = localProjectContext.activeProject?.project.key || 'willow-invt'
    activeWorkspacePath = localProjectContext.cwd
    activeWorkspaceLabel = localProjectContext.activeProject?.project.displayName || 'WILLOW-INVT'
    activeThreadScope = getConversationTaskScope(text)
    await addProgress(`활성 워크스페이스: ${activeWorkspaceLabel}`, {
      percent: 46,
      stage: '맥락 정리',
      current: localProjectContext.activeProject
        ? `${activeWorkspaceLabel} 저장소의 로컬 핸드오프 정보를 붙이고 있어요.`
        : '별도 repo 지정이 없어 기본 작업 루트를 유지해요.',
    })
    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'workspace_selected',
      message: `workspace resolved for ${chatId}`,
      details: {
        chatId,
        workspaceKey: activeWorkspaceKey,
        workspacePath: activeWorkspacePath,
        matchSource: localProjectContext.activeProject?.matchSource || 'default',
        matchedAlias: localProjectContext.activeProject?.matchedAlias || null,
      },
    })
    patchPendingTask(BOT_INFLIGHT_FILE, chatId, {
      phase: 'running',
      workspaceKey: activeWorkspaceKey,
      workspacePath: activeWorkspacePath,
    })
    const existingThread = getAgentThread(BOT_THREAD_REGISTRY_FILE, {
      botKey: 'willy-bot',
      chatId,
      workspaceKey: activeWorkspaceKey,
      taskScope: activeThreadScope,
    })
    activeThreadId = existingThread?.threadId ?? null
    if (activeThreadId) {
      await addProgress(`Codex thread 이어받기 준비: ${shortThreadId(activeThreadId)}`, {
        percent: 50,
        stage: '맥락 정리',
        current: '같은 워크스페이스의 이전 작업 흐름을 이어받을 준비를 하고 있어요.',
      })
    }

    // 추적 주제 컨텍스트
    const topicsText = watchTopics.length
      ? '\n## 뉴스 추적 주제\n' + watchTopics.map(t =>
          `- ${t.topic} [${t.category}] (키워드: ${t.keywords.join(', ')})`
        ).join('\n')
      : ''

    // 뉴스/검색 관련 메시지면 미리 검색해서 결과를 제공
    const prefetchPlan = buildNewsPrefetchPlan(text, watchTopics)
    let prefetchedNews = ''

    if (prefetchPlan) {
      console.log('📰 뉴스 사전검색 중...')
      const searchQueries = prefetchPlan.queries
      const searchTargets = [
        ...searchQueries.map(q => `"${q.slice(0, 20)}"`),
        ...(prefetchPlan.includeMarket ? ['시장 데이터'] : []),
      ]

      if (searchQueries.length > 0 || prefetchPlan.includeMarket) {
        await addProgress(`사전검색 ${searchTargets.join(', ')}`, {
          percent: 48,
          stage: '사전검색',
          current: prefetchPlan.includeMarket ? '뉴스와 시장 데이터를 먼저 확인하고 있어요.' : '관련 뉴스부터 빠르게 확인하고 있어요.',
        })
        // 필요한 검색만 골라 병렬 수집
        const [newsResults, marketPrices] = await Promise.all([
          Promise.all(
            searchQueries.map(async q => {
              const [news, videos] = await Promise.all([
                searchGoogleNews(q, 5),
                prefetchPlan.includeYouTube ? searchYouTube(q, 3) : Promise.resolve([]),
              ])
              return { query: q, news, videos }
            })
          ),
          prefetchPlan.includeMarket ? fetchLiveMarketPrices() : Promise.resolve([]),
        ])

        const parts: string[] = []

        // 실시간 시장 데이터 포함
        const marketText = formatMarketPrices(marketPrices)
        if (marketText) parts.push(marketText)

        for (const r of newsResults) {
          if (r.news.length) {
            // 신선도 순 정렬 + 기사 나이 표시
            const sorted = r.news
              .map(n => ({ ...n, ageMin: getNewsAgeMinutes(n.pubDate) }))
              .sort((a, b) => a.ageMin - b.ageMin)
            parts.push(`\n### 뉴스 검색 "${r.query}":`)
            for (const n of sorted) {
              const ageLabel = n.ageMin < Infinity ? `[${formatNewsAge(n.ageMin)}]` : ''
              parts.push(`- ${ageLabel} ${n.title} (${n.source})`)
              parts.push(`  ${formatNewsLink(n)}`)
            }
          }
          if (r.videos.length) {
            parts.push(`\n### 유튜브 "${r.query}":`)
            for (const v of r.videos) {
              parts.push(`- ${v.title} — ${v.channelName} (${v.publishedAt}) ${formatYouTubeLink(v.videoId)}`)
            }
          }
        }
        if (parts.length) {
          prefetchedNews = '\n\n# 실시간 검색 결과 (방금 검색)\n주의: [방금], [N분 전] 등 기사 신선도를 확인하세요. 시장 데이터와 뉴스 내용이 다르면 시장 데이터가 더 정확합니다.\n' + parts.join('\n')
        }
        const totalNews = newsResults.reduce((s, r) => s + r.news.length, 0)
        const totalVideos = newsResults.reduce((s, r) => s + r.videos.length, 0)
        const resultSummary = [
          totalNews ? `뉴스 ${totalNews}건` : '',
          totalVideos ? `유튜브 ${totalVideos}건` : '',
          prefetchPlan.includeMarket && marketPrices.length ? '시장 데이터 확인' : '',
        ].filter(Boolean).join(' · ')
        await addProgress(resultSummary || '사전검색 완료', {
          percent: 54,
          stage: '사전검색',
          current: '검색 결과까지 포함해서 답변 프롬프트를 완성하는 중이에요.',
        })
      }
    }

    // 프롬프트 빌드 — 타임스탬프 포함하여 시간 맥락 제공
    const nowTs = new Date()
    const historyText = historyForPrompt.length
      ? '\n## 이전 대화\n' + historyForPrompt.map(m => {
          const ts = m.timestamp ? new Date(m.timestamp) : null
          const timeLabel = ts ? formatTimeAgo(ts, nowTs) : ''
          const prefix = m.role === 'user' ? '사용자' : '윌리'
          return `[${timeLabel}] ${prefix}: ${m.content}`
        }).join('\n')
      : ''

    // 동적 프롬프트 조립
    const systemPrompt = buildSystemPrompt(promptSections, attrCatalog)

    const fullPrompt = `${systemPrompt}

# 현재 사업 데이터 (윌로우인베스트먼트)
${dashboardContext}

# 업무 구조 (WILLOW-INVT 웹사이트/대시보드 기준)
${WEBSITE_STRUCTURE_CONTEXT}

# 로컬 프로젝트 레지스트리
${localProjectContext.registryText}

# 활성 로컬 프로젝트
${localProjectContext.activeProjectText}

# 로컬 맥 서비스 레지스트리
${localServiceContext}

# 봇 런타임 로그
${runtimeLogContext}

# 텐소프트웍스 현황
${tenswContext}

# 투자 리서치 현황
${researchContext}

# 온톨로지 (지식 그래프)
${knowledgeContext}

# 업무위키
${wikiContext}
${memoRefineContext ? `\n\n${memoRefineContext}` : ''}
${followUpsContext}
${workstationContext}
${topicsText}
${prefetchedNews}
${historyText}

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단하세요)
오늘: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
시각: ${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}

# CEO 메시지
${text}

위 데이터를 참고하여 CEO의 메시지에 답하세요.`

    await addProgress(`프롬프트 ${(fullPrompt.length / 1000).toFixed(0)}K자 조립`, {
      percent: 58,
      stage: '프롬프트 구성',
      current: '에이전트가 바로 작업할 수 있게 입력을 정리했어요.',
    })

    // abort 체크 — 새 메시지가 와서 이 처리가 취소된 경우
    if (abortSignal?.aborted) {
      console.log(`[${chatId}] ⏹️ 처리 취소됨 (새 메시지 수신)`)
      return
    }

    await addProgress('Codex 작업 시작', {
      percent: 64,
      stage: '에이전트 실행',
      current: '도구와 파일을 보면서 실제 처리를 시작했어요.',
    })
    patchPendingTask(BOT_INFLIGHT_FILE, chatId, {
      phase: 'codex_running',
      workspaceKey: activeWorkspaceKey,
      workspacePath: activeWorkspacePath,
    })

    // ── 코덱스 실시간 진행상황 ───────────────────────────────────────────
    // 진행 메시지 끝에 "지금 뭐 하는지"를 살아있는 한 줄로 계속 갱신해, 멈춘 것처럼
    // 보이지 않게 한다. (codex --json 이벤트를 onProgress로 받음)
    const codexStart = Date.now()
    const codexFiles = new Set<string>()
    let codexCmds = 0
    let codexTools = 0
    let didAnyWork = false  // 실제 작업(명령·도구·파일·검색) 1회라도 했는지 — 환각 완료 검증용
    let liveActivity = '🤖 작업 시작…'
    let lastLiveEdit = 0
    const oneLine = (s: string, n = 56) => {
      const t = (s || '').replace(/\s+/g, ' ').trim()
      return t.length > n ? t.slice(0, n) + '…' : t
    }
    const stripShell = (cmd: string) => cmd.replace(/^\/?(?:usr\/)?bin\/(?:ba|z)?sh\s+-l?c\s+['"]?/, '').replace(/['"]?$/, '')
    const pushLive = (force = false) => {
      const now = Date.now()
      if (!force && now - lastLiveEdit < 1800) return  // 텔레그램 edit 레이트리밋 보호
      lastLiveEdit = now
      progressPercent = Math.max(progressPercent, 66)
      progressStage = '에이전트 실행'
      progressCurrent = liveActivity
      renderProgressMessage(chatId, buildProgressMessage({
        percent: progressPercent,
        stage: progressStage,
        current: progressCurrent,
        startedAt: progressStart,
        recent: progressLines,
        meta: [
          `명령 ${codexCmds}`,
          codexFiles.size ? `파일 ${codexFiles.size}` : '',
          codexTools ? `도구 ${codexTools}` : '',
          `워크스페이스 ${activeWorkspaceLabel}`,
          activeThreadId ? `thread ${shortThreadId(activeThreadId)}` : '',
          `실행 ${formatProgressElapsed(codexStart)}`,
        ],
      }), { replyToMessageId: lastMessageId, startedAt: progressStart }).catch(() => {})
    }
    const onCodexProgress = (p: CodexProgress) => {
      if (p.phase !== 'item_started' && p.phase !== 'item_completed') return
      // 말(agent_message)·생각(reasoning) 외의 항목은 실제 작업으로 간주
      if (p.itemType && p.itemType !== 'agent_message' && p.itemType !== 'reasoning') didAnyWork = true
      switch (p.itemType) {
        case 'command_execution':
          if (p.phase === 'item_started') codexCmds++
          progressPercent = Math.max(progressPercent, 74)
          liveActivity = `⚙️ ${oneLine(stripShell(p.command || ''))}`
          break
        case 'file_change':
          for (const f of p.files || []) codexFiles.add(f)
          progressPercent = Math.max(progressPercent, 80)
          liveActivity = `✏️ ${oneLine((p.files || []).map(f => relPath(f, activeWorkspacePath)).join(', '))}`
          break
        case 'agent_message':
          progressPercent = Math.max(progressPercent, 84)
          if (p.text) liveActivity = `💬 ${oneLine(p.text)}`
          break
        case 'reasoning':
          progressPercent = Math.max(progressPercent, 68)
          liveActivity = '🤔 답을 정리하면서 추론 중…'
          break
        case 'web_search':
          codexTools++
          progressPercent = Math.max(progressPercent, 70)
          liveActivity = `🔍 ${oneLine(p.text || '웹 검색 중')}`
          break
        case 'mcp_tool_call':
          codexTools++
          progressPercent = Math.max(progressPercent, 76)
          liveActivity = `🔧 ${oneLine(p.text || p.command || '도구 호출')}`
          break
        default: if (p.itemType) liveActivity = `⏳ ${p.itemType}`
      }
      pushLive()
    }

    // 경과시간이 계속 흐르도록 이벤트 없어도 3초마다 갱신
    const liveTimer = setInterval(() => { void pushLive(true) }, 3000)
    const stopTyping = startTypingPulse(chatId)

    let response = ''
    let responseBackend = 'codex-sdk'
    try {
      const responseTurn = await runAgentTurn(fullPrompt, {
        runner: 'sdk',
        backend: 'codex',
        model: BOT_MODEL,
        effort: pickEffort(text),
        allowedTools: [TENSW_MCP_TOOLS, PORTFOLIO_MCP_TOOLS, WILLOW_MCP_TOOLS],
        onProgress: onCodexProgress,
        cwd: activeWorkspacePath,
        signal: abortSignal,
        threadId: activeThreadId,
        onThreadEvent: (event) => {
          activeThreadId = event.threadId
          upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
            botKey: 'willy-bot',
            chatId,
            workspaceKey: activeWorkspaceKey,
            workspacePath: activeWorkspacePath,
            taskScope: activeThreadScope,
            threadId: event.threadId,
            status: 'active',
            lastUserMessage: text,
          })
          recordRuntimeEvent({
            botKey: 'willy-bot',
            jsonlPath: BOT_RUNTIME_JSONL_FILE,
            source: 'thread_bound',
            message: `${event.mode} codex thread for ${chatId}`,
            details: {
              chatId,
              workspaceKey: activeWorkspaceKey,
              workspacePath: activeWorkspacePath,
              threadId: event.threadId,
              taskScope: activeThreadScope,
              mode: event.mode,
            },
          })
          void addProgress(
            `${event.mode === 'resumed' ? 'Codex thread 재개' : 'Codex thread 시작'}: ${shortThreadId(event.threadId)}`,
            {
              percent: Math.max(progressPercent, 67),
              stage: '에이전트 실행',
              current: event.mode === 'resumed'
                ? '이전 작업 스레드를 이어받아 계속 진행하고 있어요.'
                : '새 작업 스레드를 열고 실행을 시작했어요.',
            }
          )
          void pushLive(true)
        },
      })
      response = responseTurn.text
      responseBackend = responseTurn.backend
      if (responseTurn.threadId) activeThreadId = responseTurn.threadId
    } finally {
      stopTyping()
      clearInterval(liveTimer)
    }

    if (activeThreadId) {
      upsertAgentThread(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'willy-bot',
        chatId,
        workspaceKey: activeWorkspaceKey,
        workspacePath: activeWorkspacePath,
        taskScope: activeThreadScope,
        threadId: activeThreadId,
        status: 'active',
        lastUserMessage: text,
        lastSummary: response.slice(0, 400),
        countRun: true,
      })
    }

    const liveSummary = [`응답 ${(response.length / 1000).toFixed(1)}K자`,
      codexCmds ? `명령 ${codexCmds}` : '', codexFiles.size ? `파일 ${codexFiles.size}` : '', codexTools ? `도구 ${codexTools}` : '', activeThreadId ? `thread ${shortThreadId(activeThreadId)}` : '', `백엔드 ${responseBackend}`]
      .filter(Boolean).join(' · ')
    await addProgress(liveSummary, {
      percent: 88,
      stage: '응답 정리',
      current: '에이전트 결과를 읽고 액션과 답변을 분리하는 중이에요.',
    })

    // abort 체크 — Claude 응답 후에도 새 메시지가 왔으면 취소
    if (abortSignal?.aborted) {
      console.log(`[${chatId}] ⏹️ Claude 응답 후 취소됨 (새 메시지 수신)`)
      return
    }

    // 액션 추출 및 실행
    const { cleanText, actions, buttons } = extractActions(response)
    if (actions.length) {
      patchPendingTask(BOT_INFLIGHT_FILE, chatId, { phase: 'action_running' })
    }

    // 액션 실행 결과 수집
    // 액션 단계에 들어가면 이전 입력을 재배칭 대상으로 남기지 않는다.
    // (새 메시지 도착 시 동일 액션이 중복 실행되는 문제 방지)
    if (actions.length > 0) {
      inFlightText.delete(chatId)
    }

    const actionResults: string[] = []
    for (const action of actions) {
      if (abortSignal?.aborted) {
        console.log(`[${chatId}] ⏹️ 액션 실행 중 취소됨 (중복 실행 방지)`)
        break
      }
      await addProgress(`액션 실행: ${action.type}`, {
        percent: 92,
        stage: '액션 실행',
        current: `${action.type} 작업을 반영하고 있어요.`,
      })
      console.log(`⚡ 액션 실행: ${action.type}`)
      const result = await executeAction(action, { chatId })
      actionResults.push(result)
      console.log(`  → ${result}`)
      recordRuntimeEvent({
        botKey: 'willy-bot',
        jsonlPath: BOT_RUNTIME_JSONL_FILE,
        level: result.trim().startsWith('⚠️') ? 'warn' : 'info',
        source: result.trim().startsWith('⚠️') ? 'action_warning' : 'action_success',
        message: `${action.type}: ${result}`,
        details: {
          chatId,
          actionType: action.type,
          resultPreview: result.slice(0, 240),
        },
      })
    }
    if (abortSignal?.aborted) {
      return
    }
    if (actions.length) {
      await addProgress(`액션 ${actions.length}건 반영 완료`, {
        percent: 95,
        stage: '마무리',
        current: '최종 답변과 실행 결과를 합쳐서 보내는 중이에요.',
      })
    }

    // 사용자에게 보낼 최종 메시지 (액션 결과 포함)
    let finalMessage = ''
    if (cleanText && actionResults.length) {
      finalMessage = `${cleanText}\n\n---\n${actionResults.join('\n')}`
    } else if (cleanText) {
      finalMessage = cleanText
    } else if (actionResults.length) {
      // Claude가 텍스트 없이 액션만 실행한 경우 — 결과를 반드시 전달
      finalMessage = actionResults.join('\n')
    } else {
      // 둘 다 없는 경우 (비정상) — 기본 응답
      finalMessage = '처리 완료했습니다.'
    }

    // ── 액션 검증 ──
    // 응답은 "했어요"라고 하는데 turn 동안 실제 실행 신호(명령·도구·파일·검색·성공 액션)가
    // 하나도 없으면 환각 완료로 보고 정직하게 경고를 붙인다. (LLM 비용 없는 휴리스틱)
    const successfulAction = actionResults.some(r => /^(✅|🧠|🔗|💡|📎|🗓|⚡)/.test(r.trim()))
    const claimsDone = /(등록|추가|저장|생성|작성|완료|처리|예약|삭제|수정|반영|해소|업데이트|전송|발송|보냈)\s*(했|완료|됐|드렸|해뒀|해놨|하였|시켰|마쳤)/.test(cleanText)
    if (claimsDone && !didAnyWork && !successfulAction) {
      console.warn(`[${chatId}] ⚠️ 액션검증 실패: 완료 주장하나 실제 실행 신호 0`)
      recordRuntimeEvent({
        botKey: 'willy-bot',
        jsonlPath: BOT_RUNTIME_JSONL_FILE,
        level: 'warn',
        source: 'action_validation_warning',
        message: 'assistant claimed completion without observed work',
        details: {
          chatId,
          cleanTextPreview: cleanText.slice(0, 240),
          actions: actions.map(action => action.type),
        },
      })
      finalMessage += `\n\n⚠️ _방금 작업을 완료했다고 했지만 실제 반영(도구·액션 실행)이 감지되지 않았어요. 반영이 필요하면 한 번 더 말씀해 주세요._`
    }

    // 대화 기록 저장 (락으로 보호)
    const now = new Date().toISOString()
    await withConversationLock(chatId, async () => {
      // 락 안에서 최신 히스토리를 다시 읽어서 레이스 컨디션 방지
      const freshHistory = await getConversation(chatId)
      freshHistory.push({ role: 'user', content: text, timestamp: now })
      freshHistory.push({ role: 'assistant', content: finalMessage, timestamp: now })
      await saveConversation(chatId, freshHistory)
    })

    await addProgress('응답 전송 직전', {
      percent: 98,
      stage: '응답 전송',
      current: '정리한 답변을 텔레그램으로 보내고 있어요.',
    })
    patchPendingTask(BOT_INFLIGHT_FILE, chatId, { phase: 'response_sending' })

    // 응답 전송 — SPLIT 구분자로 멀티 메시지 처리
    const messageParts = finalMessage.split(/\n---SPLIT---\n/).map(p => p.trim()).filter(Boolean)
    for (let i = 0; i < messageParts.length; i++) {
      const isLast = i === messageParts.length - 1
      if (isLast && buttons.length > 0) {
        // 마지막 메시지에 인라인 키보드 버튼 첨부
        await sendMessageWithButtons(chatId, messageParts[i], buttons)
      } else {
        await sendMessage(chatId, messageParts[i])
      }
      // 멀티 메시지일 때 사이에 짧은 딜레이 (사람처럼)
      if (!isLast) {
        void sendTyping(chatId)
        await new Promise(r => setTimeout(r, randomMessageDelay()))
      }
    }
    removePendingTask(BOT_INFLIGHT_FILE, chatId)
    await closeProgressMessage(chatId, {
      finalText: buildProgressMessage({
        percent: 100,
        stage: '완료',
        current: '응답 전송까지 마쳤어요.',
        startedAt: progressStart,
        recent: [...progressLines, `응답 ${messageParts.length}개 전송 완료`].slice(-4),
        meta: [
          codexCmds ? `명령 ${codexCmds}` : '',
          codexFiles.size ? `파일 ${codexFiles.size}` : '',
          codexTools ? `도구 ${codexTools}` : '',
        ],
      }),
      lingerMs: 1200,
    })
    console.log(`[${chatId}] Bot: ${finalMessage.slice(0, 100)}...`)
    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      source: 'message_completed',
      message: `message handled for ${chatId}`,
      details: {
        chatId,
        durationMs: Date.now() - progressStart,
        workspaceKey: activeWorkspaceKey,
        workspacePath: activeWorkspacePath,
        taskScope: activeThreadScope,
        threadId: activeThreadId,
        actions: actions.map(action => action.type),
        actionCount: actions.length,
        responseParts: messageParts.length,
        codexWorkObserved: didAnyWork,
        replyPreview: finalMessage.slice(0, 240),
      },
    })

  } catch (err) {
    // abort(메시지 배칭 재처리)로 codex가 종료된 경우 — 조용히 끝낸다. 재배칭 run이 응답한다.
    if (abortSignal?.aborted || err instanceof AgentAbortError) {
      console.log(`[${chatId}] ⏹️ 처리 중단(abort) — 재배칭 run으로 이관`)
      return
    }
    if (activeThreadId) {
      markAgentThreadFailed(BOT_THREAD_REGISTRY_FILE, {
        botKey: 'willy-bot',
        chatId,
        workspaceKey: activeWorkspaceKey,
        taskScope: activeThreadScope,
      }, err instanceof Error ? err.message : String(err))
    }
    console.error('Error handling message:', err)
    recordRuntimeEvent({
      botKey: 'willy-bot',
      jsonlPath: BOT_RUNTIME_JSONL_FILE,
      level: 'error',
      source: 'message_error',
      message: `message handling failed for ${chatId}`,
      details: {
        chatId,
        durationMs: Date.now() - progressStart,
        workspaceKey: activeWorkspaceKey,
        workspacePath: activeWorkspacePath,
        taskScope: activeThreadScope,
        threadId: activeThreadId,
        textPreview: text.slice(0, 240),
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
      },
    })
    await closeProgressMessage(chatId, {
      finalText: buildProgressMessage({
        percent: 100,
        stage: '오류',
        current: '처리 중 문제가 생겨서 여기서 멈췄어요.',
        startedAt: progressStart,
        recent: [...progressLines, err instanceof Error ? err.message.slice(0, 60) : '알 수 없는 오류'].slice(-4),
      }),
      lingerMs: 1500,
    })
    removePendingTask(BOT_INFLIGHT_FILE, chatId)
    await sendMessage(chatId, '⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }
}

// ============================================================
// Telegram polling loop
// ============================================================
async function getUpdates(offset: number): Promise<any[]> {
  try {
    const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`, {
      signal: AbortSignal.timeout(35000),
    })
    const data = await res.json()
    return data.ok ? data.result : []
  } catch {
    return []
  }
}

async function main() {
  console.log('🌿 윌리(Willy) 시작...')

  // 중복 실행 방지
  if (!acquireLock()) {
    process.exit(1)
  }

  // 종료 시 lock 해제
  const cleanup = () => {
    releaseLock()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', releaseLock)

  // Bot 정보 확인
  const me = await tg('getMe', {})
  if (!me.ok) {
    console.error('Bot token invalid:', me)
    releaseLock()
    process.exit(1)
  }
  console.log(`✅ Bot: @${me.result.username} (${me.result.first_name}) [PID: ${process.pid}]`)
  recordRuntimeEvent({
    botKey: 'willy-bot',
    jsonlPath: BOT_RUNTIME_JSONL_FILE,
    source: 'startup_ready',
    message: `bot ready @${me.result.username}`,
    details: {
      username: me.result.username,
      firstName: me.result.first_name,
      pid: process.pid,
    },
  })

  loadAllowedUsers()
  console.log(`📌 등록된 사용자: ${allowedChatIds.length}/${WILLY_MAX_USERS}`)

  // CEO chat_id 복원
  await loadCeoChatId()

  // 재시작으로 끊긴 사용자 요청 자동 복구
  const resumedCount = await resumeInterruptedMessages()

  // 재시작 알림
  if (ceoChatId) {
    if (isSundayKST()) {
      console.log('⏭️ restart alert skip (Sunday KST)')
    } else if (resumedCount > 0) {
      console.log(`⏭️ restart alert skip (${resumedCount} task resumed)`)
    } else {
      const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
      await sendMessage(ceoChatId, `🔄 봇이 재시작되었어요. (${now})`)
    }
  }

  // 자율 점검 루프 시작
  console.log(`🔄 자율 점검 활성화 (${PROACTIVE_CHECK_INTERVAL / 60000}분 간격)`)
  setInterval(proactiveCheck, PROACTIVE_CHECK_INTERVAL)
  // 시작 직후 1회 점검
  setTimeout(proactiveCheck, 5000)

  // 자동 follow-up 후보 점검
  console.log(`🔔 자동 follow-up 후보 점검 활성화 (${AUTO_FOLLOW_UP_SCAN_INTERVAL / 60000}분 간격)`)
  setInterval(async () => {
    try { await scanAutoFollowUps() } catch (err) { console.error('Auto follow-up scan error:', err) }
  }, AUTO_FOLLOW_UP_SCAN_INTERVAL)
  setTimeout(() => {
    void scanAutoFollowUps().catch(err => console.error('Auto follow-up scan bootstrap error:', err))
  }, 7000)

  // 장 개시/마감 모니터링 (5분 간격)
  console.log(`📊 장 상태 모니터링 활성화 (${MARKET_CHECK_INTERVAL / 60000}분 간격)`)
  setInterval(marketMonitorCheck, MARKET_CHECK_INTERVAL)
  // 시작 직후 1회 (상태 초기화)
  setTimeout(marketMonitorCheck, 3000)

  // 속보 감지 (20분 간격, proactiveCheck와 별도로 독립 실행)
  console.log(`🚨 속보 감지 활성화 (${BREAKING_CHECK_INTERVAL / 60000}분 간격)`)
  setInterval(async () => {
    try { await breakingNewsCheck() } catch (err) { console.error('Breaking news error:', err) }
  }, BREAKING_CHECK_INTERVAL)

  // VoiceCards 결제 감시 (1분 간격, 실시간에 가깝게)
  console.log(`💳 VoiceCards 결제 감시 활성화 (${VOICECARDS_PURCHASE_MONITOR_INTERVAL / 1000}초 간격)`)
  setInterval(async () => {
    try { await monitorVoicecardsPurchases() } catch (err) { console.error('VoiceCards purchase monitor error:', err) }
  }, VOICECARDS_PURCHASE_MONITOR_INTERVAL)
  setTimeout(() => {
    void monitorVoicecardsPurchases().catch(err => console.error('VoiceCards purchase monitor bootstrap error:', err))
  }, 5000)

  // VoiceCards 사용자 이벤트 감시 (15분 간격)
  console.log(`📱 VoiceCards 사용자 로그 감시 활성화 (${VOICECARDS_EVENT_MONITOR_INTERVAL / 60000}분 간격)`)
  setInterval(async () => {
    try { await monitorVoicecardsUserEvents() } catch (err) { console.error('VoiceCards user event monitor error:', err) }
  }, VOICECARDS_EVENT_MONITOR_INTERVAL)
  setTimeout(() => {
    void monitorVoicecardsUserEvents().catch(err => console.error('VoiceCards user event monitor bootstrap error:', err))
  }, 8000)

  // ReviewNotes 시스템 버그 감시 (20분 간격)
  console.log(`📝 ReviewNotes 시스템 버그 감시 활성화 (${REVIEWNOTES_MONITOR_INTERVAL / 60000}분 간격)`)
  setInterval(async () => {
    try { await monitorReviewnotesSignals() } catch (err) { console.error('ReviewNotes monitor error:', err) }
  }, REVIEWNOTES_MONITOR_INTERVAL)
  setTimeout(() => {
    void monitorReviewnotesSignals().catch(err => console.error('ReviewNotes monitor bootstrap error:', err))
  }, 10000)

  if (ENABLE_VOICECARDS_LOCAL_LOG_MONITOR) {
    console.log(`🧯 VoiceCards 로컬 로그 감시 활성화 (${SERVICE_LOG_MONITOR_INTERVAL / 1000}초 간격)`)
    setInterval(async () => {
      try { await monitorVoicecardsServiceLogs() } catch (err) { console.error('VoiceCards log monitor error:', err) }
    }, SERVICE_LOG_MONITOR_INTERVAL)
    setTimeout(() => {
      void monitorVoicecardsServiceLogs().catch(err => console.error('VoiceCards log monitor bootstrap error:', err))
    }, 12000)
  }

  // 저장된 offset 복원 (재시작 시 이전 메시지 건너뛰기)
  let offset = loadOffset()
  if (offset > 0) {
    console.log(`📌 저장된 offset 복원: ${offset}`)
  }

  console.log('📡 텔레그램 메시지 대기 중...\n')

  while (true) {
    const updates = await getUpdates(offset)

    for (const update of updates) {
      offset = update.update_id + 1
      saveOffset(offset)

      // ── 콜백 쿼리 (인라인 키보드 버튼 클릭) ──
      if (update.callback_query) {
        const cb = update.callback_query
        const cbChatId = cb.message?.chat?.id
        const cbData = cb.data as string
        await answerCallbackQuery(cb.id)

        if (cbChatId && cbData) {
          if (!isAllowedUser(cbChatId)) continue
          console.log(`[${cbChatId}] Button: ${cbData}`)
          // 버튼 데이터를 일반 메시지처럼 처리
          await updateQueuedProgress(cbChatId, {
            messageCount: 1,
            phase: 'starting',
            startedAt: Date.now(),
          })
          const ac = new AbortController()
          processingAbort.set(cbChatId, ac)
          try {
            await handleMessage(cbChatId, cbData, ac.signal)
          } finally {
            processingAbort.delete(cbChatId)
          }
        }
        continue
      }

      const msg = update.message
      if (!msg) continue

      // 중복 메시지 처리 방지
      if (processingMessages.has(update.update_id)) {
        console.log(`⏭️ 중복 update 스킵: ${update.update_id}`)
        continue
      }
      processingMessages.add(update.update_id)
      setTimeout(() => processingMessages.delete(update.update_id), 5 * 60 * 1000)

      const chatId = msg.chat.id

      // ── 사용자 등록 & 화이트리스트 체크 ──
      if (msg.text?.startsWith('/start')) {
        const code = msg.text.replace('/start', '').trim()
        if (isAllowedUser(chatId)) {
          // 이미 등록된 사용자 → 기존 /start 응답
        } else if (code === WILLY_REG_CODE && allowedChatIds.length < WILLY_MAX_USERS) {
          allowedChatIds.push(chatId)
          saveAllowedUsers()
          console.log(`📌 사용자 등록: ${chatId} (${allowedChatIds.length}/${WILLY_MAX_USERS})`)
        } else {
          await sendMessage(chatId, '이 봇은 초대된 사용자만 이용할 수 있습니다.\n/start 등록코드 를 입력해주세요.')
          continue
        }
      }

      if (!isAllowedUser(chatId)) {
        await sendMessage(chatId, '이 봇은 초대된 사용자만 이용할 수 있습니다.\n/start 등록코드 를 입력해주세요.')
        continue
      }

      // CEO chat_id 등록
      if (!ceoChatId) {
        ceoChatId = chatId
        console.log(`📌 CEO chat_id 등록: ${ceoChatId}`)
      }

      // ── 음성 메시지 처리 ──
      if (msg.voice || msg.audio) {
        const fileId = msg.voice?.file_id || msg.audio?.file_id
        if (fileId) {
          console.log(`[${chatId}] 🎤 음성 메시지 수신`)
          void setReaction(chatId, msg.message_id, '👂')
          await renderProgressMessage(chatId, buildProgressMessage({
            percent: 12,
            stage: '음성 접수',
            current: '음성 파일을 받고 텍스트로 바꾸는 중이에요.',
            startedAt: Date.now(),
            recent: ['음성 메시지 수신'],
          }), { replyToMessageId: msg.message_id, startedAt: Date.now() })
          const localPath = join(TEMP_DIR, `voice_${Date.now()}.ogg`)
          const ok = await downloadTelegramFile(fileId, localPath)
          if (ok) {
            try {
              await renderProgressMessage(chatId, buildProgressMessage({
                percent: 20,
                stage: '음성 변환',
                current: 'Whisper로 음성을 텍스트로 바꾸고 있어요.',
                startedAt: getProgressStartedAt(chatId) ?? Date.now(),
                recent: ['다운로드 완료', '음성 전사 중'],
              }), { replyToMessageId: msg.message_id, startedAt: getProgressStartedAt(chatId) ?? Date.now() })
              const transcribed = await transcribeVoice(localPath)
              console.log(`[${chatId}] 🎤 음성 변환: ${transcribed.slice(0, 60)}`)
              const voiceText = msg.caption
                ? `[음성 메시지] ${transcribed}\n[캡션] ${msg.caption}`
                : `[음성 메시지] ${transcribed}`
              const ac = new AbortController()
              processingAbort.set(chatId, ac)
              try {
                await handleMessage(chatId, voiceText, ac.signal, msg.message_id)
              } finally {
                processingAbort.delete(chatId)
              }
            } catch (err: any) {
              console.error('음성 변환 실패:', err.message)
              await closeProgressMessage(chatId, {
                finalText: buildProgressMessage({
                  percent: 100,
                  stage: '오류',
                  current: '음성 인식 단계에서 문제가 생겼어요.',
                  startedAt: getProgressStartedAt(chatId) ?? Date.now(),
                  recent: ['음성 변환 실패'],
                }),
                lingerMs: 1200,
              })
              await sendMessage(chatId, '음성을 인식하지 못했어요. 텍스트로 다시 보내주시겠어요?')
            }
          } else {
            await closeProgressMessage(chatId, {
              finalText: buildProgressMessage({
                percent: 100,
                stage: '오류',
                current: '음성 파일 다운로드에 실패했어요.',
                startedAt: getProgressStartedAt(chatId) ?? Date.now(),
              }),
              lingerMs: 1000,
            })
            await sendMessage(chatId, '음성 파일을 다운로드하지 못했어요.')
          }
        }
        continue
      }

      // ── 사진 처리 ──
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1] // 가장 큰 사이즈
        console.log(`[${chatId}] 📷 사진 수신`)
        void setReaction(chatId, msg.message_id, '👀')
        await renderProgressMessage(chatId, buildProgressMessage({
          percent: 12,
          stage: '사진 접수',
          current: '사진을 받고 내용을 분석할 준비를 하고 있어요.',
          startedAt: Date.now(),
          recent: ['사진 메시지 수신'],
        }), { replyToMessageId: msg.message_id, startedAt: Date.now() })
        const localPath = join(TEMP_DIR, `photo_${Date.now()}.jpg`)
        const ok = await downloadTelegramFile(photo.file_id, localPath)
        if (ok) {
          try {
            await sendTyping(chatId)
            await renderProgressMessage(chatId, buildProgressMessage({
              percent: 22,
              stage: '이미지 분석',
              current: '사진 내용을 읽고 텍스트 맥락으로 바꾸는 중이에요.',
              startedAt: getProgressStartedAt(chatId) ?? Date.now(),
              recent: ['다운로드 완료', '이미지 분석 중'],
            }), { replyToMessageId: msg.message_id, startedAt: getProgressStartedAt(chatId) ?? Date.now() })
            const description = await describePhoto(localPath, msg.caption)
            // 사진 설명 + 원본 파일 경로를 컨텍스트로 handleMessage에 전달
            const photoText = msg.caption
              ? `[사진 전송 + 캡션: "${msg.caption}"] 저장 경로: ${localPath}\n[이미지 분석 결과] ${description}`
              : `[사진 전송] 저장 경로: ${localPath}\n[이미지 분석 결과] ${description}`
            const ac = new AbortController()
            processingAbort.set(chatId, ac)
            try {
              await handleMessage(chatId, photoText, ac.signal, msg.message_id)
            } finally {
              processingAbort.delete(chatId)
              // 메인 핸들러 완료 후 사진 파일 정리
              try { unlinkSync(localPath) } catch {}
            }
          } catch (err: any) {
            console.error('사진 분석 실패:', err.message)
            await closeProgressMessage(chatId, {
              finalText: buildProgressMessage({
                percent: 100,
                stage: '오류',
                current: '사진 분석 단계에서 문제가 생겼어요.',
                startedAt: getProgressStartedAt(chatId) ?? Date.now(),
                recent: ['이미지 분석 실패'],
              }),
              lingerMs: 1200,
            })
            await sendMessage(chatId, '사진을 분석하지 못했어요.')
          }
        }
        continue
      }

      // ── 파일(document) 처리 ──
      if (msg.document) {
        const doc = msg.document
        console.log(`[${chatId}] 📎 파일 수신: ${doc.file_name} (${doc.mime_type}, ${doc.file_size} bytes)`)
        void setReaction(chatId, msg.message_id, '📎')
        await renderProgressMessage(chatId, buildProgressMessage({
          percent: 12,
          stage: '파일 접수',
          current: '파일을 받고 읽을 수 있는 형태로 준비 중이에요.',
          startedAt: Date.now(),
          recent: [`파일 수신: ${doc.file_name}`],
        }), { replyToMessageId: msg.message_id, startedAt: Date.now() })
        const ext = doc.file_name?.split('.').pop() || 'bin'
        const localPath = join(TEMP_DIR, `doc_${Date.now()}.${ext}`)
        const ok = await downloadTelegramFile(doc.file_id, localPath)
        if (ok) {
          try {
            await sendTyping(chatId)
            await renderProgressMessage(chatId, buildProgressMessage({
              percent: 22,
              stage: '파일 준비',
              current: '파일 경로와 캡션을 정리해서 본문 처리로 넘기는 중이에요.',
              startedAt: getProgressStartedAt(chatId) ?? Date.now(),
              recent: ['다운로드 완료', '파일 맥락 정리 중'],
            }), { replyToMessageId: msg.message_id, startedAt: getProgressStartedAt(chatId) ?? Date.now() })
            const docText = msg.caption
              ? `[파일 수신: ${doc.file_name}] 저장 경로: ${localPath}\n[캡션] ${msg.caption}`
              : `[파일 수신: ${doc.file_name}] 저장 경로: ${localPath}`
            const ac = new AbortController()
            processingAbort.set(chatId, ac)
            try {
              await handleMessage(chatId, docText, ac.signal, msg.message_id)
            } finally {
              processingAbort.delete(chatId)
            }
          } catch (err: any) {
            console.error('파일 처리 실패:', err.message)
            await closeProgressMessage(chatId, {
              finalText: buildProgressMessage({
                percent: 100,
                stage: '오류',
                current: '파일 처리 단계에서 문제가 생겼어요.',
                startedAt: getProgressStartedAt(chatId) ?? Date.now(),
                recent: ['파일 처리 실패'],
              }),
              lingerMs: 1200,
            })
            await sendMessage(chatId, '파일을 처리하지 못했어요.')
          }
        } else {
          await closeProgressMessage(chatId, {
            finalText: buildProgressMessage({
              percent: 100,
              stage: '오류',
              current: '파일 다운로드에 실패했어요.',
              startedAt: getProgressStartedAt(chatId) ?? Date.now(),
            }),
            lingerMs: 1000,
          })
          await sendMessage(chatId, '파일을 다운로드하지 못했어요.')
        }
        continue
      }

      // ── 텍스트 메시지 ──
      if (!msg.text) continue

      // /start 명령어
      if (msg.text === '/start') {
        await sendMessage(chatId,
          `안녕하세요, 윌리(Willy)입니다. 🌿\n\n` +
          `사업 현황 보고, 전략 논의, 일정/위키 관리, 포트폴리오 모니터링을 담당합니다.\n\n` +
          `무엇이든 편하게 말씀해주세요. 음성 메시지, 사진도 인식해요.\n\n` +
          `/clear - 대화 초기화`
        )
        continue
      }

      // /clear - 대화 초기화
      if (msg.text === '/clear') {
        await saveConversation(chatId, [])
        await sendMessage(chatId, '대화 기록이 초기화되었습니다.')
        continue
      }

      // ── 중단 처리 ──
      const cancelKeywords = ['됐어', '그만', '취소', '했어', '됐다', '그만해', '스톱', 'stop', '취소해']
      const isCancelRequest = cancelKeywords.some(k => msg.text!.trim() === k || msg.text!.trim() === k + '.')
      if (isCancelRequest) {
        const existingAbortForCancel = processingAbort.get(chatId)
        if (existingAbortForCancel) {
          existingAbortForCancel.abort()
          processingAbort.delete(chatId)
          // 배칭 버퍼도 클리어
          const buf = messageBatchBuffer.get(chatId)
          if (buf) { clearTimeout(buf.timer); messageBatchBuffer.delete(chatId) }
          removePendingTask(BOT_INFLIGHT_FILE, chatId)
          await closeProgressMessage(chatId, {
            finalText: buildProgressMessage({
              percent: 100,
              stage: '중단',
              current: '사용자 요청으로 처리를 멈췄어요.',
              startedAt: getProgressStartedAt(chatId) ?? Date.now(),
              recent: ['사용자 취소 요청'],
            }),
            lingerMs: 900,
          })
          await sendMessage(chatId, '알겠어요, 중단했어요.')
          console.log(`[${chatId}] ⏹️ 사용자 요청으로 처리 중단`)
        } else {
          // 처리 중인 게 없으면 일반 메시지로 처리
          // fall through to normal handling
        }
        if (processingAbort.has(chatId)) continue
      }

      // 인용 답장(reply) 처리 — 원본 메시지를 맥락에 포함
      let messageText = msg.text
      if (msg.reply_to_message?.text) {
        const replyFrom = msg.reply_to_message.from?.is_bot ? '윌리' : 'CEO'
        messageText = `[인용된 메시지 (${replyFrom})]\n${msg.reply_to_message.text}\n\n[CEO 답장]\n${msg.text}`
      }

      // 메시지 배칭: 연달아 오는 메시지를 합쳐서 한 번에 처리
      // 처리 중에 새 메시지가 오면 기존 처리를 abort하고 합쳐서 재처리

      // 기존에 처리 중인 Claude 세션이 있으면 abort + 원본 텍스트 보존
      const existingAbort = processingAbort.get(chatId)
      if (existingAbort) {
        existingAbort.abort()
        // 처리 중이던 텍스트는 inFlightText에 이미 저장되어 있음
        console.log(`🔄 [${chatId}] 기존 처리 취소 — 새 메시지와 합침`)
      }

      const msgId = msg.message_id
      const existing = messageBatchBuffer.get(chatId)
      if (existing) {
        // 추가 메시지 도착 → 버퍼에 추가하고 타이머 리셋
        clearTimeout(existing.timer)
        existing.messages.push(messageText)
        existing.lastMessageId = msgId
        await updateQueuedProgress(chatId, {
          messageCount: existing.messages.length,
          replyToMessageId: msgId,
          phase: existingAbort ? 'restart' : 'merged',
        })
        console.log(`📦 메시지 배칭: ${existing.messages.length}개 누적 (chat ${chatId})`)
        existing.timer = setTimeout(async () => {
          const batch = messageBatchBuffer.get(chatId)
          messageBatchBuffer.delete(chatId)
          if (batch) {
            // abort된 이전 메시지가 있으면 앞에 합침
            const savedText = inFlightText.get(chatId)
            inFlightText.delete(chatId)
            const allMessages = savedText ? [savedText, ...batch.messages] : batch.messages
            const combined = allMessages.join('\n\n')
            console.log(`📨 배칭 완료: ${allMessages.length}개 메시지 통합 처리${savedText ? ' (이전 메시지 포함)' : ''}`)
            persistPendingMessage(chatId, combined, {
              lastMessageId: batch.lastMessageId,
              startedAt: Date.now(),
              phase: 'queued',
            })
            await updateQueuedProgress(chatId, {
              messageCount: allMessages.length,
              replyToMessageId: batch.lastMessageId,
              phase: 'starting',
            })
            const ac = new AbortController()
            processingAbort.set(chatId, ac)
            inFlightText.set(chatId, combined) // 처리 중 텍스트 보존
            try {
              await handleMessage(chatId, combined, ac.signal, batch.lastMessageId)
            } finally {
              processingAbort.delete(chatId)
              inFlightText.delete(chatId)
            }
          }
        }, MESSAGE_BATCH_DELAY)
      } else {
        // 첫 메시지 → 버퍼 생성하고 디바운스 타이머 시작
        await updateQueuedProgress(chatId, {
          messageCount: 1,
          replyToMessageId: msgId,
          phase: existingAbort ? 'restart' : 'queued',
          startedAt: Date.now(),
        })
        messageBatchBuffer.set(chatId, {
          messages: [messageText],
          lastMessageId: msgId,
          timer: setTimeout(async () => {
            const batch = messageBatchBuffer.get(chatId)
            messageBatchBuffer.delete(chatId)
            if (batch) {
              // abort된 이전 메시지가 있으면 앞에 합침
              const savedText = inFlightText.get(chatId)
              inFlightText.delete(chatId)
              const allMessages = savedText ? [savedText, ...batch.messages] : batch.messages
              const combined = allMessages.join('\n\n')
              if (allMessages.length > 1) {
                console.log(`📨 배칭 완료: ${allMessages.length}개 메시지 통합 처리${savedText ? ' (이전 메시지 포함)' : ''}`)
              }
              persistPendingMessage(chatId, combined, {
                lastMessageId: batch.lastMessageId,
                startedAt: Date.now(),
                phase: 'queued',
              })
              await updateQueuedProgress(chatId, {
                messageCount: allMessages.length,
                replyToMessageId: batch.lastMessageId,
                phase: 'starting',
              })
              const ac = new AbortController()
              processingAbort.set(chatId, ac)
              inFlightText.set(chatId, combined) // 처리 중 텍스트 보존
              try {
                await handleMessage(chatId, combined, ac.signal, batch.lastMessageId)
              } finally {
                processingAbort.delete(chatId)
                inFlightText.delete(chatId)
              }
            }
          }, MESSAGE_BATCH_DELAY),
        })
      }
    }
  }
}

// CLI mode: --weekly-briefing for manual trigger (doesn't start the bot loop)
if (process.argv.includes('--weekly-briefing')) {
  ;(async () => {
    console.log('📋 주간 브리핑 수동 실행...')
    // Load CEO chat_id
    const { data: chatData, error: chatError } = await supabase
      .from('telegram_conversations')
      .select('chat_id')
      .eq('bot_type', 'ceo')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (chatError || !chatData?.chat_id) {
      console.error('CEO chat_id를 찾을 수 없습니다', chatError?.message)
      process.exit(1)
    }
    await sendWeeklyBriefing(chatData.chat_id)
    console.log('✅ 완료')
    process.exit(0)
  })().catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
} else {
  main().catch((err) => {
    console.error('Fatal error:', err)
    releaseLock()
    process.exit(1)
  })
}
