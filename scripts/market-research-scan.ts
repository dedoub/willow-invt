import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { runAgent } from './lib/agent-cli'
import { markdownToTelegramHtml, normalizeTelegramOutboundText, splitTelegramMessage } from './telegram-utils'
import { ensureTickerTheme } from '../src/lib/ensure-ticker-theme'
import { inferAxisFromSector } from '../src/lib/infer-axis'

// 한국 종목 ticker 패턴 (6자리 숫자)
function inferMarketFromTicker(ticker: string): 'KR' | 'US' {
  return /^\d{6}$/.test(ticker.replace('.KS', '')) ? 'KR' : 'US'
}

// ============================================================
// Unified Research Scanner — 통합 종목 리서치 스캔
// ============================================================
// --phase=valuechain (09:00): 포트폴리오 기반 밸류체인 발굴 → 텔레그램 전송
// --phase=smallcap   (16:15): 시장 데이터 + 레딧 버즈 → DB 적재 + 텔레그램 전송
// 플래그 없이 실행: 둘 다 순차 실행
// ============================================================

// Parse --phase argument
const phaseArg = process.argv.find(a => a.startsWith('--phase='))
const phase = phaseArg ? phaseArg.split('=')[1] : 'all' // 'valuechain' | 'smallcap' | 'all'

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
    .eq('bot_type', 'ceo')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.chat_id ?? null
}

async function sendTelegramMessage(chatId: number, text: string) {
  const normalized = normalizeTelegramOutboundText(text)
  const chunks = splitTelegramMessage(normalized, 4000)

  for (const chunk of chunks) {
    try {
      const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: markdownToTelegramHtml(chunk), parse_mode: 'HTML' }),
      })
      if (!res.ok) {
        log(`HTML 전송 실패, plain text 재시도: ${res.status}`)
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk }),
        })
      }
    } catch {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      }).catch(e => log(`❌ 텔레그램 전송 실패: ${e}`))
    }
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500))
  }
}

// 일시적인 모델 capacity / rate-limit / 429 에러는 지수 백오프로 재시도.
// 영구 장애면 마지막 attempt까지 가서 그대로 throw → main의 try/catch로 텔레그램 알림.
async function withCapacityRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      const transient = /at capacity|overloaded|rate.?limit|\b429\b|try a different model/i.test(msg)
      if (!transient || attempt === maxAttempts) throw e
      const backoffMs = attempt * 60_000 // 60s, 120s
      log(`  ⏳ 일시적 모델 장애 감지 (${attempt}/${maxAttempts}), ${backoffMs / 1000}s 후 재시도: ${msg.slice(0, 120)}`)
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastError
}

function askClaude(prompt: string): Promise<string> {
  return withCapacityRetry(() => runAgent(prompt, {
    allowedTools: ['mcp__portfolio-monitor__*', 'WebSearch', 'WebFetch'],
    timeoutMs: 15 * 60 * 1000,
    backend: 'codex',
  }))
}

function askClaudePortfolioOnly(prompt: string): Promise<string> {
  return withCapacityRetry(() => runAgent(prompt, {
    allowedTools: ['mcp__portfolio-monitor__*'],
    timeoutMs: 10 * 60 * 1000,
    backend: 'codex',
  }))
}

interface WatchlistRow {
  name: string; ticker: string; sector: string; group_name: string; axis: string | null
}

async function loadPortfolioFromDB(): Promise<{ portfolio: WatchlistRow[]; byAxis: Map<string, string[]> }> {
  const { data, error } = await supabase
    .from('stock_watchlist')
    .select('name, ticker, sector, group_name, axis')
    .eq('group_name', 'portfolio')
  if (error) throw error
  const rows = (data || []) as WatchlistRow[]
  const byAxis = new Map<string, string[]>()
  for (const r of rows) {
    const ax = r.axis || '기타'
    if (!byAxis.has(ax)) byAxis.set(ax, [])
    byAxis.get(ax)!.push(r.name)
  }
  return { portfolio: rows, byAxis }
}

function formatPortfolioAxes(byAxis: Map<string, string[]>): string {
  return Array.from(byAxis.entries())
    .map(([axis, names]) => `- ${axis}: ${names.join(', ')}`)
    .join('\n')
}

function formatPortfolioNames(portfolio: WatchlistRow[]): string {
  return portfolio.map(p => p.name).join(', ')
}

