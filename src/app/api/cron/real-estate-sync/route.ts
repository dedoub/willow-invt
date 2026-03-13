import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { XMLParser } from 'fast-xml-parser'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const TRADE_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev'
const RENT_API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'

const DISTRICTS: Record<string, string> = {
  '11680': '강남구',
  '11650': '서초구',
  '11710': '송파구',
}

const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: true })

// --- Helpers ---
function getMonthRange(months: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
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

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// --- API Fetch ---
async function fetchApi(url: string, apiKey: string, districtCode: string, dealYm: string, pageNo = 1, numOfRows = 1000) {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    LAWD_CD: districtCode,
    DEAL_YMD: dealYm,
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  })

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: { 'User-Agent': 'WillowDashboard/1.0' },
  })
  const text = await res.text()

  if (text.startsWith('<!DOCTYPE') || text.startsWith('<HTML')) {
    throw new Error(`API blocked (${districtCode}/${dealYm}): HTTP ${res.status}`)
  }

  const parsed = xmlParser.parse(text)
  const header = parsed?.response?.header
  const resultCode = String(header?.resultCode || '').trim()

  if (header && resultCode && resultCode !== '00' && resultCode !== '000') {
    throw new Error(`API Error (${districtCode}/${dealYm}): ${header?.resultMsg} (code: ${resultCode})`)
  }

  const body = parsed?.response?.body
  let items = body?.items?.item || []
  if (!Array.isArray(items)) items = items ? [items] : []

  return { items, totalCount: body?.totalCount || 0 }
}

async function fetchAllPages(url: string, apiKey: string, districtCode: string, dealYm: string): Promise<any[]> {
  const first = await fetchApi(url, apiKey, districtCode, dealYm, 1, 1000)
  let allItems = first.items

  if (first.totalCount > 1000) {
    const totalPages = Math.ceil(first.totalCount / 1000)
    for (let page = 2; page <= totalPages; page++) {
      await sleep(200)
      const next = await fetchApi(url, apiKey, districtCode, dealYm, page, 1000)
      allItems = allItems.concat(next.items)
    }
  }

  return allItems
}

// --- Data Mapping ---
function mapTradeItem(item: any, districtCode: string) {
  const year = parseInt(item.dealYear, 10)
  const month = parseInt(item.dealMonth, 10)
  const day = parseInt(item.dealDay, 10)

  return {
    district_code: districtCode,
    dong_name: str(item.umdNm),
    complex_name: str(item.aptNm),
    deal_year: year,
    deal_month: month,
    deal_day: day,
    deal_date: toDate(year, month, day),
    area_sqm: parseFloat(item.excluUseAr || '0'),
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

function mapRentalItem(item: any, districtCode: string) {
  const year = parseInt(item.dealYear, 10)
  const month = parseInt(item.dealMonth, 10)
  const day = parseInt(item.dealDay, 10)
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
    area_sqm: parseFloat(item.excluUseAr || '0'),
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

// --- Upsert ---
async function upsertBatch(supabase: any, table: string, records: any[], onConflict: string): Promise<number> {
  if (records.length === 0) return 0
  let inserted = 0

  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500)
    const { error, data } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.error(`${table} upsert error:`, error.message)
    } else {
      inserted += data?.length || 0
    }
  }

  return inserted
}

// --- Main ---
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const apiKey = process.env.MOLIT_API_KEY!
  const months = 2
  const dealYms = getMonthRange(months)
  const districtCodes = Object.keys(DISTRICTS)

  const logs: string[] = []
  let totalTrades = 0, totalRentals = 0
  let totalTradesInserted = 0, totalRentalsInserted = 0

  for (const code of districtCodes) {
    for (const ym of dealYms) {
      // Trade
      try {
        const tradeItems = await fetchAllPages(TRADE_API, apiKey, code, ym)
        const tradeRecords = tradeItems.map(item => mapTradeItem(item, code))
        const tradeInserted = await upsertBatch(
          supabase, 're_trades', tradeRecords,
          'district_code,complex_name,deal_year,deal_month,deal_day,area_sqm,floor,deal_amount'
        )
        totalTrades += tradeRecords.length
        totalTradesInserted += tradeInserted
        logs.push(`${DISTRICTS[code]} ${ym} 매매: ${tradeRecords.length}건→${tradeInserted}건`)

        await supabase.from('re_sync_log').insert({
          sync_type: 'trade', district_code: code, deal_ym: ym,
          records_fetched: tradeRecords.length, records_inserted: tradeInserted, status: 'success',
        })
      } catch (e: any) {
        logs.push(`${DISTRICTS[code]} ${ym} 매매 오류: ${e.message}`)
        await supabase.from('re_sync_log').insert({
          sync_type: 'trade', district_code: code, deal_ym: ym,
          records_fetched: 0, records_inserted: 0, status: 'error', error_message: e.message,
        })
      }

      await sleep(300)

      // Rental
      try {
        const rentItems = await fetchAllPages(RENT_API, apiKey, code, ym)
        const rentRecords = rentItems.map(item => mapRentalItem(item, code))
        const rentInserted = await upsertBatch(
          supabase, 're_rentals', rentRecords,
          'district_code,complex_name,deal_year,deal_month,deal_day,area_sqm,floor,deposit,monthly_rent'
        )
        totalRentals += rentRecords.length
        totalRentalsInserted += rentInserted
        logs.push(`${DISTRICTS[code]} ${ym} 전월세: ${rentRecords.length}건→${rentInserted}건`)

        await supabase.from('re_sync_log').insert({
          sync_type: 'rental', district_code: code, deal_ym: ym,
          records_fetched: rentRecords.length, records_inserted: rentInserted, status: 'success',
        })
      } catch (e: any) {
        logs.push(`${DISTRICTS[code]} ${ym} 전월세 오류: ${e.message}`)
        await supabase.from('re_sync_log').insert({
          sync_type: 'rental', district_code: code, deal_ym: ym,
          records_fetched: 0, records_inserted: 0, status: 'error', error_message: e.message,
        })
      }

      await sleep(300)
    }
  }

  // Sync complexes
  const { data: tradeCplx } = await supabase.from('re_trades').select('complex_name, district_code, dong_name, build_year, jibun')
  const { data: rentalCplx } = await supabase.from('re_rentals').select('complex_name, district_code, dong_name, build_year, jibun')
  const all = [...(tradeCplx || []), ...(rentalCplx || [])]
  const seen = new Map<string, any>()
  for (const r of all) {
    const key = `${r.complex_name}|${r.district_code}|${r.dong_name}`
    if (!seen.has(key)) {
      seen.set(key, {
        name: r.complex_name, district_code: r.district_code,
        district_name: DISTRICTS[r.district_code] || r.district_code,
        dong_name: r.dong_name, build_year: r.build_year, jibun: r.jibun,
      })
    }
  }
  const complexes = Array.from(seen.values())
  for (let i = 0; i < complexes.length; i += 500) {
    await supabase.from('re_complexes').upsert(complexes.slice(i, i + 500), { onConflict: 'name,district_code,dong_name', ignoreDuplicates: true })
  }

  const result = {
    success: true,
    trades: { fetched: totalTrades, inserted: totalTradesInserted },
    rentals: { fetched: totalRentals, inserted: totalRentalsInserted },
    complexes: complexes.length,
    logs,
  }

  console.log('Real estate sync completed:', JSON.stringify(result))
  return NextResponse.json(result)
}
