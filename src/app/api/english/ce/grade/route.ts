import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson } from '@/lib/english'
import { fetchCeProblems, fetchS3Object } from '@/lib/english-ce'

export const maxDuration = 60

// 손글씨 전사 — 맥락 제로 (english/grade와 동일한 커닝 차단 구조)
const TRANSCRIBE_SYSTEM = `You are a strict OCR for handwritten English on a canvas image.
Return JSON only: {"transcript": string}
Rules:
- Transcribe EXACTLY the letters/words written, including spelling and grammar mistakes. Never correct, complete, or guess.
- If the strokes do not form legible English words (random scribbles, shapes, drawings), return {"transcript": ""}.`

const COMPREHENSION_SYSTEM = `You are a CE 11+ English examiner marking a comprehension answer written by an 11-year-old Korean girl preparing for UK senior school entry.
The attached image(s) show the reading passage and the printed question. The OFFICIAL MARK SCHEME is given in the text.
British English conventions apply — never mark British spellings (learnt, colour, organise) as errors or 'correct' them to American forms.
Mark STRICTLY by the scheme: award marks only for elements the scheme accepts, with the partial-credit rules it states. Different wording that clearly expresses an accepted point still earns the mark. Do not exceed the stated maximum.
Return JSON only:
{"score": int, "maxScore": int, "points": [{"earned": int, "possible": int, "note": "무엇으로 얻었고/잃었는지 짧은 한국어"}], "comment": "격려하는 한국어 총평 1-2문장 + 더 받으려면 무엇을 쓰면 됐는지"}
points: 2-4 items covering how the marks break down. Notes in simple Korean a child understands.`

const COMPOSITION_SYSTEM = `You are a CE 11+ English examiner marking a composition (essay/descriptive writing) by an 11-year-old Korean girl.
The attached image(s) show the printed task. The marking guidance is given in the text — content marks and SPaG (spelling, punctuation, grammar) marks as stated (usually 25 + 10).
British English conventions apply — never mark British spellings (learnt, colour, organise) as errors or 'correct' them to American forms.
Judge: does the writing answer the task and include every element the task demands; is the argument/description coherent; vocabulary and sentence variety; then SPaG. An 11+ level is expected, not adult writing.
Return JSON only:
{"score": int, "maxScore": int, "points": [{"earned": int, "possible": int, "note": "내용 점수 근거 (한국어)"}, {"earned": int, "possible": int, "note": "맞춤법·구두점·문법 점수 근거 (한국어)"}], "comment": "격려 + 가장 효과 큰 개선 2-3가지, 한국어", "corrections": [{"before": "학생 문장", "after": "고친 문장", "why": "짧은 한국어"}]}
corrections: up to 3 of the most instructive fixes.`

export async function POST(req: NextRequest) {
  const body = await req.json() as { problemId?: string; answer?: string; imageBase64?: string }
  const { problemId, answer, imageBase64 } = body
  if (!problemId || (!answer?.trim() && !imageBase64)) {
    return NextResponse.json({ error: 'problemId and answer (or imageBase64) required' }, { status: 400 })
  }

  try {
    const problems = await fetchCeProblems()
    const problem = problems.find(p => p.id === problemId)
    if (!problem) return NextResponse.json({ error: 'problem not found' }, { status: 404 })

    // 1단계: 손글씨면 맥락 없는 전사
    let transcript = ''
    if (imageBase64) {
      const t = await llmJson(TRANSCRIBE_SYSTEM, 'Transcribe the handwriting in the attached image.', 800, imageBase64) as { transcript?: string }
      transcript = String(t.transcript ?? '').trim()
      if (!transcript) {
        return NextResponse.json({ error: '글씨를 읽지 못했어요. 조금 더 또렷하게 써주세요.' }, { status: 422 })
      }
    }
    const answerText = imageBase64 ? transcript : answer!.trim()

    // 2단계: 지문·문항 이미지와 마크스킴으로 채점
    const images: string[] = []
    for (const key of problem.imageKeys.slice(0, 4)) {
      try { images.push((await fetchS3Object(key)).buf.toString('base64')) } catch { /* 지문 일부 누락은 허용 */ }
    }
    const system = problem.kind === 'composition' ? COMPOSITION_SYSTEM : COMPREHENSION_SYSTEM
    const user = `## OFFICIAL MARK SCHEME / GUIDANCE
${problem.schemeText}

## PUPIL'S ANSWER
${answerText}`

    const raw = await llmJson(system, user, 2500, images) as {
      score?: number; maxScore?: number
      points?: { earned: number; possible: number; note: string }[]
      comment?: string
      corrections?: { before: string; after: string; why: string }[]
    }
    const maxScore = problem.maxScore
    const score = Math.max(0, Math.min(maxScore, Math.round(Number(raw.score ?? 0))))
    const feedback = {
      points: Array.isArray(raw.points) ? raw.points.slice(0, 5) : [],
      comment: String(raw.comment ?? ''),
      corrections: Array.isArray(raw.corrections) ? raw.corrections.slice(0, 3) : undefined,
      transcript: imageBase64 ? transcript : undefined,
    }

    const { error: insErr } = await getServiceSupabase().from('english_ce_attempts').insert({
      problem_id: problemId,
      kind: problem.kind,
      user_answer: answerText,
      score,
      max_score: maxScore,
      feedback,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({
      score, maxScore, ...feedback,
      // 채점 후에만 마크스킴(답·풀이) 공개 — 학습용
      scheme: problem.schemeText,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'grade failed' }, { status: 500 })
  }
}
