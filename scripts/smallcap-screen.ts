import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { chromium, type BrowserContext, type Page } from 'playwright'

// ============================================================
// Smallcap Screening Pipeline
// ============================================================
// 주간 실행: Finviz 스크리너 → OpenInsider 내부자매수 → Reddit 버즈 교차검증
// → 복합 스코어링 → DB 저장 → Telegram 리포트
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const LOG_PREFIX = '[smallcap-screen]'
function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

// ── Config ──
const FINVIZ_BASE = 'https://finviz.com/screener.ashx'
// Small Cap ($300M-$2B), Sales Q/Q >15%, Avg Volume >200K
const FINVIZ_FILTERS = 'cap_small,fa_salesqoq_o15,sh_avgvol_o200'
const MAX_CANDIDATES = 200
const PAGE_SIZE = 20
const FINVIZ_DELAY_MS = 2500
const HEADED = process.argv.includes('--headed')
const DRY_RUN = process.argv.includes('--dry-run')

// 제외 섹터/산업 — 원자재/순환주 필터링
const EXCLUDED_SECTORS = new Set([
  'Basic Materials',
  'Consumer Defensive',
  'Consumer Cyclical',
  'Financial',         // 핀테크/은행/보험 제외
  'Real Estate',       // 리츠/부동산 제외
  'Utilities',         // 유틸리티 제외 (AI 에너지는 별도 포트폴리오)
])
const EXCLUDED_INDUSTRIES = new Set([
  // 원자재/에너지
  'Gold', 'Silver', 'Copper', 'Steel', 'Aluminum', 'Coal',
  'Oil & Gas E&P', 'Oil & Gas Equipment & Services',
  'Oil & Gas Midstream', 'Oil & Gas Refining & Marketing',
  'Thermal Coal', 'Coking Coal', 'Uranium',
  'Agricultural Inputs', 'Lumber & Wood Production',
  // 핀테크/금융 서비스 — CEO: AI 기술주 집중, 핀테크 제외
  'Credit Services', 'Financial Data & Stock Exchanges',
  'Financial Conglomerates', 'Insurance - Specialty',
  'Insurance - Property & Casualty', 'Insurance - Life',
  'Insurance - Diversified', 'Insurance Brokers',
  'Mortgage Finance', 'Banks - Regional',
  'Banks - Diversified', 'Capital Markets',
  'Asset Management', 'Insurance - Reinsurance',
  // 해운/물류 — 기술 중심 방향과 불일치
  'Marine Shipping', 'Shipping & Ports',
])
const EXCLUDED_COUNTRIES = new Set(['China', 'Hong Kong'])

// 핀테크 키워드 — 회사명에 포함 시 제외 (소문자 비교)
// Finviz가 핀테크를 Software/Tech로 분류하는 경우가 많아서 키워드로 잡음
const FINTECH_KEYWORDS = [
  'lending', 'loan', 'credit', 'mortgage', 'fintech',
  'financial', 'insurance', 'banking', 'payment', 'payroll',
  'wallet', 'remittance', 'debt', 'pagaya', 'flywire',
  'moneylion', 'sofi', 'affirm', 'upstart', 'lemonade',
]

// 섹터 가산점 — 기술 중심 투자 철학
const SECTOR_BONUS: Record<string, number> = {
  'Technology': 5,
  'Healthcare': 4,
  'Communication Services': 4,
  'Industrials': 3, // 방산/테크 인더스트리얼
}

// AI 관련 산업 — 직접적 AI 비즈니스 가산점
const AI_INDUSTRIES = new Set([
  'Software - Application',
  'Software - Infrastructure',
  'Semiconductors',
  'Semiconductor Equipment & Materials',
  'Information Technology Services',
  'Computer Hardware',
  'Scientific & Technical Instruments',
  'Electronic Components',
  'Communication Equipment',
  'Electronics & Computer Distribution',
])

// AI 키워드 — 회사명/산업에 포함 시 가산 (소문자 비교)
const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'deep learning',
  'neural', 'nlp', 'computer vision', 'robotics', 'autonomous',
  'data analytics', 'cloud', 'cybersecurity', 'cyber security',
  'saas', 'platform', 'automation',
]

// AI 관련도 계산 — industry + company_name 기반
function calcAiRelevance(stock: StockData): number {
  let score = 0

  // AI 관련 산업이면 +10
  if (stock.industry && AI_INDUSTRIES.has(stock.industry)) score += 10

  // 회사명에 AI 키워드 포함 시 +8
  const nameLower = (stock.company_name || '').toLowerCase()
  for (const kw of AI_KEYWORDS) {
    if (nameLower.includes(kw)) {
      score += 8
      break // 중복 가산 방지
    }
  }

  return score
}

// 최소 유동성 — Finviz >200K 필터 통과 후 추가 안전장치
const MIN_AVG_VOLUME = 100_000

