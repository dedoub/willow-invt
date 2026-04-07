// ETF Query Module — Akros + ETC
// MCP tools + Chat Agent 공통 사용. auth-free, 순수 비즈니스 로직.

import { getServiceSupabase } from '@/lib/supabase'
import { akrosDb, fetchETFDisplayData } from '@/lib/supabase-etf'
import type { LineItem } from '@/lib/invoice'

// ============================================================
// Akros — Products (Akros DB: product_meta, product_figures)
// ============================================================

export async function akrosListProducts(params?: { country?: string }) {
  let metaQuery = akrosDb
    .from('product_meta')
    .select('symbol, country, product_type, product_name, product_name_local, listing_date, index_fee, index_fee_min, product_issuer, index_provider')

  if (params?.country) {
    metaQuery = metaQuery.eq('country', params.country)
  }

  const { data: metaData, error: metaError } = await metaQuery
  if (metaError) return { error: metaError.message }

  // Akros 인덱스 제공 상품만 필터
  const akrosProducts = (metaData || []).filter(p =>
    p.index_provider && p.index_provider.toLowerCase().includes('akros')
  )

  const symbols = akrosProducts.map(p => p.symbol)
  if (symbols.length === 0) return { data: [] }

  // 최근 30일 product_figures
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: figuresData, error: figError } = await akrosDb
    .from('product_figures')
    .select('symbol, date, market_cap, currency, product_flow, market_price')
    .in('symbol', symbols)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (figError) return { error: figError.message }

  // 심볼별 최신 figures
  const latestFigures = new Map<string, { market_cap: number; currency: string; date: string; market_price: number }>()
  for (const row of figuresData || []) {
    if (!latestFigures.has(row.symbol)) {
      latestFigures.set(row.symbol, {
        market_cap: row.market_cap || 0,
        currency: row.currency || 'USD',
        date: row.date,
        market_price: row.market_price || 0,
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
        date: figure.date,
        market_price: figure.market_price,
        listing_date: meta.listing_date,
        arr,
        index_fee: indexFee,
      }
    })

  return { data: products }
}

export async function akrosGetAumData(params: { symbol: string; days?: number }) {
  const period = params.days || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - period)

  const { data, error } = await akrosDb
    .from('product_figures')
    .select('symbol, date, market_cap, currency, product_flow, market_price')
    .eq('symbol', params.symbol)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error) return { error: error.message }
  return { data: data || [] }
}

// ============================================================
// Akros — Tax Invoices (main DB: akros_tax_invoices)
// ============================================================

