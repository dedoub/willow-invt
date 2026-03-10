# 텔레그램 봇 + Claude Code 연동 가이드

텔레그램 봇을 만들고, Claude Code CLI를 AI 백엔드로 연결하는 방법입니다.
macOS와 Windows 환경 모두 다룹니다.

---

## 아키텍처

```
텔레그램 사용자
    ↓ 메시지 전송
텔레그램 봇 (Node.js)
    ↓ Long-polling으로 메시지 수신
메시지 핸들러
    ↓ 시스템 프롬프트 + 사용자 메시지 조합
Claude Code CLI 서브프로세스 (claude -p)
    ↓ stdin → 프롬프트 / stdout → 응답
텔레그램 메시지 전송
```

핵심은 `claude -p` (파이프 모드)를 subprocess로 호출해서, 프롬프트를 stdin에 쓰고 stdout으로 응답을 받는 것입니다. 별도 API 키 관리 없이 Claude Code의 인증을 그대로 활용합니다.

---

## 사전 준비

### 1. 텔레그램 봇 생성

1. 텔레그램에서 [@BotFather](https://t.me/botfather) 검색 → 대화 시작
2. `/newbot` 입력
3. 봇 이름(표시명) 입력 (예: `My AI Assistant`)
4. 봇 username 입력 (예: `my_ai_assistant_bot` — `_bot`으로 끝나야 함)
5. **API 토큰** 발급됨 → 안전하게 보관

### 2. Claude Code 설치

#### macOS

```bash
# Node.js (없으면)
brew install node

# Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 인증 (최초 1회 - 브라우저에서 Anthropic 로그인)
claude
```

#### Windows

```powershell
# Node.js: https://nodejs.org 에서 LTS 다운로드
# 또는:
winget install OpenJS.NodeJS.LTS

# Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 인증 (최초 1회)
claude
```

### 3. 프로젝트 초기화

```bash
mkdir my-telegram-bot && cd my-telegram-bot
npm init -y
npm install dotenv
npm install -D tsx typescript @types/node
```

### 4. 환경변수

`.env.local` 파일 생성:
```
TELEGRAM_BOT_TOKEN=7586966475:AAH1234567890abcdefghijklmnopqrstuvwx
```

---

## 기본 봇 코드

`bot.ts` 파일을 생성합니다.

```typescript
import { config } from 'dotenv'
config({ path: '.env.local' })

import { spawn } from 'child_process'

// ============================================================
// 설정
// ============================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// ============================================================
// 텔레그램 API
// ============================================================
async function tg(method: string, body: any) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function sendMessage(chatId: number, text: string) {
  // 텔레그램 메시지 길이 제한: 4096자
  const chunks = splitMessage(text, 4000)
  for (const chunk of chunks) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
    }).catch(async () => {
      // Markdown 파싱 실패 시 plain text 재시도
      await tg('sendMessage', { chat_id: chatId, text: chunk })
    })
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
    let idx = remaining.lastIndexOf('\n', maxLen)
    if (idx === -1 || idx < maxLen / 2) idx = maxLen
    chunks.push(remaining.slice(0, idx))
    remaining = remaining.slice(idx).trimStart()
  }
  return chunks
}

async function sendTyping(chatId: number) {
  await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
}

// ============================================================
// Claude Code CLI 연동 (핵심)
// ============================================================
function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // ★ 중요: CLAUDECODE 환경변수 제거 (중첩 세션 에러 방지)
    const env = { ...process.env }
    delete env.CLAUDECODE

    // Windows에서는 'claude.cmd'가 필요할 수 있음
    const isWindows = process.platform === 'win32'
    const cmd = isWindows ? 'claude.cmd' : 'claude'

    const args = [
      '-p',                              // 파이프 모드 (비대화형)
      '--output-format', 'text',         // 텍스트 출력
      '--dangerously-skip-permissions',  // 도구 사용 자동 허용
    ]

    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        console.error('Claude error:', stderr)
        reject(new Error(`Claude exit code ${code}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Claude 실행 실패: ${err.message}`))
    })

    // 프롬프트를 stdin으로 전달하고 닫기
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ============================================================
// 메시지 핸들러
// ============================================================
// 간단한 대화 기록 (인메모리)
const conversations = new Map<number, { role: string; content: string }[]>()
const MAX_HISTORY = 20

async function handleMessage(chatId: number, text: string) {
  console.log(`[${chatId}] User: ${text}`)

  try {
    // "입력 중..." 표시 유지
    const typingInterval = setInterval(() => sendTyping(chatId), 4000)

    // 대화 기록 가져오기
    const history = conversations.get(chatId) || []
    const historyText = history.length
      ? history.map(m =>
          `${m.role === 'user' ? '사용자' : '봇'}: ${m.content}`
        ).join('\n')
      : ''

    // 시스템 프롬프트 + 대화 기록 + 사용자 메시지
    const prompt = `당신은 텔레그램 봇으로 동작하는 AI 어시스턴트입니다.
간결하고 자연스럽게 대화하세요. 텔레그램 메시지이므로 너무 길지 않게.

${historyText ? `## 이전 대화\n${historyText}\n` : ''}
## 사용자 메시지
${text}`

    const response = await askClaude(prompt)
    clearInterval(typingInterval)

    // 대화 기록 저장
    history.push({ role: 'user', content: text })
    history.push({ role: 'assistant', content: response })
    if (history.length > MAX_HISTORY * 2) history.splice(0, 2)
    conversations.set(chatId, history)

    // 응답 전송
    await sendMessage(chatId, response)
    console.log(`[${chatId}] Bot: ${response.slice(0, 80)}...`)

  } catch (err) {
    console.error('Error:', err)
    await sendMessage(chatId, '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
  }
}

// ============================================================
// 텔레그램 Long-Polling
// ============================================================
async function getUpdates(offset: number): Promise<any[]> {
  try {
    const res = await fetch(
      `${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=30`,
      { signal: AbortSignal.timeout(35000) }
    )
    const data = await res.json() as any
    return data.ok ? data.result : []
  } catch {
    return []
  }
}

async function main() {
  const me = await tg('getMe', {}) as any
  if (!me.ok) {
    console.error('봇 토큰이 유효하지 않습니다.')
    process.exit(1)
  }
  console.log(`✅ Bot: @${me.result.username} (${me.result.first_name})`)
  console.log('📡 메시지 대기 중...\n')

  let offset = 0

  while (true) {
    const updates = await getUpdates(offset)

    for (const update of updates) {
      offset = update.update_id + 1

      const msg = update.message
      if (!msg?.text) continue

      // /start 명령어
      if (msg.text === '/start') {
        await sendMessage(msg.chat.id,
          '안녕하세요! Claude가 답변하는 AI 봇입니다.\n무엇이든 물어보세요.'
        )
        continue
      }

      // /clear - 대화 기록 초기화
      if (msg.text === '/clear') {
        conversations.delete(msg.chat.id)
        await sendMessage(msg.chat.id, '대화 기록이 초기화되었습니다.')
        continue
      }

      // 일반 메시지 처리
      await handleMessage(msg.chat.id, msg.text)
    }
  }
}

main().catch(console.error)
```

---

## 실행

### macOS

```bash
# 실행
npx tsx bot.ts

# 백그라운드 실행
nohup npx tsx bot.ts > bot.log 2>&1 &

# 로그 확인
tail -f bot.log

# 종료
pkill -f "bot.ts"
```

### Windows (PowerShell)

```powershell
# 실행
npx tsx bot.ts

# 백그라운드 실행
Start-Process -NoNewWindow -FilePath "npx" `
  -ArgumentList "tsx bot.ts" `
  -RedirectStandardOutput "bot.log" `
  -RedirectStandardError "bot-error.log"

# 로그 확인
Get-Content bot.log -Wait

# 종료
Get-Process node | Where-Object {$_.CommandLine -like "*bot.ts*"} | Stop-Process
```

텔레그램에서 봇에게 메시지를 보내면 Claude가 응답합니다.

---

## MCP 도구 연동 (선택)

Claude Code에 등록된 MCP 서버의 도구를 봇에서 사용할 수 있습니다.

### MCP 서버 등록

```bash
# 서버 등록 (macOS/Windows 공통)
claude mcp add my-tools -- node /path/to/mcp-server/index.js

# 확인
claude mcp list
# → my-tools: ✓ Connected
```

> **주의**: `claude mcp add` 명령어로 등록해야 `claude -p`에서 인식됩니다. `settings.json` 수동 편집은 인식 안 될 수 있습니다.

### 봇에서 MCP 도구 허용

```typescript
function askClaude(prompt: string, allowedTools?: string[]): Promise<string> {
  // ...
  const args = ['-p', '--output-format', 'text', '--dangerously-skip-permissions']

  if (allowedTools?.length) {
    args.push('--allowedTools', allowedTools.join(','))
  }
  // ...
}

// 사용 예
const response = await askClaude('DB에서 사용자 목록 조회해줘', [
  'mcp__my-tools__*',              // my-tools 서버의 모든 도구
  'mcp__supabase__execute_sql',    // 특정 도구만
])
```

---

## 고급 기능

### 중복 실행 방지 (Lock 파일)

```typescript
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs'

const LOCK_FILE = './bot.lock'

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8'))
    try {
      process.kill(pid, 0) // 프로세스 존재 확인만 (신호 안 보냄)
      console.error(`봇이 이미 실행 중 (PID: ${pid})`)
      return false
    } catch {
      unlinkSync(LOCK_FILE) // stale lock 제거
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid))
  return true
}

