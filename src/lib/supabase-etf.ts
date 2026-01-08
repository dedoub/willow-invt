import { createClient } from '@supabase/supabase-js'

// Akros DB - AUM 데이터용 (읽기 전용)
const akrosUrl = 'https://iiicccnrnwdfawsvbacu.supabase.co'
const akrosAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpaWNjY25ybndkZmF3c3ZiYWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNDg2ODEsImV4cCI6MjA1NjcyNDY4MX0.7dgnyX-EYMolEVvemR7c3chB194ay_mPtaVbY1qx7S4'
export const akrosDb = createClient(akrosUrl, akrosAnonKey)

// Willow Dashboard DB - ETF 메타 데이터용
const willowUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const willowAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
export const willowDb = createClient(willowUrl, willowAnonKey)

// ============ 타입 정의 ============

// Akros DB에서 가져오는 AUM 데이터
export interface AUMData {
  symbol: string
  date: string
  marketCap: number
  avgMonthlyAum: number  // 최근 1개월 평균 AUM
  marketPrice: number
  productFlow: number
  monthFlow: number  // 최근 1개월 Flow 합계
  currency: string
}

// Willow DB에 저장하는 ETF 메타 데이터
export interface ETFProduct {
  id: number
  symbol: string
  fund_name: string
  fund_url: string | null
  listing_date: string | null
  bank: string
  platform_min_fee: number
  platform_fee_percent: number
  pm_min_fee: number
  pm_fee_percent: number
  currency: string
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// 입력용 타입
export interface ETFProductInput {
  symbol: string
  fund_name: string
  fund_url?: string
  listing_date?: string
  bank?: string
  platform_min_fee?: number
  platform_fee_percent?: number
  pm_min_fee?: number
  pm_fee_percent?: number
  currency?: string
  notes?: string
  is_active?: boolean
}

// 화면 표시용 통합 데이터
export interface ETFDisplayData {
  id: number
  symbol: string
  fundName: string
  fundUrl: string | null
  listingDate: string | null
  bank: string
  aum: number | null
  flow: number | null
  platformMinFee: number
  platformFeePercent: number
  pmMinFee: number
  pmFeePercent: number
  platformMonthlyFee: number
  pmMonthlyFee: number
  totalMonthlyFee: number
  remainingFee: number | null  // 잔여수수료 (36개월 기준)
  remainingMonths: number | null  // 잔여개월
  currency: string
  date: string | null
  notes: string | null
  isActive: boolean
}

// ============ Akros DB 함수 (AUM 데이터) ============

export async function fetchAUMData(symbols: string[]): Promise<Map<string, AUMData>> {
  // 최근 1개월 날짜 계산
  const oneMonthAgo = new Date()
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
  const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0]

  const { data, error } = await akrosDb
    .from('product_figures')
    .select('symbol, date, market_cap, market_price, product_flow, currency')
    .in('symbol', symbols)
    .gte('date', oneMonthAgoStr)
    .order('date', { ascending: false })

  if (error) {
    console.error('Error fetching AUM data:', error)
    return new Map()
  }

  // 각 심볼별로 최신 데이터 + 1개월 Flow 합계 + 평균 AUM 계산
  const aumMap = new Map<string, AUMData>()
  const flowSumMap = new Map<string, number>()
  const aumSumMap = new Map<string, { sum: number; count: number }>()

  for (const row of data || []) {
    // 1개월 Flow 합계 계산
    const currentFlowSum = flowSumMap.get(row.symbol) || 0
    flowSumMap.set(row.symbol, currentFlowSum + (row.product_flow || 0))

    // AUM 합계 및 카운트 (평균 계산용)
    const aumStats = aumSumMap.get(row.symbol) || { sum: 0, count: 0 }
    aumSumMap.set(row.symbol, {
      sum: aumStats.sum + (row.market_cap || 0),
      count: aumStats.count + 1,
    })

    // 최신 데이터만 저장 (첫 번째 row가 최신)
    if (!aumMap.has(row.symbol)) {
      aumMap.set(row.symbol, {
        symbol: row.symbol,
        date: row.date,
        marketCap: row.market_cap || 0,
        avgMonthlyAum: 0, // 나중에 업데이트
        marketPrice: row.market_price || 0,
        productFlow: row.product_flow || 0,
        monthFlow: 0, // 나중에 업데이트
        currency: row.currency || 'USD',
      })
    }
  }

