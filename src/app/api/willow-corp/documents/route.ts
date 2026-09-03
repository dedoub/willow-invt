import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { companyParam, fail } from '../_shared'

export const dynamic = 'force-dynamic'

// 법인 서류함 문서 목록(버전 포함). 읽기 전용.
export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('willow_corp_documents')
      .select('*, versions:willow_corp_document_versions!willow_corp_document_versions_document_id_fkey(id, version_no, kind, mime, size_bytes, sha256, note, generated_by, created_at)')
      .eq('company', companyParam(request))
      .order('created_at', { ascending: false })
    if (error) throw error
    const documents = (data ?? []).map(d => ({
      ...d,
      versions: [...(d.versions ?? [])].sort((a, b) => a.version_no - b.version_no),
    }))
    return NextResponse.json({ documents })
  } catch (error) {
    return fail('fetch documents', error)
  }
}
