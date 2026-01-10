import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Akros DB - 서버 사이드에서 service role key 사용
const akrosUrl = 'https://iiicccnrnwdfawsvbacu.supabase.co'

const akrosServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpaWNjY25ybndkZmF3c3ZiYWN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTE0ODY4MSwiZXhwIjoyMDU2NzI0NjgxfQ.N1NgeWeZ16Lqhcxz_2ZRtefwEzDdsF1WwOM0xGHnX4k'
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

    // 1. product_meta에서 전체 상품 조회
    const { data: metaData, error: metaError } = await akrosDb
      .from('product_meta')
      .select('symbol, country, product_type, product_name, product_name_local, listing_date, index_fee, index_fee_min, product_issuer, index_provider')

    if (metaError) {
      console.error('Error fetching product meta:', metaError)
      return NextResponse.json({ error: 'Failed to fetch product meta', details: metaError.message }, { status: 500 })
    }

    if (!metaData || metaData.length === 0) {
      return NextResponse.json({ products: [], message: 'No product meta data found' })
    }

    // Akros 관련 상품만 필터링 (대소문자 무시)
    const akrosMetaData = metaData.filter(p =>
      p.index_provider && p.index_provider.toLowerCase().includes('akros')
    )

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
    const { data: figuresData, error: figuresError } = await akrosDb
      .from('product_figures')
      .select('symbol, date, market_cap, currency, product_flow')
      .in('symbol', symbols)
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false })

    if (figuresError) {
      console.error('Error fetching product figures:', figuresError)
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
        const audRate = exchangeRates.AUD || 0.65
        return marketCap * audRate
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