function releaseLock() {
  try { unlinkSync(LOCK_FILE) } catch {}
}

// main()에서:
if (!acquireLock()) process.exit(1)
process.on('SIGINT', () => { releaseLock(); process.exit(0) })
process.on('SIGTERM', () => { releaseLock(); process.exit(0) })
// Windows 추가:
process.on('SIGBREAK', () => { releaseLock(); process.exit(0) })
```

---

## 자연스러운 대화 구현

기본 봇은 "질문 → 응답" 패턴이지만, 실제 사람과의 대화처럼 만들려면 여러 가지 개선이 필요합니다.

### 1. 메시지 배칭 + AbortController (핵심)

사용자가 짧은 메시지를 연속으로 보내는 경우를 처리합니다. 단순 배칭만으로는 부족하고, **이미 처리 중이던 메시지를 abort하고 새 메시지와 합쳐서 재처리**하는 로직이 필요합니다.

```
사용자: "아 그리고"       → 5초 타이머 시작
사용자: "내일 일정도 확인해줘"  → 타이머 리셋, 두 메시지 합침
(5초 대기 후) → "아 그리고\n\n내일 일정도 확인해줘"를 한 번에 처리
```

처리 중에 새 메시지가 올 경우:
```
사용자: "오늘 뉴스 요약해줘"  → Claude 처리 시작
(10초 후)
사용자: "아크로스 관련으로"   → 기존 처리 abort, 원본 텍스트 보존
                            → "오늘 뉴스 요약해줘\n\n아크로스 관련으로" 합쳐서 재처리
