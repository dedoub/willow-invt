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
    .select('id, company, source, obligation_type, notice_number, period_label, title, agency, amount, issued_date, due_date, status, paid_at, matched_cash_id, match_confidence, collected_at, edited_at')
    .eq('company', company)
    // 화면에서 지운 줄은 수집기가 같은 지문으로 다시 넣어도 보이지 않는다
    .is('deleted_at', null)
    .order('due_date', { ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    obligations: (data || []).map(row => ({ ...row, amount: Number(row.amount) })),
  })
}

// 사람이 고칠 수 있는 칸만 연다. 나머지(지문·원본 payload·매칭)는 수집기와 매칭기의 몫이다.
const EDITABLE = new Set([
  'title', 'agency', 'amount', 'obligation_type', 'notice_number',
  'period_label', 'issued_date', 'due_date', 'status', 'paid_at',
])

// PUT — 고지 한 줄 수정. edited_at 을 찍어 다음 수집이 덮어쓰지 않게 한다.
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
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no editable field given' }, { status: 400 })
  }
  if (updates.amount !== undefined) updates.amount = Number(updates.amount)

  const now = new Date().toISOString()
  const { data, error } = await getServiceSupabase()
    .from('finance_tax_obligations')
    .update({ ...updates, edited_at: now, updated_at: now })
    .eq('id', id)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE — 물리 삭제하면 다음 수집이 되살리므로 가림 처리한다.
export async function DELETE(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const now = new Date().toISOString()
  const { error } = await getServiceSupabase()
    .from('finance_tax_obligations')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
