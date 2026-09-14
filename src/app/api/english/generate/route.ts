import { NextRequest, NextResponse } from 'next/server'
import { getServiceSupabase } from '@/lib/supabase'
import { reviewnotesSupabase } from '@/lib/reviewnotes-supabase'
import { llmJson, asProfile } from '@/lib/english'
import { findTarget } from '@/lib/english-targets'

export const maxDuration = 120

const BATCH = 10
const MAX_COUNT = 50
/** 문어 문장의 기본 하한. 대상이 따로 정하면 그 값을 쓴다. */
const WRITTEN_MIN_WORDS = 16

// 청킹 규칙 — 두 프로필 공통 (보이스카드 청킹 스킬 방법론)
const CHUNKING_RULES = `## Chunking (the core of the exercise)
- AFTER the English sentence is final, split IT (the English) into real spoken breath units, in order — the phrases you'd say in one breath with one intonation contour. Avoid 1-2 word chunks; merge them into a neighbor (a natural sentence-final standalone is the only exception). A 5-6 word chunk is fine if it's said in one breath. Joining the "en" chunks in order must reproduce the reference sentence exactly.
- For each English chunk, write the "ko" Korean phrase that means exactly that chunk — same subject/verb/negation/tense scope, nothing borrowed from adjacent chunks. Target 3-4 어절, but matching the en chunk's exact meaning beats the word count. Because chunks follow the ENGLISH sentence order, the Korean verb phrase lands early (with the English verb), not at the end.
- Never split an English noun phrase across two chunks ("AI search | shadow data", "based on | user-managed ledgers" are wrong). Move the boundary so each chunk holds a whole phrase.
- EVERY Korean chunk must be sayable on its own. Two hard rules:
  (a) A trailing English relative clause becomes Korean 관형절 + its head noun, repeated: "to the developer account | that owns the app" → "개발자 계정에요, | 앱을 소유한 계정이요." Never end a chunk on a bare 관형형 ("앱을 소유한.", "제품이 쌓아온.").
  (b) Never attach 요 to a 관형형 ("통합되는요", "측정하는요" are ungrammatical). Close a trailing fragment with a noun + 요 ("통합되는 원리요"), or with a particle + 요 ("다음 주에요.", "무료로요.").
- korean_full: the natural Korean full sentence (normal Korean word order).`

const OUTPUT_SPEC = `Do NOT reuse or closely paraphrase any sentence in the "already used" list, and never output the example sentence above as an item.
Return JSON: {"items":[{"korean_full":"...","reference_english":"...","chunks":[{"en":"...","ko":"..."}],"topic":"..."}]} with exactly 10 items.`

