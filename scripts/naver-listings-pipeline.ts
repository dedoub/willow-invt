/**
 * 네이버 부동산 매물 스냅샷 파이프라인 (Playwright 기반)
 * - Playwright로 실제 브라우저를 띄워 네이버 부동산 단지 페이지를 방문
 * - 브라우저 내 API 응답을 가로채서 매물 데이터 수집
 * - TLS fingerprinting 우회, 차단 방지
 *
 * 사용법:
 *   npx tsx scripts/naver-listings-pipeline.ts          # 매매+전세 스냅샷
 *   npx tsx scripts/naver-listings-pipeline.ts --sale    # 매매만
 *   npx tsx scripts/naver-listings-pipeline.ts --rent    # 전세만
 *   npx tsx scripts/naver-listings-pipeline.ts --headed  # 브라우저 표시 (디버깅)
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

// ============================================================
// Config
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// 요청 간 딜레이 (ms) - 차단 방지
const PAGE_DELAY_MIN = 5000
const PAGE_DELAY_MAX = 10000

// 추적 대상 단지 (hscpNo = 네이버 단지번호)
const TARGET_COMPLEXES: { name: string; district: string; hscpNo: string }[] = [
  // 강남구
  { name: '래미안대치팰리스', district: '강남구', hscpNo: '180280' },
  { name: '은마', district: '강남구', hscpNo: '236' },
  { name: '도곡렉슬', district: '강남구', hscpNo: '11698' },
  { name: '개포래미안포레스트', district: '강남구', hscpNo: '119219' },
  { name: "역삼I'PARK", district: '강남구', hscpNo: '17805' },
  { name: '강남센트럴아이파크', district: '강남구', hscpNo: '127482' },
  { name: '개나리푸르지오', district: '강남구', hscpNo: '17528' },
  { name: '개나리래미안', district: '강남구', hscpNo: '18213' },
  { name: '동부센트레빌', district: '강남구', hscpNo: '8710' },
  { name: '디에이치퍼스티어아이파크', district: '강남구', hscpNo: '134062' },
  { name: '래미안블레스티지', district: '강남구', hscpNo: '112228' },
  { name: '현대1,2차', district: '강남구', hscpNo: '712' },
  { name: '현대6,7차', district: '강남구', hscpNo: '724' },
  { name: '신현대(9,11,12차)', district: '강남구', hscpNo: '3037' },
  // 서초구
  { name: '래미안원베일리', district: '서초구', hscpNo: '142155' },
  { name: '반포자이', district: '서초구', hscpNo: '22853' },
  { name: '아크로리버파크', district: '서초구', hscpNo: '107613' },
  { name: '래미안퍼스티지', district: '서초구', hscpNo: '23759' },
  // 송파구
  { name: '잠실엘스', district: '송파구', hscpNo: '22627' },
  { name: '리센츠', district: '송파구', hscpNo: '22746' },
  { name: '트리지움', district: '송파구', hscpNo: '19127' },
  { name: '헬리오시티', district: '송파구', hscpNo: '111515' },
  { name: '파크리오', district: '송파구', hscpNo: '22675' },
]

// ============================================================
// Helpers
// ============================================================
async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function randomDelay(): number {
  return PAGE_DELAY_MIN + Math.random() * (PAGE_DELAY_MAX - PAGE_DELAY_MIN)
}

function parseNaverPrice(priceStr: string): number {
  if (!priceStr) return 0
  const cleaned = priceStr.replace(/,/g, '').trim()
  let total = 0

  const eokMatch = cleaned.match(/(\d+)억/)
  if (eokMatch) {
    total += parseInt(eokMatch[1]) * 10000 // 1억 = 10,000만원
  }

  const afterEok = cleaned.replace(/\d+억\s*/, '')
  if (afterEok && !eokMatch) {
    total = parseInt(afterEok) || 0
  } else if (afterEok) {
    total += parseInt(afterEok) || 0
  }

  return total
}

function formatPrice(price: number): string {
  if (price >= 10000) {
    const eok = Math.floor(price / 10000)
    const remainder = price % 10000
    return remainder ? `${eok}억 ${remainder.toLocaleString()}` : `${eok}억`
  }
  return `${price.toLocaleString()}`
}

// ============================================================
// Playwright: 단지 페이지 방문 후 page.evaluate로 페이지네이션
// ============================================================
let rateLimitAbort = false

