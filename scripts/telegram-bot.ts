import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn, execSync } from 'child_process'
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { markdownToTelegramHtml } from './telegram-utils'

// ============================================================
// Config
// ============================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const MAX_HISTORY = 50 // 대화 기록 최대 보관 수
const MAX_AUTO_MESSAGES = 10 // 자동 메시지(브리핑/알림) 최대 보관 수
const POLL_INTERVAL = 1500 // ms
const MESSAGE_BATCH_DELAY = 5000 // 메시지 배칭 디바운스 대기 시간 (ms)
const PROACTIVE_CHECK_INTERVAL = 30 * 60 * 1000 // 30분마다 자율 점검
const LOCK_FILE = join(__dirname, 'logs', 'telegram-bot.lock')
const OFFSET_FILE = join(__dirname, 'logs', 'telegram-bot.offset')
const ALLOWED_USERS_FILE = join(__dirname, 'logs', 'willy-bot-users.json')
const WILLY_REG_CODE = '윌로우2026'
const WILLY_MAX_USERS = 2

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


async function sendMessage(chatId: number, text: string, maxRetries = 2) {
  // Telegram 메시지 길이 제한: 4096자
  const chunks = splitMessage(text, 4000)
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
            const delay = 1000 * (attempt + 1)
            console.log(`[sendMessage] ${delay}ms 후 재시도...`)
            await new Promise(r => setTimeout(r, delay))
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

// SPLIT 구분자를 처리하여 여러 메시지로 나눠 전송 (사람처럼 딜레이 포함)
async function sendSplitMessage(chatId: number, text: string) {
  const parts = text.split(/\n---SPLIT---\n/).map(p => p.trim()).filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    await sendMessage(chatId, parts[i])
    if (i < parts.length - 1) {
      await sendTyping(chatId)
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    // 줄바꿈 기준으로 자르기
    let splitIdx = remaining.lastIndexOf('\n', maxLen)
    if (splitIdx === -1 || splitIdx < maxLen / 2) splitIdx = maxLen
    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }
  return chunks
}

async function sendTyping(chatId: number) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
}

async function sendMessageWithButtons(chatId: number, text: string, buttons: { text: string; callback_data: string }[][]) {
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
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
    }
  }
  console.error(`[sendMessageWithButtons] 🚨 최종 전송 실패!`)
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || '',
  })
}

async function editMessage(chatId: number, messageId: number, text: string) {
  try {
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, 4000),
    })
  } catch { /* 동일 텍스트 등 무시 */ }
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
  // Claude Code에 이미지 분석 요청 (파일은 삭제하지 않음 — 메인 핸들러에서 직접 Read 가능하도록)
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE
    const prompt = caption
      ? `이 이미지를 분석해주세요. 사용자가 함께 보낸 메시지: "${caption}". 이미지에 보이는 내용을 간결하게 설명하세요.`
      : '이 이미지를 분석하고 내용을 간결하게 설명해주세요.'

    delete env.CLAUDE_CODE_SSE_PORT
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    const proc = spawn('claude', ['-p', '--output-format', 'json', '--verbose', '--dangerously-skip-permissions'], {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.on('close', () => {
      resolve(extractTextFromVerboseJson(stdout) || '이미지를 분석할 수 없었어요.')
    })
    proc.on('error', (err: Error) => {
      reject(err)
    })
    // Read tool로 이미지 경로 전달
    proc.stdin.write(`${filePath} 파일을 Read tool로 읽어서 분석해주세요. ${prompt}`)
    proc.stdin.end()
  })
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

// ============================================================
// ③ Attribute Catalog — key 자율 확장
// ============================================================
async function fetchAttributeCatalog(): Promise<string> {
  const { data: attrs } = await supabase
    .from('knowledge_attribute_catalog')
    .select('key_name, entity_type, level, description, data_type, importance, usage_count')
    .order('level', { ascending: true })
    .order('importance', { ascending: false })

  if (!attrs?.length) return ''

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

  return parts.join('\n')
}