  // monthFlow 및 avgMonthlyAum 값 업데이트
  for (const [symbol, aumData] of aumMap) {
    aumData.monthFlow = flowSumMap.get(symbol) || 0
    const aumStats = aumSumMap.get(symbol)
    aumData.avgMonthlyAum = aumStats && aumStats.count > 0
      ? aumStats.sum / aumStats.count
      : aumData.marketCap
  }

  return aumMap
}

// 히스토리컬 데이터 (차트용)
export interface HistoricalAUMPoint {
  date: string
  totalAum: number
}

export interface HistoricalDataPoint {
  date: string
  totalAum: number
  totalMonthlyFee: number
  totalRemainingFee: number
}

// 히스토리컬 데이터 조회 (AUM, 월수수료, 잔여수수료)
export async function fetchHistoricalData(
  products: ETFProduct[],
  days: number = 30
): Promise<HistoricalDataPoint[]> {
  if (products.length === 0) return []

  const symbols = products.map(p => p.symbol)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split('T')[0]

  const { data, error } = await akrosDb
    .from('product_figures')
    .select('symbol, date, market_cap')
    .in('symbol', symbols)
    .gte('date', startDateStr)
    .order('date', { ascending: true })

  if (error) {
    console.error('Error fetching historical data:', error)
    return []
  }

  // 각 ETF의 36개월 종료일 및 수수료 정보
  const etfInfo = new Map<string, {
    endDate: Date
    listingDate: Date | null
    platformMinFee: number
    platformFeePercent: number
    pmMinFee: number
    pmFeePercent: number
  }>()

  for (const product of products) {
    const listingDate = product.listing_date ? new Date(product.listing_date) : null
    const endDate = listingDate ? new Date(listingDate) : new Date()
    if (listingDate) endDate.setMonth(endDate.getMonth() + 36)

    etfInfo.set(product.symbol, {
      endDate,
      listingDate,
      platformMinFee: Number(product.platform_min_fee) || 0,
      platformFeePercent: Number(product.platform_fee_percent) || 0,
      pmMinFee: Number(product.pm_min_fee) || 0,
      pmFeePercent: Number(product.pm_fee_percent) || 0,
    })
  }

  // 날짜별 데이터 집계
  const dailyDataMap = new Map<string, {
    totalAum: number
    monthlyFees: number[]
    remainingMonthsList: { fee: number; months: number }[]
  }>()

  for (const row of data || []) {
    const rowDate = new Date(row.date)
    const info = etfInfo.get(row.symbol)
    if (!info) continue

    // 36개월이 지났으면 해당 날짜부터 제외
    if (info.listingDate && rowDate > info.endDate) {
      continue
    }

    const aum = row.market_cap || 0

    // 월수수료 계산 (개별 ETF 기준)
    const platformMonthlyFee = Math.max(info.platformMinFee / 12, (aum * info.platformFeePercent) / 100 / 12)
    const pmMonthlyFee = Math.max(info.pmMinFee / 12, (aum * info.pmFeePercent) / 100 / 12)
    const monthlyFee = (platformMonthlyFee + pmMonthlyFee) * 0.25

    // 잔여개월 계산
    let remainingMonths = 0
    if (info.listingDate) {
      const monthsElapsed = (rowDate.getFullYear() - info.listingDate.getFullYear()) * 12
        + (rowDate.getMonth() - info.listingDate.getMonth())
      remainingMonths = Math.max(0, 36 - monthsElapsed)
    }

    const current = dailyDataMap.get(row.date) || { totalAum: 0, monthlyFees: [], remainingMonthsList: [] }
    current.totalAum += aum
    current.monthlyFees.push(monthlyFee)
    current.remainingMonthsList.push({ fee: monthlyFee, months: remainingMonths })
    dailyDataMap.set(row.date, current)
  }

  // 결과 변환
  const result: HistoricalDataPoint[] = []
  for (const [date, data] of dailyDataMap) {
    const totalMonthlyFee = data.monthlyFees.reduce((sum, fee) => sum + fee, 0) + 2083.33
    const totalRemainingFee = data.remainingMonthsList.reduce((sum, item) => sum + (item.fee * item.months), 0)

    result.push({
      date,
      totalAum: data.totalAum,
      totalMonthlyFee,
      totalRemainingFee,
    })
  }

  result.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

// 히스토리컬 총 AUM 조회 (기존 호환용)
export async function fetchHistoricalTotalAUM(
  products: ETFProduct[],
  days: number = 30
): Promise<HistoricalAUMPoint[]> {
  const data = await fetchHistoricalData(products, days)
  return data.map(d => ({ date: d.date, totalAum: d.totalAum }))
}

// ============ Willow DB 함수 (ETF 메타 데이터) ============

// ETF 목록 조회
export async function fetchETFProducts(bank?: string): Promise<ETFProduct[]> {
  let query = willowDb
    .from('etf_products')
    .select('*')
    .order('symbol', { ascending: true })

  if (bank) {
    query = query.eq('bank', bank)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching ETF products:', error)
    return []
  }

  return (data || []) as ETFProduct[]
}

// ETF 추가
export async function createETFProduct(input: ETFProductInput): Promise<ETFProduct | null> {
  const { data, error } = await willowDb
    .from('etf_products')
    .insert({
      symbol: input.symbol.toUpperCase(),
      fund_name: input.fund_name,
      fund_url: input.fund_url || null,
      listing_date: input.listing_date || null,
      bank: input.bank || 'ETC',
      platform_min_fee: input.platform_min_fee || 0,
      platform_fee_percent: input.platform_fee_percent || 0,
      pm_min_fee: input.pm_min_fee || 0,
      pm_fee_percent: input.pm_fee_percent || 0,
      currency: input.currency || 'USD',
      notes: input.notes || null,
      is_active: input.is_active !== false,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating ETF product:', error)
    return null
  }

  return data as ETFProduct
}

// ETF 수정
export async function updateETFProduct(id: number, input: Partial<ETFProductInput>): Promise<ETFProduct | null> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (input.symbol !== undefined) updateData.symbol = input.symbol.toUpperCase()
  if (input.fund_name !== undefined) updateData.fund_name = input.fund_name
  if (input.fund_url !== undefined) updateData.fund_url = input.fund_url
  if (input.listing_date !== undefined) updateData.listing_date = input.listing_date
  if (input.bank !== undefined) updateData.bank = input.bank
  if (input.platform_min_fee !== undefined) updateData.platform_min_fee = input.platform_min_fee
  if (input.platform_fee_percent !== undefined) updateData.platform_fee_percent = input.platform_fee_percent
  if (input.pm_min_fee !== undefined) updateData.pm_min_fee = input.pm_min_fee
  if (input.pm_fee_percent !== undefined) updateData.pm_fee_percent = input.pm_fee_percent
  if (input.currency !== undefined) updateData.currency = input.currency
  if (input.notes !== undefined) updateData.notes = input.notes
  if (input.is_active !== undefined) updateData.is_active = input.is_active

  const { data, error } = await willowDb
    .from('etf_products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating ETF product:', error)
    return null
  }

  return data as ETFProduct
}