// 단지 페이지 방문 + 스크롤 페이지네이션으로 전체 매물 수집
// 매매/전세를 분리 수집하여 대단지에서 매물 누락 방지
const MAX_SCROLL_PAGES = 40 // 최대 40페이지 (800건)

// 단일 거래유형 수집 (tradeType: 'A1'=매매, 'B1'=전세)
async function fetchArticlesByTradeType(
  page: Page,
  hscpNo: string,
  tradeType: 'A1' | 'B1',
): Promise<any[]> {
  if (rateLimitAbort) throw new Error('Rate limit abort — 이전 차단으로 중단됨')

  const seenIds = new Set<string>()
  const rawArticles: any[] = []
  let lastIsMore = false
  let pageCount = 0

  // 모든 API 응답을 지속적으로 수집
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.includes('/api/articles/complex/') || !url.includes(hscpNo)) return
    try {
      const status = response.status()
      if (status === 429 || status === 302 || status === 307) {
        rateLimitAbort = true
        console.error(`  🚫 Rate limited (${status}). 파이프라인 즉시 중단.`)
      }
      if (status === 200) {
        const data = await response.json()
        const articles = data?.articleList || []
        for (const a of articles) {
          const id = String(a.articleNo)
          if (!seenIds.has(id)) { seenIds.add(id); rawArticles.push(a) }
        }
        lastIsMore = data?.isMoreData ?? false
        pageCount++
      }
    } catch {}
  })

  // 1) 단지 페이지 방문 (거래유형 필터 적용: tradTpCd)
  const pageUrl = `https://new.land.naver.com/complexes/${hscpNo}?ms=a1&a=APT&e=OPST&tradTpCd=${tradeType}`
  try { await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 }) } catch {}
  await sleep(1500)

  if (rateLimitAbort) return []

  // 2) 스크롤로 추가 페이지 로드
  while (lastIsMore && pageCount < MAX_SCROLL_PAGES && !rateLimitAbort) {
    const prevCount = rawArticles.length
    await page.evaluate(() => {
      const listEl = document.querySelector('.item_list')
      if (listEl) listEl.scrollTop = listEl.scrollHeight
      window.scrollBy(0, 800)
    })
    await page.mouse.wheel(0, 500)
    await sleep(1500)

    // 새 데이터가 안 오면 중단
    if (rawArticles.length === prevCount) break
  }

  return rawArticles
}

// 매매+전세 분리 수집 래퍼
async function fetchAllArticles(
  context: BrowserContext,
  hscpNo: string,
  collectSale: boolean,
  collectRent: boolean,
): Promise<{ sale: any[]; rent: any[] }> {
  let sale: any[] = []
  let rent: any[] = []

  if (collectSale && !rateLimitAbort) {
    const salePage = await context.newPage()
    try {
      sale = await fetchArticlesByTradeType(salePage, hscpNo, 'A1')
    } finally {
      await salePage.close()
    }
    if (!rateLimitAbort && collectRent) await sleep(randomDelay())
  }

  if (collectRent && !rateLimitAbort) {
    const rentPage = await context.newPage()
    try {
      rent = await fetchArticlesByTradeType(rentPage, hscpNo, 'B1')
    } finally {
      await rentPage.close()
    }
  }

  return { sale, rent }
}

// ============================================================
// Data Mapping
// ============================================================
function mapArticle(
  article: any,
  hscpNo: string,
  complexName: string,
  district: string,
  tradeType: string,
  snapshotDate: string
) {
  const price = parseNaverPrice(article.dealOrWarrantPrc || article.prcInfo || '')
  const monthlyRent = article.rentPrc ? parseNaverPrice(String(article.rentPrc)) : 0
  const exclusiveSqm = parseFloat(article.area2 || article.exclusiveArea || article.spc2 || '0')
  const supplySqm = parseFloat(article.area1 || article.supplyArea || article.spc1 || '0')

  let tags: string[] = []
  if (Array.isArray(article.tagList)) {
    tags = article.tagList.filter((t: any) => typeof t === 'string' && t.length > 0)
  }

  return {
    snapshot_date: snapshotDate,
    complex_no: hscpNo,
    complex_name: complexName,
    district_name: district,
    article_no: String(article.articleNo || article.atclNo),
    trade_type: tradeType,
    price,
    monthly_rent: monthlyRent,
    area_type: article.areaName || null,
    area_supply_sqm: supplySqm || null,
    area_exclusive_sqm: exclusiveSqm || null,
    floor_info: article.floorInfo || article.flrInfo || null,
    direction: article.direction || null,
    confirm_date: article.articleConfirmYmd || article.cfmYmd || null,
    description: article.articleFeatureDesc || article.atclFetrDesc || null,
    tags: tags.length > 0 ? tags : null,
    realtor_name: article.realtorName || article.cpNm || null,
  }
}