```

```typescript
const BATCH_DELAY = 5000
const batchBuffer = new Map<number, {
  messages: string[]
  timer: ReturnType<typeof setTimeout>
  lastMessageId: number
}>()

// 처리 중인 Claude 세션의 AbortController
const processingAbort = new Map<number, AbortController>()
// abort 시 원본 메시지 보존 (새 메시지와 합칠 때 필요)
const inFlightText = new Map<number, string>()

// 폴링 루프에서 텍스트 메시지 수신 시:
function queueMessage(chatId: number, text: string, messageId: number) {
  // 기존에 처리 중인 Claude 세션이 있으면 abort
  const existingAbort = processingAbort.get(chatId)
  if (existingAbort) {
    existingAbort.abort()
    // inFlightText에 처리 중이던 텍스트가 이미 보존되어 있음
    console.log(`기존 처리 취소 — 새 메시지와 합침`)
  }

  const existing = batchBuffer.get(chatId)
  if (existing) {
    clearTimeout(existing.timer)
    existing.messages.push(text)
    existing.lastMessageId = messageId
  } else {
    batchBuffer.set(chatId, {
      messages: [text],
      lastMessageId: messageId,
      timer: null as any,
    })
  }

  const entry = batchBuffer.get(chatId)!
  entry.timer = setTimeout(async () => {
    const batch = batchBuffer.get(chatId)
    batchBuffer.delete(chatId)
    if (!batch) return

    // abort된 이전 메시지가 있으면 앞에 합침
    const savedText = inFlightText.get(chatId)
    inFlightText.delete(chatId)
    const allMessages = savedText
      ? [savedText, ...batch.messages]
      : batch.messages
    const combined = allMessages.join('\n\n')

    const ac = new AbortController()
    processingAbort.set(chatId, ac)
    inFlightText.set(chatId, combined) // 처리 중 텍스트 보존

    try {
      await handleMessage(chatId, combined, ac.signal, batch.lastMessageId)
    } finally {
      processingAbort.delete(chatId)
      inFlightText.delete(chatId)
    }
  }, BATCH_DELAY)
}
```

`handleMessage`에도 abort 체크를 추가합니다:
```typescript
async function handleMessage(
  chatId: number,
  text: string,
  abortSignal?: AbortSignal,
  lastMessageId?: number
) {
  // ... 데이터 수집 등 ...

  // abort 체크 — 새 메시지가 와서 이 처리가 취소된 경우
  if (abortSignal?.aborted) {
    console.log(`처리 취소됨 (새 메시지 수신)`)
    return
  }

  const response = await askClaude(prompt)

  // Claude 응답 후에도 다시 abort 체크
  if (abortSignal?.aborted) {
    console.log(`응답 후 취소됨`)
    return
  }

  // ... 응답 전송 ...
}
```

### 2. 빠른 읽음 확인 (리액션 + 타이핑)

Claude 처리는 10~60초 걸릴 수 있습니다. 사용자가 "읽었는지" 알 수 있도록 즉시 반응합니다.

```typescript
async function setReaction(chatId: number, messageId: number, emoji: string) {
  try {
    await tg('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }],
    })
  } catch { /* 리액션 실패해도 무시 */ }
}

