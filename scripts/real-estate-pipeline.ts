/**
 * 부동산 실거래가 데이터 파이프라인
 * - 국토부 API에서 매매/전월세 데이터를 가져와 Supabase에 저장
 * - 사용법: npx tsx scripts/real-estate-pipeline.ts [--full] [--months=N]
 *   --full: 15개월치 전체 로드 (기본: 최근 2개월)
 *   --months=N: 최근 N개월 로드
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'

// ============================================================
// Config
// ============================================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
const API_KEY = process.env.MOLIT_API_KEY!

const TRADE_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
const RENT_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'

// 추적 대상 지역
const DISTRICTS: Record<string, string> = {
  '11680': '강남구',
  '11650': '서초구',
  '11710': '송파구',
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
})

// ============================================================
// Helpers
// ============================================================
function getMonthRange(months: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    result.push(ym)
  }
  return result
}

function str(val: any): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function parseAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw
  return parseInt(String(raw).replace(/,/g, '').trim(), 10) || 0
}

function toDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ============================================================
// API Fetch
// ============================================================
async function fetchApi(url: string, districtCode: string, dealYm: string, pageNo = 1, numOfRows = 1000) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    LAWD_CD: districtCode,
    DEAL_YMD: dealYm,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  })

  const fullUrl = `${url}?${params.toString()}`
  const res = await fetch(fullUrl, {
    headers: { 'User-Agent': 'WillowDashboard/1.0' },
  })
  const text = await res.text()

  // Check for HTML error responses (blocked requests)
  if (text.startsWith('<!DOCTYPE') || text.startsWith('<HTML')) {
    throw new Error(`API blocked (${districtCode}/${dealYm}): HTTP ${res.status}`)
  }

  const parsed = xmlParser.parse(text)

  const header = parsed?.response?.header
  const resultCode = String(header?.resultCode || '').trim()

  // No response or error code
  if (header && resultCode && resultCode !== '00' && resultCode !== '000') {
    const msg = header?.resultMsg || 'Unknown API error'
    throw new Error(`API Error (${districtCode}/${dealYm}): ${msg} (code: ${resultCode})`)
  }

  const body = parsed?.response?.body
  const totalCount = body?.totalCount || 0
  let items = body?.items?.item || []
  if (!Array.isArray(items)) items = items ? [items] : []

  return { items, totalCount, pageNo: body?.pageNo || 1, numOfRows: body?.numOfRows || numOfRows }
}

async function fetchAllPages(url: string, districtCode: string, dealYm: string): Promise<any[]> {
  const first = await fetchApi(url, districtCode, dealYm, 1, 1000)
  let allItems = first.items
  const totalCount = first.totalCount

  if (totalCount > 1000) {
    const totalPages = Math.ceil(totalCount / 1000)
    for (let page = 2; page <= totalPages; page++) {
      await sleep(200)
      const next = await fetchApi(url, districtCode, dealYm, page, 1000)
      allItems = allItems.concat(next.items)
    }
  }

  return allItems
}

// ============================================================
// Trade Data Processing
// ============================================================
function mapTradeItem(item: any, districtCode: string) {
  const year = parseInt(item.dealYear, 10)
  const month = parseInt(item.dealMonth, 10)
  const day = parseInt(item.dealDay, 10)
  const areaSqm = parseFloat(item.excluUseAr || '0')

  return {
    district_code: districtCode,
    dong_name: str(item.umdNm),
    complex_name: str(item.aptNm),
    deal_year: year,
    deal_month: month,
    deal_day: day,
    deal_date: toDate(year, month, day),
    area_sqm: areaSqm,
    floor: parseInt(item.floor || '0', 10),
    deal_amount: parseAmount(item.dealAmount || '0'),
    build_year: parseInt(item.buildYear || '0', 10) || null,
    dong: str(item.aptDong) || null,
    buyer_type: str(item.buyerGbn) || null,
    dealer_address: str(item.estateAgentSggNm) || null,
    registration_type: str(item.dealingGbn) || null,
    cancel_yn: str(item.cdealType) || 'N',
    cancel_date: str(item.cdealDay) || null,
    jibun: str(item.jibun) || null,
  }
}

// ============================================================
// Rental Data Processing
// ============================================================
function mapRentalItem(item: any, districtCode: string) {
  const year = parseInt(item.dealYear, 10)
  const month = parseInt(item.dealMonth, 10)
  const day = parseInt(item.dealDay, 10)
  const areaSqm = parseFloat(item.excluUseAr || '0')
  const deposit = parseAmount(item.deposit || '0')
  const monthlyRent = parseAmount(item.monthlyRent || '0')

  return {
    district_code: districtCode,
    dong_name: str(item.umdNm),
    complex_name: str(item.aptNm),
    deal_year: year,
    deal_month: month,
    deal_day: day,
    deal_date: toDate(year, month, day),
    area_sqm: areaSqm,
    floor: parseInt(item.floor || '0', 10),
    rent_type: monthlyRent > 0 ? '월세' : '전세',
    deposit,
    monthly_rent: monthlyRent,
    build_year: parseInt(item.buildYear || '0', 10) || null,
    contract_type: str(item.contractType) || str(item.contractTp) || null,
    contract_term: str(item.contractTerm) || null,
    previous_deposit: item.preDeposit ? parseAmount(item.preDeposit) : null,
    previous_monthly_rent: item.preMonthlyRent ? parseAmount(item.preMonthlyRent) : null,
    jibun: str(item.jibun) || null,
  }
}

// ============================================================
// Upsert to Supabase
// ============================================================
async function upsertTrades(records: any[]): Promise<number> {
  if (records.length === 0) return 0
  let inserted = 0

  // Batch upsert in chunks of 500
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    const { error, data } = await supabase
      .from('re_trades')
      .upsert(chunk, {
        onConflict: 'district_code,complex_name,deal_year,deal_month,deal_day,area_sqm,floor,deal_amount',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      console.error(`  ❌ Trade upsert error:`, error.message)
    } else {
      inserted += data?.length || 0
    }
  }

  return inserted
}

async function upsertRentals(records: any[]): Promise<number> {
  if (records.length === 0) return 0
  let inserted = 0

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    const { error, data } = await supabase
      .from('re_rentals')
      .upsert(chunk, {
        onConflict: 'district_code,complex_name,deal_year,deal_month,deal_day,area_sqm,floor,deposit,monthly_rent',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      console.error(`  ❌ Rental upsert error:`, error.message)
    } else {
      inserted += data?.length || 0
    }
  }

  return inserted
}

// ============================================================
// Sync Log
// ============================================================
async function logSync(syncType: string, districtCode: string, dealYm: string, fetched: number, inserted: number, status = 'success', errorMsg?: string) {
  await supabase.from('re_sync_log').insert({
    sync_type: syncType,
    district_code: districtCode,
    deal_ym: dealYm,
    records_fetched: fetched,
    records_inserted: inserted,
    status,
    error_message: errorMsg,
  })
}

// ============================================================
// Auto-populate complexes from trade/rental data
// ============================================================
async function syncComplexes() {
  console.log('\n🏢 단지 마스터 동기화...')

  // Get distinct complexes from trades
  const { data: tradeCplx } = await supabase
    .from('re_trades')
    .select('complex_name, district_code, dong_name, build_year, jibun')

  // Get distinct complexes from rentals
  const { data: rentalCplx } = await supabase
    .from('re_rentals')
    .select('complex_name, district_code, dong_name, build_year, jibun')

  const all = [...(tradeCplx || []), ...(rentalCplx || [])]
  const seen = new Map<string, any>()

  for (const r of all) {
    const key = `${r.complex_name}|${r.district_code}|${r.dong_name}`
    if (!seen.has(key)) {
      seen.set(key, {
        name: r.complex_name,
        district_code: r.district_code,
        district_name: DISTRICTS[r.district_code] || r.district_code,
        dong_name: r.dong_name,
        build_year: r.build_year,
        jibun: r.jibun,
      })
    }
  }

  const complexes = Array.from(seen.values())
  if (complexes.length === 0) return

  for (let i = 0; i < complexes.length; i += 500) {
    const chunk = complexes.slice(i, i + 500)
    const { error } = await supabase
      .from('re_complexes')
      .upsert(chunk, { onConflict: 'name,district_code,dong_name', ignoreDuplicates: true })

    if (error) console.error('  ❌ Complex upsert error:', error.message)
  }

  console.log(`  ✅ ${complexes.length}개 단지 동기화 완료`)
}

// ============================================================
// Main Pipeline
// ============================================================
async function runPipeline() {
  const args = process.argv.slice(2)
  const isFull = args.includes('--full')
  const monthsArg = args.find(a => a.startsWith('--months='))
  const months = monthsArg ? parseInt(monthsArg.split('=')[1], 10) : (isFull ? 15 : 2)

  const dealYms = getMonthRange(months)
  const districtCodes = Object.keys(DISTRICTS)

  console.log(`🏠 부동산 실거래가 파이프라인 시작`)
  console.log(`📅 기간: ${dealYms[dealYms.length - 1]} ~ ${dealYms[0]} (${months}개월)`)
  console.log(`📍 지역: ${districtCodes.map(c => DISTRICTS[c]).join(', ')}`)
  console.log('')

  let totalTrades = 0
  let totalRentals = 0
  let totalTradesInserted = 0
  let totalRentalsInserted = 0

  for (const code of districtCodes) {
    console.log(`\n📍 ${DISTRICTS[code]} (${code})`)

    for (const ym of dealYms) {
      // --- 매매 ---
      try {
        const tradeItems = await fetchAllPages(TRADE_API, code, ym)
        const tradeRecords = tradeItems.map(item => mapTradeItem(item, code))
        const tradeInserted = await upsertTrades(tradeRecords)

        totalTrades += tradeRecords.length
        totalTradesInserted += tradeInserted
        console.log(`  📊 ${ym} 매매: ${tradeRecords.length}건 조회, ${tradeInserted}건 저장`)

        await logSync('trade', code, ym, tradeRecords.length, tradeInserted)
      } catch (e: any) {
        console.error(`  ❌ ${ym} 매매 오류: ${e.message}`)
        await logSync('trade', code, ym, 0, 0, 'error', e.message)
      }

      await sleep(300) // API rate limit 방지

      // --- 전월세 ---
      try {
        const rentItems = await fetchAllPages(RENT_API, code, ym)
        const rentRecords = rentItems.map(item => mapRentalItem(item, code))
        const rentInserted = await upsertRentals(rentRecords)

        totalRentals += rentRecords.length
        totalRentalsInserted += rentInserted
        console.log(`  🏠 ${ym} 전월세: ${rentRecords.length}건 조회, ${rentInserted}건 저장`)

        await logSync('rental', code, ym, rentRecords.length, rentInserted)
      } catch (e: any) {
        console.error(`  ❌ ${ym} 전월세 오류: ${e.message}`)
        await logSync('rental', code, ym, 0, 0, 'error', e.message)
      }

      await sleep(300)
    }
  }

  // 단지 마스터 동기화
  await syncComplexes()

  console.log(`\n✅ 파이프라인 완료`)
  console.log(`   매매: ${totalTrades}건 조회 → ${totalTradesInserted}건 저장`)
  console.log(`   전월세: ${totalRentals}건 조회 → ${totalRentalsInserted}건 저장`)
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