// ============================================================
// Upsert to Supabase
// ============================================================
async function upsertListings(records: any[]): Promise<number> {
  if (records.length === 0) return 0
  let inserted = 0

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    const { error, data } = await supabase
      .from('re_naver_listings')
      .upsert(chunk, {
        onConflict: 'snapshot_date,article_no',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      console.error(`  ❌ Upsert error:`, error.message)
    } else {
      inserted += data?.length || 0
    }
  }

  return inserted
}

// ============================================================
// Daily Summary 집계 & 적재
// ============================================================
interface DailySummaryRow {
  snapshot_date: string
  complex_name: string
  trade_type: string
  area_band: number
  listing_count: number
  min_ppp: number
  max_ppp: number
  avg_ppp: number
}

function getAreaBand(pyeong: number): number | null {
  if (pyeong < 20) return null
  if (pyeong < 30) return 20
  if (pyeong < 40) return 30
  if (pyeong < 50) return 40
  if (pyeong < 60) return 50
  return 60
}

async function buildAndUpsertDailySummary(snapshotDate: string): Promise<number> {
  console.log('\n📊 일일 요약 적재 중...')

  // 해당 스냅샷 날짜의 모든 매물 조회 (1000행 제한 우회를 위해 페이징)
  const listings: any[] = []
  const PAGE_SIZE = 1000
  let offset = 0
  while (true) {
    const { data, error: fetchErr } = await supabase
      .from('re_naver_listings')
      .select('complex_name, district_name, trade_type, area_supply_sqm, area_type, price')
      .eq('snapshot_date', snapshotDate)
      .range(offset, offset + PAGE_SIZE - 1)
    if (fetchErr) {
      console.error('  ❌ 매물 조회 오류:', fetchErr.message)
      return 0
    }
    if (!data || data.length === 0) break
    listings.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (listings.length === 0) {
    console.log('  ⚠️ 해당 날짜 매물 없음')
    return 0
  }
  console.log(`  📋 매물 ${listings.length}건 조회 완료`)

  // 단지별, 거래타입별, 평형대별 집계
  const buckets = new Map<string, { prices: number[] }>()

  for (const l of listings) {
    const supplySqm = Number(l.area_supply_sqm) || 0
    const typeSqm = parseFloat(l.area_type || '0') || 0
    const sqm = supplySqm > 0 ? supplySqm : typeSqm
    if (sqm <= 0) continue

    const pyeong = sqm / 3.3058
    const band = getAreaBand(pyeong)
    if (band === null) continue

    const price = l.price
    if (!price || price <= 0) continue

    const ppp = price / pyeong

    const key = `${l.complex_name}|${l.trade_type}|${band}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { prices: [] }
      buckets.set(key, bucket)
    }
    bucket.prices.push(ppp)
  }

  // summary 행 생성
  const rows: DailySummaryRow[] = []
  for (const [key, bucket] of buckets) {
    const [complexName, tradeType, bandStr] = key.split('|')
    const prices = bucket.prices
    const sum = prices.reduce((a, b) => a + b, 0)

    rows.push({
      snapshot_date: snapshotDate,
      complex_name: complexName,
      trade_type: tradeType,
      area_band: parseInt(bandStr),
      listing_count: prices.length,
      min_ppp: Math.round(Math.min(...prices)),
      max_ppp: Math.round(Math.max(...prices)),
      avg_ppp: Math.round(sum / prices.length),
    })
  }

  if (rows.length === 0) {
    console.log('  ⚠️ 집계 결과 없음')
    return 0
  }

  // upsert
  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error: upsertError, data } = await supabase
      .from('re_listing_daily_summary')
      .upsert(chunk, {
        onConflict: 'snapshot_date,complex_name,trade_type,area_band',
      })
      .select('snapshot_date')

    if (upsertError) {
      console.error('  ❌ 요약 upsert 오류:', upsertError.message)
    } else {
      upserted += data?.length || 0
    }
  }

  console.log(`✅ ${upserted}건 적재 완료`)
  return upserted
}

// ============================================================
// Summary Output
// ============================================================
function printSummary(
  results: { name: string; district: string; trade: string; count: number; minPrice: number; maxPrice: number }[]
) {
  console.log('\n📋 매물 요약')
  console.log('─'.repeat(70))

  let currentDistrict = ''
  for (const r of results) {
    if (r.district !== currentDistrict) {
      currentDistrict = r.district
      console.log(`\n  🏢 ${currentDistrict}`)
    }

    console.log(`     ${r.name} [${r.trade}] ${r.count}건 (${formatPrice(r.minPrice)} ~ ${formatPrice(r.maxPrice)})`)
  }
}

// ============================================================
// Main Pipeline
// ============================================================
async function runPipeline() {
  const args = process.argv.slice(2)
  const saleOnly = args.includes('--sale')
  const rentOnly = args.includes('--rent')
  const headed = args.includes('--headed')

  const tradeLabel = saleOnly ? '매매만' : rentOnly ? '전세만' : '매매+전세'

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const activeComplexes = TARGET_COMPLEXES.filter(c => c.hscpNo)

  console.log(`🏠 네이버 매물 스냅샷 파이프라인 (Playwright)`)
  console.log(`📅 스냅샷 날짜: ${today}`)
  console.log(`🏢 대상 단지: ${activeComplexes.length}개`)
  console.log(`📊 거래유형: ${tradeLabel}`)
  console.log(`🌐 모드: ${headed ? 'headed (브라우저 표시)' : 'headless'}`)
  console.log('')

  // 브라우저 시작
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'ko-KR',
  })

  // webdriver 감지 우회
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  const page = await context.newPage()

  let totalListings = 0
  let totalInserted = 0
  const summaryResults: { name: string; district: string; trade: string; count: number; minPrice: number; maxPrice: number }[] = []

  try {
    // 먼저 네이버 부동산 메인 페이지 방문 (쿠키 획득)
    console.log('🌐 네이버 부동산 접속 중...')
    await page.goto('https://new.land.naver.com/', { waitUntil: 'domcontentloaded', timeout: 15000 })
    await sleep(2000)
    console.log('✅ 접속 완료\n')

    for (const { name, district, hscpNo } of activeComplexes) {
      if (rateLimitAbort) {
        console.log(`\n🚫 Rate limit으로 나머지 단지 스킵`)
        break
      }

      console.log(`🏢 ${name} (${district})`)

      // 매매/전세 분리 수집 (각각 별도 페이지)
      try {
        const { sale, rent } = await fetchAllArticles(context, hscpNo, !rentOnly, !saleOnly)

        // 매매 처리
        if (!rentOnly) {
          const records = sale.map(a =>
            mapArticle(a, hscpNo, name, district, a.tradeTypeName || '매매', today)
          )
          const inserted = await upsertListings(records)
          totalListings += records.length
          totalInserted += inserted
          console.log(`  📊 매매: ${records.length}건 → ${inserted}건 저장`)

          if (records.length > 0) {
            const prices = records.map(r => r.price).filter(p => p > 0)
            summaryResults.push({ name, district, trade: '매매', count: records.length, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) })
          }
        }

        // 전세 처리
        if (!saleOnly) {
          const records = rent.map(a =>
            mapArticle(a, hscpNo, name, district, a.tradeTypeName || '전세', today)
          )
          const inserted = await upsertListings(records)
          totalListings += records.length
          totalInserted += inserted
          console.log(`  📊 전세: ${records.length}건 → ${inserted}건 저장`)

          if (records.length > 0) {
            const prices = records.map(r => r.price).filter(p => p > 0)
            summaryResults.push({ name, district, trade: '전세', count: records.length, minPrice: Math.min(...prices), maxPrice: Math.max(...prices) })
          }
        }
      } catch (e: any) {
        console.error(`  ❌ 오류: ${e.message}`)
      }

      // 단지 간 딜레이
      await sleep(randomDelay())
    }
  } finally {
    await browser.close()
  }

  // Daily Summary 적재
  await buildAndUpsertDailySummary(today)

  // Summary
  printSummary(summaryResults)

  console.log(`\n✅ 스냅샷 완료`)
  console.log(`   총 ${totalListings}건 조회 → ${totalInserted}건 저장`)
}

// ============================================================
// Run
// ============================================================
runPipeline()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Pipeline failed:', e)
    process.exit(1)
  })
