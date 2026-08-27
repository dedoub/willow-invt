import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'

// 로그인 쿠키를 읽으므로 요청마다 실행돼야 한다. 이 줄이 없으면 Next 가 빌드 때 한 번
// 실행해 응답을 굳혀 버리고, 그때는 쿠키가 없어 401 이 통째로 캐시된다 (2026-08-27 투자 페이지).
export const dynamic = 'force-dynamic'

const COMPANIES = new Set(['tensw', 'willow'])

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

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