const CEO_SYSTEM = `You create English composition practice items for a Korean CEO of a small investment/software company.
He wants to practice spoken American English he would actually say — both in daily work (meetings, emails read aloud, quick updates, requests) and in ordinary adult life in the US.

## Sentence mix (HARD quota for each batch of 10 — check before returning)
- 4 items: grounded in the provided work context (his actual projects, numbers, decisions).
- 3 items: basic business conversation that needs NO work context — the everyday phrases any professional uses. Scheduling and rescheduling, joining and running a call, introductions, asking someone to repeat or clarify, agreeing and pushing back politely, following up, apologizing for a delay, making and declining a request, wrapping up a meeting, small talk before it starts.
- 3 items: everyday life an American adult actually speaks in — ordering at a restaurant or coffee shop, groceries and returns, doctor and pharmacy, banking, taxis and airports, hotel check-in, calling about a repair or a bill, talking with neighbors, weekend plans, kids' school, weather and traffic, gym, small complaints and thanks.
- The 6 non-work items must NOT mention his companies, projects, or metrics. They stand on their own.
- Vary the opening and the grammar across the batch — no two items may start with the same two words.

## English style (write this FIRST)
1. Write ONE natural spoken American English sentence (10-22 words), first person. Tone: clear, direct, confident — what you'd actually say out loud, not written/translated prose. Contractions OK. Natural discourse markers OK when they fit ("I mean", "But the truth is", "From the outside").
2. For the daily-life items, use the plain phrasing a native adult really uses ("Could I get...", "I'm just going to...", "Do you mind if...", "It looks like...") — not textbook English and not business register.
3. Do NOT mirror Korean sentence structure. Capture the speaker's intent and rewrite it in the American English order of thought.

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
- kind: "work" for the work-context items, "business_talk" for the general business conversation items, "daily_life" for the everyday life items. Every item must have one.

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

/**
 * 소재 표가 없는 대상이 쓰는 주제 목록.
 *
 * 미국 학부 경영 과목이 실제로 다루는 축이다. 회차마다 몇 개만 뽑아 넘겨 같은 주제가
 * 연달아 나오지 않게 한다. 업무 기록을 소재로 쓰면 문장이 자꾸 보고로 돌아갔다 —
 * 에세이 연습의 대상은 내 일정이 아니라 논증이다(CEO 2026-09-14).
 */
const ESSAY_DOMAINS = [
  '경쟁우위와 그 지속 조건', '시장 구조와 가격 결정', '유인 설계와 대리인 문제',
  '조직 설계와 조정 비용', '자본 배분과 위험 감수', '기술 도입과 확산의 속도',
  '규제가 시장에 미치는 영향', '브랜드와 소비자 선택', '공급망과 수직 통합',
  '플랫폼과 네트워크 효과', '측정 지표가 행동을 왜곡하는 방식', '불확실성 아래의 의사결정',
  '진입 장벽과 신규 진입', '가격 차별과 소비자 잉여', '기업 지배구조와 책임',
  '노동 시장과 인재 유지', '국제 무역과 비교우위', '혁신의 자금 조달',
]

// ── 문어(written) ──────────────────────────────────────────────────────────
// 구어 프롬프트와 소재는 같고 문체만 갈린다. 같은 내용을 "말하듯" 대신 "쓰듯" 옮기는
// 연습이라, 한국어 힌트도 문어체로 준다 — 힌트가 해요체면 답도 해요체로 끌려간다.

const CEO_WRITTEN_SYSTEM = `You write English sentences at the level of three books the reader named as the target: Marc Levinson's *The Box*, Thales Teixeira's *Unlocking the Customer Value Chain*, and Peter Thiel's *Zero to One*. What they share is what you must match — analytical business prose that explains a mechanism through concrete detail, and that is willing to say the thing the reader did not expect.

## Study these three. They define the level. Match their length, their syntax and their concreteness.

A. "The container's value lay not in the box itself, which was merely a corrugated steel frame, but in the reordering of ports, railways and labour contracts that had to precede its first useful voyage."

B. "Ports that invested earliest in container cranes did not always prosper, because a berth could only pay for itself if the railways behind it were rebuilt to carry the boxes inland, and those railways answered to no one at the dock."

C. "Because the new tariff was charged by the container rather than by the ton, shippers who had once paid to keep cargo light now had every reason to fill each box until it strained, and the savings that the carriers had promised themselves quietly moved to their customers."

D. "What the upstart took was not the whole business but the one step customers disliked most, which left the incumbent holding the expensive half of a relationship it could no longer complete."

E. "A company that competes on being slightly better than its rivals has already conceded the important question, since the prize goes to whoever makes the comparison irrelevant."

## What those five have in common — your sentence must have all of it
1. 22 to 34 words, with at least TWO subordinate or participial elements.
2. It EXPLAINS something non-obvious: the expected outcome failed, a small change had outsized effects, a stated cause was not the real one, a cost landed on someone who never agreed to bear it.
3. Concrete nouns: cranes, berths, tariffs, longshoremen, railways, warehouses, contracts, tonnage. Never "stakeholders", "efficiency", "synergy", "value creation".
4. Third person. No "we", "our", "I". No advice to a reader.

