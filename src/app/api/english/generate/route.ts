import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson } from '@/lib/english'

export const maxDuration = 120

const BATCH = 10
const MAX_COUNT = 50

// 업무위키·이메일 분석에서 소재를 뽑아 미국식 구어체 영작 문제를 배치 생성해 문제은행에 저장.
// count(기본 10, 최대 50)만큼 10개 단위로 나눠 생성 — 회차마다 중복 방지 목록을 누적한다.
export async function POST(req: NextRequest) {
  const count = Math.min(MAX_COUNT, Math.max(BATCH, Number((await req.json().catch(() => ({}))).count ?? BATCH)))
  const supabase = getServiceSupabase()

  // 소재: 최근 위키 노트(제목+본문 앞부분) + 최근 이메일 분석 요약
  const [wikiRes, emailRes, recentRes] = await Promise.all([
    supabase.from('work_wiki')
      .select('title, content, section')
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase.from('email_analysis')
      .select('label, analysis_data')
      .order('generated_at', { ascending: false })
      .limit(4),
    // 중복 방지 — 최근 만든 문제의 영어 문장 목록
    supabase.from('english_practice_items')
      .select('reference_english')
      .order('created_at', { ascending: false })
      .limit(120),
  ])

  const wikiNotes = (wikiRes.data ?? [])
  const emailText = (emailRes.data ?? [])
    .map(e => `- ${e.label}: ${JSON.stringify(e.analysis_data).slice(0, 400)}`)
    .join('\n')
  const existing = (recentRes.data ?? []).map(r => r.reference_english)

  const system = `You create English composition practice items for a Korean CEO of a small investment/software company.
He wants to practice spoken American business English he would actually say in daily work — meetings, emails read aloud, quick updates, requests, small talk about his projects.

## English style (write this FIRST)
1. Write ONE natural spoken American English sentence (10-22 words), first person, grounded in the provided work context. Tone: clear, polished, direct, confident — what you'd actually say out loud in a New York business conversation, not written/translated prose. Contractions OK. Natural discourse markers OK when they fit ("I mean", "But the truth is", "From the outside").
2. Do NOT mirror Korean sentence structure. Capture the speaker's intent and rewrite it in the American English order of thought.

## Chunking (the core of the exercise)
3. AFTER the English sentence is final, split IT (the English) into real spoken breath units, in order — the phrases you'd say in one breath with one intonation contour ("But the truth is," / "he's been at this" / "for 15-plus years"). Avoid 1-2 word chunks; merge them into a neighbor (a natural sentence-final standalone is the only exception). A 5-6 word chunk is fine if it's said in one breath. Joining the "en" chunks in order must reproduce the reference sentence exactly.
4. For each English chunk, write the "ko" Korean phrase that means exactly that chunk — same subject/verb/negation/tense scope, nothing borrowed from adjacent chunks. Target 3-4 어절, but matching the en chunk's exact meaning beats the word count. Because chunks follow the ENGLISH sentence order, the Korean verb phrase lands early (with the English verb), not at the end.
5. korean_full: the natural Korean full sentence (normal Korean word order). All Korean is 구어체 존댓말 ("~해요/~거예요"), never written style ("~합니다/~됩니다").

Example:
reference_english: "I sent the invoice to Akros yesterday, and I'll check the payment next week."
korean_full: "어제 아크로스에 인보이스를 보냈고, 다음 주에 수금을 확인할 거예요."
chunks: [
  {"en": "I sent the invoice", "ko": "저는 보냈어요, 인보이스를"},
  {"en": "to Akros yesterday,", "ko": "아크로스에 어제요,"},
  {"en": "and I'll check the payment", "ko": "그리고 확인할 거예요, 수금을"},
  {"en": "next week.", "ko": "다음 주에요."}
]
6. topic: 2-4 word Korean label of the subject matter.

Do NOT reuse or closely paraphrase any sentence in the "already used" list, and never output the example sentence above as an item.
Return JSON: {"items":[{"korean_full":"...","reference_english":"...","chunks":[{"en":"...","ko":"..."}],"topic":"..."}]} with exactly 10 items.`

  interface GenChunk { en: string; ko: string }
  interface GenItem { korean_full: string; reference_english: string; chunks: GenChunk[]; topic?: string }

  let created = 0
  let lastError: string | null = null

  try {
    for (let done = 0; done < count; done += BATCH) {
      // 회차마다 다른 소재가 섞이도록 위키 노트를 셔플해 일부만 사용
      const shuffled = [...wikiNotes].sort(() => Math.random() - 0.5).slice(0, 8)
      const wikiText = shuffled
        .map(n => `- [${n.section}] ${n.title}: ${String(n.content ?? '').slice(0, 300)}`)
        .join('\n')

      const user = `## Work wiki notes (source material)
${wikiText || '(none)'}

## Recent email analysis (source material)
${emailText || '(none)'}

## Already used (avoid duplicates)
${existing.join('\n') || '(none)'}`

      const out = await llmJson(system, user, 8000) as { items?: unknown[] }
      const items = (out.items ?? []).filter((it): it is GenItem => {
        const o = it as Record<string, unknown>
        return typeof o?.korean_full === 'string'
          && typeof o?.reference_english === 'string'
          && Array.isArray(o?.chunks)
          && (o.chunks as unknown[]).every(c => {
            const p = c as Record<string, unknown>
            return typeof p?.en === 'string' && typeof p?.ko === 'string'
          })
          && (o.chunks as unknown[]).length > 0
      })
      if (items.length === 0) { lastError = 'no items generated'; continue }

      const rows = items.map(it => ({
        korean_full: it.korean_full,
        korean_chunks: it.chunks.map(c => c.ko),
        english_chunks: it.chunks.map(c => c.en),
        reference_english: it.reference_english,
        topic: it.topic ?? null,
        source_type: 'wiki',
      }))
      const { error } = await supabase.from('english_practice_items').insert(rows)
      if (error) { lastError = error.message; continue }
      created += rows.length
      existing.push(...rows.map(r => r.reference_english))
    }

    if (created === 0) return NextResponse.json({ error: lastError ?? 'no items generated' }, { status: 502 })
    return NextResponse.json({ created })
  } catch (e) {
    if (created > 0) return NextResponse.json({ created })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'generate failed' }, { status: 500 })
  }
}
