import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { runAgent } from './lib/agent-cli'

// ============================================================
// Portfolio Briefing — 장 개장/마감 포트폴리오 브리핑
// ============================================================
// --session kr-open   : 한국장 개장 후 브리핑
// --session kr-close  : 한국장 마감 후 브리핑
// --session us-open   : 미국장 개장 후 브리핑
// --session us-close  : 미국장 마감 후 브리핑
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
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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

type HoldingSummary = {
  ticker: string
  name: string
  market: string
  currency: string
  totalQty: number
  totalCost: number
  totalBought: number
  avgPrice: number
}

async function loadHoldingSummaries(): Promise<HoldingSummary[]> {
  const { data: trades } = await supabase
    .from('stock_trades')
    .select('ticker, company_name, market, trade_type, quantity, price, total_amount, currency')
    .order('trade_date', { ascending: true })

  if (!trades || trades.length === 0) return []

  const holdings: Record<string, {
    name: string, market: string, currency: string,
    totalQty: number, totalCost: number, totalBought: number
  }> = {}

  for (const t of trades) {
    if (!holdings[t.ticker]) {
      holdings[t.ticker] = {
        name: t.company_name, market: t.market, currency: t.currency,
        totalQty: 0, totalCost: 0, totalBought: 0
      }
    }
    const h = holdings[t.ticker]
    if (t.trade_type === 'buy') {
      h.totalQty += t.quantity
      h.totalCost += t.total_amount
      h.totalBought += t.total_amount
    } else {
      h.totalQty -= t.quantity
      h.totalCost -= t.price * t.quantity
    }
  }

  return Object.entries(holdings)
    .filter(([, h]) => h.totalQty > 0)
    .map(([ticker, h]) => ({
      ticker,
      name: h.name,
      market: h.market,
      currency: h.currency,
      totalQty: h.totalQty,
      totalCost: h.totalCost,
      totalBought: h.totalBought,
      avgPrice: h.totalCost / h.totalQty,
    }))
}

async function fetchQuoteMap(tickers: string[], markets: string[]) {
  if (tickers.length === 0) return {}
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const res = await fetch(
    `${baseUrl}/api/willow-mgmt/stock-quotes?tickers=${encodeURIComponent(tickers.join(','))}&markets=${encodeURIComponent(markets.join(','))}`
  )
  if (!res.ok) {
    throw new Error(`시세 조회 실패: ${res.status}`)
  }
  const data = await res.json()
  return data.prices || {}
}

async function loadPortfolioStatusSummary(): Promise<string> {
  const holdings = await loadHoldingSummaries()
  if (holdings.length === 0) return '(현재 보유 종목 없음)'

  const quoteMap = await fetchQuoteMap(
    holdings.map(h => h.ticker),
    holdings.map(h => h.market)
  )

  let usdKrwRate = 1430
  try {
    const fxQuotes = await fetchQuoteMap(['KRW=X'], ['US'])
    const fxRate = fxQuotes['KRW=X']?.price
    if (typeof fxRate === 'number' && fxRate > 0) usdKrwRate = fxRate
  } catch {
    // Fallback to default rate for tranche sizing.
  }

  const TRANCHE_TRIGGERS = [null, 0.10, 0.20, 0.30, 0.40, 0.55, 0.75, 1.00, 1.35, 1.75] as const

  const lines = holdings.map((h) => {
    const quote = quoteMap[h.ticker] || quoteMap[h.ticker.replace('.KS', '')]
    const currentPrice = Number(quote?.price || 0)
    const dailyChangePct = Number(quote?.changePercent || 0)
    const pnlPercent = h.avgPrice > 0 && currentPrice > 0
      ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100
      : 0
    const trancheSize = h.currency === 'KRW' ? 5_000_000 : 5_000_000 / usdKrwRate
    const tranche = Math.min(10, Math.max(1, Math.round(h.totalBought / trancheSize)))
    const currTrigger = TRANCHE_TRIGGERS[tranche - 1]
    const nextTrigger = tranche < 10 ? TRANCHE_TRIGGERS[tranche] : null

    let status = 'HOLD'
    if (pnlPercent >= 200) status = 'HOUSE_MONEY'
    else if (tranche >= 10) status = 'FULL'
    else if (nextTrigger !== null && pnlPercent / 100 >= nextTrigger) status = 'BUY'
    else if (currTrigger !== null && pnlPercent / 100 < currTrigger) status = 'FREEZE'

    const unit = h.currency === 'KRW' ? '₩' : '$'
    const nextAction = status === 'BUY'
      ? `🔔 추가매수 T${tranche + 1}`
      : status === 'FULL'
        ? '추가매수 없음'
        : `대기 ${nextTrigger !== null ? `(+${Math.round(nextTrigger * 100)}%)` : ''}`.trim()

    return [
      h.name,
      `ticker=${h.ticker}`,
      `market=${h.market}`,
      `qty=${h.totalQty}`,
      `avg_buy=${unit}${Math.round(h.avgPrice).toLocaleString()}`,
      `current=${unit}${Math.round(currentPrice).toLocaleString()}`,
      `change=${dailyChangePct >= 0 ? '+' : ''}${dailyChangePct.toFixed(2)}%`,
      `pnl=${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`,
      `tranche=T${tranche}`,
      `status=${status}`,
      `next_action=${nextAction}`,
    ].join(' | ')
  })

  return lines.join('\n')
}

