import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'

// ============================================================
// Market Research Scanner — 통합 종목 리서치 스캔
// ============================================================
// 매일 오후 4:15 실행
// Phase 1: 포트폴리오 스캔 + 시장 데이터 기반 종목 발굴
// Phase 2: 레딧 버즈 수집 + 소셜 센티먼트 분석
// Phase 3: 교차 검증 — 양쪽에서 겹치는 종목 = 강한 신호
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const LOG_PREFIX = '[market-research]'

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

    // 포트폴리오 MCP + 웹 검색 모두 허용
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

    // 15분 타임아웃
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude CLI timeout (15min)'))
    }, 15 * 60 * 1000)

    proc.on('close', () => clearTimeout(timeout))

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

async function runMarketResearchScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

  const prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 오후 통합 마켓 리서치 스캔 시간입니다.

이 리포트는 두 가지를 한 번에 수행합니다:
- Part A: 시장 데이터 기반 종목 스크리닝 (숫자)
- Part B: 레딧/소셜 센티먼트 기반 종목 소싱 (군중 심리)
- 교차 검증: 양쪽에서 겹치는 종목 = 강한 신호

## 윌로우 포트폴리오 4축
- AI 인프라: SK하이닉스, 삼성전자, 시에나, 버티브, 블룸에너지, 아이렌, 오클로
- 지정학/안보: 한화에어로스페이스, 현대로템, 팔란티어, 로켓랩
- 넥스트: 디웨이브, 현대차
- ETF: 미래에셋증권

---

## Part A: 시장 데이터 스크리닝

### A-1: 포트폴리오 전체 스캔
portfolio_scan 도구를 사용해서 보유 종목 전체 스캔:
- 신고가 돌파/근접 종목
- 부진 종목 (12M 고점 대비 -20% 이상)
- 주요 시그널

### A-2: 워치리스트 & 시그널
portfolio_watchlist로 현재 워치리스트 확인
portfolio_signals로 시그널 현황 확인

---

## Part B: 레딧 버즈 스크리닝

### B-1: 레딧 버즈 수집
아래 서브레딧에서 최근 24시간 핫 포스트를 웹 검색으로 수집:
- r/wallstreetbets (밈/모멘텀)
- r/stocks (가치/분석)
- r/investing (장기투자)
- r/options (옵션 플로우)

검색 쿼리 예시: "site:reddit.com/r/wallstreetbets most mentioned stocks today"

### B-2: 버즈 종목 필터링
- 보유 종목과 겹치는 것 → 센티먼트 변화 체크
- 비보유 종목 중 4축 테마에 해당하는 것 → 신규 후보
- 밈/펌프 성격 종목 제외

### B-3: 구조적 검증
신규 후보 (최대 3개)에 대해 portfolio_check_stock으로 확인:
- 12M 고점 대비 위치, 추세 방향
- 어떤 축에 해당하는지 태깅

---

## Part C: 교차 검증 & 종합

양쪽(시장 데이터 + 레딧 버즈)에서 동시에 포착된 종목이 있으면 **🔥 강한 신호**로 표시.
워치리스트 추가 후보가 있으면 제안.

---

## 리포트 형식
텔레그램 메시지용으로 간결하게:
- 상단: "🔍 마켓 리서치 스캔 (${dateStr})"
- [포트폴리오 현황] 섹션: 보유 종목 주요 시그널
- [시장 발굴] 섹션: 데이터 기반 신규 후보
- [레딧 버즈] 섹션: 소셜 센티먼트 기반 후보 + 보유 종목 언급
- [교차 신호] 섹션: 양쪽에서 겹치는 종목 (없으면 생략)
- [시장 센티먼트] 섹션: 전체 분위기 한 줄
- "---SPLIT---"으로 분할 가능 (필요시만)

중요: 사실 기반 보고만. 추측/예측 금지. 레딧 출처 명시.`

  return askClaude(prompt)
}

// ============================================================
// Phase 2: 리포트에서 종목 데이터 추출 → stock_research 테이블 적재
// ============================================================
interface ResearchEntry {
  ticker: string
  company_name: string
  source: string
  sector_tags: string[]
  structural_thesis: string | null
  high_12m: number | null
  gap_from_high_pct: number | null
  current_price: number | null
  market_cap_b: number | null
  trend_verdict: string | null
  verdict: string | null
  notes: string | null
}

async function extractResearchEntries(report: string): Promise<ResearchEntry[]> {
  const extractPrompt = `아래 마켓 리서치 리포트에서 언급된 **비보유 신규 후보 종목**만 추출하세요.
기존 보유 종목(SK하이닉스, 삼성전자, 시에나, 버티브, 블룸에너지, 아이렌, 오클로, 한화에어로스페이스, 현대로템, 팔란티어, 로켓랩, 디웨이브, 현대차, 미래에셋증권)은 제외합니다.

각 종목에 대해 아래 JSON 배열 형식으로만 출력하세요. 설명 텍스트 없이 순수 JSON만:

[
  {
    "ticker": "CRDO",
    "company_name": "Credo Technology",
    "source": "market_scan",
    "sector_tags": ["AI 인프라", "네트워킹"],
    "structural_thesis": "AI 데이터센터 네트워킹 수요 증가 수혜",
    "high_12m": 85.5,
    "gap_from_high_pct": -12.3,
    "current_price": 75.0,
    "market_cap_b": 12.5,
    "trend_verdict": "uptrend",
    "verdict": "pass_tier2",
    "notes": "레딧 r/stocks 다수 언급. 신고가 근접."
  }
]

