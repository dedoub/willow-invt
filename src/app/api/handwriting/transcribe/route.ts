import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { llmJson } from '@/lib/english'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * 손글씨 연습장 → 텍스트.
 *
 * 영작연습의 채점 라우트도 같은 비전 호출을 쓰지만 저쪽은 전사와 채점이 한 몸이라
 * 문제 항목(itemId)이 있어야 한다. 여기는 전사만 한다 — 받아 적을 정답이 없는 메모라서다.
 *
 * 영작연습과 다른 점이 하나 더 있다. 저쪽은 영어 한 문장을 읽지만 여기는 한글·영어가
 * 섞인 여러 줄 메모라, 줄바꿈을 살리고 못 읽은 글자를 지어내지 않게 시킨다.
 */
const SYSTEM = `You transcribe handwritten notes from an image.

Rules:
- Output JSON only: {"text": string}
- The note may be in Korean, English, or a mix. Transcribe each in its own script.
- Preserve line breaks with \\n. Preserve bullet marks and numbering as written.
- Transcribe only what is written. Never complete, correct, translate or explain.
- For a word you cannot read, write ○ for each unreadable character rather than guessing.
- If the image holds no legible writing (blank, scribbles, a drawing), return {"text": ""}.`

export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  let body: { imageBase64?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const imageBase64 = body.imageBase64
  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
  }

  try {
    const out = await llmJson(SYSTEM, 'Transcribe the handwriting in the attached image.', 2000, imageBase64) as { text?: string }
    const text = String(out.text ?? '').trim()
    // 빈 문자열은 오류가 아니다 — 낙서만 있는 판이다. 호출부가 그렇게 말해 준다.
    return NextResponse.json({ text })
  } catch (e) {
    console.error('handwriting transcribe failed:', e)
    return NextResponse.json({ error: '손글씨를 읽지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
  }
}