function askClaude(prompt: string): Promise<string> {
  return runAgent(prompt, {
    allowedTools: ['mcp__portfolio-monitor__*'],
    timeoutMs: 10 * 60 * 1000,
    backend: 'codex',
  })
}

const SESSION_LABELS: Record<Session, string> = {
  'kr-open': '한국장 개장 브리핑',
  'kr-close': '한국장 마감 브리핑',
  'us-open': '미국장 개장 브리핑',
  'us-close': '미국장 마감 브리핑',
}

const SESSION_INSTRUCTIONS: Record<Session, string> = {
  'kr-open': `한국장이 개장 후 안정화 구간입니다.
portfolio_market_status로 장 상태를 확인하고, portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 한국 종목 시초가 + 전일대비 등락률(%)
2. 전일 미국장 마감 정리 (미국 종목 종가 + 등락률)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 피라미딩 상태(BUY/HOLD/FREEZE/FULL/HOUSE_MONEY) + 추가매수 필요 여부`,

  'kr-close': `한국장이 마감 후 안정화 구간입니다.
portfolio_market_status로 장 상태를 확인하고, portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 한국 종목 종가 + 전일대비 등락률(%)
2. 미국 종목 프리마켓 동향 (있다면)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 피라미딩 상태(BUY/HOLD/FREEZE/FULL/HOUSE_MONEY) + 추가매수 필요 여부
7. 주요 포인트 요약`,

  'us-open': `미국장이 개장 후 안정화 구간입니다.
portfolio_market_status로 장 상태를 확인하고, portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 미국 종목 시초가 + 전일대비 등락률(%)
2. 오늘 한국장 마감 정리 간단 리캡
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 피라미딩 상태(BUY/HOLD/FREEZE/FULL/HOUSE_MONEY) + 추가매수 필요 여부`,

  'us-close': `미국장이 마감 후 안정화 구간입니다.
portfolio_market_status로 장 상태를 확인하고, portfolio_scan 도구로 전체 포트폴리오를 스캔하세요.

보고 내용:
1. 미국 종목 종가 + 전일대비 등락률(%)
2. 한국 종목 프리마켓/야간선물 동향 (있다면)
3. 신고가 돌파/근접 종목
4. 12M 고점 대비 부진 종목 (괴리율)
5. 종목별 평균매수단가 대비 수익률
6. 피라미딩 상태(BUY/HOLD/FREEZE/FULL/HOUSE_MONEY) + 추가매수 필요 여부
7. 주요 포인트 요약`,
}

async function buildPrompt(session: Session, portfolioStatusSummary: string): Promise<string> {
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

## DB 피라미딩 현황 (자동계산)
${portfolioStatusSummary}

## 브리핑 지시사항
${instructions}

## 포맷 규칙
- 텔레그램 메시지용 간결한 텍스트
- 상단에 "[${label}]" 제목 + 이모지
- 첫 표부터 바로 보여주기. 숫자 섹션은 문장보다 표 우선.
- 핵심 숫자는 반드시 마크다운 표로 작성
- 표 기본 컬럼: 종목 | 현재가 | 전일대비 | 12M고점거리 | 트랜치 | 상태 | 추가매수
- 4축별로 종목 그룹핑하되, 각 축마다 표 1개로 정리
- 각 종목: 현재가 + 전일대비 등락률(%) + 평균매수단가 대비 총수익률 필수
- BUY면 추가매수 칸에 "🔔 추가매수 T{다음트랜치}" 형식으로 표시
- BUY가 아니면 추가매수 칸에 "추가매수 없음" 또는 "대기(+N%)"처럼 명시
- 신고가/급등/급락은 이모지로 하이라이트
- 브리핑 하단에 "피라미딩 현황" 섹션을 따로 두고 BUY/HOLD/FREEZE/FULL/HOUSE_MONEY 건수를 한 줄로 요약
- 마지막에 "주요 포인트" 2~3줄 요약
- 필요시 "---SPLIT---"으로 분할
- 사실 기반만. 추측 금지.
- 휴장일이면 "오늘 [한국/미국]장은 휴장입니다"로 짧게 안내하고 종료.
- 미국장 휴장 판단 시 미국 현지 시간(ET) 기준으로 날짜 확인할 것. 한국과 미국은 13~14시간 시차.
- DB 피라미딩 현황의 status/tranche/next_action은 그대로 사용하고 임의 수정하지 말 것.`
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
    const portfolioStatusSummary = await loadPortfolioStatusSummary()
    const prompt = await buildPrompt(session, portfolioStatusSummary)
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
