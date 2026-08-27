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
      .select('id, used_date, used_time, card_no, store_name, store_type, store_corp_no, amount, krw_amount, home_foreign_type, vat, payment_type, installment_month, cancel_yn, cancel_amount')
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
