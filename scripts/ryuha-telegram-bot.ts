import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'

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
const POLL_INTERVAL = 1500
const MESSAGE_BATCH_DELAY = 4000
const LOG_DIR = join(__dirname, 'logs')
const LOCK_FILE = join(LOG_DIR, 'ryuha-bot.lock')
const OFFSET_FILE = join(LOG_DIR, 'ryuha-bot.offset')

// 류하 chat_id (첫 메시지 수신 시 등록)
let ryuhaChatId: number | null = null

// 메시지 배칭
const messageBatchBuffer: Map<number, { messages: string[]; timer: ReturnType<typeof setTimeout>; lastMessageId: number }> = new Map()

// 처리 중 메시지 취소
const processingAbort: Map<number, AbortController> = new Map()
const inFlightText: Map<number, string> = new Map()

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

async function sendMessage(chatId: number, text: string, maxRetries = 2) {
  const chunks = splitMessage(text, 4000)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    let sent = false
    for (let attempt = 0; attempt <= maxRetries && !sent; attempt++) {
      try {
        const res = await tg('sendMessage', {
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown',
        })
        if (res.result?.message_id) {
          sent = true
          console.log(`[send] chunk ${i + 1}/${chunks.length} (id: ${res.result.message_id})`)
        }
      } catch {
        try {
          const res = await tg('sendMessage', { chat_id: chatId, text: chunk })
          if (res.result?.message_id) {
            sent = true
            console.log(`[send] plain text chunk ${i + 1}/${chunks.length}`)
          }
        } catch (plainErr) {
          console.error(`[send] fail chunk ${i + 1}, attempt ${attempt + 1}:`, plainErr)
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }
    if (!sent) console.error(`[send] final fail chunk ${i + 1}/${chunks.length}`)
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break }
    let splitIdx = remaining.lastIndexOf('\n', maxLen)
    if (splitIdx === -1 || splitIdx < maxLen / 2) splitIdx = maxLen
    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }
  return chunks
}

async function sendTyping(chatId: number) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
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
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      await tg('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      })
      return
    } catch {
      try {
        await tg('sendMessage', {
          chat_id: chatId,
          text,
          reply_markup: { inline_keyboard: buttons },
        })
        return
      } catch (e) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000))
        else console.error('[sendButtons] fail:', e)
      }
    }
  }
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
  const { data } = await supabase
    .from('telegram_conversations')
    .select('messages')
    .eq('chat_id', chatId)
    .eq('bot_type', 'ryuha')
    .single()
  return data?.messages || []
}

async function saveConversation(chatId: number, messages: Message[]) {
  await supabase
    .from('telegram_conversations')
    .upsert({
      chat_id: chatId,
      bot_type: 'ryuha',
      messages: messages.slice(-MAX_HISTORY),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chat_id,bot_type' })
}

// ============================================================
// System Prompt
// ============================================================
function buildSystemPrompt(context: string, history: Message[]): string {
  const now = new Date()
  const timeStr = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]

  const historyText = history.length > 0
    ? history.map(m => {
        const t = new Date(m.timestamp)
        const tStr = t.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        return `[${tStr}] ${m.role === 'user' ? '류하' : '봇'}: ${m.content.slice(0, 300)}`
      }).join('\n')
    : '(첫 대화)'

  return `너는 류하의 학습 도우미 "공부친구"야.
류하는 초등학생이야. 친근한 친구처럼 반말로 대화해.

현재 시각: ${timeStr} (${dayOfWeek}요일)

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

## MCP 도구
류하가 일정/숙제/교재/체형 관련 요청을 하면 MCP 도구를 사용해.
도구 이름은 모두 ryuha_ 접두사.

### 일정 관리
- ryuha_list_schedules: 일정 조회 (start_date, end_date)
- ryuha_create_schedule: 일정 추가 (title, schedule_date 필수, type: 'homework'|'self_study')
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

## 응답 규칙
1. 텔레그램 메시지니까 짧고 읽기 쉽게!
2. 한 번에 너무 많은 정보 쏟아내지 마. 핵심만.
3. 일정/숙제 완료하면 크게 칭찬! 🎉🥳
4. 숙제 마감이 가까우면 부드럽게 알려줘 (절대 압박 X)
5. 여러 메시지로 나눌 때: \\n---SPLIT---\\n 사용
6. 선택지를 줄 때 버튼 제안:
\`\`\`buttons
[["오늘 일정 보기", "오늘 일정 알려줘"], ["숙제 확인", "숙제 뭐 있어?"]]
\`\`\`
7. 도구 실행 결과를 그대로 보여주지 마. 자연스럽게 요약해서 전달해.
8. 날짜는 "3월 30일 (일)" 형태로 읽기 쉽게.

## 현재 학습 현황
${context}

## 최근 대화
${historyText}`
}

// ============================================================
// Context builder
// ============================================================
async function buildContext(): Promise<string> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

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

  return parts.join('\n') || '(데이터 없음)'
}

