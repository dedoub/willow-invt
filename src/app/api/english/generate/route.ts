import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { reviewnotesSupabase } from '@/lib/reviewnotes-supabase'
import { llmJson, asProfile } from '@/lib/english'

export const maxDuration = 120

const BATCH = 10
const MAX_COUNT = 50

// 청킹 규칙 — 두 프로필 공통 (보이스카드 청킹 스킬 방법론)
const CHUNKING_RULES = `## Chunking (the core of the exercise)
- AFTER the English sentence is final, split IT (the English) into real spoken breath units, in order — the phrases you'd say in one breath with one intonation contour. Avoid 1-2 word chunks; merge them into a neighbor (a natural sentence-final standalone is the only exception). A 5-6 word chunk is fine if it's said in one breath. Joining the "en" chunks in order must reproduce the reference sentence exactly.
- For each English chunk, write the "ko" Korean phrase that means exactly that chunk — same subject/verb/negation/tense scope, nothing borrowed from adjacent chunks. Target 3-4 어절, but matching the en chunk's exact meaning beats the word count. Because chunks follow the ENGLISH sentence order, the Korean verb phrase lands early (with the English verb), not at the end.
- korean_full: the natural Korean full sentence (normal Korean word order).`

const OUTPUT_SPEC = `Do NOT reuse or closely paraphrase any sentence in the "already used" list, and never output the example sentence above as an item.
Return JSON: {"items":[{"korean_full":"...","reference_english":"...","chunks":[{"en":"...","ko":"..."}],"topic":"..."}]} with exactly 10 items.`

const CEO_SYSTEM = `You create English composition practice items for a Korean CEO of a small investment/software company.
He wants to practice spoken American business English he would actually say in daily work — meetings, emails read aloud, quick updates, requests, small talk about his projects.

## English style (write this FIRST)
1. Write ONE natural spoken American English sentence (10-22 words), first person, grounded in the provided work context. Tone: clear, polished, direct, confident — what you'd actually say out loud in a New York business conversation, not written/translated prose. Contractions OK. Natural discourse markers OK when they fit ("I mean", "But the truth is", "From the outside").
2. Do NOT mirror Korean sentence structure. Capture the speaker's intent and rewrite it in the American English order of thought.

${CHUNKING_RULES}
- All Korean is 구어체 존댓말 ("~해요/~거예요"), never written style ("~합니다/~됩니다").

Example:
reference_english: "I sent the invoice to Akros yesterday, and I'll check the payment next week."
korean_full: "어제 아크로스에 인보이스를 보냈고, 다음 주에 수금을 확인할 거예요."
chunks: [
  {"en": "I sent the invoice", "ko": "저는 보냈어요, 인보이스를"},
  {"en": "to Akros yesterday,", "ko": "아크로스에 어제요,"},
  {"en": "and I'll check the payment", "ko": "그리고 확인할 거예요, 수금을"},
  {"en": "next week.", "ko": "다음 주에요."}
]
- topic: 2-4 word Korean label of the subject matter.

${OUTPUT_SPEC}`

const RYUHA_SYSTEM = `You create English speaking-practice items for Ryuha, an 11-year-old Korean girl preparing for UK senior school entrance (Wycombe Abbey 11+, ISEB Pre-Tests) — especially the school INTERVIEW and everyday conversation at a British school.

## English style (write this FIRST)
1. Write ONE natural spoken BRITISH English sentence (8-18 words), first person, that Ryuha herself would actually SAY in an interview or at school: introducing herself, her hobbies and favourite books, her school life in Korea, her family, why she wants to join the school, what she is curious about, how she practises and learns. Warm, confident, polite, age-appropriate — a bright Year 6 pupil's voice, never corporate or bookish.
2. British spelling and vocabulary (favourite, colour, maths, brilliant, quite, lovely). Contractions OK.
3. Use the provided notes ONLY as background context for topics (which schools, what she is preparing, her study methods). Administrative facts (deadlines, portals, fees) are her parents' business — never make her recite them.
4. The "ISEB practice problems" section shows what she is actually studying right now. Use it two ways: sentences where she TALKS ABOUT those topics ("I've been practising fraction problems this week"), and sentences that naturally USE the English vocabulary from the problems in her own speech. Never turn a quiz question itself into the sentence.
5. HARD quotas for each batch of 10 — check before returning:
   - At most 3 sentences may contain "ISEB" or "Pre-Tests" at all, and no two sentences may share the same opening ("I'm practising...") or the same ending phrase.
   - At least 4 sentences are personal interview answers with NO exam mention: who she is, family, hobbies, favourite books, feelings, why this school, questions she'd ask the interviewer.
   - Vary tenses and frames: past ("Last week I..."), feelings ("I find ... tricky but fun"), comparisons, opinions, little stories.
6. Do NOT mirror Korean sentence structure. Write the English thought first.

${CHUNKING_RULES}
- All Korean is natural spoken 해요체 (아이가 실제로 말하듯: "~이에요/~거든요/~하고 싶어요"), never 문어체.

Example:
reference_english: "My favourite subject is maths because I really enjoy solving tricky problems."
korean_full: "제가 제일 좋아하는 과목은 수학이에요, 어려운 문제 푸는 게 정말 재미있거든요."
chunks: [
  {"en": "My favourite subject is maths", "ko": "제가 제일 좋아하는 과목은 수학이에요,"},
  {"en": "because I really enjoy", "ko": "왜냐하면 정말 재미있거든요,"},
  {"en": "solving tricky problems.", "ko": "어려운 문제 푸는 게요."}
]
- topic: 2-4 word Korean label (예: "자기소개", "취미", "지원 동기").

${OUTPUT_SPEC}`