// Finviz view → column index → field name
const VIEW_COLUMNS: Record<string, Record<number, string>> = {
  // Overview: No, Ticker, Company, Sector, Industry, Country, Market Cap, P/E, Price, Change, Volume
  '111': {
    2: 'company_name', 3: 'sector', 4: 'industry', 5: 'country',
    6: 'market_cap', 7: 'pe', 8: 'price', 9: 'change_pct', 10: 'volume',
  },
  // Valuation: No, Ticker, Market Cap, P/E, Fwd P/E, PEG, P/S, P/B, P/C, P/FCF, Dividend, Payout, EPS, Price, Change, Volume
  '121': { 4: 'forward_pe', 5: 'peg', 6: 'ps', 7: 'pb' },
  // Financial: No, Ticker, Market Cap, Dividend, ROA, ROE, ROI, Curr R, Quick R, LTDebt/Eq, Debt/Eq, Gross M, Oper M, Profit M, Earnings, Price, Change, Volume
  '131': {
    4: 'roa', 5: 'roe', 6: 'roi', 7: 'current_ratio', 8: 'quick_ratio',
    10: 'debt_to_equity', 11: 'gross_margin', 12: 'operating_margin', 13: 'profit_margin',
  },
  // Ownership: No, Ticker, Market Cap, Outstanding, Float, Insider Own, Insider Trans, Inst Own, Inst Trans, Float Short, Short Ratio, Avg Volume, Price, Change, Volume
  '141': {
    5: 'insider_own_pct', 6: 'insider_trans_pct', 7: 'inst_own_pct',
    8: 'inst_trans_pct', 9: 'short_float_pct', 11: 'avg_volume',
  },
  // Performance: No, Ticker, Perf Week, Perf Month, Perf Quart, Perf Half, Perf Year, Perf YTD, Vol W, Vol M, Recom, Avg Volume, Rel Volume, Price, Change, Volume
  '151': {
    2: 'perf_week', 3: 'perf_month', 4: 'perf_quarter',
    5: 'perf_half', 6: 'perf_year', 7: 'perf_ytd',
  },
}

// ── Types ──

interface StockData {
  ticker: string
  company_name?: string
  sector?: string
  industry?: string
  country?: string
  market_cap_m?: number
  price?: number
  change_pct?: number
  volume?: number
  avg_volume?: number
  pe?: number
  forward_pe?: number
  peg?: number
  ps?: number
  pb?: number
  roe?: number
  roa?: number
  roi?: number
  gross_margin?: number
  operating_margin?: number
  profit_margin?: number
  current_ratio?: number
  quick_ratio?: number
  debt_to_equity?: number
  perf_week?: number
  perf_month?: number
  perf_quarter?: number
  perf_half?: number
  perf_year?: number
  perf_ytd?: number
  insider_own_pct?: number
  insider_trans_pct?: number
  inst_own_pct?: number
  inst_trans_pct?: number
  short_float_pct?: number
}

interface ScoredStock extends StockData {
  insider_buys_3m: number
  insider_buy_value_3m: number
  reddit_mentions: number
  reddit_sentiment: number | null
  reddit_buzz_score: number | null
  growth_score: number
  value_score: number
  quality_score: number
  momentum_score: number
  insider_score: number
  sentiment_score: number
  composite_score: number
  rs_rank: number  // Relative Strength percentile 0-100
  tier: 'A' | 'B' | 'C' | 'F'
  track: 'profitable' | 'hypergrowth'
  fail_reasons: string[]
}

// ── Utils ──

function parseMarketCap(s: string): number | null {
  if (!s || s === '-') return null
  const num = parseFloat(s)
  if (isNaN(num)) return null
  if (s.endsWith('B')) return num * 1000 // → millions
  if (s.endsWith('M')) return num
  if (s.endsWith('K')) return num / 1000
  return num
}

function parsePct(s: string): number | null {
  if (!s || s === '-') return null
  const num = parseFloat(s.replace('%', '').trim())
  return isNaN(num) ? null : num
}

function parseNum(s: string): number | null {
  if (!s || s === '-') return null
  const num = parseFloat(s.replace(/[,$]/g, '').trim())
  return isNaN(num) ? null : num
}

function parseVolume(s: string): number | null {
  if (!s || s === '-') return null
  const cleaned = s.replace(/,/g, '').trim()
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  if (cleaned.endsWith('B')) return num * 1e9
  if (cleaned.endsWith('M')) return num * 1e6
  if (cleaned.endsWith('K')) return num * 1e3
  return num
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ============================================================
// Phase 1: Finviz Screener
// ============================================================

async function scrapeFinvizView(
  page: Page,
  view: string,
  columns: Record<number, string>
): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>()
  let startRow = 1
  let pageCount = 0

  while (startRow <= MAX_CANDIDATES) {
    const url = `${FINVIZ_BASE}?v=${view}&f=${FINVIZ_FILTERS}&r=${startRow}`
    log(`  v=${view} r=${startRow}`)

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Wait for ticker links to appear
      await page.waitForSelector('a[href*="quote.ashx?t="]', { timeout: 10000 }).catch(() => null)
      await sleep(FINVIZ_DELAY_MS + Math.random() * 1000)

      const rows = await page.evaluate(() => {
        const results: string[][] = []
        document.querySelectorAll('tr').forEach(tr => {
          // Only data rows have ticker links
          if (!tr.querySelector('a[href*="quote.ashx?t="]')) return
          const cells: string[] = []
          tr.querySelectorAll('td').forEach(td => {
            const a = td.querySelector('a')
            cells.push((a?.textContent || td.textContent || '').trim())
          })
          if (cells.length > 1) results.push(cells)
        })
        return results
      })

      if (rows.length === 0) break

      for (const row of rows) {
        const ticker = row[1] // Ticker is always column 1
        if (!ticker || ticker.length > 5) continue

        const data: Record<string, string> = {}
        for (const [idx, field] of Object.entries(columns)) {
          const i = parseInt(idx)
          if (i < row.length) data[field] = row[i]
        }

        if (!result.has(ticker)) result.set(ticker, {})
        Object.assign(result.get(ticker)!, data)
      }

      pageCount++
      if (rows.length < PAGE_SIZE) break
      startRow += PAGE_SIZE
    } catch (err) {
      log(`  ⚠️ Error v=${view} r=${startRow}: ${err}`)
      try {
        await page.screenshot({ path: `scripts/logs/tmp/finviz-err-v${view}-r${startRow}.png` })
      } catch {}
      break
    }
  }

  log(`  v=${view}: ${result.size} tickers, ${pageCount} pages`)
  return result
}

