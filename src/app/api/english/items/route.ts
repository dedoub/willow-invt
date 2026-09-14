import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { asProfile } from '@/lib/english'
import { passStreak, hintLevelFor } from '@/lib/english-practice-review'

/**
 * 문제은행 전체 + 문장별 학습 기록.
 *
 * 큐(/api/english/queue)는 오늘 풀 스무 문장만 돌려준다. 이 라우트는 반대로 전부를 돌려주되
 * 푸는 데 필요한 것이 아니라 **지나온 것**을 싣는다 — 몇 번 시도했고, 마지막이 몇 점이었고,
 * 지금 힌트가 어느 단계인지. 연습 화면과 분리해 달라는 요청이라 라우트도 나눈다(CEO 2026-09-14).
 */

export interface ItemAttempt {
  score: number
  passed: boolean
  used_hint: boolean
  created_at: string
}

export async function GET(req: NextRequest) {
  const profile = asProfile(req.nextUrl.searchParams.get('profile'))
  const supabase = getServiceSupabase()

  const [itemsRes, attemptsRes] = await Promise.all([
    supabase.from('english_practice_items')
      .select('id, korean_full, korean_chunks, english_chunks, reference_english, topic, source_type, created_at')
      .eq('profile', profile)
      .order('created_at', { ascending: false }),
    supabase.from('english_practice_attempts')
      .select('item_id, score, passed, used_hint, created_at')
      .eq('profile', profile)
      .order('created_at', { ascending: true }),
  ])
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })
  if (attemptsRes.error) return NextResponse.json({ error: attemptsRes.error.message }, { status: 500 })

  const byItem = new Map<string, ItemAttempt[]>()
  for (const a of attemptsRes.data ?? []) {
    const one = { score: a.score, passed: a.passed, used_hint: !!a.used_hint, created_at: a.created_at }
    const row = byItem.get(a.item_id)
    if (row) row.push(one)
    else byItem.set(a.item_id, [one])
  }

  const items = (itemsRes.data ?? []).map(it => {
    const attempts = byItem.get(it.id) ?? []
    const last = attempts[attempts.length - 1] ?? null
    const streak = passStreak(attempts)
    return {
      ...it,
      attempts,
      tries: attempts.length,
      last_score: last?.score ?? null,
      last_passed: last?.passed ?? null,
      last_at: last?.created_at ?? null,
      streak,
      hint_level: hintLevelFor(streak),
      // 최고 점수는 "한 번은 해냈다"를 말한다. 마지막 점수만 보면 그 사실이 사라진다.
      best_score: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null,
    }
  })

  return NextResponse.json({ items })
}
