import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

const COMPANIES = new Set(['tensw', 'willow'])

export async function GET(request: Request) {
  const company = new URL(request.url).searchParams.get('company')
  if (!company || !COMPANIES.has(company)) {
    return NextResponse.json({ error: 'company must be tensw or willow' }, { status: 400 })
  }

  const { data, error } = await getServiceSupabase()
    .from('finance_tax_obligations')
    .select('id, company, source, obligation_type, notice_number, period_label, title, agency, amount, issued_date, due_date, status, paid_at, matched_cash_id, match_confidence, collected_at')
    .eq('company', company)
    .order('due_date', { ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    obligations: (data || []).map(row => ({ ...row, amount: Number(row.amount) })),
  })
}
