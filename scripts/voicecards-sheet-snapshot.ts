/**
 * VoiceCards 시트 스냅샷 — 매일 유저별 시트 수(users.sheet_ids 길이)를 기록.
 * 시트 "오늘 증가분"(전일대비)을 내기 위한 일별 스냅샷. 보유카드 daily_inventory_snapshots 와 동일 취지.
 * 매일 00:05 KST 실행(launchd) → 그날 스냅샷 = 자정 기준 → 대시보드는 live − 스냅샷 = 오늘 증가분.
 * 쓰기 필요 → VOICECARDS_SUPABASE_SERVICE_KEY (anon 은 RLS로 불가).
 * 실행: npx tsx scripts/voicecards-sheet-snapshot.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { buildVoicecardsCurrentCardMaps } from '../src/lib/voicecards-current-inventory'

const url = process.env.VOICECARDS_SUPABASE_URL
const key = process.env.VOICECARDS_SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('VOICECARDS_SUPABASE_URL / VOICECARDS_SUPABASE_SERVICE_KEY 미설정')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const t0 = Date.now()
  // KST 오늘 날짜 (YYYY-MM-DD)
  const kstDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })

  // 전 유저 sheet_ids 수집 (페이지네이션)
  const users: Array<{ user_id: string; sheet_ids: string[] | null }> = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('users')
      .select('user_id, sheet_ids')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    for (const u of data as Array<{ user_id: string | null; sheet_ids: string[] | null }>) {
      if (!u.user_id) continue
      users.push({ user_id: u.user_id, sheet_ids: u.sheet_ids })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

  // 카드는 현재 sheet_ids에 남은 시트만 세고, 말하기는 삭제된 시트까지 누적으로 유지한다.
  const { data: analyticsData, error: analyticsError } = await sb
    .from('user_analytics')
    .select('user_id, sheet_id, total_cards, total_attempts')
  if (analyticsError) throw analyticsError
  const analytics = (analyticsData ?? []) as Array<{
    user_id: string
    sheet_id: string | null
    total_cards: number | null
    total_attempts: number | null
  }>
  const { cards: cardByUser } = buildVoicecardsCurrentCardMaps(users, analytics)
  const attemptByUser = new Map<string, number>()
  for (const row of analytics) {
    attemptByUser.set(row.user_id, (attemptByUser.get(row.user_id) || 0) + (Number(row.total_attempts) || 0))
  }

  const rows = users.map(user => ({
    user_id: user.user_id,
    date: kstDate,
    sheet_count: user.sheet_ids?.length || 0,
    card_count: cardByUser.get(user.user_id) || 0,
    attempt_count: attemptByUser.get(user.user_id) || 0,
  }))

  // upsert (user_id, date) — 재실행 시 그날 값 갱신
  let saved = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await sb.from('user_sheet_snapshots').upsert(chunk, { onConflict: 'user_id,date' })
    if (error) throw error
    saved += chunk.length
  }
  console.log(`시트 스냅샷 완료: ${saved} users @ ${kstDate}, ${(Date.now() - t0) / 1000}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
