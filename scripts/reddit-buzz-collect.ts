import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

// ============================================================
// Reddit Buzz Collector — 레딧 버즈 정량 수집기
// ============================================================
// 매일 16:00 실행: Reddit API → 티커 멘션 추출 → DB 저장
// 목적: 버즈 시계열 데이터 축적 → 선행지표 분석용
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const SUBREDDITS = ['wallstreetbets', 'stocks', 'investing', 'options']
const USER_AGENT = 'willow-buzz-collector/1.0 (by /u/willow-inv)'

const LOG_PREFIX = '[reddit-buzz-collect]'
function log(msg: string) {
  console.log(`${LOG_PREFIX} [${new Date().toISOString()}] ${msg}`)
}

// ── False positives: common English words that look like tickers ──
const FALSE_POSITIVES = new Set([
  // 1-2 char
  'I', 'A', 'AM', 'PM', 'AI', 'AT', 'AN', 'AS', 'BE', 'BY', 'DD', 'DO',
  'ET', 'EV', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY',
  'NO', 'OF', 'OK', 'ON', 'OR', 'RE', 'SO', 'TO', 'UP', 'US', 'WE',
  // 3 char common
  'CEO', 'CFO', 'CTO', 'COO', 'IPO', 'ATH', 'IMO', 'FYI', 'LOL', 'OMG',
  'RIP', 'WTF', 'GDP', 'CPI', 'FED', 'SEC', 'OTC', 'RSI', 'EMA', 'SMA',
  'EPS', 'ROI', 'YOY', 'MOM', 'QOQ', 'THE', 'AND', 'BUT', 'NOT', 'ARE',
  'ALL', 'ANY', 'CAN', 'HAS', 'HAD', 'HOW', 'WAS', 'DID', 'NEW', 'OLD',
  'BIG', 'TOP', 'LOW', 'RED', 'HIT', 'RUN', 'PUT', 'SAY', 'MAY', 'DAY',
  'WAY', 'OWN', 'TRY', 'GOT', 'LET', 'OUT', 'NOW', 'YOU', 'GET', 'ITS',
  'ONE', 'TWO', 'TEN', 'OFF', 'WHY', 'WHO', 'SET', 'OUR', 'END', 'MAN',
  'WIN', 'API', 'ETF', 'USA', 'FOR', 'PER', 'AVG', 'MAX', 'MIN', 'NET',
  'TAX', 'IRA', 'LLC', 'INC', 'LTD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY',
  'AMA', 'FAQ', 'TIL', 'PSA', 'FYI', 'ELI', 'TBH', 'SMH', 'IMO', 'IMHO',
  // 4 char common
  'EDIT', 'HUGE', 'JUST', 'LIKE', 'LONG', 'OVER', 'VERY', 'WILL', 'WELL',
  'ALSO', 'BEEN', 'GOOD', 'MUCH', 'ONLY', 'SOME', 'WHAT', 'WHEN', 'MORE',
  'MOST', 'NEXT', 'THEY', 'THEM', 'THAN', 'THAT', 'THIS', 'THEN', 'WERE',
  'HAVE', 'KEEP', 'HOLD', 'CALL', 'SELL', 'MAKE', 'MADE', 'NEED', 'BACK',
  'EVEN', 'YOLO', 'HODL', 'MOON', 'PUMP', 'DUMP', 'BEAR', 'BULL', 'CASH',
  'BOND', 'FUND', 'BANK', 'DEBT', 'LOAN', 'RATE', 'RISK', 'GAIN', 'LOSS',
  'HIGH', 'DIPS', 'FREE', 'SAFE', 'PRAY', 'HOPE', 'HELP', 'LMAO', 'LMFAO',
  'FOMO', 'FIRE', 'BAGS', 'PUTS', 'LEAP', 'ROTH',
  // Options/trading jargon
  'ATM', 'ITM', 'OTM', 'NTM', 'DTE', 'LEAPS', 'CC', 'CSP', 'DCA',
  'PMCC', 'BPS', 'BCS', 'PCS', 'CCS', 'IV', 'HV', 'VIX', 'IC', 'DR',
  'ER', 'PT', 'SP', 'QE', 'QT', 'YTD', 'MTD', 'AH', 'PM', 'TD',
  'RH', 'WR', 'TA', 'FA', 'PE', 'PB', 'PS', 'NAV', 'AUM', 'TBD',
  'CF', 'FCF', 'DCF', 'MOASS', 'SI', 'FD', 'OI', 'GEX', 'DEX',
  // Subreddit/platform names & common abbreviations
  'WSB', 'GTC', 'TL', 'OP', 'PP', 'PR', 'HR', 'VP', 'IT', 'QA',
  'UI', 'UX', 'ML', 'NLP', 'GPU', 'CPU', 'RAM', 'SSD', 'HDD',
  // 5+ char common
  'STILL', 'THINK', 'WANT', 'WORK', 'ABOUT', 'WOULD', 'COULD', 'SHOULD',
  'OTHER', 'EVERY', 'THESE', 'THOSE', 'THEIR', 'WHICH', 'WHERE', 'AFTER',
  'SHARE', 'GOING', 'STOCK', 'MONEY', 'PRICE', 'TRADE', 'SHORT', 'CALLS',
  'GAINS', 'BEING', 'NEVER', 'FIRST', 'SINCE', 'UNTIL', 'WHILE', 'MAYBE',
  'GONNA', 'POINT', 'RIGHT', 'YEARS', 'TODAY', 'CRASH', 'HEDGE', 'YIELD',
  'INDEX', 'RALLY', 'BONDS', 'FUNDS', 'TAXES', 'GREAT', 'WORTH', 'ABOVE',
  'BELOW', 'UNDER', 'THOSE', 'AHEAD', 'GAMMA', 'THETA', 'DELTA', 'ALPHA',
  'SIGMA', 'BASED', 'WATCH', 'CHECK', 'LOOKS', 'THING', 'WHOLE', 'FEELS',
])

