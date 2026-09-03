import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { companyParam, fail } from '../_shared'

export const dynamic = 'force-dynamic'

// 대기·완료 액션 목록. status=all이면 전부, 기본은 pending.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    let query = supabase
      .from('willow_corp_actions')
      .select('*')
      .eq('company', companyParam(request))
      .order('due_at', { ascending: true, nullsFirst: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ actions: data ?? [] })
  } catch (error) {
    return fail('fetch actions', error)
  }
}
