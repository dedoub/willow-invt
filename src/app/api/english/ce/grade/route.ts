import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson } from '@/lib/english'
import { fetchCeProblems, fetchS3Object } from '@/lib/english-ce'
import { normaliseCompositionGrade, type RawCompositionPoint } from '@/lib/english-ce-grading'
import { getAuthUser } from '@/lib/auth'

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
The text contains the ReviewNotes solution in Korean, including 문제 이해 and 답안 구성, followed by an example answer and explanation.
Use that solution as the task-specific guide and assess exactly three levels, from large structure to small structure:
1. paragraph_structure (문단 구성): whether the whole piece has purposeful paragraphs in a logical order and covers the task.
2. paragraph_sentence_structure (문단 내 문장 구성): whether each paragraph's sentences have clear roles, develop one idea, connect logically, and follow the plan.
3. sentence_quality (개별 문장의 완성도): whether individual sentences are complete, precise, varied, and accurate in vocabulary, spelling, punctuation, and grammar.
For a 35-mark composition use 10 + 15 + 10 possible marks in that order. For another maximum, scale the three possible marks proportionally and make them sum exactly to maxScore.
The plan is guidance, not a script. Do not require the exact wording of the example answer or the exact sentence count when the pupil achieves the same purpose with a coherent alternative structure. Do not reward copied phrases by themselves when the writing does not fulfil the task.
British English conventions apply. Never mark British spellings (learnt, colour, organise) as errors or correct them to American forms. An 11+ level is expected, not adult writing.
Return JSON only:
{"score": int, "maxScore": int, "points": [{"level": "paragraph_structure", "earned": int, "possible": int, "note": "구체적인 한국어 근거", "nextPractice": "바로 할 연습 한 가지"}, {"level": "paragraph_sentence_structure", "earned": int, "possible": int, "note": "구체적인 한국어 근거", "nextPractice": "바로 할 연습 한 가지"}, {"level": "sentence_quality", "earned": int, "possible": int, "note": "구체적인 한국어 근거", "nextPractice": "바로 할 연습 한 가지"}], "comment": "세 단계 중 먼저 고칠 한 가지를 알려주는 짧은 한국어", "corrections": [{"before": "학생 문장", "after": "고친 문장", "why": "짧은 한국어"}]}
Return exactly three points in that order. Possible marks must sum to maxScore and earned marks must sum to score. Refer to concrete requirements from the plan. Keep every note and nextPractice under 70 Korean characters. Return no more than two corrections.`

export async function POST(req: NextRequest) {
  if (!(await getAuthUser())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
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

    // 2단계: 독해만 지문 이미지를 붙인다. 작문은 상세 풀이 텍스트로 빠르게 채점한다.
    const images: string[] = []
    if (problem.kind === 'comprehension') {
      for (const key of problem.imageKeys.slice(0, 4)) {
        try { images.push((await fetchS3Object(key)).buf.toString('base64')) } catch { /* 지문 일부 누락은 허용 */ }
      }
    }
    const system = problem.kind === 'composition' ? COMPOSITION_SYSTEM : COMPREHENSION_SYSTEM
    const user = `## REVIEWNOTES PROBLEM SOLUTION AND WRITING PLAN
${problem.schemeText}

## MAX SCORE
${problem.maxScore}

## PUPIL'S ANSWER
${answerText}`

    const raw = await llmJson(system, user, 1400, problem.kind === 'comprehension' ? images : undefined) as {
      score?: number; maxScore?: number
      points?: { level?: string; earned: number; possible: number; note: string; nextPractice?: string }[]
      comment?: string
      corrections?: { before: string; after: string; why: string }[]
    }
    const maxScore = problem.maxScore
    const rawPoints = Array.isArray(raw.points) ? raw.points : []
    const compositionGrade = problem.kind === 'composition'
      ? normaliseCompositionGrade(Number(raw.score ?? 0), maxScore, rawPoints as RawCompositionPoint[])
      : null
    const score = compositionGrade?.score
      ?? Math.max(0, Math.min(maxScore, Math.round(Number(raw.score ?? 0))))
    const feedback = {
      points: compositionGrade?.points ?? rawPoints.slice(0, 5),
      comment: String(raw.comment ?? ''),
      corrections: Array.isArray(raw.corrections) ? raw.corrections.slice(0, problem.kind === 'composition' ? 2 : 3) : undefined,
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