// ── Sentiment keywords ──
const BULLISH_WORDS = new Set([
  'moon', 'rocket', 'buy', 'bullish', 'calls', 'diamond',
  'tendies', 'squeeze', 'undervalued', 'breakout', 'rally',
  'soar', 'surge', 'boom', 'printing', 'loaded', 'ripping',
  'mooning', 'lambo', 'launch', 'parabolic', 'accumulate',
])

const BEARISH_WORDS = new Set([
  'puts', 'bearish', 'crash', 'dump', 'overvalued', 'sell',
  'dead', 'rug', 'drill', 'tank', 'bust', 'fade', 'plunge',
  'collapse', 'bubble', 'scam', 'fraud', 'bagholding', 'rekt',
  'worthless', 'bankrupt', 'dilution', 'sinking', 'bleeding',
])

// ── Types ──
interface RedditPost {
  title: string
  selftext: string
  score: number
  upvote_ratio: number
  num_comments: number
  permalink: string
  subreddit: string
  created_utc: number
}

interface TickerBuzz {
  ticker: string
  mentions: number
  upvotes: number
  comments: number
  upvoteRatios: number[]
  bullishCount: number
  bearishCount: number
  posts: { title: string; url: string; score: number; subreddit: string }[]
  subredditCounts: Record<string, { mentions: number; upvotes: number }>
}