async function runValuechainScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const dayOfWeek = now.getDay()

  let prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 아침 종목 발굴 스캔 시간입니다.

아래 작업을 순서대로 수행하고, CEO에게 텔레그램으로 보낼 간결한 리포트를 작성하세요.

## 커버리지
**미국 + 한국 주식 모두 다룹니다.** KOSPI/KOSDAQ 종목도 적극 발굴 대상.
- 한국 보유: 삼성전자, SK하이닉스, 한화에어로, 현대로템, 현대차, 미래에셋증권 (이들과 밸류체인 연결성이 강한 KR 종목 우선)
- 한국 후보 ticker는 6자리(예: 005930) 형식으로

## 1단계: 포트폴리오 전체 스캔
portfolio_scan 도구를 사용해서 보유 종목 전체 스캔을 돌려주세요.
- 신고가 돌파/근접 종목
- 부진 종목 (12M 고점 대비 -20% 이상)
- 주요 시그널

## 2단계: 종목 발굴
portfolio_watchlist 도구로 현재 워치리스트를 확인하고,
portfolio_signals 도구로 시그널 현황을 확인하세요.
- **신규 후보**는 미국·한국 둘 다 가능. 보유 종목과 같은 밸류체인 안의 KR 종목(예: HBM 협력사, 방산 부품주, 우주 발사체 부품)도 후보에 포함.

## 리포트 형식
텔레그램 메시지로 보낼 거라 간결하게 작성해주세요.
- 이모지 적절히 사용
- 핵심 수치 위주
- 신호 없으면 "특이사항 없음"으로 짧게
- "---SPLIT---"으로 메시지 분할 가능 (너무 길 때만)
- 리포트 상단에 "🔍 종목 리서치 데일리 스캔 (${dateStr})" 제목 포함
- KR 종목과 US 종목을 [국내] / [해외] 섹션으로 나눠 표기

중요: 도구 호출 결과만 기반으로 사실만 보고. 추측이나 예측 금지.`

  if (dayOfWeek === 3) {
    prompt += `

## 3단계: 주간 테마 스캔 (수요일 추가)
이번 주 주목할 테마나 섹터 변화가 있는지 포트폴리오 데이터를 기반으로 분석해주세요.
- 섹터별 모멘텀 변화
- 워치리스트 중 진입 시그널 근접 종목
- 리포트에 "[주간 테마]" 섹션으로 추가`
  }

  return askClaudePortfolioOnly(prompt)
}

async function runMarketResearchScan(): Promise<string> {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const { byAxis } = await loadPortfolioFromDB()

  const prompt = `당신은 윌리(Willy)입니다. 윌로우인베스트먼트의 COO.
오늘은 ${dateStr}이고 매일 오후 통합 마켓 리서치 스캔 시간입니다.

이 리포트는 두 가지를 한 번에 수행합니다:
- Part A: 시장 데이터 기반 종목 스크리닝 (숫자)
- Part B: 소셜/뉴스 센티먼트 기반 종목 소싱 (군중 심리)
- 교차 검증: 양쪽에서 겹치는 종목 = 강한 신호

## 커버리지
**미국 + 한국 주식 모두 다룹니다.** US 소스(Reddit, 미국 뉴스)와 KR 소스(네이버 증권, 디시 주식갤러리, 종토방, 한경/매경/이데일리) 모두 활용.

## 윌로우 포트폴리오 현재 보유
${formatPortfolioAxes(byAxis)}

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

## Part B: 소셜/뉴스 버즈 스크리닝

### B-1: 미국 — 레딧 버즈
아래 서브레딧에서 최근 24시간 핫 포스트 웹 검색:
- r/wallstreetbets (밈/모멘텀)
- r/stocks (가치/분석)
- r/investing (장기투자)
- r/options (옵션 플로우)
검색 예: "site:reddit.com/r/wallstreetbets most mentioned stocks today"

### B-2: 한국 — 증권 뉴스 + 커뮤니티 버즈
아래 채널에서 최근 24시간 화제 종목/테마 검색:
- **네이버 증권**: 시가총액 급등 종목, 거래량 상위, 인기 검색
- **한국경제 / 매일경제 / 이데일리**: 산업·기업 뉴스 헤드라인
- **38커뮤니케이션 / 디시 주식갤러리**: 개인 투자자 화제 종목 (밈/펌프 주의)
- **네이버 종토방**: 보유 종목 관련 동향 체크
검색 예: "site:hankyung.com 오늘 급등 종목", "site:naver.com 거래량 상위", "디시 주식갤러리 핫"

