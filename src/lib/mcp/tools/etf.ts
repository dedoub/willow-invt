import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
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
}
