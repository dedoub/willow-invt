import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export interface StockTrade {
  id: string
  ticker: string
  company_name: string
  market: 'KR' | 'US'
  trade_date: string
  trade_type: 'buy' | 'sell'
  quantity: number
  price: number
  total_amount: number
  currency: 'KRW' | 'USD'
  broker: string | null
  memo: string | null
  created_at: string
}

// GET - List all stock trades
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const market = searchParams.get('market')
  const trade_type = searchParams.get('trade_type')

  const supabase = getServiceSupabase()

  let query = supabase
    .from('stock_trades')
    .select('*')
    .order('trade_date', { ascending: false })

  if (market) {
    query = query.eq('market', market)
  }
  if (trade_type) {
    query = query.eq('trade_type', trade_type)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const trades = (data || []).map((t) => ({
    ...t,
    price: Number(t.price),
    total_amount: Number(t.total_amount),
    quantity: Number(t.quantity),
  }))

  return NextResponse.json({ trades })
}

// POST - Create a new stock trade
export async function POST(request: Request) {
  const body = await request.json()
  const { ticker, company_name, market, trade_date, trade_type, quantity, price, total_amount, currency, broker, memo } = body

  if (!ticker || !company_name || !market || !trade_date || !quantity || !price) {
    return NextResponse.json(
      { error: 'ticker, company_name, market, trade_date, quantity, and price are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_trades')
    .insert({
      ticker,
      company_name,
      market,
      trade_date,
      trade_type: trade_type || 'buy',
      quantity,
      price,
      total_amount: total_amount || quantity * price,
      currency: currency || (market === 'US' ? 'USD' : 'KRW'),
      broker: broker || '토스증권',
      memo: memo || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update a stock trade
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('stock_trades')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete a stock trade
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('stock_trades')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