// handleMessage 시작 시:
if (lastMessageId) {
  await setReaction(chatId, lastMessageId, '👀') // "읽었다" 표시 (abort되어도 안전)
}

// 무거운 질문이면 확인 메시지도 전송 (abort 체크 후에!)
const heavyKeywords = ['분석', '요약', '검색', '브리핑', '리뷰']
const isHeavy = heavyKeywords.some(k => text.includes(k)) || text.length > 80

if (isHeavy) {
  const acks = ['확인 중이에요.', '살펴볼게요, 잠시만요.', '확인해볼게요.']
  await sendMessage(chatId, acks[Math.floor(Math.random() * acks.length)])
}
```

> **팁**: 리액션(`👀`)은 abort되어도 문제없지만, 확인 메시지("확인 중이에요")는 abort 체크 후에 보내야 합니다. 그렇지 않으면 취소된 처리에서 고아 메시지가 남습니다.

### 3. 멀티 메시지 응답 (---SPLIT---)

긴 응답을 한 덩어리로 보내면 벽처럼 보입니다. AI가 자연스럽게 여러 메시지로 나눠 보내도록 합니다.

**프롬프트에 지시:**
```
응답이 자연스럽게 여러 파트로 나뉠 때는 \n---SPLIT---\n 구분자를 넣으세요.
시스템이 이걸 여러 메시지로 나눠 보냅니다.
예: "네 확인할게요\n---SPLIT---\n(분석 결과) 현재 상황은..."
단, 짧은 응답은 나누지 마세요.
```

**전송 코드:**
```typescript
const messageParts = response
  .split(/\n---SPLIT---\n/)
  .map(p => p.trim())
  .filter(Boolean)

for (let i = 0; i < messageParts.length; i++) {
  await sendMessage(chatId, messageParts[i])

  // 멀티 메시지일 때 사이에 짧은 딜레이 (사람처럼)
  if (i < messageParts.length - 1) {
    await sendTyping(chatId)
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500))
  }
}
```

### 4. 타임스탬프 대화 기록

대화 기록에 시간 정보를 포함하면 AI가 맥락을 더 잘 이해합니다.

```typescript
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string  // ISO string
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