async function scrapeFinviz(context: BrowserContext): Promise<StockData[]> {
  log('Phase 1: Finviz Screener')
  const page = await context.newPage()
  const allData = new Map<string, Record<string, string>>()

  for (const [view, columns] of Object.entries(VIEW_COLUMNS)) {
    const viewData = await scrapeFinvizView(page, view, columns)
    for (const [ticker, data] of viewData) {
      if (!allData.has(ticker)) allData.set(ticker, { ticker })
      Object.assign(allData.get(ticker)!, data)
    }
  }

  await page.close()

  // Convert raw strings to typed StockData
  const stocks: StockData[] = []
  for (const [ticker, raw] of allData) {
    stocks.push({
      ticker,
      company_name: raw.company_name || undefined,
      sector: raw.sector || undefined,
      industry: raw.industry || undefined,
      market_cap_m: parseMarketCap(raw.market_cap || ''),
      price: parseNum(raw.price || ''),
      change_pct: parsePct(raw.change_pct || ''),
      volume: parseVolume(raw.volume || ''),
      avg_volume: parseVolume(raw.avg_volume || ''),
      pe: parseNum(raw.pe || ''),
      forward_pe: parseNum(raw.forward_pe || ''),
      peg: parseNum(raw.peg || ''),
      ps: parseNum(raw.ps || ''),
      pb: parseNum(raw.pb || ''),
      roe: parsePct(raw.roe || ''),
      roa: parsePct(raw.roa || ''),
      roi: parsePct(raw.roi || ''),
      gross_margin: parsePct(raw.gross_margin || ''),
      operating_margin: parsePct(raw.operating_margin || ''),
      profit_margin: parsePct(raw.profit_margin || ''),
      current_ratio: parseNum(raw.current_ratio || ''),
      quick_ratio: parseNum(raw.quick_ratio || ''),
      debt_to_equity: parseNum(raw.debt_to_equity || ''),
      perf_week: parsePct(raw.perf_week || ''),
      perf_month: parsePct(raw.perf_month || ''),
      perf_quarter: parsePct(raw.perf_quarter || ''),
      perf_half: parsePct(raw.perf_half || ''),
      perf_year: parsePct(raw.perf_year || ''),
      perf_ytd: parsePct(raw.perf_ytd || ''),
      insider_own_pct: parsePct(raw.insider_own_pct || ''),
      insider_trans_pct: parsePct(raw.insider_trans_pct || ''),
      inst_own_pct: parsePct(raw.inst_own_pct || ''),
      inst_trans_pct: parsePct(raw.inst_trans_pct || ''),
      short_float_pct: parsePct(raw.short_float_pct || ''),
    })
  }

  log(`Phase 1 complete: ${stocks.length} candidates`)
  return stocks
}

// ============================================================
// Phase 2: OpenInsider — 내부자 매수 (bulk query)
// ============================================================

async function scrapeOpenInsider(
  context: BrowserContext,
  tickers: Set<string>
): Promise<Map<string, { count: number; value: number }>> {
  log('Phase 2: OpenInsider insider buying')
  const result = new Map<string, { count: number; value: number }>()
  const page = await context.newPage()

  try {
    // Small cap insider buys in last 90 days
    const url = 'http://openinsider.com/screener?s=&o=&pl=&ph=&st=p&fd=90&td=0&act=B&lt=1&mc=3&cnt=500'
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(2000)

    const purchases = await page.evaluate(() => {
      const rows: { ticker: string; value: number }[] = []
      document.querySelectorAll('table.tinytable tr, table.non-mobile tr').forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td'))
        if (cells.length < 10) return

        // Find ticker: short uppercase text in a link
        let ticker = ''
        for (const cell of cells) {
          const link = cell.querySelector('a')
          const text = link?.textContent?.trim() || ''
          if (/^[A-Z]{1,5}$/.test(text)) {
            ticker = text
            break
          }
        }
        if (!ticker) return

        // Find value: last cell containing $
        let value = 0
        for (let i = cells.length - 1; i >= 0; i--) {
          const text = cells[i]?.textContent?.trim() || ''
          if (text.includes('$')) {
            value = Math.abs(parseFloat(text.replace(/[$,+\-]/g, '')) || 0)
            break
          }
        }

        rows.push({ ticker, value })
      })
      return rows
    })

    // Aggregate for our candidates only
    for (const p of purchases) {
      if (!tickers.has(p.ticker)) continue
      const existing = result.get(p.ticker) || { count: 0, value: 0 }
      existing.count++
      existing.value += p.value
      result.set(p.ticker, existing)
    }

    log(`  ${purchases.length} total purchases, ${result.size} match our candidates`)
  } catch (err) {
    log(`  ⚠️ OpenInsider error: ${err}`)
  }

  await page.close()
  return result
}

// ============================================================
// Phase 3: Reddit Buzz 교차검증
// ============================================================