// 소재를 뽑아 구어체 영작 문제를 배치 생성해 문제은행에 저장.
// count(기본 10, 최대 50)만큼 10개 단위로 나눠 생성 — 회차마다 중복 방지 목록을 누적한다.
// profile: ceo(미국식 비즈니스, 위키+이메일 소재) / ryuha(영국식 ISEB 인터뷰, 류하 노트 소재)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { count?: number; profile?: string }
  const count = Math.min(MAX_COUNT, Math.max(BATCH, Number(body.count ?? BATCH)))
  const profile = asProfile(body.profile)
  const supabase = getServiceSupabase()

  // 소재 풀을 넓게 가져와 회차마다 랜덤 샘플 — 최신 노트에만 편중되면 소재가 금방 겹친다
  const sourceQuery = profile !== 'ceo'
    ? supabase.from('ryuha_notes')
        .select('title, content, category')
        .in('category', ['진학', '학습법', '학교', '학습계획'])
        .order('updated_at', { ascending: false })
        .limit(100)
    : supabase.from('work_wiki')
        .select('title, content, section')
        .order('updated_at', { ascending: false })
        .limit(200)

  const [sourceRes, emailRes, recentRes] = await Promise.all([
    sourceQuery,
    profile === 'ceo'
      ? supabase.from('email_analysis')
          .select('label, analysis_data')
          .order('generated_at', { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as { label: string; analysis_data: unknown }[] }),
    // 중복 방지 — 최근 만든 문제의 영어 문장 목록
    supabase.from('english_practice_items')
      .select('reference_english')
      .eq('profile', profile)
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  const notes = (sourceRes.data ?? []) as { title: string; content: string | null; section?: string; category?: string }[]

  // 류하 추가 소재 — ReviewNotes의 ISEB English/Maths 노트 문항 (지금 실제로 공부하는 내용)
  let isebProblems: { note: string; question: string; answer: string }[] = []
  if (profile !== 'ceo' && reviewnotesSupabase) {
    const { data: rnNotes } = await reviewnotesSupabase
      .from('Note')
      .select('id, title')
      .or('title.ilike.%ISEB%English%,title.ilike.%ISEB%Math%')
    const noteIds = (rnNotes ?? []).map(n => n.id)
    const titleById = new Map((rnNotes ?? []).map(n => [n.id, n.title as string]))
    if (noteIds.length > 0) {
      // 문항이 수천 개라 임의 오프셋 페이지를 뽑아 회차마다 다른 문항이 섞이게 한다
      const { count } = await reviewnotesSupabase
        .from('Problem').select('id', { count: 'exact', head: true }).in('noteId', noteIds)
      const offset = Math.max(0, Math.floor(Math.random() * Math.max(1, (count ?? 0) - 300)))
      const { data: probs } = await reviewnotesSupabase
        .from('Problem')
        .select('noteId, question, answer')
        .in('noteId', noteIds)
        .range(offset, offset + 299)
      isebProblems = (probs ?? []).map(p => ({
        note: titleById.get(p.noteId) ?? 'ISEB',
        question: String(p.question ?? '').slice(0, 160),
        answer: String(p.answer ?? '').slice(0, 60),
      }))
    }
  }
  const emailText = (emailRes.data ?? [])
    .map(e => `- ${e.label}: ${JSON.stringify(e.analysis_data).slice(0, 400)}`)
    .join('\n')
  const existing = (recentRes.data ?? []).map(r => r.reference_english)
  const system = profile === 'ryuha' ? RYUHA_SYSTEM : CEO_SYSTEM

  interface GenChunk { en: string; ko: string }
  interface GenItem { korean_full: string; reference_english: string; chunks: GenChunk[]; topic?: string }

  let created = 0
  let lastError: string | null = null

  try {
    for (let done = 0; done < count; done += BATCH) {
      // 회차마다 다른 소재가 섞이도록 노트를 셔플해 일부만 사용
      const shuffled = [...notes].sort(() => Math.random() - 0.5).slice(0, 8)
      const noteText = shuffled
        .map(n => `- [${n.section ?? n.category}] ${n.title}: ${String(n.content ?? '').slice(0, 300)}`)
        .join('\n')

      // 회차마다 ISEB 문항도 새로 샘플
      const probSample = [...isebProblems].sort(() => Math.random() - 0.5).slice(0, 12)
      const probText = probSample
        .map(p => `- [${p.note}] Q: ${p.question}${p.answer ? ` / A: ${p.answer}` : ''}`)
        .join('\n')

      const user = `## Notes (source material for topics)
${noteText || '(none)'}
${profile === 'ceo' ? `
## Recent email analysis (source material)
${emailText || '(none)'}
` : `
## ISEB practice problems she is studying (topics/vocabulary source)
${probText || '(none)'}
`}
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
        source_type: profile === 'ceo' ? 'wiki' : 'ryuha_notes',
        profile,
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
