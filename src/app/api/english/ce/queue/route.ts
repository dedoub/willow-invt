import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { fetchCeProblems } from '@/lib/english-ce'

export const maxDuration = 30

// CE 기출 출제 큐. 작문은 ReviewNotes 풀이를 먼저 읽고 계획한 뒤 쓰는 학습 흐름이다.
export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') === 'composition' ? 'composition' : 'comprehension'
  try {
    const [problems, attemptsRes] = await Promise.all([
      fetchCeProblems(),
      getServiceSupabase()
        .from('english_ce_attempts')
        .select('problem_id, score, max_score, created_at')
        .order('created_at', { ascending: true }),
    ])
    if (attemptsRes.error) throw new Error(attemptsRes.error.message)
    const attempts = attemptsRes.data ?? []

    // 문항별 마지막 시도 (시간 오름차순이라 마지막 대입이 최신)
    const last = new Map<string, { score: number; max: number }>()
    for (const a of attempts) last.set(a.problem_id, { score: a.score, max: a.max_score })

    const pool = problems.filter(p => p.kind === kind)
    const fresh = pool.filter(p => !last.has(p.id))
    const retry = pool
      .filter(p => { const l = last.get(p.id); return l && l.score < l.max })
      .sort((a, b) => {
        const ra = last.get(a.id)!, rb = last.get(b.id)!
        return (ra.score / ra.max) - (rb.score / rb.max)
      })
    const queue = [...fresh, ...retry].slice(0, 10).map(p => ({
      id: p.id, title: p.title, kind: p.kind, maxScore: p.maxScore,
      imageKeys: p.imageKeys, questionText: p.questionText,
      solution: p.schemeText,
      isReview: last.has(p.id),
    }))

    // KST 오늘 카운트
    const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    const todayCount = attempts.filter(a =>
      new Date(new Date(a.created_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10) === todayKst).length

    const solvedFull = pool.filter(p => { const l = last.get(p.id); return l && l.score >= l.max }).length
    return NextResponse.json({
      queue,
      stats: {
        today: todayCount,
        attempted: pool.filter(p => last.has(p.id)).length,
        solvedFull,
        total: pool.length,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'queue failed' }, { status: 500 })
  }
}