// 프롬프트에 포함할 때:
const now = new Date()
const historyText = history.map(m => {
  const ts = m.timestamp ? new Date(m.timestamp) : null
  const timeLabel = ts ? formatTimeAgo(ts, now) : ''
  const prefix = m.role === 'user' ? '사용자' : '봇'
  return `[${timeLabel}] ${prefix}: ${m.content}`
}).join('\n')
```

이렇게 하면 "어제 오후에 이야기하다가 이어서..." 같은 맥락이 자연스럽게 이어집니다.

### 5. 취소/중단 처리

사용자가 "됐어", "그만", "취소" 등을 입력하면 진행 중인 처리를 중단합니다.

```typescript
// 폴링 루프에서:
const cancelKeywords = ['됐어', '그만', '취소', 'stop', '그만해']
const isCancel = cancelKeywords.some(k => msg.text.trim() === k)

if (isCancel) {
  const existing = processingAbort.get(chatId)
  if (existing) {
    existing.abort()
    processingAbort.delete(chatId)
    // 배칭 버퍼도 클리어
    const buf = batchBuffer.get(chatId)
    if (buf) { clearTimeout(buf.timer); batchBuffer.delete(chatId) }
    await sendMessage(chatId, '알겠어요, 중단했어요.')
  }
  continue
}
```

### 6. 음성 메시지 지원

텔레그램에서 보낸 음성 메시지를 텍스트로 변환해서 처리합니다.

**의존성:**
```bash
# Whisper (OpenAI 오픈소스 음성인식)
pip install openai-whisper
```

```typescript
async function transcribeVoice(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      '-m', 'whisper', filePath,
      '--language', 'ko',   // 언어 설정
      '--model', 'base',    // tiny/base/small/medium/large
      '--output_format', 'txt',
      '--output_dir', '/tmp'
    ], { timeout: 60000 })

    proc.on('close', () => {
      const txtPath = filePath.replace(/\.[^.]+$/, '.txt')
      if (existsSync(txtPath)) {
        resolve(readFileSync(txtPath, 'utf-8').trim())
      } else {
        reject(new Error('Whisper 변환 실패'))
      }
    })
  })
}

// 폴링 루프에서:
if (msg.voice || msg.audio) {
  const fileId = msg.voice?.file_id || msg.audio?.file_id
  // 1) Telegram에서 파일 다운로드 (getFile API → fetch)
  // 2) Whisper로 변환
  const transcribed = await transcribeVoice(localPath)
  // 3) "[음성 메시지] 변환된 텍스트" 형태로 handleMessage에 전달
  await handleMessage(chatId, `[음성 메시지] ${transcribed}`)
}
```

**프롬프트에 지시:**
```
[음성 메시지] 태그가 있으면 음성을 텍스트로 변환한 것입니다.
음성 특유의 구어체/불완전한 문장을 자연스럽게 이해하세요.
```

### 7. 사진 분석

사진을 Claude에게 보내서 분석한 결과를 대화 맥락에 포함합니다.

```typescript
async function describePhoto(filePath: string, caption?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE

    const prompt = caption
      ? `이 이미지를 분석해주세요. 사용자 메시지: "${caption}". 내용을 간결하게 설명하세요.`
      : '이 이미지를 분석하고 내용을 간결하게 설명해주세요.'

    const proc = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions'], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    proc.on('close', () => resolve(stdout.trim()))

    // Claude Code의 Read 도구로 이미지 분석
    proc.stdin.write(`${filePath} 파일을 Read tool로 읽어서 분석해주세요. ${prompt}`)
    proc.stdin.end()
  })
}

// 폴링 루프에서:
if (msg.photo && msg.photo.length > 0) {
  const photo = msg.photo[msg.photo.length - 1] // 가장 큰 사이즈
  // 다운로드 → 분석 → handleMessage
  const description = await describePhoto(localPath, msg.caption)
  await handleMessage(chatId, `[사진 전송]\n[이미지 분석 결과] ${description}`)
}
```

### 8. 인라인 키보드 버튼

AI 응답에 후속 액션 버튼을 달아서 사용자가 탭 한 번으로 이어갈 수 있게 합니다.

**프롬프트에 지시:**
```
후속 액션을 제안하고 싶으면 텍스트 끝에 아래 형식으로 버튼을 추가하세요.
버튼은 상황에 맞을 때만 넣으세요. 간단한 대화에는 불필요.

