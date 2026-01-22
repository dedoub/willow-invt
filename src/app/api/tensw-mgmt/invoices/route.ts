import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

export interface TenswInvoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null  // 세금계산서 발행일
  payment_date: string | null  // 입금일/지급일
  status: 'issued' | 'completed'
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  notes: string | null
  account_number: string | null
  created_at: string
  updated_at: string
}

// GET - List all invoices
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'revenue' | 'expense' | null (all)
  const status = searchParams.get('status') // 'issued' | 'completed' | null (all)

  const supabase = getServiceSupabase()

  let query = supabase
    .from('tensw_invoices')
    .select('*')
    .order('created_at', { ascending: false })

  if (type) {
    query = query.eq('type', type)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invoices: data || [] })
}

// POST - Create a new invoice
export async function POST(request: Request) {
  const body = await request.json()
  const { type, counterparty, description, amount, issue_date, payment_date, status, attachments, notes, account_number } = body

  if (!type || !counterparty || amount === undefined) {
    return NextResponse.json(
      { error: 'type, counterparty, and amount are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_invoices')
    .insert({
      type,
      counterparty,
      description: description || null,
      amount,
      issue_date: issue_date || null,  // 세금계산서 발행일 (선택)
      payment_date: payment_date || null,  // 입금일/지급일 (선택)
      status: status || 'issued',
      attachments: attachments || [],
      notes: notes || null,
      account_number: account_number || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update an invoice
export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete an invoice
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('tensw_invoices')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