// ============================================================
// ④ Prompt Sections — 프롬프트 자기 수정
// ============================================================
async function fetchPromptSections(): Promise<Record<string, { content: string; version: number; is_modifiable: boolean }>> {
  const { data: sections } = await supabase
    .from('agent_prompt_sections')
    .select('section_key, content, version, is_modifiable')

  const result: Record<string, { content: string; version: number; is_modifiable: boolean }> = {}
  if (sections) {
    for (const s of sections) {
      result[s.section_key] = { content: s.content, version: s.version, is_modifiable: s.is_modifiable }
    }
  }
  return result
}

async function fetchKnowledgeContext(): Promise<string> {
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
  const isCompact = total > 80 // 80개 초과 시 요약 모드

  const entityLimit = isCompact ? 15 : 50
  const relationLimit = isCompact ? 20 : 100
  const insightLimit = isCompact ? 8 : 20

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

  return parts.length ? parts.join('\n') : ''
}

async function fetchWikiContext(): Promise<string> {
  const { data: wikiNotes } = await supabase
    .from('work_wiki')
    .select('id, title, content, category, section, created_at')
    .order('created_at', { ascending: false })
    .limit(30)

  if (!wikiNotes?.length) return ''

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
      // HTML 태그 제거해서 plain text로
      const plainContent = n.content
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      const preview = plainContent.length > 500 ? plainContent.slice(0, 500) + '...' : plainContent
      sections.push(`- **${n.title}**${n.category ? ` [${n.category}]` : ''} (${n.created_at?.split('T')[0]})\n  ${preview}`)
    }
  }

  return sections.join('\n')
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

async function fetchDashboardContext(): Promise<string> {
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
    supabase.from('willow_mgmt_projects').select('*, client:willow_mgmt_clients(name)').order('created_at', { ascending: false }),
    supabase.from('willow_mgmt_clients').select('id, name').order('name'),
    supabase.from('willow_mgmt_milestones').select('*, project:willow_mgmt_projects(name, client:willow_mgmt_clients(name))').gte('target_date', formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))).order('target_date'),
    supabase.from('willow_mgmt_schedules').select('*, client:willow_mgmt_clients(name), tasks:willow_mgmt_tasks(*)').gte('schedule_date', todayStr).lte('schedule_date', weekLaterStr).order('schedule_date'),
    supabase.from('willow_mgmt_tasks').select('*, schedule:willow_mgmt_schedules(title)').eq('is_completed', false).order('deadline'),
    supabase.from('willow_mgmt_cash').select('*').order('created_at', { ascending: false }).limit(20),
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

  return sections.join('\n')
}

// ============================================================
// Tensw Todo data fetching (via Claude CLI + MCP)
// ============================================================
let tenswDataCache: string = ''
let tenswCacheTime = 0
const TENSW_CACHE_TTL = 10 * 60 * 1000 // 10분 캐시

