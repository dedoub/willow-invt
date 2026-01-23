import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { getAuthUser } from '@/lib/auth'

export interface AkrosTaxInvoice {
  id: string
  invoice_date: string
  amount: number
  notes: string | null
  file_url: string | null
  issued_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

// GET /api/akros/tax-invoices - 세금계산서 목록 조회
export async function GET() {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .select('*')
      .order('invoice_date', { ascending: false })

    if (error) {
      console.error('[Akros Tax Invoices] List error:', error)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    return NextResponse.json({ invoices: data as AkrosTaxInvoice[] })
  } catch (error) {
    console.error('[Akros Tax Invoices] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/akros/tax-invoices - 세금계산서 생성
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { invoice_date, amount, notes } = body

    if (!invoice_date || !amount) {
      return NextResponse.json({ error: 'invoice_date and amount are required' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('akros_tax_invoices')
      .insert({
        invoice_date,
        amount,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Akros Tax Invoices] Create error:', error)
      return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
    }

    return NextResponse.json({ invoice: data as AkrosTaxInvoice }, { status: 201 })
  } catch (error) {
    console.error('[Akros Tax Invoices] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
