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
 *
 * 손으로 그린 것이 늘 글은 아니다(2026-09-13 CEO). 그래서 무엇을 그렸는지 먼저
 * 가른다:
 *   · 표는 글자로 옮겨도 잃는 게 없다 — 마크다운 파이프 표로 낸다. 위키 본문은
 *     marked(gfm) 를 거쳐 진짜 <table> 로 그려지고, 정화기도 표 태그를 허용한다.
 *   · 다이어그램은 배치 자체가 내용이라 글자로 옮기면 복원할 수 없다. 그림은 첨부로
 *     남기고, 본문에는 검색에 걸릴 짧은 설명만 둔다.
 */
const SYSTEM = `You read a handwritten note from an image and return it as text.

First decide what the page holds, then transcribe accordingly.

Output JSON only: {"kind": "text" | "table" | "diagram" | "empty", "text": string}

- "text": ordinary writing. Transcribe it. Preserve line breaks with \\n, and keep
  bullet marks and numbering as written.
- "table": a grid of ruled or implied rows and columns. Return it as a GitHub
  flavoured markdown pipe table, header row first, one line per row. If the table
  has no header row, use the first row as the header.
- "diagram": boxes, arrows, flow charts, sketches — anything whose meaning is in
  the layout. Do NOT try to draw it in text. Return one or two short Korean
  sentences naming the parts and how they connect, so the note can be searched.
  Say nothing about handwriting quality or colours.
- "empty": nothing legible at all (blank page, stray marks).

A page may mix prose and a table. In that case use "table" and put the prose lines
above or below the table as plain lines.

Rules for every kind:
- The note may be in Korean, English, or a mix. Transcribe each in its own script.
- Transcribe only what is written. Never complete, correct, translate or explain.
- For a word you cannot read, write ○ for each unreadable character rather than guessing.`

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
    const out = await llmJson(SYSTEM, 'Read the attached page.', 2000, imageBase64) as { kind?: string; text?: string }
    const text = String(out.text ?? '').trim()
    const kinds = ['text', 'table', 'diagram', 'empty']
    // 모델이 엉뚱한 값을 주면 글로 친다 — 종류는 화면 문구를 고르는 데만 쓰고,
    // 본문은 어느 쪽이든 text 를 그대로 쓴다.
    const kind = kinds.includes(String(out.kind)) ? String(out.kind) : (text ? 'text' : 'empty')
    // 빈 문자열은 오류가 아니다 — 읽을 글씨가 없는 판이다. 호출부가 그렇게 말해 준다.
    return NextResponse.json({ kind, text })
  } catch (e) {
    console.error('handwriting transcribe failed:', e)
    return NextResponse.json({ error: '손글씨를 읽지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
  }
}
