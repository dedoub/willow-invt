import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { asProfile } from '@/lib/english'
import { asFreshOrder, selectFresh, shuffle } from '@/lib/english-queue'

// 모드별 출제 큐 + 통계.
// 복습 대상 = "마지막 시도가 불합격"인 문장. 정답률도 문장별 마지막 시도 기준 —
// 목표는 누적 학습 문장을 늘리면서 마지막 시도 기준 정답률을 100%에 가깝게 유지하는 것.

// 하루 100문장 페이스 기준 — 큐 한 번에 20문장 (5큐 = 100)
export type PracticeMode = 'new_heavy' | 'balanced' | 'review_heavy'
const RATIO: Record<PracticeMode, { fresh: number; review: number }> = {
  new_heavy: { fresh: 16, review: 4 },
  balanced: { fresh: 10, review: 10 },
  review_heavy: { fresh: 4, review: 16 },
}
const QUEUE_SIZE = 20

// KST 날짜 문자열 (YYYY-MM-DD)
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const mode = (req.nextUrl.searchParams.get('mode') ?? 'balanced') as PracticeMode
  const profile = asProfile(req.nextUrl.searchParams.get('profile'))
  // 신규 문항 선발 순서. 미지정이면 지금까지의 동작(오래된 순) 그대로.
  const order = asFreshOrder(req.nextUrl.searchParams.get('order'))
  const ratio = RATIO[mode] ?? RATIO.balanced
  const supabase = getServiceSupabase()

  const [itemsRes, attemptsRes] = await Promise.all([
    supabase.from('english_practice_items')
      .select('id, korean_full, korean_chunks, reference_english, topic, source_type, created_at')
      .eq('profile', profile)
      .order('created_at', { ascending: true }),
    supabase.from('english_practice_attempts')
      .select('item_id, passed, score, is_review, created_at')
      .eq('profile', profile)
      .order('created_at', { ascending: true }),
  ])
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 })
  if (attemptsRes.error) return NextResponse.json({ error: attemptsRes.error.message }, { status: 500 })

  const items = itemsRes.data ?? []
  const attempts = attemptsRes.data ?? []

  // 문장별 마지막 시도 (attempts는 시간 오름차순이라 마지막 대입이 최신)
  const latest = new Map<string, { passed: boolean; created_at: string }>()
  for (const a of attempts) latest.set(a.item_id, { passed: a.passed, created_at: a.created_at })

  const freshPool = items.filter(it => !latest.has(it.id))
  const reviewPool = items
    .filter(it => latest.get(it.id)?.passed === false)
    // 오래 묵은 오답부터
    .sort((a, b) => latest.get(a.id)!.created_at.localeCompare(latest.get(b.id)!.created_at))

  // 비율대로 채우고, 한쪽 풀이 모자라면 남는 자리를 다른 쪽으로 백필
  let nFresh = Math.min(ratio.fresh, freshPool.length)
  let nReview = Math.min(ratio.review, reviewPool.length)
  const free = QUEUE_SIZE - nFresh - nReview
  if (free > 0) {
    const addFresh = Math.min(free, freshPool.length - nFresh)
    nFresh += addFresh
    nReview += Math.min(free - addFresh, reviewPool.length - nReview)
  }

  const queue = shuffle([
    ...selectFresh(freshPool, order, nFresh).map(it => ({ ...it, is_review: false })),
    ...reviewPool.slice(0, nReview).map(it => ({ ...it, is_review: true })),
  ])

  // ── 통계 ──────────────────────────────────────────────
  const today = kstDate(new Date().toISOString())
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    days.push(kstDate(new Date(Date.now() - i * 86400_000).toISOString()))
  }
  const daily = days.map(d => ({ date: d, fresh: 0, review: 0 }))
  const dailyIdx = new Map(days.map((d, i) => [d, i]))
  for (const a of attempts) {
    const idx = dailyIdx.get(kstDate(a.created_at))
    if (idx === undefined) continue
    if (a.is_review) daily[idx].review++
    else daily[idx].fresh++
  }
  const todayRow = daily[daily.length - 1]

  const attempted = latest.size
  const passedCount = [...latest.values()].filter(v => v.passed).length

  return NextResponse.json({
    queue,
    stats: {
      today: { fresh: todayRow.fresh, review: todayRow.review, date: today },
      daily,
      totalItems: items.length,
      attemptedItems: attempted,       // 누적 학습 문장 (시도한 고유 문장)
      passedItems: passedCount,        // 마지막 시도 기준 합격 문장
      accuracy: attempted > 0 ? Math.round((passedCount / attempted) * 100) : 0,
      freshRemaining: freshPool.length,
      reviewRemaining: reviewPool.length,
    },
  })
}
