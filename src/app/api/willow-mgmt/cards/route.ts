import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

// KB 법인카드 승인내역 + 이용대금명세서. 화면이 연도 단위로 훑으므로 기간을 받는다.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') || String(new Date().getFullYear())
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const supabase = getServiceSupabase()

  const [approvalsRes, billingRes] = await Promise.all([
    supabase
      .from('willow_finance_card_approvals')
      .select('id, used_date, used_time, card_no, store_name, store_type, store_corp_no, amount, krw_amount, home_foreign_type, vat, payment_type, installment_month, cancel_yn, cancel_amount, edited_at')
      // 화면에서 지운 줄은 수집기가 같은 지문으로 다시 넣어도 보이지 않는다
      .is('deleted_at', null)
      .gte('used_date', from)
      .lte('used_date', to)
      .order('used_date', { ascending: false }),
    supabase
      .from('willow_finance_card_billing')
      .select('billing_month, payment_due_date, total_amount, domestic_use, overseas_use, full_amount, installment_amount, annual_fee, payment_account')
      .gte('billing_month', `${year}01`)
      .lte('billing_month', `${year}12`)
      .order('billing_month'),
  ])

  if (approvalsRes.error) return NextResponse.json({ error: approvalsRes.error.message }, { status: 500 })
  if (billingRes.error) return NextResponse.json({ error: billingRes.error.message }, { status: 500 })

  return NextResponse.json({
    approvals: (approvalsRes.data || []).map(a => ({
      ...a,
      amount: Number(a.amount),
      // 해외 승인은 amount가 외화다. 합산·정렬은 원화로 해야 하므로 krw를 따로 준다.
      krw: a.krw_amount === null || a.krw_amount === undefined ? Number(a.amount) : Number(a.krw_amount),
      vat: a.vat === null ? null : Number(a.vat),
      cancel_amount: a.cancel_amount === null ? null : Number(a.cancel_amount),
    })),
    billing: (billingRes.data || []).map(b => ({
      ...b,
      total_amount: Number(b.total_amount),
      domestic_use: b.domestic_use === null ? null : Number(b.domestic_use),
      overseas_use: b.overseas_use === null ? null : Number(b.overseas_use),
      full_amount: b.full_amount === null ? null : Number(b.full_amount),
      installment_amount: b.installment_amount === null ? null : Number(b.installment_amount),
      annual_fee: b.annual_fee === null ? null : Number(b.annual_fee),
    })),
  })
}

// 사람이 고칠 수 있는 칸만 연다. 지문·원본 raw·카드번호는 카드사 원본 그대로 둔다.
const EDITABLE = new Set([
  'used_date', 'used_time', 'store_name', 'store_type', 'store_corp_no',
  'amount', 'krw_amount', 'vat', 'installment_month', 'cancel_yn', 'cancel_amount',
])

const NUMERIC = new Set(['amount', 'krw_amount', 'vat', 'cancel_amount'])

// PUT — 승인 한 줄 수정. 가맹점 이름이 분류를 정하므로 여기가 실제로 고칠 일이 있는 칸이다.
export async function PUT(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const { id, ...rest } = body ?? {}
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) {
    if (EDITABLE.has(key)) updates[key] = value === '' ? null : value
  }
  for (const key of NUMERIC) {
    if (updates[key] !== undefined && updates[key] !== null) updates[key] = Number(updates[key])
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no editable field given' }, { status: 400 })
  }

  const { error } = await getServiceSupabase()
    .from('willow_finance_card_approvals')
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
    .from('willow_finance_card_approvals')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