규칙:
- 숫자를 모르면 null
- source: "market_scan" (데이터 기반), "reddit_buzz" (레딧 기반), "cross_signal" (교차 검증)
- verdict: "pass_tier1" (강한 후보), "pass_tier2" (관심 후보), "watch" (관찰)
- trend_verdict: "uptrend", "downtrend", "sideways", null
- 한국 종목 ticker: "005930" (숫자만, .KS 제외)
- 후보 종목이 없으면 빈 배열 [] 출력
- 이미 워치리스트에 있는 종목도 포함 (최신 상태 업데이트용)

---
리포트:
${report}`

  try {
    const result = await askClaude(extractPrompt)
    // JSON 배열 추출 (```json ... ``` 감싸져 있을 수 있음)
    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      log('⚠️ 종목 추출 결과에서 JSON을 찾을 수 없음')
      return []
    }
    const entries: ResearchEntry[] = JSON.parse(jsonMatch[0])
    return entries.filter(e => e.ticker && e.company_name)
  } catch (err) {
    log(`⚠️ 종목 추출 실패: ${err}`)
    return []
  }
}

async function upsertResearchEntries(entries: ResearchEntry[]): Promise<number> {
  if (entries.length === 0) return 0

  const today = new Date().toISOString().split('T')[0]
  let upserted = 0

  for (const entry of entries) {
    // 같은 ticker + 같은 날짜가 있으면 업데이트, 없으면 신규
    const { data: existing } = await supabase
      .from('stock_research')
      .select('id')
      .eq('ticker', entry.ticker)
      .eq('scan_date', today)
      .limit(1)

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('stock_research')
        .update({
          company_name: entry.company_name,
          source: entry.source,
          sector_tags: entry.sector_tags,
          structural_thesis: entry.structural_thesis,
          high_12m: entry.high_12m,
          gap_from_high_pct: entry.gap_from_high_pct,
          current_price: entry.current_price,
          market_cap_b: entry.market_cap_b,
          trend_verdict: entry.trend_verdict,
          verdict: entry.verdict,
          notes: entry.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id)

      if (!error) upserted++
    } else {
      const { error } = await supabase
        .from('stock_research')
        .insert({
          ticker: entry.ticker,
          company_name: entry.company_name,
          scan_date: today,
          source: entry.source,
          sector_tags: entry.sector_tags || [],
          structural_thesis: entry.structural_thesis,
          high_12m: entry.high_12m,
          gap_from_high_pct: entry.gap_from_high_pct,
          current_price: entry.current_price,
          market_cap_b: entry.market_cap_b,
          trend_verdict: entry.trend_verdict,
          verdict: entry.verdict,
          notes: entry.notes,
        })

      if (!error) upserted++
    }
  }

  return upserted
}

async function main() {
  log('🔍 통합 마켓 리서치 스캔 시작')

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('❌ CEO chat_id를 찾을 수 없습니다.')
    process.exit(1)
  }

  try {
    const report = await runMarketResearchScan()

    if (!report || report.length < 10) {
      log('⚠️ 리포트가 비어있거나 너무 짧습니다')
      await sendTelegramMessage(chatId, '🔍 마켓 리서치 스캔: 데이터 조회에 실패했어요. 나중에 다시 시도할게요.')
      process.exit(1)
    }

    // 텔레그램 전송
    const parts = report.split(/\n---SPLIT---\n/)
    for (const part of parts) {
      const trimmed = part.trim()
      if (trimmed) {
        await sendTelegramMessage(chatId, trimmed)
        if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
      }
    }

    log(`✅ 리포트 전송 완료 (${parts.length}개 메시지)`)

    // stock_research 테이블 적재
    log('📊 리포트에서 종목 데이터 추출 중...')
    const entries = await extractResearchEntries(report)

    if (entries.length > 0) {
      log(`  📋 ${entries.length}개 종목 추출: ${entries.map(e => e.ticker).join(', ')}`)
      const upserted = await upsertResearchEntries(entries)
      log(`  ✅ stock_research 테이블 ${upserted}건 적재 완료`)

      // 텔레그램으로 적재 결과 알림
      const dbLines = entries.map(e => {
        const verdict = e.verdict === 'pass_tier1' ? '⭐' : e.verdict === 'pass_tier2' ? '✅' : '👀'
        return `${verdict} ${e.ticker} (${e.company_name})${e.gap_from_high_pct != null ? ` | 고점대비 ${e.gap_from_high_pct}%` : ''}`
      })
      await sendTelegramMessage(chatId, `📊 리서치 DB 업데이트 (${upserted}건)\n\n${dbLines.join('\n')}\n\n대시보드에서 확인: 투자리서치 탭`)
    } else {
      log('  ℹ️ 신규 후보 종목 없음 — DB 적재 스킵')
    }
  } catch (err) {
    log(`❌ 스캔 실패: ${err}`)
    await sendTelegramMessage(chatId, '🔍 마켓 리서치 스캔에서 오류가 발생했어요. 로그를 확인해주세요.')
    process.exit(1)
  }
}

main()