async function getRedditBuzz(
  tickers: string[]
): Promise<Map<string, { mentions: number; sentiment: number | null; buzz_score: number | null }>> {
  log('Phase 3: Reddit buzz cross-reference')
  const result = new Map<string, { mentions: number; sentiment: number | null; buzz_score: number | null }>()

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toISOString().split('T')[0]

  // Batch query (supabase .in() has a limit, chunk if needed)
  const CHUNK = 100
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from('reddit_buzz')
      .select('ticker, total_mentions, sentiment_score, buzz_score')
      .in('ticker', chunk)
      .gte('scan_date', weekAgoStr)

    if (error) {
      log(`  ⚠️ Reddit buzz query error: ${error.message}`)
      continue
    }

    // Aggregate per ticker
    for (const row of data || []) {
      const existing = result.get(row.ticker) || { mentions: 0, sentiment: null, buzz_score: null }
      existing.mentions += row.total_mentions || 0
      if (row.sentiment_score != null) {
        existing.sentiment = existing.sentiment != null
          ? (existing.sentiment + row.sentiment_score) / 2
          : row.sentiment_score
      }
      if (row.buzz_score != null) {
        existing.buzz_score = Math.max(existing.buzz_score ?? 0, row.buzz_score)
      }
      result.set(row.ticker, existing)
    }
  }

  log(`  Reddit data for ${result.size} tickers`)
  return result
}

// ============================================================
// Phase 4: 복합 스코어링
// ============================================================

function calcGrowthScore(s: StockData): number {
  // All candidates passed Sales Q/Q >15% filter = confirmed growth
  let score = 25
  // PEG: 성장 대비 밸류에이션
  if (s.peg != null && s.peg > 0) {
    if (s.peg <= 0.5) score += 30
    else if (s.peg <= 1.0) score += 20
    else if (s.peg <= 1.5) score += 10
    else if (s.peg <= 2.0) score += 5
  }
  // 어닝 서프라이즈/가속 — Forward P/E < Trailing P/E
  // 연속 비트의 프록시: forward_pe/pe 비율이 낮을수록 이익 가속 강함
  if (s.forward_pe != null && s.pe != null && s.pe > 0 && s.forward_pe < s.pe) {
    const accelRatio = s.forward_pe / s.pe
    if (accelRatio < 0.6) score += 30      // 매우 강한 이익 가속
    else if (accelRatio < 0.8) score += 25 // 강한 이익 가속
    else score += 15                        // 이익 가속
  } else if (s.forward_pe != null && s.forward_pe > 0 && s.forward_pe < 25) {
    score += 10
  }
  // ROI as growth efficiency
  if (s.roi != null) {
    if (s.roi >= 25) score += 20
    else if (s.roi >= 15) score += 15
    else if (s.roi >= 10) score += 10
  }
  return Math.min(score, 100)
}

function calcValueScore(s: StockData): number {
  let score = 0
  if (s.peg != null && s.peg > 0) {
    if (s.peg <= 0.5) score += 30
    else if (s.peg <= 1.0) score += 25
    else if (s.peg <= 1.5) score += 15
    else if (s.peg <= 2.0) score += 10
  }
  if (s.ps != null && s.ps > 0) {
    if (s.ps <= 2) score += 25
    else if (s.ps <= 5) score += 15
    else if (s.ps <= 10) score += 5
  }
  if (s.pb != null && s.pb > 0) {
    if (s.pb <= 2) score += 25
    else if (s.pb <= 4) score += 15
    else if (s.pb <= 6) score += 5
  }
  if (s.pe != null && s.pe > 0) {
    if (s.pe <= 15) score += 20
    else if (s.pe <= 25) score += 10
    else if (s.pe <= 40) score += 5
  }
  return Math.min(score, 100)
}

function calcQualityScore(s: StockData): number {
  let score = 0
  // Current Ratio
  if (s.current_ratio != null) {
    if (s.current_ratio >= 2.0) score += 15
    else if (s.current_ratio >= 1.5) score += 12
    else if (s.current_ratio >= 1.0) score += 8
    else if (s.current_ratio >= 0.5) score += 3
  }
  // D/E
  if (s.debt_to_equity != null) {
    if (s.debt_to_equity <= 0.3) score += 20
    else if (s.debt_to_equity <= 0.5) score += 18
    else if (s.debt_to_equity <= 1.0) score += 12
    else if (s.debt_to_equity <= 2.0) score += 5
  } else {
    score += 10
  }
  // Operating Margin
  if (s.operating_margin != null) {
    if (s.operating_margin >= 25) score += 20
    else if (s.operating_margin >= 15) score += 15
    else if (s.operating_margin >= 10) score += 10
    else if (s.operating_margin >= 5) score += 5
  }
  // ROE
  if (s.roe != null) {
    if (s.roe >= 25) score += 20
    else if (s.roe >= 15) score += 15
    else if (s.roe >= 10) score += 10
    else if (s.roe >= 5) score += 5
  }
  // Profit Margin
  if (s.profit_margin != null) {
    if (s.profit_margin >= 15) score += 25
    else if (s.profit_margin >= 10) score += 20
    else if (s.profit_margin >= 5) score += 15
    else if (s.profit_margin > 0) score += 10
  }
  return Math.min(score, 100)
}

