import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson, GradeFeedback, asProfile } from '@/lib/english'

export const maxDuration = 30

const PASS_SCORE = 80

// 손글씨(펜슬) 답안일 때 시스템 프롬프트 앞에 붙는 전사 지시
const HANDWRITING_PREFIX = `The learner wrote the answer BY HAND — a photo/canvas image of the handwriting is attached.
FIRST transcribe the handwritten English exactly as written (do not silently fix spelling or grammar while transcribing; unreadable parts become "?"). Put it in "transcript".
THEN grade that transcript as the learner's answer. If the writing is completely unreadable, return {"transcript":"", "score":0, ...} with a point explaining 글씨를 읽지 못했다고.

`

// 실시간 채점 — 속도 1순위라 단발 호출 + 짧은 프롬프트 + JSON 강제.
// answer(타이핑) 또는 imageBase64(손글씨 캔버스 PNG) 중 하나를 받는다.
export async function POST(req: NextRequest) {
  const body = await req.json() as { itemId?: string; answer?: string; imageBase64?: string; isReview?: boolean; profile?: string }
  const { itemId, answer, imageBase64, isReview } = body
  const profile = asProfile(body.profile)
  if (!itemId || (!answer?.trim() && !imageBase64)) {
    return NextResponse.json({ error: 'itemId and answer (or imageBase64) required' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { data: item, error: itemErr } = await supabase
    .from('english_practice_items')
    .select('id, korean_full, korean_chunks, reference_english')
    .eq('id', itemId)
    .single()
  if (itemErr || !item) return NextResponse.json({ error: 'item not found' }, { status: 404 })

  const system = profile === 'ryuha_written'
    ? `You grade an 11-year-old Korean girl's WRITTEN English sentence against a Korean prompt. Register: formal written British English for UK 11+ exam papers (reading comprehension answers, composition).
Score 0-100: meaning accuracy 50, grammar 30, written-register quality 20 (no contractions, precise vocabulary, correct punctuation). Different-but-correct wording that keeps the meaning is NOT penalized — the reference is one possible answer, not the only one. Use British spelling in corrections.
Return JSON only:
{"score": int, "corrected": "minimal fix of the learner's own sentence (keep her words where possible)", "natural": "the version an examiner would award full marks — polished written British English", "points": [{"type":"grammar|word|natural|good|meaning","note":"짧은 한국어 코멘트"}]}
points: 1-3 items, most important first. If the answer is already great, one "good" point. Notes in Korean a child understands easily, encouraging tone, each under 60 chars.`
    : profile === 'ryuha'
    ? `You grade an 11-year-old Korean girl's spoken English answer against a Korean prompt. Register: natural spoken BRITISH English, age-appropriate (UK school interview / school life).
Score 0-100: meaning accuracy 50, grammar 30, natural spoken phrasing 20. Different-but-natural wording that keeps the meaning is NOT penalized — the reference is one possible answer, not the only one. Use British spelling in corrections (favourite, colour, maths).
Return JSON only:
{"score": int, "corrected": "minimal fix of the learner's own sentence (keep her words where possible)", "natural": "the most natural spoken British version a Year 6 pupil would say", "points": [{"type":"grammar|word|natural|good","note":"짧은 한국어 코멘트"}]}
points: 1-3 items, most important first. If the answer is already great, one "good" point. Notes in Korean a child understands easily, encouraging tone, each under 60 chars.`
    : `You grade a Korean speaker's English composition against a Korean prompt. Register: spoken American business English.
Score 0-100: meaning accuracy 50, grammar 30, natural spoken phrasing 20. Different-but-natural wording that keeps the meaning is NOT penalized — the reference is one possible answer, not the only one.
Return JSON only:
{"score": int, "corrected": "minimal fix of the learner's own sentence (keep their words where possible)", "natural": "the most natural spoken American version", "points": [{"type":"grammar|word|natural|good","note":"짧은 한국어 코멘트"}]}
points: 1-3 items, most important first. If the answer is already great, one "good" point. Notes in Korean, each under 60 chars.`

  const user = `한글: ${item.korean_full}
청킹: ${(item.korean_chunks as string[]).join(' / ')}
참고 답안: ${item.reference_english}
학습자 답안: ${imageBase64 ? '(첨부된 손글씨 이미지)' : answer!.trim()}`

  try {
    const raw = await llmJson(
      imageBase64 ? HANDWRITING_PREFIX + system : system,
      user, 1200, imageBase64,
    ) as Partial<GradeFeedback> & { transcript?: string }
    const transcript = typeof raw.transcript === 'string' ? raw.transcript.trim() : ''
    if (imageBase64 && !transcript) {
      return NextResponse.json({ error: '글씨를 읽지 못했어요. 조금 더 크게 써주세요.' }, { status: 422 })
    }
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
      user_answer: imageBase64 ? transcript : answer!.trim(),
      score,
      passed,
      is_review: !!isReview,
      feedback,
      profile,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ ...feedback, passed, reference: item.reference_english, ...(imageBase64 ? { transcript } : {}) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'grade failed' }, { status: 500 })
  }
}