// ============================================================
// Claude CLI
// ============================================================
const RYUHA_MCP_TOOLS = 'mcp__claude_ai_willow-dashboard__ryuha_*'

function extractTextFromVerboseJson(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout)
    const events = Array.isArray(parsed) ? parsed : [parsed]
    let lastText = ''
    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        const texts = event.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text)
        if (texts.length > 0) lastText = texts.join('\n').trim()
      }
    }
    if (lastText) return lastText
    const resultEvent = events.find((e: { type: string }) => e.type === 'result')
    return resultEvent?.result?.trim() || ''
  } catch {
    return stdout.trim()
  }
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_SSE_PORT
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    const args = ['-p', '--output-format', 'json', '--verbose', '--allowedTools', RYUHA_MCP_TOOLS]

    const proc = spawn('claude', args, {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(extractTextFromVerboseJson(stdout))
      } else {
        console.error('[claude] error:', stderr.slice(0, 500))
        reject(new Error(`Claude exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Claude spawn error: ${err.message}`))
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
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

  // ❤️ 리액션으로 "읽었다" 표시
  if (lastMessageId) {
    await setReaction(chatId, lastMessageId, '❤️')
  }

  await sendTyping(chatId)

  // Build context & history
  const [context, history] = await Promise.all([
    buildContext(),
    getConversation(chatId),
  ])

  if (abortSignal?.aborted) return

  // 무거운 질문이면 확인 메시지 전송
  const isHeavyQuery = userText.length > 50 || ['일정', '숙제', '진도', '현황', '알려줘', '보여줘', '정리', '기록'].some(k => userText.includes(k))
  if (isHeavyQuery) {
    const acks = ['잠깐만~ 확인해볼게! 🔍', '알겠어, 찾아볼게! 📚', '잠시만 기다려~ 👀', '확인하고 바로 알려줄게!']
    const ack = acks[Math.floor(Math.random() * acks.length)]
    await sendMessage(chatId, ack)
  }

  const systemPrompt = buildSystemPrompt(context, history)
  const fullPrompt = `${systemPrompt}\n\n---\n류하: ${userText}`

  // 타이핑 유지 (Claude 처리 중)
  const typingInterval = setInterval(() => sendTyping(chatId), 4000)

  try {
    const response = await askClaude(fullPrompt)

    clearInterval(typingInterval)

    if (abortSignal?.aborted) return

    const { messages, buttons } = parseResponse(response)

    // Send messages
    for (let i = 0; i < messages.length; i++) {
      if (!messages[i]) continue
      if (i === messages.length - 1 && buttons) {
        await sendMessageWithButtons(chatId, messages[i], buttons)
      } else {
        await sendMessage(chatId, messages[i])
      }
    }

    // Save conversation
    const newHistory = [
      ...history,
      { role: 'user' as const, content: userText, timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: response.slice(0, 1000), timestamp: new Date().toISOString() },
    ]
    await saveConversation(chatId, newHistory)

  } catch (err) {
    clearInterval(typingInterval)
    console.error('[handle] error:', err)
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
    processingAbort.delete(chatId)
  }

  const existing = messageBatchBuffer.get(chatId)
  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push(text)
    existing.lastMessageId = messageId
    existing.timer = setTimeout(() => flushBatch(chatId), MESSAGE_BATCH_DELAY)
  } else {
    const timer = setTimeout(() => flushBatch(chatId), MESSAGE_BATCH_DELAY)
    messageBatchBuffer.set(chatId, { messages: [text], timer, lastMessageId: messageId })
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

  try {
    await handleMessage(chatId, combinedText, ac.signal, batch.lastMessageId)
  } catch (err) {
    if (!ac.signal.aborted) {
      console.error('[flush] error:', err)
    }
  } finally {
    if (processingAbort.get(chatId) === ac) {
      processingAbort.delete(chatId)
    }
  }
}

// ============================================================
// Daily greeting (아침 인사)
// ============================================================
let lastGreetingDate = ''

async function checkMorningGreeting() {
  if (!ryuhaChatId) return

  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const hour = kst.getHours()
  const todayStr = kst.toISOString().split('T')[0]

  // 07:30~08:30 사이 한번만
  if (hour === 7 || (hour === 8 && kst.getMinutes() <= 30)) {
    if (lastGreetingDate === todayStr) return
    lastGreetingDate = todayStr

    console.log('[greeting] sending morning greeting')
    const context = await buildContext()
    const prompt = `너는 류하의 학습관리 도우미 봇 "공부친구"야.
현재 시각: ${kst.toLocaleString('ko-KR')}

오늘의 학습 현황:
${context}

류하에게 아침 인사를 해줘. 오늘 일정이 있으면 간단히 알려줘.
밝고 에너지 넘치게! 짧게 2-3문장으로.`

    try {
      const response = await askClaude(prompt)
      const { messages, buttons } = parseResponse(response)
      for (let i = 0; i < messages.length; i++) {
        if (!messages[i]) continue
        if (i === messages.length - 1 && buttons) {
          await sendMessageWithButtons(ryuhaChatId, messages[i], buttons)
        } else {
          await sendMessage(ryuhaChatId, messages[i])
        }
      }

      // Save to history
      const history = await getConversation(ryuhaChatId)
      await saveConversation(ryuhaChatId, [
        ...history,
        { role: 'assistant', content: `[아침 인사] ${response.slice(0, 500)}`, timestamp: new Date().toISOString() },
      ])
    } catch (err) {
      console.error('[greeting] error:', err)
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
          if (!ryuhaChatId) ryuhaChatId = cbChatId
          onNewMessage(cbChatId, cbData, cb.message?.message_id || 0)
        }
        continue
      }

      // Text message
      if (update.message?.text) {
        const chatId = update.message.chat.id
        const text = update.message.text

        if (!ryuhaChatId) {
          ryuhaChatId = chatId
          console.log(`[init] 류하 chat_id 등록: ${chatId}`)
        }

        // /start 명령어
        if (text === '/start') {
          await sendMessage(chatId, '안녕! 나는 공부친구야 📚\n\n공부 일정이나 숙제 관리를 도와줄게!\n\n"오늘 일정 알려줘", "숙제 뭐 있어?" 같이 편하게 말해줘 😊')
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

  process.on('SIGINT', () => { releaseLock(); process.exit(0) })
  process.on('SIGTERM', () => { releaseLock(); process.exit(0) })
  process.on('uncaughtException', (err) => {
    console.error('[fatal]', err)
    releaseLock()
    process.exit(1)
  })

  console.log('🎓 류하 공부친구 봇 시작!')

  // 아침 인사 체크 (30분 간격)
  setInterval(checkMorningGreeting, 30 * 60 * 1000)
  checkMorningGreeting()

  // Polling loop
  while (true) {
    await poll()
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
}

main()
