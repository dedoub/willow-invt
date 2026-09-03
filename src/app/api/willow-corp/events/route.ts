import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { companyParam, fail } from '../_shared'

export const dynamic = 'force-dynamic'

// 감사 이벤트(해시체인). entity_type·entity_id로 한 개체의 타임라인만 볼 수 있다.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const { searchParams } = new URL(request.url)
    let query = supabase
      .from('willow_corp_events')
      .select('id, company, entity_type, entity_id, event, actor, payload, at')
      .eq('company', companyParam(request))
      .order('id', { ascending: false })
      .limit(200)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    if (entityType) query = query.eq('entity_type', entityType)
    if (entityId) query = query.eq('entity_id', entityId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ events: data ?? [] })
  } catch (error) {
    return fail('fetch events', error)
  }
}