// 하이퍼그로스 트랙용 Quality — 적자 기업도 평가 가능
// 핵심: 매출 성장 + 그로스 마진 + 현금 체력(유동비율) 중심
function calcHypergrowthQuality(s: StockData): number {
  let score = 0
  // Gross Margin — 적자라도 그로스 마진이 높으면 스케일링 시 흑자전환 가능
  if (s.gross_margin != null) {
    if (s.gross_margin >= 60) score += 30
    else if (s.gross_margin >= 40) score += 25
    else if (s.gross_margin >= 20) score += 15
    else if (s.gross_margin >= 0) score += 5
  }
  // Current Ratio — 캐시 체력 (적자 버틸 수 있는지)
  if (s.current_ratio != null) {
    if (s.current_ratio >= 3.0) score += 25
    else if (s.current_ratio >= 2.0) score += 20
    else if (s.current_ratio >= 1.5) score += 15
    else if (s.current_ratio >= 1.0) score += 8
  }
  // D/E — 낮을수록 좋음 (적자 + 고부채 = 위험)
  if (s.debt_to_equity != null) {
    if (s.debt_to_equity <= 0.3) score += 25
    else if (s.debt_to_equity <= 0.5) score += 20
    else if (s.debt_to_equity <= 1.0) score += 12
    else if (s.debt_to_equity <= 2.0) score += 5
  } else {
    score += 12
  }
  // 적자 축소 신호 — 영업이익률이 음수지만 개선 중인지
  if (s.operating_margin != null && s.operating_margin < 0) {
    if (s.operating_margin > -10) score += 20  // 소폭 적자 = 흑자전환 임박
    else if (s.operating_margin > -20) score += 10
  }
  return Math.min(score, 100)
}

function calcMomentumScore(s: StockData): number {
  let score = 0
  if (s.perf_year != null) {
    if (s.perf_year >= 100) score += 25
    else if (s.perf_year >= 50) score += 20
    else if (s.perf_year >= 20) score += 15
    else if (s.perf_year >= 0) score += 5
  }
  if (s.perf_half != null) {
    if (s.perf_half >= 40) score += 25
    else if (s.perf_half >= 20) score += 20
    else if (s.perf_half >= 10) score += 12
    else if (s.perf_half >= 0) score += 5
  }
  if (s.perf_quarter != null) {
    if (s.perf_quarter >= 20) score += 25
    else if (s.perf_quarter >= 10) score += 20
    else if (s.perf_quarter >= 5) score += 12
    else if (s.perf_quarter >= 0) score += 5
  }
  if (s.perf_month != null) {
    if (s.perf_month >= 10) score += 15
    else if (s.perf_month >= 5) score += 12
    else if (s.perf_month >= 0) score += 5
  }
  if (s.perf_week != null && s.perf_week > 0) score += 10
  return Math.min(score, 100)
}

function calcInsiderScore(
  s: StockData,
  data?: { count: number; value: number }
): number {
  let score = 0
  if (data) {
    if (data.count >= 3) score += 40
    else if (data.count >= 2) score += 30
    else if (data.count >= 1) score += 20

    // 고액 인사이더 매수 — CEO/CFO급이 $100K+ 매수 시 강한 신호
    if (data.value >= 500_000) score += 30      // $500K+ = 매우 확신
    else if (data.value >= 100_000) score += 20  // $100K+ = 의미있는 매수
    else if (data.value >= 50_000) score += 10
  }
  if (s.insider_own_pct != null) {
    if (s.insider_own_pct >= 20) score += 20
    else if (s.insider_own_pct >= 10) score += 15
    else if (s.insider_own_pct >= 5) score += 10
  }
  if (s.insider_trans_pct != null && s.insider_trans_pct > 0) score += 10
  return Math.min(score, 100)
}

function calcSentimentScore(
  data?: { mentions: number; sentiment: number | null; buzz_score: number | null }
): number {
  if (!data || data.mentions === 0) return 20
  let score = 0
  if (data.mentions >= 20) score += 40
  else if (data.mentions >= 10) score += 30
  else if (data.mentions >= 5) score += 20
  else score += 10
  if (data.sentiment != null) {
    if (data.sentiment >= 0.3) score += 40
    else if (data.sentiment >= 0) score += 25
    else if (data.sentiment >= -0.3) score += 10
  }
  if (data.buzz_score != null && data.buzz_score > 100) score += 20
  return Math.min(score, 100)
}

function getFailReasons(s: StockData, isHypergrowth: boolean): string[] {
  const reasons: string[] = []
  if (s.debt_to_equity != null && s.debt_to_equity > 3) reasons.push('high_leverage')
  if (s.current_ratio != null && s.current_ratio < 0.5) reasons.push('liquidity_risk')
  if (s.avg_volume != null && s.avg_volume < MIN_AVG_VOLUME) reasons.push('low_volume')
  if (!isHypergrowth) {
    // profitable track에서만 적자를 red flag으로
    if (s.operating_margin != null && s.operating_margin < 0) reasons.push('unprofitable_ops')
    if (s.profit_margin != null && s.profit_margin < -10) reasons.push('deep_losses')
  } else {
    // hypergrowth track: 적자가 너무 심하면만 경고
    if (s.profit_margin != null && s.profit_margin < -50) reasons.push('extreme_burn')
    if (s.current_ratio != null && s.current_ratio < 1.0) reasons.push('cash_crunch')
  }
  if (s.short_float_pct != null && s.short_float_pct > 20) reasons.push('high_short')
  return reasons
}

