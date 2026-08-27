import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// GET - List all loans
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_loans')
    .select('*')
    .order('maturity_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const loans = (data || []).map((loan) => ({
    ...loan,
    principal: Number(loan.principal),
    interest_rate: loan.interest_rate ? Number(loan.interest_rate) : null,
    monthly_interest_avg: loan.monthly_interest_avg ? Number(loan.monthly_interest_avg) : null,
    annual_interest_2025: loan.annual_interest_2025 ? Number(loan.annual_interest_2025) : null,
  }))

  return NextResponse.json({ loans })
}

// POST - Create a new loan
export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const { bank, account_number, loan_type, principal, interest_rate, monthly_interest_avg, annual_interest_2025, loan_date, maturity_date, last_extension_date, next_interest_date, interest_payment_day, repayment_type, status, memo, attachments } = body

  if (!bank || !account_number || !loan_type || principal === undefined) {
    return NextResponse.json(
      { error: 'bank, account_number, loan_type, and principal are required' },
      { status: 400 }
    )
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('tensw_mgmt_loans')
    .insert({
      bank,
      account_number,
      loan_type,
      principal,
      interest_rate: interest_rate || null,
      monthly_interest_avg: monthly_interest_avg || null,
      annual_interest_2025: annual_interest_2025 || null,
      loan_date: loan_date || null,
      maturity_date: maturity_date || null,
      last_extension_date: last_extension_date || null,
      next_interest_date: next_interest_date || null,
      interest_payment_day: interest_payment_day || null,
      repayment_type: repayment_type || 'bullet',
      status: status || 'active',
      memo: memo || null,
      attachments: attachments || [],
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PUT - Update a loan
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
    .from('tensw_mgmt_loans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE - Delete a loan
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
    .from('tensw_mgmt_loans')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
