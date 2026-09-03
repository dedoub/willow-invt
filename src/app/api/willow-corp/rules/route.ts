import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { companyParam, fail } from '../_shared'

export const dynamic = 'force-dynamic'

// 정관·사규 버전 목록. `at=YYYY-MM-DD`가 있으면 그 날짜에 시행 중이던 버전만.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const company = companyParam(request)
    const at = new URL(request.url).searchParams.get('at')
    const columns = 'id, company, rule_type, title, version_no, effective_from, effective_to, parent_rule_id, document_id, note, articles, created_at'
    const { data, error } = at
      ? await supabase.rpc('willow_corp_rules_effective_at', { p_company: company, p_at: at })
      : await supabase.from('willow_corp_rules').select(columns).eq('company', company)
          .order('rule_type').order('version_no', { ascending: false })
    if (error) throw error
    const rules = (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id, company: r.company, rule_type: r.rule_type, title: r.title, version_no: r.version_no,
      effective_from: r.effective_from, effective_to: r.effective_to, parent_rule_id: r.parent_rule_id,
      document_id: r.document_id, note: r.note, articles: r.articles ?? [], created_at: r.created_at,
    }))
    return NextResponse.json({ rules })
  } catch (error) {
    return fail('fetch rules', error)
  }
}
