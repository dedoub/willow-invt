import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson, GradeFeedback } from '@/lib/english'

export const maxDuration = 30

const PASS_SCORE = 80

// 실시간 채점 — 속도 1순위라 단발 호출 + 짧은 프롬프트 + JSON 강제.
export async function POST(req: NextRequest) {
  const body = await req.json() as { itemId?: string; answer?: string; isReview?: boolean }
  const { itemId, answer, isReview } = body
  if (!itemId || !answer?.trim()) {
    return NextResponse.json({ error: 'itemId and answer required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { data: item, error: itemErr } = await supabase
    .from('english_practice_items')
    .select('id, korean_full, korean_chunks, reference_english')
    .eq('id', itemId)
    .single()
  if (itemErr || !item) return NextResponse.json({ error: 'item not found' }, { status: 404 })

  const system = `You grade a Korean speaker's English composition against a Korean prompt. Register: spoken American business English.
Score 0-100: meaning accuracy 50, grammar 30, natural spoken phrasing 20. Different-but-natural wording that keeps the meaning is NOT penalized — the reference is one possible answer, not the only one.
Return JSON only:
{"score": int, "corrected": "minimal fix of the learner's own sentence (keep their words where possible)", "natural": "the most natural spoken American version", "points": [{"type":"grammar|word|natural|good","note":"짧은 한국어 코멘트"}]}
points: 1-3 items, most important first. If the answer is already great, one "good" point. Notes in Korean, each under 60 chars.`

  const user = `한글: ${item.korean_full}
청킹: ${(item.korean_chunks as string[]).join(' / ')}
참고 답안: ${item.reference_english}
학습자 답안: ${answer.trim()}`

  try {
    const raw = await llmJson(system, user, 1000) as Partial<GradeFeedback>
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.score ?? 0))))
    const feedback: GradeFeedback = {
      score,
      corrected: String(raw.corrected ?? ''),
      natural: String(raw.natural ?? item.reference_english),
      points: Array.isArray(raw.points) ? raw.points.slice(0, 3) : [],
    }
    const passed = score >= PASS_SCORE

    const { error: insErr } = await supabase.from('english_practice_attempts').insert({
      item_id: itemId,
      user_answer: answer.trim(),
      score,
      passed,
      is_review: !!isReview,
      feedback,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ...feedback, passed, reference: item.reference_english })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'grade failed' }, { status: 500 })
  }
}
