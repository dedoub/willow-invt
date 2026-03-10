import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// GET - List all tax invoices
export async function GET() {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_tax_invoices')
    .select('*')
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
    .from('tensw_tax_invoices')
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
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_tax_invoices')
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
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('tensw_tax_invoices')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