export async function akrosListTaxInvoices() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('akros_tax_invoices')
    .select('*')
    .order('invoice_date', { ascending: false })
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function akrosCreateTaxInvoice(params: {
  invoice_date: string
  amount: number
  notes?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('akros_tax_invoices')
    .insert({
      invoice_date: params.invoice_date,
      amount: params.amount,
      notes: params.notes || null,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function akrosUpdateTaxInvoice(params: {
  id: string
  invoice_date?: string
  amount?: number
  notes?: string
  issued_at?: string
  paid_at?: string
}) {
  const { id, ...updates } = params
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('akros_tax_invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function akrosDeleteTaxInvoice(id: string) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('akros_tax_invoices').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// Akros — Time Series (Akros DB: time_series_data)
// ============================================================

export async function akrosGetTimeSeries(params?: { days?: number }) {
  let query = akrosDb
    .from('time_series_data')
    .select('*')
    .order('date', { ascending: false })

  if (params?.days) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - params.days)
    query = query.gte('date', startDate.toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

// ============================================================
// Akros — Exchange Rates (Akros DB: exchange_rates)
// ============================================================

export async function akrosGetExchangeRates(params?: { date?: string }) {
  let targetDate = params?.date

  if (!targetDate) {
    const { data: latest } = await akrosDb
      .from('exchange_rates')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)

    targetDate = latest?.[0]?.date
  }

  if (!targetDate) return { error: 'No exchange rate data found' }

  const { data, error } = await akrosDb
    .from('exchange_rates')
    .select('date, currency, rate')
    .eq('date', targetDate)

  if (error) return { error: error.message }
  return { data: { date: targetDate, rates: data || [] } }
}

// ============================================================
// ETC — Products (main DB: etf_products)
// ============================================================

export async function etcListProducts(params?: { bank?: string }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('etf_products')
    .select('*')
    .order('symbol', { ascending: true })

  if (params?.bank) query = query.eq('bank', params.bank)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function etcCreateProduct(params: {
  symbol: string
  fund_name: string
  fund_url?: string
  listing_date?: string
  bank?: string
  platform_fee_percent?: number
  platform_min_fee?: number
  pm_fee_percent?: number
  pm_min_fee?: number
  currency?: string
  notes?: string
}) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('etf_products')
    .insert({
      symbol: params.symbol.toUpperCase(),
      fund_name: params.fund_name,
      fund_url: params.fund_url || null,
      listing_date: params.listing_date || null,
      bank: params.bank || 'ETC',
      platform_fee_percent: params.platform_fee_percent || 0,
      platform_min_fee: params.platform_min_fee || 0,
      pm_fee_percent: params.pm_fee_percent || 0,
      pm_min_fee: params.pm_min_fee || 0,
      currency: params.currency || 'USD',
      notes: params.notes || null,
      is_active: true,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function etcUpdateProduct(params: {
  id: number
  symbol?: string
  fund_name?: string
  fund_url?: string
  listing_date?: string
  bank?: string
  platform_fee_percent?: number
  platform_min_fee?: number
  pm_fee_percent?: number
  pm_min_fee?: number
  currency?: string
  notes?: string
  is_active?: boolean
}) {
  const { id, ...updates } = params
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateData[key === 'symbol' ? 'symbol' : key] = key === 'symbol' ? (value as string).toUpperCase() : value
    }
  }

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('etf_products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function etcDeleteProduct(id: number) {
  const sb = getServiceSupabase()
  const { error } = await sb.from('etf_products').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// ============================================================
// ETC — Invoices (main DB: willow_invoices)
// ============================================================

export async function etcListInvoices(params?: { status?: string; limit?: number }) {
  const sb = getServiceSupabase()
  let query = sb
    .from('willow_invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params?.limit || 50)

  if (params?.status) query = query.eq('status', params.status)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data || [] }
}

export async function etcCreateInvoice(params: {
  invoice_date: string
  bill_to_company?: string
  attention?: string
  line_items: LineItem[]
  notes?: string
}) {
  const totalAmount = params.line_items.reduce((sum, item) => sum + (item.amount || 0), 0)

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_invoices')
    .insert({
      invoice_date: params.invoice_date,
      bill_to_company: params.bill_to_company || 'Exchange Traded Concepts, LLC',
      attention: params.attention || 'Garrett Stevens',
      line_items: params.line_items,
      total_amount: totalAmount,
      currency: 'USD',
      status: 'draft',
      notes: params.notes || null,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  return { success: true, data }
}

export async function etcGetInvoice(params: { id: string }) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('willow_invoices')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error) return { error: error.message }
  return { data }
}

// ============================================================
// ETC — Stats
// ============================================================

export async function etcGetStats() {
  try {
    const displayData = await fetchETFDisplayData('ETC')

    const totalAUM = displayData.reduce((sum, etf) => sum + (etf.aum || 0), 0)
    const totalMonthlyFee = displayData.reduce((sum, etf) => sum + etf.totalMonthlyFee, 0) + 2083.33
    const totalRemainingFee = displayData.reduce((sum, etf) => sum + (etf.remainingFee || 0), 0)
    const activeCount = displayData.filter(etf => etf.isActive).length

    return {
      data: {
        summary: {
          total_aum_usd: totalAUM,
          total_monthly_fee_usd: totalMonthlyFee,
          total_remaining_fee_usd: totalRemainingFee,
          total_products: displayData.length,
          active_products: activeCount,
        },
        products: displayData.map(etf => ({
          symbol: etf.symbol,
          fund_name: etf.fundName,
          aum: etf.aum,
          monthly_fee: etf.totalMonthlyFee,
          remaining_fee: etf.remainingFee,
          remaining_months: etf.remainingMonths,
          listing_date: etf.listingDate,
          currency: etf.currency,
          is_active: etf.isActive,
        })),
      },
    }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ============================================================
// Dashboard — Akros
// ============================================================

export async function akrosGetDashboard() {
  const sb = getServiceSupabase()

  const [productsRes, taxInvoicesRes, timeSeriesRes] = await Promise.all([
    // Akros product count (from Akros DB)
    akrosDb
      .from('product_meta')
      .select('symbol, index_provider')
      .not('index_provider', 'is', null),

    // Tax invoices summary
    sb
      .from('akros_tax_invoices')
      .select('id, invoice_date, amount, paid_at')
      .order('invoice_date', { ascending: false }),

    // Latest time series data point
    akrosDb
      .from('time_series_data')
      .select('*')
      .order('date', { ascending: false })
      .limit(1),
  ])

  const akrosProducts = (productsRes.data || []).filter(p =>
    p.index_provider && p.index_provider.toLowerCase().includes('akros')
  )

  const taxInvoices = taxInvoicesRes.data || []
  const totalTaxAmount = taxInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
  const paidCount = taxInvoices.filter(inv => inv.paid_at).length

  return {
    data: {
      product_count: akrosProducts.length,
      tax_invoices: {
        count: taxInvoices.length,
        total_amount: totalTaxAmount,
        paid_count: paidCount,
        unpaid_count: taxInvoices.length - paidCount,
        latest: taxInvoices[0] || null,
      },
      time_series_latest: (timeSeriesRes.data || [])[0] || null,
    },
  }
}

// ============================================================
// Dashboard — ETC
// ============================================================

export async function etcGetDashboard() {
  const sb = getServiceSupabase()

  const [productsRes, invoicesRes] = await Promise.all([
    sb
      .from('etf_products')
      .select('id, is_active')
      .eq('is_active', true),

    sb
      .from('willow_invoices')
      .select('id, status, total_amount')
      .order('created_at', { ascending: false }),
  ])

  const activeProducts = productsRes.data || []
  const invoices = invoicesRes.data || []

  const draftCount = invoices.filter(inv => inv.status === 'draft').length
  const sentCount = invoices.filter(inv => inv.status === 'sent').length
  const paidCount = invoices.filter(inv => inv.status === 'paid').length
  const totalInvoiceAmount = invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0)

  // ETC stats (AUM/fees) via fetchETFDisplayData
  let totalAUM = 0
  let totalMonthlyFee = 0
  try {
    const displayData = await fetchETFDisplayData('ETC')
    totalAUM = displayData.reduce((sum, etf) => sum + (etf.aum || 0), 0)
    totalMonthlyFee = displayData.reduce((sum, etf) => sum + etf.totalMonthlyFee, 0) + 2083.33
  } catch {
    // stats not available — continue with zeros
  }

  return {
    data: {
      product_count: activeProducts.length,
      invoices: {
        total: invoices.length,
        draft: draftCount,
        sent: sentCount,
        paid: paidCount,
        total_amount: totalInvoiceAmount,
      },
      fees: {
        total_aum_usd: totalAUM,
        total_monthly_fee_usd: totalMonthlyFee,
      },
    },
  }
}
