import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

export interface TenswInvoice {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability' | 'transfer' | 'exchange'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null  // 세금계산서 발행일
  payment_date: string | null  // 입금일/지급일
  status: 'issued' | 'completed'
  attachments: Array<{ name: string; url: string; size: number; type: string }>
  notes: string | null
  account_number: string | null
  balance_after: number | null
  created_at: string
  updated_at: string
}

// GET - List all invoices
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'revenue' | 'expense' | null (all)
  const status = searchParams.get('status') // 'issued' | 'completed' | null (all)

  const supabase = getServiceSupabase()

  let query = supabase
    .from('tensw_mgmt_cash')
    // account_number 없이는 표에서 어느 계좌 내역인지 알 수 없다 — 계좌가 여럿이라
    // 한 표에 섞여 나온다.
    .select('id, type, counterparty, description, amount, issue_date, payment_date, account_number')
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

  // Convert amount from string (numeric type) to number
  const invoices = (data || []).map((inv) => ({
    ...inv,
    amount: Number(inv.amount),
  }))

  return NextResponse.json({ invoices })
}

// POST - Create a new invoice
export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const { type, counterparty, description, amount, issue_date, payment_date, status, attachments, notes, account_number, balance_after, transaction_time } = body

  if (!type || !counterparty || amount === undefined) {
    return NextResponse.json(
      { error: 'type, counterparty, and amount are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_cash')
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
      balance_after: balance_after ?? null,
      transaction_time: transaction_time || null,
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
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_cash')
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
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('tensw_mgmt_cash')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
