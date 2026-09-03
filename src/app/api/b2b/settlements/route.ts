import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import type { B2bCompany, B2bReconciliation, B2bSettlement, B2bSettlementListItem } from '@/types/b2b'

export const dynamic = 'force-dynamic'

const COMPANIES: readonly B2bCompany[] = ['willow', 'tensw', 'biblo']

function companyParam(url: URL, key: string): B2bCompany | null {
  const v = url.searchParams.get(key)
  return v && (COMPANIES as readonly string[]).includes(v) ? (v as B2bCompany) : null
}

// 정산 목록. 약정 제목·업무기록 건수·묶음 문서·대사 결과를 곁들여 돌려준다. 읽기 전용.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const url = new URL(request.url)
    const provider = companyParam(url, 'provider')
    const client = companyParam(url, 'client')
    const status = url.searchParams.get('status')

    const supabase = getServiceSupabase()
    let query = supabase.from('b2b_settlements').select('*').order('created_at', { ascending: false })
    if (provider) query = query.eq('provider_company', provider)
    if (client) query = query.eq('client_company', client)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    const settlements = (data ?? []) as B2bSettlement[]
    if (!settlements.length) return NextResponse.json({ settlements: [] })

    const agreementIds = [...new Set(settlements.map(s => s.agreement_id))]
    const engagementIds = [...new Set(settlements.map(s => s.engagement_id).filter((v): v is string => !!v))]
    const settlementIds = settlements.map(s => s.id)

    const [agreementsRes, engagementsRes, workRowsRes, reconciliations] = await Promise.all([
      supabase.from('b2b_agreements').select('id, title').in('id', agreementIds),
      engagementIds.length
        ? supabase.from('b2b_engagements').select('id, ref_no').in('id', engagementIds)
        : Promise.resolve({ data: [] as { id: string; ref_no: string }[], error: null }),
      supabase.from('b2b_work_records').select('settlement_id').in('settlement_id', settlementIds),
      Promise.all(settlements.map(s => supabase.rpc('b2b_reconcile', { p_settlement: s.id }))),
    ])
    if (agreementsRes.error) throw agreementsRes.error
    if (engagementsRes.error) throw engagementsRes.error
    if (workRowsRes.error) throw workRowsRes.error

    const agreementTitle = new Map((agreementsRes.data ?? []).map(a => [a.id as string, a.title as string]))
    const engagementRef = new Map((engagementsRes.data ?? []).map(e => [e.id as string, e.ref_no as string]))
    const workCount = new Map<string, number>()
    for (const w of (workRowsRes.data ?? []) as { settlement_id: string }[]) {
      workCount.set(w.settlement_id, (workCount.get(w.settlement_id) ?? 0) + 1)
    }

    const settlementList: B2bSettlementListItem[] = settlements.map((s, i) => {
      const reconRes = reconciliations[i]
      const reconciliation = (reconRes.error ? s.reconciliation : reconRes.data) as B2bReconciliation | null
      return {
        ...s,
        reconciliation,
        agreement_title: agreementTitle.get(s.agreement_id) ?? '',
        engagement_ref: s.engagement_id ? engagementRef.get(s.engagement_id) ?? null : null,
        work_count: workCount.get(s.id) ?? 0,
      }
    })

    return NextResponse.json({ settlements: settlementList })
  } catch (error) {
    console.error('b2b settlements list:', error)
    return NextResponse.json({ error: 'Failed to fetch settlements' }, { status: 500 })
  }
}
