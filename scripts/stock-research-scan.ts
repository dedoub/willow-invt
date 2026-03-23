import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

// ============================================================
// Stock Research Scanner — 종목 발굴 스캔
// ============================================================
// 매일 아침 9시 실행: portfolio_scan + 종목 발굴 리포트 생성 → 텔레그램 전송
// 수요일에는 레딧 버즈 주간 스캔도 추가 실행
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const LOG_PREFIX = '[stock-research]'

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

async function getCeoChatId(): Promise<number | null> {
  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  return data?.chat_id ?? null
}

async function sendTelegramMessage(chatId: number, text: string) {
  // 텔레그램 메시지 4096자 제한 처리
  const MAX_LEN = 4000
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining)
      break
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN)
    if (splitAt < 100) splitAt = MAX_LEN
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    })
    if (!res.ok) {
      log(`❌ 텔레그램 전송 실패: ${res.status} ${await res.text()}`)
    }
    // 연속 전송 시 rate limit 방지
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500))
  }
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete (env as Record<string, string | undefined>).CLAUDECODE

    const args = ['-p', '--output-format', 'text', '--allowedTools', 'mcp__portfolio-monitor__*']

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
        resolve(stdout.trim())
      } else {
        log(`Claude CLI error: ${stderr}`)
        reject(new Error(`Claude exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    // 10분 타임아웃
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (10min)'))
    }, 10 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function runDailyScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayOfWeek = now.getDay() // 0=일, 3=수

  let prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 아침 종목 발굴 스캔 시간입니다.

아래 작업을 순서대로 수행하고, CEO에게 텔레그램으로 보낼 간결한 리포트를 작성하세요.

## 1단계: 포트폴리오 전체 스캔
portfolio_scan 도구를 사용해서 보유 종목 전체 스캔을 돌려주세요.
- 신고가 돌파/근접 종목
- 부진 종목 (12M 고점 대비 -20% 이상)
- 주요 시그널

## 2단계: 종목 발굴
portfolio_watchlist 도구로 현재 워치리스트를 확인하고,
portfolio_signals 도구로 시그널 현황을 확인하세요.

## 리포트 형식
텔레그램 메시지로 보낼 거라 간결하게 작성해주세요.
- 이모지 적절히 사용
- 핵심 수치 위주
- 신호 없으면 "특이사항 없음"으로 짧게
- "---SPLIT---"으로 메시지 분할 가능 (너무 길 때만)
- 리포트 상단에 "🔍 종목 리서치 데일리 스캔 (${dateStr})" 제목 포함

중요: 도구 호출 결과만 기반으로 사실만 보고. 추측이나 예측 금지.`

  // 수요일에는 레딧 버즈 스캔도 추가
  if (dayOfWeek === 3) {
    prompt += `

## 3단계: 주간 테마 스캔 (수요일 추가)
이번 주 주목할 테마나 섹터 변화가 있는지 포트폴리오 데이터를 기반으로 분석해주세요.
- 섹터별 모멘텀 변화
- 워치리스트 중 진입 시그널 근접 종목
- 리포트에 "[주간 테마]" 섹션으로 추가`
  }

  return askClaude(prompt)
}

async function main() {
  log('🔍 종목 리서치 스캔 시작')

  // CEO chat_id 조회
  const chatId = await getCeoChatId()
  if (!chatId) {
    log('❌ CEO chat_id를 찾을 수 없습니다. 텔레그램 봇에서 먼저 메시지를 보내야 합니다.')
    process.exit(1)
  }

  try {
    const report = await runDailyScan()

    if (!report || report.length < 10) {
      log('⚠️ 리포트가 비어있거나 너무 짧습니다')
      await sendTelegramMessage(chatId, '🔍 종목 리서치 스캔: 데이터 조회에 실패했어요. 나중에 다시 시도할게요.')
      process.exit(1)
    }

    // ---SPLIT--- 처리
    const parts = report.split(/\n---SPLIT---\n/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) {
        await sendTelegramMessage(chatId, trimmed)
        if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
      }
    }

    log(`✅ 리포트 전송 완료 (${parts.length}개 메시지)`)
  } catch (err) {
    log(`❌ 스캔 실패: ${err}`)
    await sendTelegramMessage(chatId, '🔍 종목 리서치 스캔에서 오류가 발생했어요. 로그를 확인해주세요.')
    process.exit(1)
  }
}

main()
