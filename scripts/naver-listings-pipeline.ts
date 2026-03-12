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
// 네이버 API는 tradeType= (빈값)으로 매매+전세 혼합 반환 → tradeTypeCode로 분리
const MAX_SCROLL_PAGES = 20 // 최대 20페이지 (400건)

async function fetchAllArticles(
  page: Page,
  hscpNo: string,
): Promise<{ sale: any[]; rent: any[] }> {
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

  // 1) 단지 페이지 방문 → 첫 번째 API 응답 수집
  const pageUrl = `https://new.land.naver.com/complexes/${hscpNo}?ms=a1&a=APT&e=OPST`
  try { await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 20000 }) } catch {}
  await sleep(1500)

  if (rateLimitAbort) return { sale: [], rent: [] }

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

  // tradeTypeCode로 분리 (A1=매매, B1=전세)
  return {
    sale: rawArticles.filter(a => a.tradeTypeCode === 'A1'),
    rent: rawArticles.filter(a => a.tradeTypeCode === 'B1'),
  }
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

  const today = new Date().toISOString().split('T')[0]
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

      // 단지당 1회만 방문 → 매매+전세 동시 수집
      const freshPage = await context.newPage()
      try {
        const { sale, rent } = await fetchAllArticles(freshPage, hscpNo)

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
      } finally {
        await freshPage.close()
      }

      // 단지 간 딜레이
      await sleep(randomDelay())
    }
  } finally {
    await browser.close()
  }

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