```buttons
[["상세 보기", "자세히 알려줘"], ["오늘 일정", "오늘 일정 확인해줘"]]
```

형식: [[버튼텍스트, 클릭시보낼메시지], ...] — 최대 3개
```

**파싱 + 전송:**
```typescript
function extractButtons(text: string) {
  const buttonRegex = /```buttons\n([\s\S]*?)```/g
  const match = buttonRegex.exec(text)
  const cleanText = text.replace(/```buttons\n[\s\S]*?```/g, '').trim()
  let buttons: { text: string; callback_data: string }[][] = []

  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim())
      buttons = parsed.map((row: string[]) =>
        row.length === 2
          ? [{ text: row[0], callback_data: row[1] }]
          : []
      ).filter((r: any[]) => r.length)
    } catch { /* 파싱 실패 무시 */ }
  }

  return { cleanText, buttons }
}

async function sendMessageWithButtons(
  chatId: number,
  text: string,
  buttons: { text: string; callback_data: string }[][]
) {
  await tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  })
}

// 버튼 클릭 처리 (폴링 루프에서):
if (update.callback_query) {
  const cb = update.callback_query
  await tg('answerCallbackQuery', { callback_query_id: cb.id })
  // callback_data를 일반 메시지처럼 처리
  queueMessage(cb.message.chat.id, cb.data, cb.message.message_id)
}
```

### 9. 인용 답장 처리

사용자가 이전 메시지를 인용(reply)해서 보내면 맥락을 포함합니다.

```typescript
let messageText = msg.text
if (msg.reply_to_message?.text) {
  const replyFrom = msg.reply_to_message.from?.is_bot ? '봇' : '사용자'
  messageText = `[인용된 메시지 (${replyFrom})]\n${msg.reply_to_message.text}\n\n[사용자 답장]\n${msg.text}`
}
```

### 10. 시간 인식 프롬프트

현재 시각을 프롬프트에 포함하면 AI가 시간대에 맞는 자연스러운 반응을 합니다.

```typescript
// 프롬프트에 현재 시각 포함
const currentTime = new Date().toLocaleString('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short'
})

const prompt = `${systemPrompt}

# 현재 시각
${currentTime}

# 사용자 메시지
${text}`
```

**프롬프트에 시간대 인식 지시:**
```
현재 시각 정보가 주어집니다. 시간에 맞는 자연스러운 반응:
- 심야(00~06시): "이 시간에도 일하시네요", "늦었는데 내일 해도 될 것 같아요"
- 이른 아침(06~08시): "일찍 시작하시네요"
- 업무시간(09~18시): 평상시
- 저녁(18~22시): 가끔 "오늘 수고하셨어요"
단, 매번 시간 언급하면 부자연스러우니 가끔만.
```

### 11. 자율 알림 (Proactive Alerts)

봇이 주기적으로 데이터를 확인하고, 필요할 때 먼저 말을 겁니다.

```typescript
const PROACTIVE_INTERVAL = 30 * 60 * 1000 // 30분마다

// main()에서:
setInterval(() => proactiveCheck(), PROACTIVE_INTERVAL)