## Forbidden shapes — a sentence of this kind is a failure, rewrite it
- "The success of X depends on Y." / "X is determined by Y." / "X leads to Y."
- "For a company to do X, it must do Y."
- "X plays a vital role in Y." / "X is important for Y."
Every one of these states a bare relationship. The examples above never do; they say WHY, and at whose expense.

## Batch rules
Ten sentences, ten different subjects drawn from the domains given. Use at least six different moves: unintended consequence, cost shifted onto a third party, an incentive that produced the opposite of its aim, a threshold effect, two cases that diverged, a measure that distorted what it measured, the real constraint behind an apparent one, an advantage that proved temporary, a rule that reshaped an industry, timing that mattered more than the idea. No two sentences may open with the same word.

${CHUNKING_RULES}
- All Korean is 문어체 ("~했다/~이다/~였다"), never 구어체. The register of a well-translated non-fiction book.

Chunking example, for sentence A:
korean_full: "컨테이너의 가치는 상자 그 자체에 있지 않았다. 그것은 골함석 강철 틀에 지나지 않았고, 가치는 첫 항해가 쓸모를 갖기 전에 먼저 이루어져야 했던 항만과 철도와 노동 계약의 재편에 있었다."
chunks: [
  {"en": "The container's value lay not in the box itself,", "ko": "컨테이너의 가치는 상자 그 자체에 있지 않았다,"},
  {"en": "which was merely a corrugated steel frame,", "ko": "그것은 골함석 강철 틀에 지나지 않았다,"},
  {"en": "but in the reordering of ports, railways and labour contracts", "ko": "가치는 항만과 철도와 노동 계약의 재편에 있었다"},
  {"en": "that had to precede its first useful voyage.", "ko": "첫 항해가 쓸모를 갖기 전에 먼저 이루어져야 했던."}
]
- topic: 2-4 word Korean label of the subject matter.
- kind: always "business_talk" for this profile.

${OUTPUT_SPEC}`

const RYUHA_WRITTEN_SYSTEM = `You create English WRITING-practice items for Ryuha, an 11-year-old Korean girl preparing for UK senior school entrance — the WRITTEN paper and the work she will hand in at a British school, not the interview.

## English style (write this FIRST)
1. Write ONE natural WRITTEN British English sentence (12-22 words) of the kind a strong Year 6 pupil would put on paper: a personal statement, a book response, a short descriptive or explanatory piece. Full clauses, no contractions, more careful than speech but still her own voice — never corporate.
2. British spelling and vocabulary (favourite, colour, maths, practise as verb).
3. Use the provided notes as background for subject matter (her reading, her studies, her school life, why this school). Administrative facts are her parents' business — never make her write them.
4. Vary the shape across a batch of 10: description, reason, comparison, sequence, opinion with support, reflection. No two sentences may open the same way, and at most 3 may mention exams at all.
5. Do NOT mirror Korean sentence structure. Write the English thought first.

${CHUNKING_RULES}
- All Korean is 문어체 ("~이다/~한다/~했다"), never 해요체. This is the whole point of this profile.

Example:
reference_english: "Although the story is set in a small village, it explores questions that feel much larger than the place itself."
korean_full: "그 이야기는 작은 마을을 배경으로 하지만, 그 장소 자체보다 훨씬 큰 질문들을 다룬다."
chunks: [
  {"en": "Although the story is set", "ko": "그 이야기는 배경으로 하지만"},
  {"en": "in a small village,", "ko": "작은 마을을,"},
  {"en": "it explores questions", "ko": "그것은 질문들을 다룬다"},
  {"en": "that feel much larger", "ko": "훨씬 크게 느껴지는"},
  {"en": "than the place itself.", "ko": "그 장소 자체보다."}
]
- topic: 2-4 word Korean label (예: "독서 감상", "학교 생활", "지원 동기").