### B-3: 버즈 종목 필터링 (US/KR 공통)
- 보유 종목과 겹치는 것 → 센티먼트 변화 체크
- 비보유 종목 중 3축 테마(AI 인프라/지정학·안보/넥스트)에 해당하는 것 → 신규 후보
- 밈/펌프 성격 종목 제외

### B-4: 구조적 검증
신규 후보 (US 최대 3, KR 최대 3)에 대해 portfolio_check_stock으로 확인:
- 12M 고점 대비 위치, 추세 방향
- 어떤 축에 해당하는지 태깅
- KR 종목 ticker는 6자리 (예: 005930), market='KR'

---

## Part C: 교차 검증 & 종합

양쪽(시장 데이터 + 소셜/뉴스)에서 동시에 포착된 종목이 있으면 **🔥 강한 신호**로 표시.
워치리스트 추가 후보가 있으면 제안.

---

## 리포트 형식
텔레그램 메시지용으로 간결하게:
- 상단: "🔍 마켓 리서치 스캔 (${dateStr})"
- [포트폴리오 현황] 섹션: 보유 종목 주요 시그널 ([국내] / [해외] 분리)
- [시장 발굴] 섹션: 데이터 기반 신규 후보 ([국내] / [해외])
- [소셜·뉴스 버즈] 섹션: US Reddit + KR 증권/커뮤니티 기반 후보
- [교차 신호] 섹션: 양쪽에서 겹치는 종목 (없으면 생략)
- [시장 센티먼트] 섹션: 미국/한국 분위기 각 한 줄
- "---SPLIT---"으로 분할 가능 (필요시만)

중요: 사실 기반 보고만. 추측/예측 금지. 출처 명시(Reddit URL, 네이버 증권 URL, 신문사명 등).`

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
  axis: string | null
  structural_thesis: string | null
  high_12m: number | null
  gap_from_high_pct: number | null
  current_price: number | null
  market_cap_b: number | null
  trend_verdict: string | null
  verdict: string | null
  notes: string | null
  sector: string | null
  track: string | null
  composite_score: number | null
  growth_score: number | null
  value_score: number | null
  quality_score: number | null
  momentum_score: number | null
  insider_score: number | null
  sentiment_score: number | null
}

function deriveVerdict(compositeScore: number | null): string {
  if (compositeScore == null) return 'pass_tier2'
  if (compositeScore >= 65) return 'pass_tier1'
  if (compositeScore >= 50) return 'pass_tier2'
  return 'fail'
}

async function extractResearchEntries(report: string, sourceType: 'valuechain' | 'smallcap'): Promise<ResearchEntry[]> {
  const { portfolio } = await loadPortfolioFromDB()
  const portfolioNames = formatPortfolioNames(portfolio)
  const sourceLabel = sourceType === 'valuechain' ? '밸류체인 리서치' : '마켓 리서치'
  const extractPrompt = `아래 ${sourceLabel} 리포트에서 언급된 **비보유 신규 후보 종목**만 추출하세요.
기존 보유 종목(${portfolioNames})은 제외합니다.
**미국 + 한국 종목 모두 추출 대상.**

각 종목에 대해 아래 JSON 배열 형식으로만 출력하세요. 설명 텍스트 없이 순수 JSON만:

[
  {
    "ticker": "CRDO",
    "company_name": "Credo Technology",
    "source": "${sourceType === 'valuechain' ? 'valuechain' : 'market_scan'}",
    "sector_tags": ["AI 인프라", "네트워킹"],
    "sector": "AI 네트워킹",
    "axis": "AI 인프라",
    "track": "AI Infra",
    "structural_thesis": "AI 데이터센터 네트워킹 수요 증가 수혜. 400G/800G 이더넷 스위치 수요 급증에 따른 연결 솔루션 시장 확대.",
    "high_12m": 85.5,
    "gap_from_high_pct": -12.3,
    "current_price": 75.0,
    "market_cap_b": 12.5,
    "trend_verdict": "near_breakout",
    "notes": "레딧 r/stocks 다수 언급. 신고가 근접.",
    "composite_score": 72,
    "growth_score": 80,
    "value_score": 55,
    "quality_score": 70,
    "momentum_score": 75,
    "insider_score": 65,
    "sentiment_score": 78
  },
  {
    "ticker": "042660",
    "company_name": "한화오션",
    "source": "kr_news",
    "sector_tags": ["방산 - 한국", "조선"],
    "sector": "방산 - 한국",
    "axis": "지정학/안보",
    "track": "Geopolitics",
    "structural_thesis": "함정 수출 확대 + 미 해군 MRO 사업 진출. 폴란드/필리핀 잠수함 수주 가능성과 글로벌 군비 증가 수혜.",
    "current_price": 85000,
    "market_cap_b": null,
    "trend_verdict": "near_breakout",
    "notes": "한경 헤드라인. 폴란드 MROK 수주 기대.",
    "composite_score": 68,
    "growth_score": 75,
    "value_score": 50,
    "quality_score": 65,
    "momentum_score": 72,
    "insider_score": 60,
    "sentiment_score": 70
  }
]