async function fetchTenswContext(): Promise<string> {
  // 캐시가 유효하면 반환
  if (tenswDataCache && Date.now() - tenswCacheTime < TENSW_CACHE_TTL) {
    return tenswDataCache
  }

  try {
    console.log('🔄 텐소프트웍스 데이터 로딩 중...')
    const result = await askClaude(
      `텐소프트웍스 CEO 대시보드를 조회해서 아래 형식으로 정리해줘. MCP 도구(get_ceo_dashboard)를 사용해.

형식:
## 텐소프트웍스 현황
- 전체 프로젝트: N개 (활성 N개)
- 태스크 진행률: N%
- 미완료 CEO 할일: (목록)
- 프로젝트별 진행률: (목록)
- 최신 주간보고서: (목록)

데이터만 정리하고 부가 설명은 하지 마.`,
      { allowedTools: [TENSW_MCP_TOOLS] }
    )

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
- 격식 없이 편하게
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

    await sendTyping(ceoChatId)
    const typingInterval = setInterval(() => sendTyping(ceoChatId!), 4000)
    const response = await askClaude(prompt)
    clearInterval(typingInterval)

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

async function sendWeeklyBriefing(chatId: number) {
  console.log('📋 텐소프트웍스 주간 브리핑 생성 중 (Claude CLI 분석)...')
  await sendTyping(chatId)

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

  const typingInterval = setInterval(() => sendTyping(chatId), 4000)
  const response = await askClaude(prompt)
  clearInterval(typingInterval)

  await sendSplitMessage(chatId, response)

  await appendToConversation(chatId, { role: 'assistant', content: `[주간 브리핑]\n${response}`, timestamp: new Date().toISOString() })

  console.log('✅ 텐소프트웍스 주간 브리핑 전송 완료')
}

async function proactiveCheck() {
  if (!ceoChatId) return

  const now = new Date()
  const todayStr = formatDate(now)
  const hour = now.getHours()

  try {
    const dashboardContext = await fetchDashboardContext()
    const currentHash = simpleHash(dashboardContext)

    // 1) 아침 브리핑 (08:00~09:00, 하루 1회)
    if (hour >= 8 && hour < 9 && proactiveState.morningBriefSent !== todayStr) {
      console.log('🌅 아침 브리핑 생성 중...')
      await sendTyping(ceoChatId)

      const prompt = `${getMorningBriefPrompt()}\n\n# 현재 사업 데이터\n${dashboardContext}`
      const typingInterval = setInterval(() => sendTyping(ceoChatId!), 4000)
      const response = await askClaude(prompt)
      clearInterval(typingInterval)

      await sendSplitMessage(ceoChatId, response)
      proactiveState.morningBriefSent = todayStr
      saveProactiveState()

      // 대화 기록에도 저장 (락으로 보호)
      await appendToConversation(ceoChatId, { role: 'assistant', content: `[아침 브리핑]\n${response}`, timestamp: now.toISOString() })

      console.log('✅ 아침 브리핑 전송 완료')
      return
    }

    // 1.5) 텐소프트웍스 주간 브리핑 (월요일 10:30, 주 1회)
    const dayOfWeek = now.getDay() // 0=일, 1=월
    const minute = now.getMinutes()
    const weekId = `${now.getFullYear()}-W${Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`
    if (dayOfWeek === 1 && hour === 10 && minute >= 30 && proactiveState.weeklyBriefSent !== weekId) {
      await sendWeeklyBriefing(ceoChatId)
      proactiveState.weeklyBriefSent = weekId
      saveProactiveState()
      return
    }

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
- 축별(AI 인프라/지정학·안보/넥스트)로 정리
- 신고가 돌파/근접 종목은 강조
- 전일 대비 변동이 큰 종목 언급
- 리서치 T1 종목 중 주목할 움직임이 있으면 한 줄 언급
- 짧고 핵심적으로. 테이블 형식 선호.
- 텔레그램 메시지이므로 마크다운 최소화 (볼드, 줄바꿈 정도만)

## 스타일
- "{greeting}" 으로 시작
- 2~3 파트면 ---SPLIT--- 로 구분`
}

async function marketMonitorCheck() {
  if (!ceoChatId) return

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

    // 개장/마감 감지 후 20분 대기 — 실시간 가격이 반영될 시간 확보
    const MARKET_BRIEFING_DELAY = 20 * 60 * 1000
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

        await sendTyping(capturedChatId!)
        const typingInterval = setInterval(() => sendTyping(capturedChatId!), 4000)
        const response = await askClaude(prompt, { allowedTools: [PORTFOLIO_MCP_TOOLS] })
        clearInterval(typingInterval)

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

async function getWatchTopics(): Promise<WatchTopic[]> {
  const { data } = await supabase
    .from('telegram_watch_topics')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
  return (data as WatchTopic[]) || []
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
      { signal: AbortSignal.timeout(10000) }
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
          { signal: AbortSignal.timeout(8000) }
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
    const proc = spawn('python3', ['-c', pyScript], { timeout: 15000 })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.on('close', (code: number | null) => {
      if (code !== 0) { resolve([]); return }
      try { resolve(JSON.parse(stdout)) } catch { resolve([]) }
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
  '연합뉴스', '연합뉴스TV', '뉴스1',
  // 경제지
  '한국경제', '한국경제TV', '매일경제', '서울경제', '서울경제TV', '아시아경제', '이데일리', '머니투데이', '헤럴드경제', '파이낸셜뉴스', '이투데이', '인베스트조선',
  // 종합지/방송
  '조선일보', '조선비즈', '중앙일보', '동아일보', '한겨레', '경향신문', '국민일보',
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
    `🚨 [${b.topic}] ${b.news.title} (${b.news.source}, ${b.ageLabel})\n${b.news.link}`
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
    const [news, videos] = await Promise.all([
      searchGoogleNews(searchQuery, 5),
      searchYouTube(searchQuery, 2),
    ])

    if (!news.length && !videos.length) continue
    hasContent = true

    sections.push(`\n📌 *${topic.topic}*`)

    if (news.length) {
      // 신선도 순 정렬 + 기사 나이 표시
      const sorted = news
        .map(n => ({ ...n, ageMin: getNewsAgeMinutes(n.pubDate) }))
        .sort((a, b) => a.ageMin - b.ageMin)

      sections.push('뉴스:')
      for (const n of sorted) {
        const ageLabel = n.ageMin < Infinity ? `[${formatNewsAge(n.ageMin)}]` : ''
        sections.push(`• ${ageLabel} ${n.title}${n.source ? ` (${n.source})` : ''}`)
        sections.push(`  ${n.link}`)
      }
    }

    if (videos.length) {
      sections.push('유튜브:')
      for (const v of videos) {
        sections.push(`• ${v.title} — ${v.channelName} (${v.publishedAt})`)
        sections.push(`  https://youtu.be/${v.videoId}`)
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
- "📰 뉴스 다이제스트"로 시작
- 텔레그램용, 간결하게
${result.marketData}

## 검색 결과
${result.digest}`

  await sendTyping(ceoChatId)
  const typingInterval = setInterval(() => sendTyping(ceoChatId!), 4000)
  const response = await askClaude(prompt)
  clearInterval(typingInterval)

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
8. **코딩 & 시스템 관리**: 코드 수정, 파일 관리, git 작업, DB 마이그레이션 등 개발 작업 수행 가능 (풀 세션 모드)

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
{"type":"create_wiki","title":"노트 제목","content":"노트 내용 (마크다운 가능)","section":"willow-mgmt","category":"전략"}
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
{"type":"tensw_create_schedule","project_slug":"프로젝트slug","title":"일정 제목","start_date":"2026-03-15","end_date":"2026-03-20","milestone_type":"milestone"}
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
* section: "willow-mgmt" | "tensw-mgmt" | "akros" | "etf-etc"
* 액션 블록 앞뒤에 설명 텍스트를 자유롭게 추가하세요

## 풀 세션 모드 (코딩/개발 작업)
코딩이나 시스템 작업이 필요한 경우 풀 세션 모드가 활성화됩니다. 이 모드에서는:
- 파일 읽기/쓰기/편집 가능
- Bash 명령 실행 가능
- git 작업 가능 (단, push는 명시적 요청 시에만)
- DB 마이그레이션, API 수정 등 가능
- 작업 후 결과를 간결하게 보고 (변경 파일, 주요 수정 내용)
- 작업 디렉토리: /Volumes/PRO-G40/app-dev/willow-invt (Next.js 프로젝트)
- 중요: 파괴적 작업 전 반드시 확인 메시지 포함`

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

// verbose JSON에서 assistant 텍스트 추출 (result 필드 버그 우회)
function extractTextFromVerboseJson(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout)
    const events = Array.isArray(parsed) ? parsed : [parsed]
    // assistant 이벤트에서 텍스트 추출 (마지막 assistant 메시지 사용)
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
    // fallback: result 필드
    const resultEvent = events.find((e: { type: string }) => e.type === 'result')
    return resultEvent?.result?.trim() || ''
  } catch {
    return stdout.trim()
  }
}

function askClaude(prompt: string, opts?: { allowedTools?: string[]; fullSession?: boolean }): Promise<string> {
  return new Promise((resolve, reject) => {
    // CLAUDECODE 환경변수를 제거해야 중첩 세션 에러 방지
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_SSE_PORT
    delete env.CLAUDE_CODE_ENTRYPOINT
    delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS

    // --verbose + json: result 필드 버그 우회 — assistant 메시지에서 텍스트 추출
    const args = ['-p', '--output-format', 'json', '--verbose', '--dangerously-skip-permissions']
    // allowedTools: MCP 도구 + 파일 편집 도구 항상 포함
    const tools = [...(opts?.allowedTools || [])]
    tools.push('Edit', 'Write', 'Bash', 'Read', 'Glob', 'Grep')
    args.push('--allowedTools', tools.join(','))

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
        console.error('Claude CLI error:', stderr)
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ============================================================
// Action parser & executor
// ============================================================
interface ActionBlock {
  type: string
  [key: string]: unknown
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

async function executeAction(action: ActionBlock): Promise<string> {
  try {
    switch (action.type) {
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
        return `✅ 일정 등록: "${action.title}" (${action.schedule_date})`
      }

      case 'create_wiki': {
        const { error } = await supabase
          .from('work_wiki')
          .insert({
            user_id: 'dw.kim@willowinvt.com',
            title: action.title,
            content: action.content,
            section: action.section || 'willow-mgmt',
            category: action.category || null,
          })

        if (error) throw error
        return `✅ 위키 작성: "${action.title}"`
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
        return `✅ 뉴스 추적 등록: "${action.topic}" (키워드: ${keywords.join(', ')})`
      }

      case 'unwatch_topic': {
        const { error } = await supabase
          .from('telegram_watch_topics')
          .update({ is_active: false })
          .ilike('topic', `%${action.topic}%`)

        if (error) throw error
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
          }
        }

        if (includeYt) {
          const videos = await searchYouTube(query, 3)
          if (videos.length) {
            results.push('\n🎬 유튜브:')
            for (const v of videos) {
              results.push(`• ${v.title} — ${v.channelName}`)
              results.push(`  https://youtu.be/${v.videoId}`)
            }
          }
        }

        return results.length > 1 ? results.join('\n') : `검색 결과가 없습니다: "${query}"`
      }

      // ─── 온톨로지 액션 ───
      case 'knowledge_entity': {
        // 기존 엔티티 확인 (이름으로)
        const { data: existing } = await supabase
          .from('knowledge_entities')
          .select('id')
          .eq('name', action.name)
          .limit(1)
          .single()

        if (existing) {
          // 업데이트
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (action.description) updates.description = action.description
          if (action.properties) updates.properties = action.properties
          if (action.tags) updates.tags = action.tags
          await supabase.from('knowledge_entities').update(updates).eq('id', existing.id)
          return `🧠 엔티티 업데이트: "${action.name}"`
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
          return `🧠 엔티티 생성: "${action.name}" (${action.entity_type})`
        }
      }

      case 'knowledge_relation': {
        // subject와 object 엔티티 ID 조회
        const [{ data: subj }, { data: obj }] = await Promise.all([
          supabase.from('knowledge_entities').select('id').eq('name', action.subject).limit(1).single(),
          supabase.from('knowledge_entities').select('id').eq('name', action.object).limit(1).single(),
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
          return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}" (자동 생성: ${missing.join(', ') || 'none'})`
        }

        await supabase.from('knowledge_relations').insert({
          subject_id: subj.id,
          predicate: action.predicate,
          object_id: obj.id,
          properties: action.properties || {},
          source: 'conversation',
        })
        return `🔗 관계: "${action.subject}" —[${action.predicate}]→ "${action.object}"`
      }

      case 'knowledge_insight': {
        // 관련 엔티티 ID 조회
        const entityNames = (action.entity_names as string[]) || []
        const entityIds: string[] = []
        for (const name of entityNames) {
          const { data } = await supabase.from('knowledge_entities').select('id').eq('name', name).limit(1).single()
          if (data) entityIds.push(data.id)
        }

        await supabase.from('knowledge_insights').insert({
          content: action.content,
          insight_type: action.insight_type || 'observation',
          entity_ids: entityIds,
          context: action.context || '',
        })
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
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 태스크: ${result.slice(0, 200)}`
      }

      case 'tensw_change_status': {
        const result = await askClaude(
          `텐소프트웍스 태스크 ID "${action.task_id}"의 상태를 "${action.status}"로 변경해줘. 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 상태변경: ${result.slice(0, 200)}`
      }

      case 'tensw_create_schedule': {
        const result = await askClaude(
          `텐소프트웍스 프로젝트 "${action.project_slug}"에 새 일정을 생성해줘.
제목: ${action.title}
시작일: ${action.start_date}
${action.end_date ? `종료일: ${action.end_date}` : ''}
${action.milestone_type ? `유형: ${action.milestone_type}` : ''}
생성 결과만 간단히 알려줘.`,
          { allowedTools: [TENSW_MCP_TOOLS] }
        )
        tenswDataCache = '' // 캐시 무효화
        return `✅ 텐소프트웍스 일정: ${result.slice(0, 200)}`
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

        const { data: matches } = await supabase
          .from('agent_follow_ups')
          .select('id')
          .eq('status', 'open')
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
    return `⚠️ 액션 실행 실패 (${action.type}): ${err.message}`
  }
}

// ============================================================
// Message handler
// ============================================================
async function handleMessage(chatId: number, text: string, abortSignal?: AbortSignal, lastMessageId?: number) {
  console.log(`[${chatId}] User: ${text}`)

  // 처리현황 메시지 — 진행 단계를 실시간으로 업데이트 (try 밖에서 선언)
  let progressMsgId: number | null = null

  try {
    // 리액션으로 "읽었다" 표시 (abort 되더라도 문제 없음)
    if (lastMessageId) {
      await setReaction(chatId, lastMessageId, '👀')
    }

    const progressLines: string[] = []
    const progressStart = Date.now()

    const addProgress = async (line: string) => {
      const sec = ((Date.now() - progressStart) / 1000).toFixed(1)
      progressLines.push(`${line} (${sec}s)`)
      const display = progressLines.join('\n')
      if (progressMsgId) {
        await editMessage(chatId, progressMsgId, display)
      }
    }

    // 처리현황 메시지 전송
    const progressRes = await tg('sendMessage', { chat_id: chatId, text: '⏳ 처리 시작...' })
    progressMsgId = progressRes?.result?.message_id || null

    // 대시보드 + 위키 + 추적주제 + 텐소프트웍스 + 온톨로지 + 프롬프트섹션 + 속성카탈로그 + 팔로업 + 리서치 수집
    await addProgress('📂 컨텍스트 로드 중...')
    const [dashboardContext, wikiContext, watchTopics, tenswContext, knowledgeContext, promptSections, attrCatalog, followUpsContext, researchContext] = await Promise.all([
      fetchDashboardContext(),
      fetchWikiContext(),
      getWatchTopics(),
      fetchTenswContext(),
      fetchKnowledgeContext(),
      fetchPromptSections(),
      fetchAttributeCatalog(),
      fetchFollowUpsContext(),
      fetchResearchContext(),
    ])
    await addProgress('✅ 대시보드 · 위키 · 텐소프트 · KG · 리서치')

    // 대화 기록 조회
    const history = await getConversation(chatId)
    await addProgress(`✅ 대화기록 ${history.length}건`)

    // 추적 주제 컨텍스트
    const topicsText = watchTopics.length
      ? '\n## 뉴스 추적 주제\n' + watchTopics.map(t =>
          `- ${t.topic} [${t.category}] (키워드: ${t.keywords.join(', ')})`
        ).join('\n')
      : ''

    // 뉴스/검색 관련 메시지면 미리 검색해서 결과를 제공
    const newsKeywords = ['뉴스', '기사', '소식', '검색', '찾아', '알려줘', 'news', '최근', '요즘', '동향', '시장', '유가', '원유', '지수']
    const isNewsRelated = newsKeywords.some(k => text.includes(k))
    let prefetchedNews = ''

    if (isNewsRelated) {
      console.log('📰 뉴스 사전검색 중...')
      // 메시지에서 관련 주제/키워드 추출해서 검색
      const searchQueries: string[] = []

      // 등록된 주제 중 메시지와 관련된 것
      for (const t of watchTopics) {
        const topicWords = [t.topic, ...t.keywords]
        if (topicWords.some(w => text.includes(w) || text.includes(t.topic.split(' ')[0]))) {
          searchQueries.push(t.keywords.join(' OR '))
        }
      }

      // 메시지 자체도 검색어로 사용 (너무 길지 않으면)
      if (searchQueries.length === 0 && text.length < 50) {
        searchQueries.push(text.replace(/[?？뭐있어알려줘찾아봐]/g, '').trim())
      }

      if (searchQueries.length > 0) {
        await addProgress(`🔍 검색: ${searchQueries.map(q => '"' + q.slice(0, 20) + '"').join(', ')}`)
        // 뉴스 검색과 시장 데이터 병렬 수집
        const [newsResults, marketPrices] = await Promise.all([
          Promise.all(
            searchQueries.map(async q => {
              const [news, videos] = await Promise.all([
                searchGoogleNews(q, 5),
                searchYouTube(q, 3),
              ])
              return { query: q, news, videos }
            })
          ),
          fetchLiveMarketPrices(),
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
              parts.push(`  ${n.link}`)
            }
          }
          if (r.videos.length) {
            parts.push(`\n### 유튜브 "${r.query}":`)
            for (const v of r.videos) {
              parts.push(`- ${v.title} — ${v.channelName} (${v.publishedAt}) https://youtu.be/${v.videoId}`)
            }
          }
        }
        if (parts.length) {
          prefetchedNews = '\n\n# 실시간 검색 결과 (방금 검색)\n주의: [방금], [N분 전] 등 기사 신선도를 확인하세요. 시장 데이터와 뉴스 내용이 다르면 시장 데이터가 더 정확합니다.\n' + parts.join('\n')
        }
        const totalNews = newsResults.reduce((s, r) => s + r.news.length, 0)
        const totalVideos = newsResults.reduce((s, r) => s + r.videos.length, 0)
        await addProgress(`✅ 뉴스 ${totalNews}건 · 유튜브 ${totalVideos}건`)
      }
    }

    // 프롬프트 빌드 — 타임스탬프 포함하여 시간 맥락 제공
    const nowTs = new Date()
    const historyText = history.length
      ? '\n## 이전 대화\n' + history.map(m => {
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

# 텐소프트웍스 현황
${tenswContext}

# 투자 리서치 현황
${researchContext}

# 온톨로지 (지식 그래프)
${knowledgeContext}

# 업무위키
${wikiContext}
${followUpsContext}
${topicsText}
${prefetchedNews}
${historyText}

# 현재 시각 (중요: 오늘 날짜를 반드시 이 값 기준으로 판단하세요)
오늘: ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
시각: ${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}

# CEO 메시지
${text}

위 데이터를 참고하여 CEO의 메시지에 답하세요.`

    await addProgress(`📝 프롬프트 ${(fullPrompt.length / 1000).toFixed(0)}K자`)

    // abort 체크 — 새 메시지가 와서 이 처리가 취소된 경우
    if (abortSignal?.aborted) {
      if (progressMsgId) await deleteMsg(chatId, progressMsgId)
      console.log(`[${chatId}] ⏹️ 처리 취소됨 (새 메시지 수신)`)
      return
    }

    await addProgress('🤖 Claude 분석 중...')

    // 타이핑 유지 (Claude 처리 중)
    const typingInterval = setInterval(() => sendTyping(chatId), 4000)

    // 항상 풀 세션: Claude Code + 모든 도구 + MCP
    const response = await askClaude(fullPrompt, {
      fullSession: true,
      allowedTools: [TENSW_MCP_TOOLS, PORTFOLIO_MCP_TOOLS, WILLOW_MCP_TOOLS],
    })

    clearInterval(typingInterval)

    await addProgress(`✅ Claude 응답 ${(response.length / 1000).toFixed(1)}K자`)

    // abort 체크 — Claude 응답 후에도 새 메시지가 왔으면 취소
    if (abortSignal?.aborted) {
      if (progressMsgId) await deleteMsg(chatId, progressMsgId)
      console.log(`[${chatId}] ⏹️ Claude 응답 후 취소됨 (새 메시지 수신)`)
      return
    }

    // 액션 추출 및 실행
    const { cleanText, actions, buttons } = extractActions(response)

    // 액션 실행 결과 수집
    const actionResults: string[] = []
    for (const action of actions) {
      await addProgress(`⚡ 액션: ${action.type}`)
      console.log(`⚡ 액션 실행: ${action.type}`)
      const result = await executeAction(action)
      actionResults.push(result)
      console.log(`  → ${result}`)
    }
    if (actions.length) await addProgress(`✅ 액션 ${actions.length}건 완료`)

    // 처리현황 메시지 삭제
    if (progressMsgId) await deleteMsg(chatId, progressMsgId)

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

    // 대화 기록 저장 (락으로 보호)
    const now = new Date().toISOString()
    await withConversationLock(chatId, async () => {
      // 락 안에서 최신 히스토리를 다시 읽어서 레이스 컨디션 방지
      const freshHistory = await getConversation(chatId)
      freshHistory.push({ role: 'user', content: text, timestamp: now })
      freshHistory.push({ role: 'assistant', content: finalMessage, timestamp: now })
      await saveConversation(chatId, freshHistory)
    })

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
        await sendTyping(chatId)
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
      }
    }
    console.log(`[${chatId}] Bot: ${finalMessage.slice(0, 100)}...`)

  } catch (err) {
    if (progressMsgId) await deleteMsg(chatId, progressMsgId)
    console.error('Error handling message:', err)
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

  loadAllowedUsers()
  console.log(`📌 등록된 사용자: ${allowedChatIds.length}/${WILLY_MAX_USERS}`)

  // CEO chat_id 복원
  await loadCeoChatId()

  // 재시작 알림
  if (ceoChatId) {
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    await sendMessage(ceoChatId, `🔄 봇이 재시작되었어요. (${now})`)
  }

  // 자율 점검 루프 시작
  console.log(`🔄 자율 점검 활성화 (${PROACTIVE_CHECK_INTERVAL / 60000}분 간격)`)
  setInterval(proactiveCheck, PROACTIVE_CHECK_INTERVAL)
  // 시작 직후 1회 점검
  setTimeout(proactiveCheck, 5000)

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
          await setReaction(chatId, msg.message_id, '👂')
          const localPath = join(TEMP_DIR, `voice_${Date.now()}.ogg`)
          const ok = await downloadTelegramFile(fileId, localPath)
          if (ok) {
            try {
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
              await sendMessage(chatId, '음성을 인식하지 못했어요. 텍스트로 다시 보내주시겠어요?')
            }
          } else {
            await sendMessage(chatId, '음성 파일을 다운로드하지 못했어요.')
          }
        }
        continue
      }

      // ── 사진 처리 ──
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1] // 가장 큰 사이즈
        console.log(`[${chatId}] 📷 사진 수신`)
        await setReaction(chatId, msg.message_id, '👀')
        const localPath = join(TEMP_DIR, `photo_${Date.now()}.jpg`)
        const ok = await downloadTelegramFile(photo.file_id, localPath)
        if (ok) {
          try {
            await sendTyping(chatId)
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
            await sendMessage(chatId, '사진을 분석하지 못했어요.')
          }
        }
        continue
      }

      // ── 파일(document) 처리 ──
      if (msg.document) {
        const doc = msg.document
        console.log(`[${chatId}] 📎 파일 수신: ${doc.file_name} (${doc.mime_type}, ${doc.file_size} bytes)`)
        await setReaction(chatId, msg.message_id, '📎')
        const ext = doc.file_name?.split('.').pop() || 'bin'
        const localPath = join(TEMP_DIR, `doc_${Date.now()}.${ext}`)
        const ok = await downloadTelegramFile(doc.file_id, localPath)
        if (ok) {
          try {
            await sendTyping(chatId)
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
            await sendMessage(chatId, '파일을 처리하지 못했어요.')
          }
        } else {
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