${OUTPUT_SPEC}`

// 소재를 뽑아 영작 문제를 배치 생성해 문제은행에 저장.
// count(기본 10, 최대 50)만큼 10개 단위로 나눠 생성 — 회차마다 중복 방지 목록을 누적한다.
// profile: ceo(미국식 비즈니스, 위키+이메일 소재) / ryuha(영국식 ISEB 인터뷰, 류하 노트 소재)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { count?: number; profile?: string }
  const count = Math.min(MAX_COUNT, Math.max(BATCH, Number(body.count ?? BATCH)))
  const profile = asProfile(body.profile)
  // 소재 풀과 문체는 대상 목록이 정한다 — 'ceo 냐 아니냐'로 갈라 두면 대상을 하나
  // 늘릴 때마다 이 파일의 조건문을 전부 고쳐야 한다(2026-09-14).
  const target = findTarget(profile)
  const fromWiki = target.source === 'wiki'
  // 끌어올 표가 없는 대상. 주제 목록에서 돌려 가며 만든다.
  const fromTopics = target.source === 'general'
  const supabase = getServiceSupabase()

  // 소재 풀을 넓게 가져와 회차마다 랜덤 샘플 — 최신 노트에만 편중되면 소재가 금방 겹친다
  const sourceQuery = fromTopics
    ? Promise.resolve({ data: [] as { title: string; content: string | null }[], error: null })
    : !fromWiki
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
    fromWiki && !fromTopics
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
  if (!fromWiki && !fromTopics && reviewnotesSupabase) {
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
  const system = target.register === 'written'
    ? (fromWiki ? CEO_WRITTEN_SYSTEM : RYUHA_WRITTEN_SYSTEM)
    : (fromWiki ? CEO_SYSTEM : RYUHA_SYSTEM)

  interface GenChunk { en: string; ko: string }
  interface GenItem { korean_full: string; reference_english: string; chunks: GenChunk[]; topic?: string; kind?: string }

  // ceo는 소재별로 source_type을 나눠 둔다 — 업무 문장만 있는 은행이 되지 않게 비중을 나중에 볼 수 있어야 한다
  const CEO_SOURCE: Record<string, string> = { work: 'wiki', business_talk: 'business_talk', daily_life: 'daily_life' }

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

      // 주제로 만드는 대상은 회차마다 주제를 몇 개만 뽑아 넘긴다 — 전부 넘기면
      // 모델이 앞쪽 주제에만 붙어 회차가 바뀌어도 같은 이야기가 나온다.
      const domainText = [...ESSAY_DOMAINS].sort(() => Math.random() - 0.5).slice(0, 6)
        .map(d => `- ${d}`).join('\n')

      const user = fromTopics
        ? `## Domains for this batch (use each at most twice)
${domainText}

## Already used (avoid duplicates)
${existing.join('\n') || '(none)'}`
        : `## Notes (source material for topics)
${noteText || '(none)'}
${fromWiki ? `
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
      // 길이는 부탁해서 얻어지지 않는다. 방금 배치에서도 열 중 여덟이 기준 아래였다.
      // 문어 대상만 바닥을 두고 걸러 낸다 — 짧은 문장은 에세이 연습이 되지 않는다(2026-09-14).
      const floor = target.minWords ?? WRITTEN_MIN_WORDS
      const kept = target.register === 'written'
        ? items.filter(it => it.reference_english.trim().split(/\s+/).length >= floor)
        : items
      if (kept.length === 0) { lastError = 'no items met the length floor'; continue }

      const rows = kept.map(it => ({
        korean_full: it.korean_full,
        korean_chunks: it.chunks.map(c => c.ko),
        english_chunks: it.chunks.map(c => c.en),
        reference_english: it.reference_english,
        topic: it.topic ?? null,
        source_type: fromTopics ? 'business_topics' : fromWiki ? (CEO_SOURCE[String(it.kind ?? '')] ?? 'wiki') : 'ryuha_notes',
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
