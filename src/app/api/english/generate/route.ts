import { NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { llmJson } from '@/lib/english'

export const maxDuration = 60

// 업무위키·이메일 분석에서 소재를 뽑아 미국식 구어체 영작 문제 10개를 배치 생성해 문제은행에 저장.
export async function POST() {
  const supabase = getServiceSupabase()

  // 소재: 최근 위키 노트(제목+본문 앞부분) + 최근 이메일 분석 요약
  const [wikiRes, emailRes, recentRes] = await Promise.all([
    supabase.from('work_wiki')
      .select('title, content, section')
      .order('updated_at', { ascending: false })
      .limit(24),
    supabase.from('email_analysis')
      .select('label, analysis_data')
      .order('generated_at', { ascending: false })
      .limit(4),
    // 중복 방지 — 최근 만든 문제의 영어 문장 목록
    supabase.from('english_practice_items')
      .select('reference_english')
      .order('created_at', { ascending: false })
      .limit(60),
  ])

  const wikiNotes = (wikiRes.data ?? [])
  // 매번 다른 소재가 섞이도록 위키 노트를 셔플해 일부만 사용
  const shuffled = [...wikiNotes].sort(() => Math.random() - 0.5).slice(0, 8)
  const wikiText = shuffled
    .map(n => `- [${n.section}] ${n.title}: ${String(n.content ?? '').slice(0, 300)}`)
    .join('\n')
  const emailText = (emailRes.data ?? [])
    .map(e => `- ${e.label}: ${JSON.stringify(e.analysis_data).slice(0, 400)}`)
    .join('\n')
  const existing = (recentRes.data ?? []).map(r => r.reference_english).join('\n')

  const system = `You create English composition practice items for a Korean CEO of a small investment/software company.
He wants to practice spoken American business English he would actually say in daily work — meetings, emails read aloud, quick updates, requests, small talk about his projects.

For each item:
1. Write ONE natural spoken American English sentence (10-22 words), first person, conversational register (contractions OK). Ground it in the provided work context.
2. Write the natural Korean full sentence (korean_full).
3. Split the Korean into chunks REORDERED to match the ENGLISH word order (korean_chunks). This is the core of the exercise: the learner reads the chunks top-to-bottom and each chunk maps onto the next English phrase. Korean puts the verb last — you MUST move the verb chunk to its English position (right after the subject). Each chunk is 1-4 어절.

Example:
reference_english: "I sent the invoice to Akros yesterday, and I'll check the payment next week."
korean_full: "어제 아크로스에 인보이스를 보냈고, 다음 주에 수금을 확인할 거예요."
korean_chunks: ["나는 보냈어요", "그 인보이스를", "아크로스에", "어제,", "그리고 나는 확인할 거예요", "수금을", "다음 주에"]

WRONG (Korean order — verb last): ["어제", "아크로스에", "인보이스를", "보냈고", ...]
4. topic: 2-4 word Korean label of the subject matter.

Do NOT reuse or closely paraphrase any sentence in the "already used" list.
Return JSON: {"items":[{"korean_full":"...","korean_chunks":["..."],"reference_english":"...","topic":"..."}]} with exactly 10 items.`

  const user = `## Work wiki notes (source material)
${wikiText || '(none)'}

## Recent email analysis (source material)
${emailText || '(none)'}

## Already used (avoid duplicates)
${existing || '(none)'}`

  try {
    const out = await llmJson(system, user, 8000) as { items?: unknown[] }
    const items = (out.items ?? []).filter((it): it is {
      korean_full: string; korean_chunks: string[]; reference_english: string; topic?: string
    } => {
      const o = it as Record<string, unknown>
      return typeof o?.korean_full === 'string'
        && Array.isArray(o?.korean_chunks)
        && typeof o?.reference_english === 'string'
    })
    if (items.length === 0) return NextResponse.json({ error: 'no items generated' }, { status: 502 })

    const rows = items.map(it => ({
      korean_full: it.korean_full,
      korean_chunks: it.korean_chunks,
      reference_english: it.reference_english,
      topic: it.topic ?? null,
      source_type: 'wiki',
    }))
    const { error } = await supabase.from('english_practice_items').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ created: rows.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'generate failed' }, { status: 500 })
  }
}
