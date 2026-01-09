import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import type { Invoice, UpdateInvoiceInput, LineItem } from '@/lib/invoice'

// GET /api/invoices/[id] - Get single invoice
export async function GET(
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

    const { data, error } = await supabase
      .from('willow_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({ invoice: data as Invoice })
  } catch (error) {
    console.error('[Invoices] GET by ID error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH /api/invoices/[id] - Update invoice
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
    const body = await request.json() as UpdateInvoiceInput
    const supabase = getServiceSupabase()

    // Build update object
    const updateData: Record<string, unknown> = {}

    if (body.invoice_date !== undefined) updateData.invoice_date = body.invoice_date
    if (body.bill_to_company !== undefined) updateData.bill_to_company = body.bill_to_company
    if (body.attention !== undefined) updateData.attention = body.attention
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.sent_to_email !== undefined) updateData.sent_to_email = body.sent_to_email
    if (body.gmail_message_id !== undefined) updateData.gmail_message_id = body.gmail_message_id

    // Handle line_items update (recalculate total)
    if (body.line_items !== undefined) {
      updateData.line_items = body.line_items
      updateData.total_amount = body.line_items.reduce(
        (sum: number, item: LineItem) => sum + (item.amount || 0),
        0
      )
    }

    // Handle status update
    if (body.status !== undefined) {
      updateData.status = body.status

      // Auto-set sent_at when status changes to 'sent'
      if (body.status === 'sent' && !updateData.sent_at) {
        updateData.sent_at = new Date().toISOString()
      }

      // Auto-set paid_at when status changes to 'paid'
      if (body.status === 'paid') {
        updateData.paid_at = new Date().toISOString()
      }
    }

    const { data, error } = await supabase
      .from('willow_invoices')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Invoices] Update error:', error)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return NextResponse.json({ invoice: data as Invoice })
  } catch (error) {
    console.error('[Invoices] PATCH error:', error)
    return NextResponse.json(
      { error: 'Failed to update invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE /api/invoices/[id] - Delete invoice
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
      .from('willow_invoices')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Invoices] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Invoices] DELETE error:', error)
    return NextResponse.json(
      { error: 'Failed to delete invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
