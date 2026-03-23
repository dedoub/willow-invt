import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

// ============================================================
// Portfolio Briefing — 장 개장/마감 포트폴리오 브리핑
// ============================================================
// --session kr-open   : 한국장 개장 (09:05)
// --session kr-close  : 한국장 마감 (15:35)
// --session us-open   : 미국장 개장 (23:35 써머타임)
// --session us-close  : 미국장 마감 (06:05 써머타임)
// ============================================================

type Session = 'kr-open' | 'kr-close' | 'us-open' | 'us-close'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const LOG_PREFIX = '[portfolio-briefing]'

function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

function getSession(): Session {
  const idx = process.argv.indexOf('--session')
  if (idx === -1 || !process.argv[idx + 1]) {
    log('Usage: --session <kr-open|kr-close|us-open|us-close>')
    process.exit(1)
  }
  const s = process.argv[idx + 1] as Session
  if (!['kr-open', 'kr-close', 'us-open', 'us-close'].includes(s)) {
    log(`Invalid session: ${s}`)
    process.exit(1)
  }
  return s
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
  const MAX_LEN = 4000
  const chunks: string[] = []
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
      log(`Telegram send failed: ${res.status} ${await res.text()}`)
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500))
  }
}

async function loadTradesSummary(): Promise<string> {
  const { data: trades } = await supabase
    .from('stock_trades')
    .select('ticker, company_name, market, trade_type, quantity, price, total_amount, currency')
    .order('trade_date', { ascending: true })

  if (!trades || trades.length === 0) return '(거래 내역 없음)'

  // 종목별 평균매수단가, 보유수량, 투자원금 계산
  const holdings: Record<string, {
    name: string, market: string, currency: string,
    totalQty: number, totalCost: number
  }> = {}

  for (const t of trades) {
    if (!holdings[t.ticker]) {
      holdings[t.ticker] = {
        name: t.company_name, market: t.market, currency: t.currency,
        totalQty: 0, totalCost: 0
      }
    }
    const h = holdings[t.ticker]
    if (t.trade_type === 'buy') {
      h.totalQty += t.quantity
      h.totalCost += t.total_amount
    } else {
      h.totalQty -= t.quantity
      h.totalCost -= t.price * t.quantity
    }
  }

  const lines: string[] = []
  for (const [ticker, h] of Object.entries(holdings)) {
    if (h.totalQty <= 0) continue
    const avgPrice = h.totalCost / h.totalQty
    const unit = h.currency === 'KRW' ? '원' : '$'
    lines.push(`${h.name}(${ticker}): ${h.totalQty}주, 평균단가 ${unit}${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}, 투자원금 ${unit}${h.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
  }

  return lines.length > 0 ? lines.join('\n') : '(현재 보유 종목 없음)'
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

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

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

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (10min)'))
    }, 10 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

const SESSION_LABELS: Record<Session, string> = {
  'kr-open': '한국장 개장 브리핑',
  'kr-close': '한국장 마감 브리핑',
  'us-open': '미국장 개장 브리핑',
  'us-close': '미국장 마감 브리핑',
}

const SESSION_INSTRUCTIONS: Record<Session, string> = {
  'kr-open': `한국장이 개장했습니다 (09:00).
portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 한국 종목 시초가 + 전일대비 등락률(%)
2. 전일 미국장 마감 정리 (미국 종목 종가 + 등락률)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률`,

  'kr-close': `한국장이 마감했습니다 (15:30).
portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 한국 종목 종가 + 전일대비 등락률(%)
2. 미국 종목 프리마켓 동향 (있다면)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 주요 포인트 요약`,

  'us-open': `미국장이 개장했습니다 (써머타임 기준 23:30 KST).
portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 미국 종목 시초가 + 전일대비 등락률(%)
2. 오늘 한국장 마감 정리 간단 리캡
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률`,

  'us-close': `미국장이 마감했습니다 (써머타임 기준 06:00 KST).
portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 미국 종목 종가 + 전일대비 등락률(%)
2. 한국 종목 프리마켓/야간선물 동향 (있다면)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 주요 포인트 요약`,
}

async function buildPrompt(session: Session, tradesSummary: string): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const label = SESSION_LABELS[session]
  const instructions = SESSION_INSTRUCTIONS[session]

  return `당신은 윌리(Willy), 윌로우인베스트먼트 COO입니다.
현재: ${dateStr} ${timeStr} KST

## 역할
CEO(김동욱)에게 [${label}] 텔레그램 메시지를 작성하세요.

## 포트폴리오 4축
- AI 인프라: SK하이닉스, 삼성전자, 시에나(CIEN), 버티브(VRT), 블룸에너지(BE), 아이렌(IREN), 오클로(OKLO)
- 지정학/안보: 미래에셋증권, 한화에어로스페이스, 팔란티어(PLTR), 현대로템, 로켓랩(RKLB)
- 넥스트: 디웨이브(QBTS), 현대차
- ETF: 미래에셋증권

## DB 보유 현황 (평균매수단가/보유수량)
${tradesSummary}

## 브리핑 지시사항
${instructions}

## 포맷 규칙
- 텔레그램 메시지용 간결한 텍스트
- 상단에 "[${label}]" 제목 + 이모지
- 4축별로 종목 그룹핑
- 각 종목: 현재가 + 전일대비 등락률(%) 필수
- 평균매수단가 대비 총수익률 표시 (DB 데이터 있는 종목만)
- 신고가/급등/급락은 이모지로 하이라이트
- 마지막에 "주요 포인트" 2~3줄 요약
- 필요시 "---SPLIT---"으로 분할
- 사실 기반만. 추측 금지.
- 휴장일이면 "오늘 [한국/미국]장은 휴장입니다"로 짧게 안내하고 종료.

중요: 미국장 휴장 판단 시 미국 현지 시간(ET) 기준으로 날짜 확인할 것. 한국과 미국은 13~14시간 시차.`
}

async function main() {
  const session = getSession()
  log(`${SESSION_LABELS[session]} 시작`)

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('CEO chat_id not found')
    process.exit(1)
  }

  try {
    const tradesSummary = await loadTradesSummary()
    const prompt = await buildPrompt(session, tradesSummary)
    const report = await askClaude(prompt)

    if (!report || report.length < 10) {
      log('Report too short or empty')
      await sendTelegramMessage(chatId, `${SESSION_LABELS[session]}: 데이터 조회에 실패했어요. 나중에 다시 확인할게요.`)
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

    log(`Briefing sent (${parts.length} messages)`)
  } catch (err) {
    log(`Failed: ${err}`)
    await sendTelegramMessage(chatId, `${SESSION_LABELS[session]}에서 오류가 발생했어요. 로그 확인 필요.`)
    process.exit(1)
  }
}

main()
