import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// VoiceCards 보너스 오퍼 만료 배치.
// 규칙: 유저가 오퍼를 확인(seen_at)한 뒤 3일이 지나고, 아직 전환(redeemed)/닫힘(dismissed)/만료 처리가 안 된 건을
//       status='expired'로 확정한다. (대시보드는 seen+3일을 실시간 계산하지만, DB status 값 자체를 정확히 유지)
const SEEN_TTL_DAYS = 3

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.VOICECARDS_SUPABASE_URL
  const key = process.env.VOICECARDS_SUPABASE_SERVICE_KEY || process.env.VOICECARDS_SUPABASE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'VoiceCards Supabase env not configured' }, { status: 500 })
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  // cutoff = 지금 - 3일. seen_at <= cutoff 이면 "확인 후 3일 경과".
  const cutoff = new Date(Date.now() - SEEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('user_offers')
    .update({ status: 'expired' })
    .lte('seen_at', cutoff)                 // seen_at NULL은 자동 제외
    .is('redeemed_at', null)
    .not('status', 'in', '("dismissed","redeemed","expired")')
    .select('user_id, seen_at')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    expired_count: data?.length ?? 0,
    expired_user_ids: (data ?? []).map((r) => r.user_id),
  })
}