function scoreStock(
  stock: StockData,
  insiderMap: Map<string, { count: number; value: number }>,
  redditMap: Map<string, { mentions: number; sentiment: number | null; buzz_score: number | null }>
): ScoredStock {
  const insider = insiderMap.get(stock.ticker)
  const reddit = redditMap.get(stock.ticker)

  // 트랙 결정: 영업이익 적자 → hypergrowth, 흑자 → profitable
  const isHypergrowth = (stock.operating_margin != null && stock.operating_margin < 0) ||
    (stock.profit_margin != null && stock.profit_margin < 0 && stock.pe == null)
  const track: 'profitable' | 'hypergrowth' = isHypergrowth ? 'hypergrowth' : 'profitable'

  const growth_score = calcGrowthScore(stock)
  const value_score = calcValueScore(stock)
  const quality_score = isHypergrowth ? calcHypergrowthQuality(stock) : calcQualityScore(stock)
  const momentum_score = calcMomentumScore(stock)
  const insider_score = calcInsiderScore(stock, insider)
  const sentiment_score = calcSentimentScore(reddit)

  let composite_score: number
  if (isHypergrowth) {
    // Hypergrowth: Growth 30% + Quality 20% + Momentum 20% + Insider 10% + Sentiment 10% + Value 10%
    composite_score =
      growth_score * 0.30 +
      quality_score * 0.20 +
      momentum_score * 0.20 +
      insider_score * 0.10 +
      sentiment_score * 0.10 +
      value_score * 0.10
  } else {
    // Profitable: Quality 25% + Growth 25% + Value 20% + Momentum 10% + Insider 10% + Sentiment 10%
    composite_score =
      quality_score * 0.25 +
      growth_score * 0.25 +
      value_score * 0.20 +
      momentum_score * 0.10 +
      insider_score * 0.10 +
      sentiment_score * 0.10
  }

  // 섹터 가산점 — 기술 중심 투자 철학 반영
  const sectorBonus = stock.sector ? (SECTOR_BONUS[stock.sector] ?? 0) : 0
  composite_score += sectorBonus

  // AI 관련도 가산점 — AI 기술주 중심 투자 방향
  const aiBonus = calcAiRelevance(stock)
  composite_score += aiBonus

  // 유동성 패널티 — 거래량 부족은 리스크
  if (stock.avg_volume != null && stock.avg_volume < MIN_AVG_VOLUME) {
    composite_score -= 10
  }

  const fail_reasons = getFailReasons(stock, isHypergrowth)

  let tier: 'A' | 'B' | 'C' | 'F'
  if (composite_score >= 70) tier = 'A'
  else if (composite_score >= 50) tier = 'B'
  else if (composite_score >= 35) tier = 'C'
  else tier = 'F'

  // Downgrade A with multiple red flags
  if (fail_reasons.length >= 2 && tier === 'A') tier = 'B'

  return {
    ...stock,
    insider_buys_3m: insider?.count || 0,
    insider_buy_value_3m: insider?.value || 0,
    reddit_mentions: reddit?.mentions || 0,
    reddit_sentiment: reddit?.sentiment ?? null,
    reddit_buzz_score: reddit?.buzz_score ?? null,
    growth_score: Math.round(growth_score * 10) / 10,
    value_score: Math.round(value_score * 10) / 10,
    quality_score: Math.round(quality_score * 10) / 10,
    momentum_score: Math.round(momentum_score * 10) / 10,
    insider_score: Math.round(insider_score * 10) / 10,
    sentiment_score: Math.round(sentiment_score * 10) / 10,
    composite_score: Math.round(composite_score * 10) / 10,
    rs_rank: 0, // calculated after all stocks scored
    tier,
    track,
    fail_reasons,
  }
}

// ============================================================
// Phase 5: DB 저장
// ============================================================

async function saveToDb(stocks: ScoredStock[]): Promise<void> {
  log('Phase 5: Saving to DB')
  if (DRY_RUN) { log('  (dry-run, skipping)'); return }

  const scanDate = new Date().toISOString().split('T')[0]

  // 오늘자 이전 데이터 삭제 (제외 필터 변경 시 잔여 데이터 방지)
  const { error: delErr } = await supabase
    .from('smallcap_screening')
    .delete()
    .eq('scan_date', scanDate)
  if (delErr) log(`  ⚠️ Delete error: ${delErr.message}`)
  else log(`  Cleared today's old data`)

  let saved = 0
  let errors = 0

  for (const s of stocks) {
    const { error } = await supabase
      .from('smallcap_screening')
      .upsert({
        scan_date: scanDate,
        ticker: s.ticker,
        company_name: s.company_name || null,
        sector: s.sector || null,
        industry: s.industry || null,
        country: s.country || null,
        market_cap_m: s.market_cap_m ?? null,
        price: s.price ?? null,
        change_pct: s.change_pct ?? null,
        volume: s.volume ?? null,
        avg_volume: s.avg_volume ?? null,
        pe: s.pe ?? null,
        forward_pe: s.forward_pe ?? null,
        peg: s.peg ?? null,
        ps: s.ps ?? null,
        pb: s.pb ?? null,
        roe: s.roe ?? null,
        roa: s.roa ?? null,
        roi: s.roi ?? null,
        gross_margin: s.gross_margin ?? null,
        operating_margin: s.operating_margin ?? null,
        profit_margin: s.profit_margin ?? null,
        current_ratio: s.current_ratio ?? null,
        quick_ratio: s.quick_ratio ?? null,
        debt_to_equity: s.debt_to_equity ?? null,
        perf_week: s.perf_week ?? null,
        perf_month: s.perf_month ?? null,
        perf_quarter: s.perf_quarter ?? null,
        perf_half: s.perf_half ?? null,
        perf_year: s.perf_year ?? null,
        perf_ytd: s.perf_ytd ?? null,
        insider_own_pct: s.insider_own_pct ?? null,
        insider_trans_pct: s.insider_trans_pct ?? null,
        inst_own_pct: s.inst_own_pct ?? null,
        inst_trans_pct: s.inst_trans_pct ?? null,
        short_float_pct: s.short_float_pct ?? null,
        insider_buys_3m: s.insider_buys_3m,
        insider_buy_value_3m: s.insider_buy_value_3m,
        reddit_mentions: s.reddit_mentions,
        reddit_sentiment: s.reddit_sentiment,
        reddit_buzz_score: s.reddit_buzz_score,
        growth_score: s.growth_score,
        value_score: s.value_score,
        quality_score: s.quality_score,
        momentum_score: s.momentum_score,
        insider_score: s.insider_score,
        sentiment_score: s.sentiment_score,
        composite_score: s.composite_score,
        rs_rank: s.rs_rank,
        tier: s.tier,
        track: s.track,
        fail_reasons: s.fail_reasons,
      }, { onConflict: 'scan_date,ticker' })

    if (error) {
      errors++
      if (errors <= 3) log(`  ⚠️ DB error ${s.ticker}: ${error.message}`)
    } else {
      saved++
    }
  }

  log(`  Saved: ${saved}, Errors: ${errors}`)
}

