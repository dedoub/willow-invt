import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

function getAkrosDb() {
  return createClient(
    process.env.AKROS_SUPABASE_URL!,
    process.env.AKROS_SUPABASE_SERVICE_KEY!
  )
}

export function registerEtfTools(server: McpServer) {
  server.registerTool('list_etf_products', {
    description: '[ETF/Akros] Akros ETF 상품 목록을 조회합니다 (AUM, ARR 포함)',
    inputSchema: z.object({
      country: z.string().optional().describe('국가 필터 (KR, US, AU 등)'),
    }),
  }, async ({ country }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_etf_products', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    try {
      const akrosDb = getAkrosDb()

      // Get product meta
      let metaQuery = akrosDb
        .from('product_meta')
        .select('symbol, country, product_type, product_name, product_name_local, listing_date, index_fee, index_fee_min, product_issuer, index_provider')

      if (country) {
        metaQuery = metaQuery.eq('country', country)
      }

      const { data: metaData, error: metaError } = await metaQuery

      if (metaError) return { content: [{ type: 'text' as const, text: `Error: ${metaError.message}` }], isError: true }

      // Filter Akros products
      const akrosProducts = (metaData || []).filter(p =>
        p.index_provider && p.index_provider.toLowerCase().includes('akros')
      )

      const symbols = akrosProducts.map(p => p.symbol)

      // Get latest figures
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: figuresData } = await akrosDb
        .from('product_figures')
        .select('symbol, date, market_cap, currency, product_flow')
        .in('symbol', symbols)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false })

      // Build latest figures map
      const latestFigures = new Map<string, { market_cap: number; currency: string }>()
      for (const row of figuresData || []) {
        if (!latestFigures.has(row.symbol)) {
          latestFigures.set(row.symbol, {
            market_cap: row.market_cap || 0,
            currency: row.currency || 'USD',
          })
        }
      }

      const products = akrosProducts
        .filter(meta => {
          const figure = latestFigures.get(meta.symbol)
          return figure && figure.market_cap > 0
        })
        .map(meta => {
          const figure = latestFigures.get(meta.symbol)!
          const indexFee = meta.index_fee || 0
          const indexFeeMin = meta.index_fee_min || 0
          const arr = meta.country === 'KR'
            ? Math.max(figure.market_cap * indexFee, indexFeeMin / 100000000)
            : Math.max(figure.market_cap * indexFee, indexFeeMin)

          return {
            symbol: meta.symbol,
            product_name: meta.product_name,
            country: meta.country,
            product_type: meta.product_type,
            product_issuer: meta.product_issuer,
            market_cap: figure.market_cap,
            currency: figure.currency,
            listing_date: meta.listing_date,
            arr,
            index_fee: indexFee,
          }
        })

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_etf_products', inputParams: { country } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(products, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  server.registerTool('get_aum_data', {
    description: '[ETF/Akros] 특정 ETF 상품의 AUM 히스토리를 조회합니다',
    inputSchema: z.object({
      symbol: z.string().describe('상품 심볼'),
      days: z.number().optional().describe('조회 기간 (일, 기본: 30)'),
    }),
  }, async ({ symbol, days }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_aum_data', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    try {
      const akrosDb = getAkrosDb()
      const period = days || 30
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - period)

      const { data, error } = await akrosDb
        .from('product_figures')
        .select('symbol, date, market_cap, currency, product_flow, market_price')
        .eq('symbol', symbol)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true })

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_aum_data', inputParams: { symbol, days } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 환율 (Exchange Rates)
  // =============================================

  server.registerTool('get_exchange_rates', {
    description: '[ETF/Akros] 최신 환율 정보를 조회합니다 (KRW, AUD 등)',
    inputSchema: z.object({
      date: z.string().optional().describe('특정 날짜 환율 (YYYY-MM-DD, 기본: 최신)'),
    }),
  }, async ({ date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_exchange_rates', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    try {
      const akrosDb = getAkrosDb()

      let targetDate = date
      if (!targetDate) {
        const { data: latest } = await akrosDb
          .from('exchange_rates')
          .select('date')
          .order('date', { ascending: false })
          .limit(1)

        targetDate = latest?.[0]?.date
      }

      if (!targetDate) return { content: [{ type: 'text' as const, text: 'No exchange rate data found' }], isError: true }

      const { data, error } = await akrosDb
        .from('exchange_rates')
        .select('date, currency, rate')
        .eq('date', targetDate)

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_exchange_rates', inputParams: { date } })
      return { content: [{ type: 'text' as const, text: JSON.stringify({ date: targetDate, rates: data }, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // Akros 시계열 데이터 (Time Series)
  // =============================================

  server.registerTool('get_akros_time_series', {
    description: '[ETF/Akros] Akros 전체 AUM/ARR 시계열 데이터를 조회합니다 (지역별 분류 포함)',
    inputSchema: z.object({
      days: z.number().optional().describe('최근 N일 (기본: 전체)'),
    }),
  }, async ({ days }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_akros_time_series', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    try {
      const akrosDb = getAkrosDb()
      let query = akrosDb
        .from('time_series_data')
        .select('*')
        .order('date', { ascending: false })

      if (days) {
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        query = query.gte('date', startDate.toISOString().split('T')[0])
      }

      const { data, error } = await query

      if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

      await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_akros_time_series', inputParams: { days } })
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
    } catch (e) {
      return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true }
    }
  })

  // =============================================
  // 세금계산서 (Tax Invoices)
  // =============================================

  server.registerTool('list_tax_invoices', {
    description: '[ETF/Akros] Akros 세금계산서 목록을 조회합니다',
    inputSchema: z.object({}),
  }, async (_input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_tax_invoices', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .select('*')
      .order('invoice_date', { ascending: false })

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_tax_invoices' })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('create_tax_invoice', {
    description: '[ETF/Akros] Akros 세금계산서를 생성합니다',
    inputSchema: z.object({
      invoice_date: z.string().describe('계산서 날짜 (YYYY-MM-DD)'),
      amount: z.number().describe('금액'),
      notes: z.string().optional().describe('메모'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('create_tax_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .insert({
        invoice_date: input.invoice_date,
        amount: input.amount,
        notes: input.notes || null,
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'create_tax_invoice', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('update_tax_invoice', {
    description: '[ETF/Akros] Akros 세금계산서를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('세금계산서 ID'),
      invoice_date: z.string().optional().describe('계산서 날짜 (YYYY-MM-DD)'),
      amount: z.number().optional().describe('금액'),
      notes: z.string().optional().describe('메모'),
      issued_at: z.string().optional().describe('발행일'),
      paid_at: z.string().optional().describe('지급일'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('update_tax_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'update_tax_invoice', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('delete_tax_invoice', {
    description: '[ETF/Akros] Akros 세금계산서를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('세금계산서 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('delete_tax_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('akros_tax_invoices')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'delete_tax_invoice', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })
}