// ETF 삭제
export async function deleteETFProduct(id: number): Promise<boolean> {
  const { error } = await willowDb
    .from('etf_products')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting ETF product:', error)
    return false
  }

  return true
}

// ============ 통합 데이터 함수 ============

// ETF 목록 + AUM 데이터 통합 조회
export async function fetchETFDisplayData(bank?: string): Promise<ETFDisplayData[]> {
  // 1. Willow DB에서 ETF 목록 조회
  const products = await fetchETFProducts(bank)

  if (products.length === 0) {
    return []
  }

  // 2. Akros DB에서 AUM 데이터 조회
  const symbols = products.map(p => p.symbol)
  const aumMap = await fetchAUMData(symbols)

  // 3. 데이터 통합
  const displayData: ETFDisplayData[] = products.map(product => {
    const aum = aumMap.get(product.symbol)

    // null/undefined 처리
    const platformMinFee = Number(product.platform_min_fee) || 0
    const platformFeePercent = Number(product.platform_fee_percent) || 0
    const pmMinFee = Number(product.pm_min_fee) || 0
    const pmFeePercent = Number(product.pm_fee_percent) || 0

    // 최근 1개월 평균 AUM 사용
    const avgAum = aum?.avgMonthlyAum || 0

    // Platform 월수수료 계산: Max(연간 Min Fee / 12, 평균 AUM × Fee% / 100 / 12)
    const platformMonthlyFee = aum
      ? Math.max(platformMinFee / 12, (avgAum * platformFeePercent) / 100 / 12)
      : platformMinFee / 12

    // PM 월수수료 계산: Max(연간 Min Fee / 12, 평균 AUM × Fee% / 100 / 12)
    const pmMonthlyFee = aum
      ? Math.max(pmMinFee / 12, (avgAum * pmFeePercent) / 100 / 12)
      : pmMinFee / 12

    // 총 월수수료 (Platform + PM)의 25%가 최종 수수료
    const totalMonthlyFee = (platformMonthlyFee + pmMonthlyFee) * 0.25

    // 잔여수수료 계산 (상장일로부터 36개월)
    let remainingFee: number | null = null
    let remainingMonths: number | null = null

    if (product.listing_date) {
      const listingDate = new Date(product.listing_date)
      const endDate = new Date(listingDate)
      endDate.setMonth(endDate.getMonth() + 36) // 상장일 + 36개월

      // 현재 날짜 기준 직전 달의 첫째 날 (1월이면 12월 1일)
      const now = new Date()
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)

      // 36개월 완전히 경과 - 잔여수수료 0
      if (endDate <= startDate) {
        remainingMonths = 0
        remainingFee = 0
      } else {
        const listingMonth = listingDate.getMonth()
        const listingYear = listingDate.getFullYear()
        const startMonth = startDate.getMonth()
        const startYear = startDate.getFullYear()
        const endMonth = endDate.getMonth()
        const endYear = endDate.getFullYear()
        const endDay = endDate.getDate()

        let totalMonths = 0
        let calcStartDate: Date

        // 첫 달 pro-rating (상장일이 직전달인 경우)
        if (listingMonth === startMonth && listingYear === startYear) {
          const daysInMonth = new Date(listingYear, listingMonth + 1, 0).getDate()
          const remainingDaysInMonth = daysInMonth - listingDate.getDate() + 1
          totalMonths += remainingDaysInMonth / daysInMonth
          calcStartDate = new Date(listingYear, listingMonth + 1, 1)
        } else if (listingDate > startDate) {
          // 당월 상장 (아직 시작하지 않음) - 전체 36개월
          remainingMonths = 36
          remainingFee = totalMonthlyFee * 36
          // 아래 계산 스킵
          calcStartDate = endDate // dummy to skip calculation
        } else {
          // 일반적인 경우 (전월 이전 상장)
          calcStartDate = startDate
        }

        // 당월 상장이 아닌 경우에만 계속 계산
        if (!(listingDate > startDate && listingMonth !== startMonth)) {
          // 중간 완전한 개월 수 (calcStartDate부터 endDate 달 직전까지)
          const endMonthStart = new Date(endYear, endMonth, 1)
          if (endMonthStart > calcStartDate) {
            const fullMonths = (endMonthStart.getFullYear() - calcStartDate.getFullYear()) * 12
              + (endMonthStart.getMonth() - calcStartDate.getMonth())
            totalMonths += fullMonths
          }

          // 마지막 달 pro-rating (endDate가 해당 달의 마지막 날이 아닌 경우)
          const daysInEndMonth = new Date(endYear, endMonth + 1, 0).getDate()
          if (endDay < daysInEndMonth) {
            // 마지막 달은 endDay일까지만 카운트
            totalMonths += endDay / daysInEndMonth
          } else {
            // 마지막 달 전체 카운트
            totalMonths += 1
          }

          remainingMonths = Math.max(0, totalMonths)
          remainingFee = totalMonthlyFee * remainingMonths
        }
      }
    }

    return {
      id: product.id,
      symbol: product.symbol,
      fundName: product.fund_name,
      fundUrl: product.fund_url,
      listingDate: product.listing_date,
      bank: product.bank,
      aum: aum?.marketCap || null,
      flow: aum?.monthFlow || null,
      platformMinFee,
      platformFeePercent,
      pmMinFee,
      pmFeePercent,
      platformMonthlyFee,
      pmMonthlyFee,
      totalMonthlyFee,
      remainingFee,
      remainingMonths,
      currency: product.currency,
      date: aum?.date || null,
      notes: product.notes,
      isActive: product.is_active,
    }
  })

  // 월수수료 기준 내림차순 정렬
  displayData.sort((a, b) => b.totalMonthlyFee - a.totalMonthlyFee)

  return displayData
}