// ── Reddit API (public JSON, no auth needed) ──
async function fetchSubredditPosts(
  subreddit: string,
  sort: 'hot' | 'rising',
  limit = 100
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!res.ok) {
      log(`⚠️ ${subreddit}/${sort} HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    return (data?.data?.children || []).map((child: any) => child.data as RedditPost)
  } catch (err) {
    log(`❌ ${subreddit}/${sort} fetch error: ${err}`)
    return []
  }
}

// ── Ticker extraction ──
function extractTickers(text: string): string[] {
  const tickers = new Set<string>()

  // Pattern 1: $TICKER (most reliable on WSB)
  const dollarPattern = /\$([A-Z]{1,5})\b/g
  let match
  while ((match = dollarPattern.exec(text)) !== null) {
    const t = match[1]
    if (!FALSE_POSITIVES.has(t) && t.length >= 2) {
      tickers.add(t)
    }
  }

  // Pattern 2: Standalone all-caps tokens (2-5 chars)
  const tokens = text.split(/[\s,.:;!?()\[\]{}"']+/)
  for (const token of tokens) {
    if (/^[A-Z]{2,5}$/.test(token) && !FALSE_POSITIVES.has(token)) {
      tickers.add(token)
    }
  }

  return Array.from(tickers)
}

// ── Sentiment scoring ──
function computeSentiment(text: string): { bullish: number; bearish: number } {
  const words = text.toLowerCase().split(/[\s,.:;!?()\[\]{}"']+/)
  let bullish = 0
  let bearish = 0

  for (const word of words) {
    if (BULLISH_WORDS.has(word)) bullish++
    if (BEARISH_WORDS.has(word)) bearish++
  }

  return { bullish, bearish }
}

// ── DB lookups ──
async function getHoldings(): Promise<Set<string>> {
  const { data } = await supabase
    .from('investment_tickers')
    .select('ticker')

  return new Set((data || []).map((r: any) => r.ticker.toUpperCase()))
}

// ── Main ──
async function main() {
  log('🔍 레딧 버즈 수집 시작')

  const holdings = await getHoldings()
  log(`📊 보유 종목: ${holdings.size}개 (${Array.from(holdings).join(', ')})`)

  // Collect posts from all subreddits
  const allPosts: RedditPost[] = []

  for (const sub of SUBREDDITS) {
    const hot = await fetchSubredditPosts(sub, 'hot', 100)
    allPosts.push(...hot)

    await new Promise((r) => setTimeout(r, 1500)) // rate limit courtesy

    const rising = await fetchSubredditPosts(sub, 'rising', 50)
    allPosts.push(...rising)

    await new Promise((r) => setTimeout(r, 1500))

    log(`  r/${sub}: hot ${hot.length} + rising ${rising.length}`)
  }

  log(`📝 총 ${allPosts.length}개 포스트 수집`)

  // Deduplicate posts by permalink
  const seen = new Set<string>()
  const uniquePosts = allPosts.filter((p) => {
    if (seen.has(p.permalink)) return false
    seen.add(p.permalink)
    return true
  })
  log(`📝 중복 제거 후: ${uniquePosts.length}개`)

  // Extract tickers and aggregate
  const buzzMap = new Map<string, TickerBuzz>()

  for (const post of uniquePosts) {
    const text = `${post.title} ${post.selftext || ''}`
    const tickers = extractTickers(text)
    const sentiment = computeSentiment(text)

    for (const ticker of tickers) {
      if (!buzzMap.has(ticker)) {
        buzzMap.set(ticker, {
          ticker,
          mentions: 0,
          upvotes: 0,
          comments: 0,
          upvoteRatios: [],
          bullishCount: 0,
          bearishCount: 0,
          posts: [],
          subredditCounts: {},
        })
      }

      const buzz = buzzMap.get(ticker)!
      buzz.mentions++
      buzz.upvotes += post.score
      buzz.comments += post.num_comments
      buzz.upvoteRatios.push(post.upvote_ratio)
      buzz.bullishCount += sentiment.bullish
      buzz.bearishCount += sentiment.bearish

      // Keep top 3 posts by score
      buzz.posts.push({
        title: post.title,
        url: `https://reddit.com${post.permalink}`,
        score: post.score,
        subreddit: post.subreddit,
      })
      buzz.posts.sort((a, b) => b.score - a.score)
      if (buzz.posts.length > 3) buzz.posts = buzz.posts.slice(0, 3)

      // Subreddit breakdown
      const sub = post.subreddit.toLowerCase()
      if (!buzz.subredditCounts[sub]) {
        buzz.subredditCounts[sub] = { mentions: 0, upvotes: 0 }
      }
      buzz.subredditCounts[sub].mentions++
      buzz.subredditCounts[sub].upvotes += post.score
    }
  }

  log(`🎯 ${buzzMap.size}개 티커 추출`)

  // Filter: 2+ mentions or 1 mention with 100+ upvotes (noise reduction)
  const significantBuzz = Array.from(buzzMap.values()).filter(
    (b) => b.mentions >= 2 || b.upvotes >= 100
  )

  log(`📊 유의미한 티커: ${significantBuzz.length}개`)

  // Upsert to DB
  const today = new Date().toISOString().split('T')[0]
  let upserted = 0
  let errors = 0

  for (const buzz of significantBuzz) {
    const totalSentiment = buzz.bullishCount + buzz.bearishCount
    const sentimentScore =
      totalSentiment > 0
        ? (buzz.bullishCount - buzz.bearishCount) / totalSentiment
        : 0

    const sentimentLabel =
      sentimentScore > 0.3
        ? 'bullish'
        : sentimentScore < -0.3
          ? 'bearish'
          : totalSentiment === 0
            ? 'neutral'
            : 'mixed'

    const avgUpvoteRatio =
      buzz.upvoteRatios.length > 0
        ? buzz.upvoteRatios.reduce((a, b) => a + b, 0) / buzz.upvoteRatios.length
        : null

    // buzz_score = mentions * log2(1 + upvotes) * (1 + |sentiment|)
    const buzzScore =
      buzz.mentions * Math.log2(1 + buzz.upvotes) * (1 + Math.abs(sentimentScore))

    const topPost = buzz.posts[0] || null

    const row = {
      scan_date: today,
      ticker: buzz.ticker,
      total_mentions: buzz.mentions,
      total_upvotes: buzz.upvotes,
      total_comments: buzz.comments,
      avg_upvote_ratio: avgUpvoteRatio
        ? parseFloat(avgUpvoteRatio.toFixed(3))
        : null,
      sentiment_score: parseFloat(sentimentScore.toFixed(3)),
      sentiment_label: sentimentLabel,
      top_post_title: topPost?.title?.substring(0, 500) || null,
      top_post_url: topPost?.url || null,
      top_post_score: topPost?.score || null,
      subreddit_breakdown: buzz.subredditCounts,
      is_holding: holdings.has(buzz.ticker),
      is_watchlist: false,
      buzz_score: parseFloat(buzzScore.toFixed(2)),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('reddit_buzz')
      .upsert(row, { onConflict: 'scan_date,ticker' })

    if (error) {
      log(`❌ ${buzz.ticker} upsert 실패: ${error.message}`)
      errors++
    } else {
      upserted++
    }
  }

  log(`✅ ${upserted}/${significantBuzz.length}건 저장 완료 (에러: ${errors}건)`)

  // Log top 10 by buzz score
  const top10 = significantBuzz
    .sort((a, b) => {
      const scoreA = a.mentions * Math.log2(1 + a.upvotes)
      const scoreB = b.mentions * Math.log2(1 + b.upvotes)
      return scoreB - scoreA
    })
    .slice(0, 10)

  if (top10.length > 0) {
    log('\n📈 오늘의 Top 10 버즈:')
    for (const b of top10) {
      const tag = holdings.has(b.ticker) ? ' [보유]' : ''
      const totalSent = b.bullishCount + b.bearishCount
      const sentIcon =
        totalSent === 0
          ? '⚪'
          : b.bullishCount > b.bearishCount
            ? '🟢'
            : b.bearishCount > b.bullishCount
              ? '🔴'
              : '🟡'
      log(
        `  ${sentIcon} ${b.ticker}${tag}: ${b.mentions}멘션 | ↑${b.upvotes.toLocaleString()} | 💬${b.comments.toLocaleString()}`
      )
    }
  }

  // Holdings not mentioned today
  const mentionedTickers = new Set(significantBuzz.map((b) => b.ticker))
  const unmentioned = Array.from(holdings).filter((t) => !mentionedTickers.has(t))
  if (unmentioned.length > 0) {
    log(`\n🔇 오늘 레딧 미언급 보유종목: ${unmentioned.join(', ')}`)
  }

  log('\n🏁 레딧 버즈 수집 완료')
}

main().catch((err) => {
  log(`💥 치명적 오류: ${err}`)
  process.exit(1)
})
