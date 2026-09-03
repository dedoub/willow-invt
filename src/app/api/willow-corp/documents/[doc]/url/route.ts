import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { fail } from '../../../_shared'

export const dynamic = 'force-dynamic'

const BUCKET = 'corp-records'
const EXPIRES_SEC = 3600

// 문서 버전의 서명 URL(1시간). 버킷은 private이라 이 경로로만 연다.
export async function GET(request: Request, ctx: { params: Promise<{ doc: string }> }) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied
  try {
    const { doc } = await ctx.params
    const versionParam = new URL(request.url).searchParams.get('version')
    const supabase = getServiceSupabase()
    const { data: document, error: docError } = await supabase
      .from('willow_corp_documents')
      .select('id')
      .eq('doc_no', doc)
      .maybeSingle()
    if (docError) throw docError
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    let query = supabase
      .from('willow_corp_document_versions')
      .select('version_no, storage_path, mime')
      .eq('document_id', document.id)
      .order('version_no', { ascending: false })
      .limit(1)
    if (versionParam) query = query.eq('version_no', Number(versionParam))
    const { data: versions, error: verError } = await query
    if (verError) throw verError
    const version = versions?.[0]
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(version.storage_path, EXPIRES_SEC)
    if (signError) throw signError
    return NextResponse.json({ url: signed.signedUrl, version_no: version.version_no, mime: version.mime, expires_in: EXPIRES_SEC })
  } catch (error) {
    return fail('sign document url', error)
  }
}
