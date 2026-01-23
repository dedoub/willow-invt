import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

// PATCH /api/akros/tax-invoices/[id] - 세금계산서 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const supabase = getServiceSupabase()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.invoice_date !== undefined) updateData.invoice_date = body.invoice_date
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.file_url !== undefined) updateData.file_url = body.file_url
    if (body.issued_at !== undefined) updateData.issued_at = body.issued_at
    if (body.paid_at !== undefined) updateData.paid_at = body.paid_at

    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Akros Tax Invoices] Update error:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice: data })
  } catch (error) {
    console.error('[Akros Tax Invoices] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/akros/tax-invoices/[id] - 세금계산서 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const supabase = getServiceSupabase()

    const { error } = await supabase
      .from('akros_tax_invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Akros Tax Invoices] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Akros Tax Invoices] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