async function proactiveCheck() {
  if (!targetChatId) return

  const hour = new Date().getHours()
  const isWorkHours = hour >= 9 && hour <= 21
  if (!isWorkHours) return

  // 1) 아침 브리핑 (08~09시, 하루 1회)
  if (hour >= 8 && hour < 9 && !todayBriefSent) {
    const data = await fetchYourData()
    const response = await askClaude(`
      오늘의 핵심 사항을 자연스럽게 알려주세요.
      보고서 스타일이 아니라 동료에게 카톡하듯 간결하게.
      ${data}
    `)
    await sendMessage(targetChatId, response)
    todayBriefSent = true
    return
  }

  // 2) 이상 탐지 시 알림
  const data = await fetchYourData()
  const response = await askClaude(`
    아래 데이터를 검토하고, 지금 즉시 알려야 할 사항이 있으면 자연스럽게 말을 거세요.
    알릴 사항이 없으면 "SKIP" 한 단어만 출력하세요.
    ${data}
  `)

  if (response.trim() !== 'SKIP') {
    await sendMessage(targetChatId, response)
  }
}
```

> **팁**: 중복 알림 방지를 위해 이미 보고한 사항을 목록으로 관리하고, 프롬프트에 포함시키세요.

### 12. 대화 톤/길이 매칭

프롬프트에 명시적으로 톤과 길이 규칙을 지시합니다:

```
## 대화 스타일
이것은 텔레그램 메시지입니다. 보고서가 아니라 사람과의 대화처럼 하세요.

### 응답 길이 규칙
- 사용자 메시지가 짧으면(~20자 이하) 답도 짧게. "네 알겠어요" 수준으로.
- 질문이면 핵심만 답하고, 필요하면 후속 질문.
- 분석 요청일 때만 구조화된 긴 답변.
- 불릿 포인트는 정말 필요할 때만. 대부분은 자연어로 충분.

### 톤
- 격식체 X, 자연스러운 존댓말. "~합니다" 보다 "~해요" 선호.
- 이모지는 자연스럽게, 과하지 않게. 문장 끝에 하나 정도.
```

---

## 플랫폼별 차이 요약

| 항목 | macOS | Windows |
|------|-------|---------|
| Node.js 설치 | `brew install node` | `winget install OpenJS.NodeJS.LTS` |
| Claude 설치 | `npm install -g @anthropic-ai/claude-code` | 동일 |
| Claude 명령어 | `claude` | `claude.cmd` (spawn 시) |
| 백그라운드 실행 | `nohup ... &` | `Start-Process -NoNewWindow` |
| 프로세스 종료 | `pkill -f "bot.ts"` | 작업관리자 또는 `Stop-Process` |
| 종료 시그널 | `SIGINT`, `SIGTERM` | + `SIGBREAK` 추가 필요 |
| 파일 경로 | `/Users/name/...` | `C:\Users\name\...` |

---

## 트러블슈팅

### "Claude Code cannot be launched inside another Claude Code session"

Claude Code 안에서 봇을 실행하면 발생합니다.

```typescript
// 해결: CLAUDECODE 환경변수 제거
const env = { ...process.env }
delete env.CLAUDECODE
spawn('claude', args, { env, ... })
```

### MCP 도구가 안 보임

```bash
# settings.json 수동 편집이 아닌, CLI로 등록
claude mcp add my-server -- node /path/to/server.js
claude mcp list  # ✓ Connected 확인
```

### Markdown 파싱 에러

텔레그램 Markdown은 제한적입니다 (`*bold*`, `_italic_`, `` `code` `` 정도).
파싱 실패 시 plain text로 fallback하는 코드를 넣으세요 (위 예제에 포함).

### 응답이 느릴 때

Claude CLI 호출은 10~60초 걸릴 수 있습니다:
- `sendTyping()`을 4초마다 호출 → "입력 중..." 표시 유지
- 무거운 질문엔 "확인해볼게요" 같은 빠른 메시지를 먼저 전송

### Windows에서 spawn 실패

```typescript
// claude → claude.cmd로 변경
const isWindows = process.platform === 'win32'
const cmd = isWindows ? 'claude.cmd' : 'claude'
spawn(cmd, args, { shell: isWindows, ... })
```

---

## 빠른 시작 요약

```bash
# 1. BotFather에서 봇 생성 → 토큰 받기
# 2. Claude Code 설치 + 인증
npm install -g @anthropic-ai/claude-code && claude

# 3. 프로젝트 생성
mkdir my-bot && cd my-bot
npm init -y && npm install dotenv && npm install -D tsx

# 4. .env.local에 토큰 저장
echo 'TELEGRAM_BOT_TOKEN=토큰' > .env.local

# 5. bot.ts 작성 (위 코드 참고)
# 6. 실행
npx tsx bot.ts
```

텔레그램에서 봇에게 메시지를 보내면 Claude가 답합니다.
