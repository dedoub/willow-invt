import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Akros DB - 서버 사이드에서 service role key 사용
const akrosUrl = process.env.AKROS_SUPABASE_URL!
const akrosServiceKey = process.env.AKROS_SUPABASE_SERVICE_KEY!
const akrosDb = createClient(akrosUrl, akrosServiceKey)

export async function GET() {
  try {
    // 0. 최신 환율 조회
    const { data: latestDateData } = await akrosDb
      .from('exchange_rates')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)

    let exchangeRates: Record<string, number> = { KRW: 1400, AUD: 0.65 }  // 기본값

    if (latestDateData && latestDateData.length > 0) {
      const latestDate = latestDateData[0].date
      const { data: ratesData } = await akrosDb
        .from('exchange_rates')
        .select('currency, rate')
        .eq('date', latestDate)

      if (ratesData) {
        exchangeRates = ratesData.reduce((acc: Record<string, number>, row) => {
          acc[row.currency] = row.rate
          return acc
        }, {})
      }
    }

    // 1. product_meta에서 Akros 상품 조회
    //    ⚠️ 필터를 서버측(ilike)에서 적용해야 함. 클라이언트 필터로 하면
    //    product_meta 전체(1000행 초과)가 PostgREST 기본 max-rows(1000)에서 잘린 뒤
    //    필터링돼 뒤쪽 Akros 상품이 조용히 누락됨 (40개 중 21개만 반환되던 버그).
    const { data: metaData, error: metaError } = await akrosDb
      .from('product_meta')
      .select('symbol, country, product_type, product_name, product_name_local, listing_date, index_fee, index_fee_min, product_issuer, index_provider')
      .ilike('index_provider', '%akros%')

    if (metaError) {
      console.error('Error fetching product meta:', metaError)
      return NextResponse.json({ error: 'Failed to fetch product meta', details: metaError.message }, { status: 500 })
    }

    if (!metaData || metaData.length === 0) {
      return NextResponse.json({ products: [], message: 'No product meta data found' })
    }

    // ilike 로 이미 Akros 만 조회됨 (index_provider NULL 방어만 유지)
    const akrosMetaData = metaData.filter(p => p.index_provider)

    if (akrosMetaData.length === 0) {
      return NextResponse.json({ products: [], message: 'No Akros products found' })
    }

    const symbols = akrosMetaData.map(p => p.symbol)

    // 2. index_provider_changes 테이블에서 변경 이력 조회 (변경일이 지난 상품만 제외)
    const today = new Date().toISOString().split('T')[0]
    const { data: changesData } = await akrosDb
      .from('index_provider_changes')
      .select('symbol, change_date')
      .lte('change_date', today)  // 변경일이 오늘 이하인 것 (오늘 포함)

    const changedSymbols = new Set((changesData || []).map(c => c.symbol))

    // 3. 최근 30일 날짜 계산
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    // 3. 최근 30일 product_figures 데이터 가져오기
    //    심볼수 × ~30일이 PostgREST 기본 max-rows(1000)를 넘을 수 있어 range 페이지네이션으로 전량 확보.
    //    (안 하면 오래된 날짜 row 가 잘려 30일 flow 합산이 일부 심볼에서 과소 집계됨)
    type FigureRow = { symbol: string; date: string; market_cap: number | null; currency: string | null; product_flow: number | null }
    const figuresData: FigureRow[] = []
    const FIG_PAGE = 1000
    for (let from = 0; ; from += FIG_PAGE) {
      const { data: page, error: figuresError } = await akrosDb
        .from('product_figures')
        .select('symbol, date, market_cap, currency, product_flow')
        .in('symbol', symbols)
        .gte('date', thirtyDaysAgoStr)
        .order('date', { ascending: false })
        .range(from, from + FIG_PAGE - 1)

      if (figuresError) {
        console.error('Error fetching product figures:', figuresError)
        break
      }
      if (!page || page.length === 0) break
      figuresData.push(...(page as FigureRow[]))
      if (page.length < FIG_PAGE) break
    }

    // 각 심볼별로 최신 데이터 + 30일 flow 합산 계산
    const latestFigures = new Map<string, { market_cap: number; currency: string; product_flow: number }>()
    const flowSumMap = new Map<string, number>()

    for (const row of figuresData || []) {
      // 30일 flow 합산
      const currentSum = flowSumMap.get(row.symbol) || 0
      flowSumMap.set(row.symbol, currentSum + (row.product_flow || 0))

      // 최신 데이터 (첫 번째 row가 최신)
      if (!latestFigures.has(row.symbol)) {
        latestFigures.set(row.symbol, {
          market_cap: row.market_cap || 0,
          currency: row.currency || 'USD',
          product_flow: 0, // 나중에 합산값으로 대체
        })
      }
    }

    // flow 합산값 적용
    for (const [symbol, figure] of latestFigures) {
      figure.product_flow = flowSumMap.get(symbol) || 0
    }

    // 4. 데이터 결합 (AUM=0 및 index_provider 변경 상품 제외)
    const products = akrosMetaData
      .filter(meta => {
        // index_provider가 변경된 상품 제외
        if (changedSymbols.has(meta.symbol)) return false
        // AUM이 0인 상품 제외
        const figure = latestFigures.get(meta.symbol)
        if (!figure || figure.market_cap === 0) return false
        return true
      })
      .map(meta => {
        const figure = latestFigures.get(meta.symbol)!
        const marketCap = figure.market_cap
        const indexFee = meta.index_fee || 0
        const indexFeeMin = meta.index_fee_min || 0

        // ARR 계산
        let arr: number
        if (meta.country === 'KR') {
          arr = Math.max(marketCap * indexFee, indexFeeMin / 100000000)
        } else {
          arr = Math.max(marketCap * indexFee, indexFeeMin)
        }

        return {
          symbol: meta.symbol,
          product_name: meta.product_name,
          product_name_local: meta.product_name_local,
          country: meta.country,
          product_type: meta.product_type,
          product_issuer: meta.product_issuer,
          index_provider: meta.index_provider,
          market_cap: marketCap,
          currency: figure.currency,
          listing_date: meta.listing_date,
          product_flow: figure.product_flow || 0,
          arr,
          index_fee: indexFee,
          index_fee_min: indexFeeMin,
        }
      })

    // AUM 기준 내림차순 정렬 (모든 통화를 USD로 환산하여 비교)
    const toUsd = (marketCap: number, currency: string) => {
      if (currency === 'KRW') {
        // KRW는 억원 단위이므로 1억원 = 100,000,000 KRW
        const krwRate = exchangeRates.KRW || 1400
        return (marketCap * 100000000) / krwRate
      }
      if (currency === 'AUD') {
        // AUD는 raw 호주달러, 환율은 USD당 AUD (예: 1.43)
        const audRate = exchangeRates.AUD || 1.5
        return marketCap / audRate
      }
      if (currency === 'JPY') {
        // JPY는 raw 엔화, 환율은 USD당 엔 (예: 163)
        const jpyRate = exchangeRates.JPY || 155
        return marketCap / jpyRate
      }
      return marketCap  // USD
    }
    products.sort((a, b) => toUsd(b.market_cap, b.currency) - toUsd(a.market_cap, a.currency))

    return NextResponse.json({ products })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