## 점수 채점 기준 (0-100 스케일)
각 항목을 리포트 내용 + 종목 특성에 기반해 채점:
- **growth_score**: 매출/이익 성장률, TAM 확대 가능성
- **value_score**: PER/PSR 수준, 동종 대비 밸류에이션
- **quality_score**: 마진 추세, 재무 건전성, 경쟁 우위
- **momentum_score**: 주가 추세, 신고가 근접도, 거래량 추세
- **insider_score**: 내부자 매수/매도, 기관 보유 변동
- **sentiment_score**: 애널리스트 의견, 소셜 센티먼트, 뉴스 톤
- **composite_score**: 위 6개 가중평균 (growth 25%, quality 20%, momentum 20%, value 15%, sentiment 10%, insider 10%)

## verdict 규칙 (composite_score 기반)
- composite_score ≥ 65 → "pass_tier1" (강한 후보)
- composite_score ≥ 50 → "pass_tier2" (관심 후보)
- composite_score < 50 → "fail" (탈락)

## 기타 규칙
- 숫자를 모르면 null
- source: "${sourceType === 'valuechain' ? 'valuechain' : 'market_scan'}" (데이터 기반), "reddit_buzz" (레딧 기반), "naver_buzz" / "kr_news" (한국 소스 기반), "cross_signal" (교차 검증)
- trend_verdict: "near_breakout" (신고가 근접), "watch" (관찰 중), "too_far" (고점 대비 너무 멀음), null (판단 불가)
- sector: 섹터명. KR 가이드: "AI 반도체"(삼성/SK하이닉스 협력사), "방산 - 한국"(한화/LIG/현대로템 등), "AI 에너지"(원전 부품), "자동차/로보틱스", "자산운용/증권", "우주" 등
- track: 포트폴리오 축 ("AI Infra", "Geopolitics", "Next Gen", "ETF", 또는 null)
- **axis**: 윌로우 3축 분류. 다음 중 하나만: "AI 인프라" | "지정학/안보" | "넥스트". 모르면 null
  - AI 인프라: AI 반도체/메모리/스토리지/네트워킹/냉각/데이터센터/클라우드/광 인터커넥트/AI 에너지(SMR·연료전지)
  - 지정학/안보: 방산·우주·발사체·위성·우라늄·미국방 AI(PLTR류)·자산운용/증권
  - 넥스트: 자동차·로보틱스·산업 자동화·핀테크·헬스케어 AI·광고 AI·RPA·양자컴퓨팅(하드웨어)
- structural_thesis: 2-3문장 구조적 투자 논거 (절대 null 금지, 반드시 작성)
- **한국 종목 ticker**: "005930" 형태 6자리 숫자 (.KS 제외). market 필드는 "KR"
- **미국 종목 ticker**: 대문자 알파벳 (예: "MU"). market 필드는 "US"
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
    const raw: ResearchEntry[] = JSON.parse(jsonMatch[0])
    const VALID_TREND = new Set(['watch', 'near_breakout', 'too_far'])
    const VALID_VERDICT = new Set(['pass_tier1', 'pass_tier2', 'fail'])
    const TREND_MAP: Record<string, string> = { uptrend: 'near_breakout', sideways: 'watch', downtrend: 'too_far' }
    const VERDICT_MAP: Record<string, string> = { watch: 'pass_tier2' }

    const entries = raw.filter(e => e.ticker && e.company_name).map(e => ({
      ...e,
      trend_verdict: e.trend_verdict
        ? VALID_TREND.has(e.trend_verdict) ? e.trend_verdict : (TREND_MAP[e.trend_verdict] || null)
        : null,
      // Derive verdict from composite_score (≥65=T1, ≥50=T2, <50=fail)
      verdict: deriveVerdict(e.composite_score),
      sector: e.sector || null,
      track: e.track || null,
      // axis: LLM이 부여하지 않으면 sector 기반 자동 추론
      axis: e.axis || inferAxisFromSector(e.sector || null) || null,
      composite_score: e.composite_score ?? null,
      growth_score: e.growth_score ?? null,
      value_score: e.value_score ?? null,
      quality_score: e.quality_score ?? null,
      momentum_score: e.momentum_score ?? null,
      insider_score: e.insider_score ?? null,
      sentiment_score: e.sentiment_score ?? null,
    }))
    return entries
  } catch (err) {
    log(`⚠️ 종목 추출 실패: ${err}`)
    return []
  }
}

