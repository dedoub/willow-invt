import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/supabase'
import { GUARDED_BUCKETS } from '@/lib/storage-links'

export const dynamic = 'force-dynamic'

// 짧게 준다. 링크를 복사해 나가도 금방 죽는다.
const EXPIRES_SEC = 300

/**
 * 비공개 버킷의 파일 하나를 로그인한 사람에게만 열어 준다.
 *
 *   GET /api/files/wiki-attachments/dw_kim.../1789555741023_file.hwp
 *
 * 버킷은 목록에 있는 것만 연다. 경로를 지어내서 다른 버킷을 긁지 못하게 한다.
 */
export async function GET(request: Request, ctx: { params: Promise<{ ref: string[] }> }) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const { ref } = await ctx.params
  const [bucket, ...rest] = ref ?? []
  const path = rest.join('/')
  if (!bucket || !path) {
    return NextResponse.json({ error: 'Bucket and path required' }, { status: 400 })
  }
  if (!GUARDED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'Unknown bucket' }, { status: 404 })
  }

  const { data, error } = await getServiceSupabase().storage
    .from(bucket)
    .createSignedUrl(decodeURIComponent(path), EXPIRES_SEC, { download: false })
  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // 파일을 이 서버로 흘려보내지 않고 서명 URL 로 넘긴다.
  return NextResponse.redirect(data.signedUrl, { status: 307 })
}