// ============================================================
// Phase 6: Telegram 리포트
// ============================================================

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
    if (!res.ok) log(`  ⚠️ Telegram send failed: ${res.status}`)
    if (chunks.length > 1) await sleep(500)
  }
}

function formatStockLine(s: ScoredStock): string {
  const cap = s.market_cap_m
    ? s.market_cap_m >= 1000
      ? `$${(s.market_cap_m / 1000).toFixed(1)}B`
      : `$${Math.round(s.market_cap_m)}M`
    : '?'
  const price = s.price ? `$${s.price.toFixed(2)}` : ''
  const trackEmoji = s.track === 'hypergrowth' ? '🚀' : '💰'
  const peg = s.peg != null ? `PEG ${s.peg.toFixed(1)}` : ''
  const gm = s.track === 'hypergrowth' && s.gross_margin != null ? `GM ${s.gross_margin.toFixed(0)}%` : ''
  const roe = s.track === 'profitable' && s.roe != null ? `ROE ${s.roe.toFixed(0)}%` : ''
  const de = s.debt_to_equity != null ? `D/E ${s.debt_to_equity.toFixed(1)}` : ''
  const halfPerf = s.perf_half != null
    ? `6M ${s.perf_half >= 0 ? '+' : ''}${s.perf_half.toFixed(0)}%`
    : ''
  const rs = `RS ${s.rs_rank}`

  let line = `\n${trackEmoji} ${s.ticker} (${cap}) — ${s.company_name || ''}\n`
  line += `  ${s.sector || ''} | Score ${s.composite_score.toFixed(1)} | ${price}\n`

  const metrics = [rs, peg, gm, roe, de, halfPerf].filter(Boolean).join(' | ')
  if (metrics) line += `  ${metrics}\n`

  const signals: string[] = []
  if (s.rs_rank >= 80) signals.push('📈RS상위')
  if (calcAiRelevance(s) > 0) signals.push('🤖AI')
  if (s.forward_pe != null && s.pe != null && s.pe > 0 && s.forward_pe < s.pe * 0.8) signals.push('⚡어닝가속')
  if (s.insider_buys_3m > 0) {
    const val = s.insider_buy_value_3m >= 100_000 ? ' $100K+' : ''
    signals.push(`💎인사이더 ${s.insider_buys_3m}건${val}`)
  }
  if (s.reddit_mentions > 0) signals.push(`📢Reddit ${s.reddit_mentions}회`)
  if (s.fail_reasons.length > 0) signals.push(`⚠️${s.fail_reasons.join(',')}`)
  if (signals.length > 0) line += `  ${signals.join(' | ')}\n`

  return line
}

function formatReport(stocks: ScoredStock[]): string {
  const date = new Date().toISOString().split('T')[0]
  const tierA = stocks.filter(s => s.tier === 'A')
  const tierB = stocks.filter(s => s.tier === 'B')
  const tierC = stocks.filter(s => s.tier === 'C')
  const hypergrowthCount = stocks.filter(s => s.track === 'hypergrowth').length
  const profitableCount = stocks.filter(s => s.track === 'profitable').length

  let report = `📊 소형주 스크리닝 (${date})\n\n`
  report += `총 ${stocks.length}개 | A: ${tierA.length} · B: ${tierB.length} · C: ${tierC.length}\n`
  report += `💰흑자 ${profitableCount}개 | 🚀적자성장 ${hypergrowthCount}개\n`
  report += `필터: Small Cap, Sales >15%, Vol >200K\n`
  report += `제외: 원자재·소비재·중국 | 가산: Tech·HC·Comms·AI | RS+어닝+인사이더\n`

  if (tierA.length > 0) {
    report += `\n🏆 Tier A (${tierA.length}개)`
    for (const s of tierA.slice(0, 10)) report += formatStockLine(s)
  }

  if (tierB.length > 0) {
    report += `\n⭐ Tier B (상위 ${Math.min(tierB.length, 10)}/${tierB.length}개)`
    for (const s of tierB.slice(0, 10)) report += formatStockLine(s)
  }

  if (tierC.length > 0) {
    report += `\n📋 Tier C: ${tierC.length}개 — 대시보드에서 확인\n`
  }

  return report
}