/** Fetch market cap from Yahoo Finance for entries missing it */
async function fillMarketCaps(entries: ResearchEntry[]): Promise<void> {
  const missing = entries.filter(e => e.market_cap_b == null)
  if (missing.length === 0) return
  log(`📊 시가총액 조회: ${missing.length}개 종목 (Yahoo Finance)`)

  const batchSize = 5
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize)
    await Promise.all(batch.map(async (entry) => {
      try {
        const isKR = /^\d{6}$/.test(entry.ticker)
        const symbol = isKR ? `${entry.ticker}.KS` : entry.ticker
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!res.ok) return
        const data = await res.json()
        const meta = data?.chart?.result?.[0]?.meta
        if (!meta) return

        // Try marketCap from chart meta, or estimate from price * sharesOutstanding
        let mcap: number | null = null
        if (meta.marketCap) {
          mcap = meta.marketCap
        } else if (meta.regularMarketPrice && meta.sharesOutstanding) {
          mcap = meta.regularMarketPrice * meta.sharesOutstanding
        }

        if (mcap && mcap > 0) {
          entry.market_cap_b = Math.round(mcap / 1e9 * 10) / 10  // to billions, 1 decimal
          if (entry.market_cap_b < 0.1) entry.market_cap_b = Math.round(mcap / 1e6) / 1000  // sub-100M: keep precision
          log(`  ✅ ${entry.ticker}: $${entry.market_cap_b}B`)
        }

        // Also fill current_price if missing
        if (entry.current_price == null && meta.regularMarketPrice) {
          entry.current_price = meta.regularMarketPrice
        }
      } catch {
        // silently skip
      }
    }))
    // Rate limit between batches
    if (i + batchSize < missing.length) await new Promise(r => setTimeout(r, 500))
  }

  const filled = missing.filter(e => e.market_cap_b != null).length
  log(`📊 시가총액 조회 완료: ${filled}/${missing.length}개 성공`)
}

async function upsertResearchEntries(entries: ResearchEntry[], sourceType: 'valuechain' | 'smallcap' = 'smallcap'): Promise<number> {
  if (entries.length === 0) return 0

  const today = new Date().toISOString().split('T')[0]
  const now = new Date().toISOString()

  // ticker 단위로 단일 row 유지. 같은 ticker는 최근 스캔 결과로 덮어씀(scan_date 갱신).
  const rows = entries.map(entry => ({
    ticker: entry.ticker,
    company_name: entry.company_name,
    scan_date: today,
    source: entry.source || 'market_scan',
    source_type: sourceType,
    sector_tags: entry.sector_tags || [],
    sector: entry.sector,
    axis: entry.axis || inferAxisFromSector(entry.sector) || null,
    market: inferMarketFromTicker(entry.ticker),
    track: entry.track,
    structural_thesis: entry.structural_thesis,
    high_12m: entry.high_12m,
    gap_from_high_pct: entry.gap_from_high_pct,
    current_price: entry.current_price,
    market_cap_b: entry.market_cap_b,
    trend_verdict: entry.trend_verdict,
    verdict: entry.verdict,
    notes: entry.notes,
    composite_score: entry.composite_score,
    growth_score: entry.growth_score,
    value_score: entry.value_score,
    quality_score: entry.quality_score,
    momentum_score: entry.momentum_score,
    insider_score: entry.insider_score,
    sentiment_score: entry.sentiment_score,
    updated_at: now,
  }))

  const { error } = await supabase
    .from('stock_research')
    .upsert(rows, { onConflict: 'ticker' })

  if (error) {
    log(`  ⚠️ UPSERT 실패: ${error.message}`)
    return 0
  }

  for (const entry of entries) {
    if (entry.sector) {
      await ensureTickerTheme(supabase, entry.ticker, entry.company_name, entry.sector).catch(() => {})
    }
  }

  return entries.length
}

