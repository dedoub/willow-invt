import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'

// 홈택스에서 수집한 전자세금계산서. 윌로우는 텐소프트웍스와 달리 수금상태를 사람이
// 관리하는 매출관리 테이블이 없어, 수집분이 그대로 정본이다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')

  const supabase = getServiceSupabase()
  let query = supabase
    .from('willow_finance_tax_invoices')
    .select('id, transe_type, reporting_date, issue_date, supplier_company, supplier_reg_number, contractor_company, contractor_reg_number, rep_items, supply_amount, tax_amount, total_amount, invoice_kind, receipt_or_charge, approval_no')
    .order('reporting_date', { ascending: false })

  if (year) query = query.gte('reporting_date', `${year}-01-01`).lte('reporting_date', `${year}-12-31`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    invoices: (data || []).map(row => ({
      ...row,
      supply_amount: Number(row.supply_amount),
      tax_amount: Number(row.tax_amount),
      total_amount: Number(row.total_amount),
      // 매출이면 상대는 공급받는자, 매입이면 공급자다.
      counterparty: row.transe_type === 'purchase' ? row.supplier_company : row.contractor_company,
      counterparty_reg_number: row.transe_type === 'purchase' ? row.supplier_reg_number : row.contractor_reg_number,
    })),
  })
}
