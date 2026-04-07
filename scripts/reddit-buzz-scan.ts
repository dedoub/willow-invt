import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

// ============================================================
// Reddit Buzz Scanner — 레딧 버즈 종목 스캔
// ============================================================
// 매일 오후 4:15 실행: 레딧/소셜 버즈 기반 종목 소싱 → 구조적 검증 → 텔레그램 전송
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const LOG_PREFIX = '[reddit-buzz]'

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

async function getCeoChatId(): Promise<number | null> {
  const { data } = await supabase
    .from('telegram_conversations')
    .select('chat_id')
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.chat_id ?? null
}

async function sendTelegramMessage(chatId: number, text: string) {
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
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500))
  }
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete (env as Record<string, string | undefined>).CLAUDECODE

    const args = ['-p', '--output-format', 'text', '--allowedTools', 'mcp__portfolio-monitor__*,WebSearch,WebFetch']

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

    // 15분 타임아웃 (웹 검색 포함이라 더 길게)
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (15min)'))
    }, 15 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function runRedditBuzzScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 오후 레딧 버즈 종목 스캔 시간입니다.

## 윌로우 포트폴리오 4축
- AI 인프라: SK하이닉스, 삼성전자, 시에나, 버티브, 블룸에너지, 아이렌, 오클로
- 지정학/안보: 한화에어로스페이스, 현대로템, 팔란티어, 로켓랩
- 넥스트: 디웨이브, 현대차
- ETF: 미래에셋증권

## 작업 순서

### 1단계: 레딧 버즈 수집
아래 서브레딧에서 최근 24시간 핫 포스트를 웹 검색으로 수집하세요:
- r/wallstreetbets (밈/모멘텀)
- r/stocks (가치/분석)
- r/investing (장기투자)
- r/options (옵션 플로우)

검색 쿼리 예시: "site:reddit.com/r/wallstreetbets most mentioned stocks today"
또는: "reddit wallstreetbets trending tickers ${dateStr}"

### 2단계: 버즈 종목 필터링
수집된 종목 중에서:
- 보유 종목과 겹치는 것 → 센티먼트 변화 체크
- 비보유 종목 중 4축 테마에 해당하는 것 → 신규 후보로 분류
- 밈/펌프 성격의 종목은 제외 (penny stock, meme coin 등)

### 3단계: 구조적 검증
신규 후보 종목 (최대 3개)에 대해:
- portfolio_check_stock으로 기본 시세 확인
- 12M 고점 대비 위치, 추세 방향
- 어떤 축에 해당하는지 태깅

### 4단계: 워치리스트 후보 제안
검증된 종목이 있으면 워치리스트 추가 후보로 제안

## 리포트 형식
텔레그램 메시지용으로 간결하게:
- 상단: "📡 레딧 버즈 스캔 (${dateStr})"
- [보유 종목 언급] 섹션: 보유 종목이 레딧에서 언급된 경우 센티먼트 요약
- [신규 발굴 후보] 섹션: 구조적 검증 통과한 종목 (없으면 "특이사항 없음")
- [시장 센티먼트] 섹션: 레딧 전체 분위기 한 줄
- "---SPLIT---"으로 분할 가능 (필요시만)

중요: 사실 기반 보고만. 추측/예측 금지. 레딧 출처 명시.`

  return askClaude(prompt)
}

async function main() {
  log('📡 레딧 버즈 스캔 시작')

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('❌ CEO chat_id를 찾을 수 없습니다.')
    process.exit(1)
  }

  try {
    const report = await runRedditBuzzScan()

    if (!report || report.length < 10) {
      log('⚠️ 리포트가 비어있거나 너무 짧습니다')
      await sendTelegramMessage(chatId, '📡 레딧 버즈 스캔: 데이터 수집에 실패했어요. 나중에 다시 시도할게요.')
      process.exit(1)
    }

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
    await sendTelegramMessage(chatId, '📡 레딧 버즈 스캔에서 오류가 발생했어요. 로그를 확인해주세요.')
    process.exit(1)
  }
}

main()
