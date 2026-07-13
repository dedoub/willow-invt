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

  // 유저별 보유 카드 합 (user_analytics.total_cards) — 카드 '오늘 증가분' 기준선
  const cardByUser = new Map<string, number>()
  {
    const { data, error } = await sb.from('user_analytics').select('user_id, total_cards')
    if (error) throw error
    for (const a of (data ?? []) as Array<{ user_id: string; total_cards: number | null }>) {
      cardByUser.set(a.user_id, (cardByUser.get(a.user_id) || 0) + (Number(a.total_cards) || 0))
    }
  }

  // 전 유저 sheet_ids 수집 (페이지네이션)
  const rows: Array<{ user_id: string; date: string; sheet_count: number; card_count: number }> = []
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
      rows.push({ user_id: u.user_id, date: kstDate, sheet_count: u.sheet_ids?.length || 0, card_count: cardByUser.get(u.user_id) || 0 })
    }
    if (data.length < PAGE) break
    from += PAGE
  }

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