// ============ 문서 관리 함수 (Supabase Storage) ============

const STORAGE_BUCKET = 'etf-documents'

export interface ETFDocument {
  name: string
  fullPath: string
  size: number
  createdAt: string
  updatedAt: string
}

// 문서 목록 조회
export async function fetchETFDocuments(symbol: string): Promise<ETFDocument[]> {
  const folderPath = `${symbol}/`

  const { data, error } = await willowDb.storage
    .from(STORAGE_BUCKET)
    .list(symbol, {
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (error) {
    console.error('Error fetching documents:', error)
    return []
  }

  return (data || [])
    .filter(file => file.name !== '.emptyFolderPlaceholder')
    .map(file => ({
      name: file.name,
      fullPath: `${folderPath}${file.name}`,
      size: file.metadata?.size || 0,
      createdAt: file.created_at || '',
      updatedAt: file.updated_at || '',
    }))
}

// 문서 업로드
export async function uploadETFDocument(
  symbol: string,
  file: File
): Promise<{ success: boolean; error?: string }> {
  const filePath = `${symbol}/${file.name}`

  const { error } = await willowDb.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true, // 같은 이름 파일 덮어쓰기
    })

  if (error) {
    console.error('Error uploading document:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// 문서 다운로드 URL 생성
export async function getDocumentDownloadUrl(
  symbol: string,
  fileName: string
): Promise<string | null> {
  const filePath = `${symbol}/${fileName}`

  const { data, error } = await willowDb.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, 60 * 60) // 1시간 유효

  if (error) {
    console.error('Error creating download URL:', error)
    return null
  }

  return data.signedUrl
}

// 문서 삭제
export async function deleteETFDocument(
  symbol: string,
  fileName: string
): Promise<boolean> {
  const filePath = `${symbol}/${fileName}`

  const { error } = await willowDb.storage
    .from(STORAGE_BUCKET)
    .remove([filePath])

  if (error) {
    console.error('Error deleting document:', error)
    return false
  }

  return true
}
