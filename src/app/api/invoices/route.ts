import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'
import type { Invoice, CreateInvoiceInput, LineItem } from '@/lib/invoice'
import { generateInvoiceNo, parseInvoiceNo } from '@/lib/invoice'

// GET /api/invoices - List all invoices
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('willow_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[Invoices] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    return NextResponse.json({
      invoices: data as Invoice[],
      total: count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('[Invoices] GET error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoices', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST /api/invoices - Create new invoice
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const userId = authUser.userId

    const body = await request.json() as CreateInvoiceInput
    const { invoice_date, line_items, bill_to_company, attention, notes } = body

    // Validate required fields
    if (!invoice_date || !line_items || line_items.length === 0) {
      return NextResponse.json(
        { error: 'invoice_date and line_items are required' },
        { status: 400 }
      )
    }

    // Calculate total
    const total_amount = line_items.reduce((sum: number, item: LineItem) => sum + (item.amount || 0), 0)

    // Generate invoice number if not provided
    let invoice_no = body.invoice_no
    if (!invoice_no) {
      const invoiceDate = new Date(invoice_date)
      const year = invoiceDate.getFullYear()

      // Get the latest invoice number for this year
      const supabase = getServiceSupabase()
      const yearPrefix = `#${String(year).slice(-2)}-ETC-`

      const { data: latestInvoice } = await supabase
        .from('willow_invoices')
        .select('invoice_no')
        .like('invoice_no', `${yearPrefix}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      let sequence = 1
      if (latestInvoice?.invoice_no) {
        const parsed = parseInvoiceNo(latestInvoice.invoice_no)
        if (parsed) {
          sequence = parsed.sequence + 1
        }
      }

      invoice_no = generateInvoiceNo(year, sequence)
    }

    // Insert invoice
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('willow_invoices')
      .insert({
        user_id: userId,
        invoice_no,
        invoice_date,
        bill_to_company: bill_to_company || 'Exchange Traded Concepts, LLC',
        attention: attention || 'Garrett Stevens',
        line_items,
        total_amount,
        currency: 'USD',
        status: 'draft',
        notes,
      })
      .select()
      .single()

    if (error) {
      console.error('[Invoices] Create error:', error)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice: data as Invoice }, { status: 201 })
  } catch (error) {
    console.error('[Invoices] POST error:', error)
    return NextResponse.json(
      { error: 'Failed to create invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
