import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// 홈택스에서 수집한 전자세금계산서. 윌로우는 텐소프트웍스와 달리 수금상태를 사람이
// 관리하는 매출관리 테이블이 없어, 수집분이 그대로 정본이다.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')

  const supabase = getServiceSupabase()
  let query = supabase
    .from('willow_finance_tax_invoices')
    .select('id, transe_type, reporting_date, issue_date, supplier_company, supplier_reg_number, contractor_company, contractor_reg_number, rep_items, supply_amount, tax_amount, total_amount, invoice_kind, receipt_or_charge, approval_no, edited_at')
    // 화면에서 지운 줄은 수집기가 같은 지문으로 다시 넣어도 보이지 않는다
    .is('deleted_at', null)
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

// 사람이 고칠 수 있는 칸만 연다. 지문·원본 payload·승인번호는 홈택스 원본 그대로 둔다.
const EDITABLE = new Set([
  'reporting_date', 'issue_date', 'rep_items', 'note',
  'supply_amount', 'tax_amount', 'total_amount',
  'invoice_kind', 'receipt_or_charge',
  'supplier_company', 'contractor_company',
])

const NUMERIC = new Set(['supply_amount', 'tax_amount', 'total_amount'])

// PUT — 계산서 한 줄 수정. 수집기는 ignoreDuplicates 라 고친 값이 덮이지 않지만,
// 사람이 손댄 줄임을 남겨 두면 나중에 원본과 대조할 수 있다.
export async function PUT(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const { id, counterparty, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = getServiceSupabase()

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (EDITABLE.has(key)) updates[key] = value === '' ? null : value
  }
  for (const key of NUMERIC) {
    if (updates[key] !== undefined && updates[key] !== null) updates[key] = Number(updates[key])
  }

  // 거래처는 매출이면 공급받는자, 매입이면 공급자 칸이다. 화면은 한 칸으로 보여주므로 여기서 가른다.
  if (typeof counterparty === 'string') {
    const { data: row, error: readError } = await supabase
      .from('willow_finance_tax_invoices')
      .select('transe_type')
      .eq('id', id)
      .single()
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    updates[row.transe_type === 'purchase' ? 'supplier_company' : 'contractor_company'] = counterparty
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no editable field given' }, { status: 400 })
  }

  const { error } = await supabase
    .from('willow_finance_tax_invoices')
    .update({ ...updates, edited_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — 물리 삭제하면 다음 수집이 되살리므로 가림 처리한다.
export async function DELETE(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await getServiceSupabase()
    .from('willow_finance_tax_invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