async function main() {
  log(`🔍 통합 리서치 스캔 시작 (phase: ${phase})`)

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('❌ CEO chat_id를 찾을 수 없습니다.')
    process.exit(1)
  }

  try {
    // Phase: valuechain (morning scan)
    if (phase === 'valuechain' || phase === 'all') {
      log('📡 Phase: 밸류체인 스캔')
      const report = await runValuechainScan()

      if (report && report.length >= 10) {
        const parts = report.split(/\n---SPLIT---\n/)
        for (const part of parts) {
          const trimmed = part.trim()
          if (trimmed) {
            await sendTelegramMessage(chatId, trimmed)
            if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
          }
        }
        log(`✅ 밸류체인 리포트 전송 완료`)

        // Extract and upsert to DB
        log('📊 밸류체인 리포트에서 종목 데이터 추출 중...')
        const entries = await extractResearchEntries(report, 'valuechain')

        if (entries.length > 0) {
          log(`  📋 ${entries.length}개 종목 추출: ${entries.map(e => e.ticker).join(', ')}`)
          await fillMarketCaps(entries)
          const upserted = await upsertResearchEntries(entries, 'valuechain')
          log(`  ✅ stock_research 테이블 ${upserted}건 적재 완료`)
        } else {
          log('  ℹ️ 밸류체인 신규 후보 종목 없음 — DB 적재 스킵')
        }
      } else {
        log('⚠️ 밸류체인 리포트가 비어있거나 너무 짧습니다')
        await sendTelegramMessage(chatId, '🔍 밸류체인 스캔: 데이터 조회에 실패했어요.')
      }
    }

    // Phase: smallcap (afternoon scan)
    if (phase === 'smallcap' || phase === 'all') {
      log('📡 Phase: 마켓 리서치 (소형주) 스캔')
      const report = await runMarketResearchScan()

      if (!report || report.length < 10) {
        log('⚠️ 마켓 리포트가 비어있거나 너무 짧습니다')
        await sendTelegramMessage(chatId, '🔍 마켓 리서치 스캔: 데이터 조회에 실패했어요.')
        if (phase === 'smallcap') process.exit(1)
        return
      }

      const parts = report.split(/\n---SPLIT---\n/)
      for (const part of parts) {
        const trimmed = part.trim()
        if (trimmed) {
          await sendTelegramMessage(chatId, trimmed)
          if (parts.length > 1) await new Promise(r => setTimeout(r, 1000))
        }
      }
      log(`✅ 마켓 리포트 전송 완료`)

      // Extract and upsert to DB
      log('📊 리포트에서 종목 데이터 추출 중...')
      const entries = await extractResearchEntries(report, 'smallcap')

      if (entries.length > 0) {
        log(`  📋 ${entries.length}개 종목 추출: ${entries.map(e => e.ticker).join(', ')}`)
        await fillMarketCaps(entries)
        const upserted = await upsertResearchEntries(entries, 'smallcap')
        log(`  ✅ stock_research 테이블 ${upserted}건 적재 완료`)

        const dbLines = entries.map(e => {
          const verdict = e.verdict === 'pass_tier1' ? '⭐' : e.verdict === 'pass_tier2' ? '✅' : '👀'
          return `${verdict} ${e.ticker} (${e.company_name})${e.gap_from_high_pct != null ? ` | 고점대비 ${e.gap_from_high_pct}%` : ''}`
        })
        await sendTelegramMessage(chatId, `📊 리서치 DB 업데이트 (${upserted}건)\n\n${dbLines.join('\n')}\n\n대시보드에서 확인: 투자리서치 탭`)
      } else {
        log('  ℹ️ 신규 후보 종목 없음 — DB 적재 스킵')
      }
    }

    log('🏁 통합 리서치 스캔 완료')
  } catch (err) {
    log(`❌ 스캔 실패: ${err}`)
    await sendTelegramMessage(chatId, '🛠️ [백그라운드 리서치 스캔] 오류가 발생했어요. 자동 복구에 실패해 로그 확인이 필요합니다.')
    process.exit(1)
  }
}

main()
