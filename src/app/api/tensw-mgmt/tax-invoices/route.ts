import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// GET - List all tax invoices
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_sales')
    .select('id, invoice_type, issue_date, counterparty, business_number, representative, supply_amount, tax_amount, total_amount, items, expected_payment_date, payment_status, paid_amount, bank_ref, notes')
    .order('issue_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const invoices = (data || []).map((inv) => ({
    ...inv,
    supply_amount: Number(inv.supply_amount),
    tax_amount: Number(inv.tax_amount),
    total_amount: Number(inv.total_amount),
  }))

  return NextResponse.json({ invoices })
}

// POST - Create a new tax invoice
export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const {
    invoice_type, issue_date, counterparty, business_number, representative,
    supply_amount, tax_amount, total_amount, items,
    expected_payment_date, payment_status, notes, file_url,
  } = body

  if (!issue_date || !counterparty || supply_amount === undefined) {
    return NextResponse.json(
      { error: 'issue_date, counterparty, and supply_amount are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_sales')
    .insert({
      invoice_type: invoice_type || 'sales',
      issue_date,
      counterparty,
      business_number: business_number || null,
      representative: representative || null,
      supply_amount,
      tax_amount: tax_amount || 0,
      total_amount: total_amount || 0,
      items: items || [],
      expected_payment_date: expected_payment_date || null,
      payment_status: payment_status || 'pending',
      notes: notes || null,
      file_url: file_url || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update a tax invoice
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
    .from('tensw_mgmt_sales')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete a tax invoice
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
    .from('tensw_mgmt_sales')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