async function sendReport(stocks: ScoredStock[]): Promise<void> {
  log('Phase 6: Telegram report')
  if (DRY_RUN) {
    log('  (dry-run) Report preview:')
    console.log(formatReport(stocks))
    return
  }

  const chatId = await getCeoChatId()
  if (!chatId) {
    log('  ⚠️ No CEO chat ID, skipping Telegram')
    return
  }

  await sendTelegramMessage(chatId, formatReport(stocks))
  log('  Report sent')
}

// ============================================================
// Main
// ============================================================

async function main() {
  log('========================================')
  log('Smallcap screening pipeline starting')
  log(`Filters: ${FINVIZ_FILTERS}`)
  log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | ${HEADED ? 'HEADED' : 'HEADLESS'}`)
  log('========================================')

  const browser = await chromium.launch({ headless: !HEADED })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  })

  try {
    // Phase 1: Finviz
    const rawCandidates = await scrapeFinviz(context)
    if (rawCandidates.length === 0) {
      log('❌ No candidates from Finviz. Aborting.')
      return
    }

    // 섹터/산업/국가/핀테크 필터링
    const candidates = rawCandidates.filter(c => {
      if (c.sector && EXCLUDED_SECTORS.has(c.sector)) return false
      if (c.industry && EXCLUDED_INDUSTRIES.has(c.industry)) return false
      if (c.country && EXCLUDED_COUNTRIES.has(c.country)) return false
      // 핀테크 키워드 필터 — Finviz가 Tech로 분류해도 실제 핀테크면 제외
      const nameLower = (c.company_name || '').toLowerCase()
      if (FINTECH_KEYWORDS.some(kw => nameLower.includes(kw))) return false
      return true
    })
    const excluded = rawCandidates.length - candidates.length
    if (excluded > 0) log(`  Excluded ${excluded} stocks (Materials/Consumer/Fintech/Shipping/China)`)

    // Phase 2: OpenInsider
    const tickerSet = new Set(candidates.map(c => c.ticker))
    const insiderData = await scrapeOpenInsider(context, tickerSet)

    // Phase 3: Reddit buzz
    const redditData = await getRedditBuzz(candidates.map(c => c.ticker))

    // Phase 4: Score & rank
    log('Phase 4: Scoring')
    const scored = candidates
      .map(c => scoreStock(c, insiderData, redditData))

    // Phase 4b: Relative Strength (RS) — 상대강도 백분위
    // 3개월 + 6개월 퍼포먼스 합산 → 전체 대비 백분위 계산
    const rsValues = scored.map(s => {
      const q = s.perf_quarter ?? 0
      const h = s.perf_half ?? 0
      return { ticker: s.ticker, rs: q + h }
    }).sort((a, b) => a.rs - b.rs)

    const rsMap = new Map<string, number>()
    for (let i = 0; i < rsValues.length; i++) {
      rsMap.set(rsValues[i].ticker, Math.round((i / (rsValues.length - 1 || 1)) * 100))
    }

    // RS 백분위를 composite에 반영 + rs_rank 저장
    for (const s of scored) {
      const rank = rsMap.get(s.ticker) ?? 50
      s.rs_rank = rank
      // RS 상위 30% = +5, 하위 30% = -5
      if (rank >= 70) s.composite_score = Math.round((s.composite_score + 5) * 10) / 10
      else if (rank <= 30) s.composite_score = Math.round((s.composite_score - 5) * 10) / 10

      // RS 기반 tier 재조정
      if (s.composite_score >= 70) s.tier = 'A'
      else if (s.composite_score >= 50) s.tier = 'B'
      else if (s.composite_score >= 35) s.tier = 'C'
      else s.tier = 'F'
      if (s.fail_reasons.length >= 2 && s.tier === 'A') s.tier = 'B'
    }

    scored.sort((a, b) => b.composite_score - a.composite_score)

    const tiers = { A: 0, B: 0, C: 0, F: 0 }
    for (const s of scored) tiers[s.tier]++
    log(`  A=${tiers.A} B=${tiers.B} C=${tiers.C} F=${tiers.F}`)

    // Top 3 preview
    for (const s of scored.slice(0, 3)) {
      log(`  #${scored.indexOf(s) + 1} ${s.ticker} (${s.tier}) score=${s.composite_score} q=${s.quality_score} v=${s.value_score} m=${s.momentum_score}`)
    }

    // Phase 5: DB
    await saveToDb(scored)

    // Phase 6: Telegram
    await sendReport(scored)

    log('========================================')
    log(`Pipeline complete — ${scored.length} stocks scored`)
    log('========================================')
  } catch (err) {
    log(`❌ Pipeline error: ${err}`)
    try {
      const chatId = await getCeoChatId()
      if (chatId && !DRY_RUN) {
        await sendTelegramMessage(chatId, `⚠️ 소형주 스크리닝 오류: ${err}`)
      }
    } catch {}
    throw err
  } finally {
    await context.close()
    await browser.close()
  }
}

main().catch(err => {
  log(`Fatal: ${err}`)
  process.exit(1)
})
