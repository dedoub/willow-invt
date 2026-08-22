// 영작 연습 공용 — 보이스카드 프로젝트의 Gemini 키를 프록시로 빌려 쓴다 (CEO 지시, 2026-08-22).
// geo-ask와 같은 철학: 키는 보이스카드 엣지 시크릿에 두고, llm-json 엣지 함수로 호출만 빌린다.
// (윌로우 자체 GEMINI_API_KEY는 무료 티어(flash 20회/일)라 이 기능에 못 쓴다.)
// 채점은 속도가 1순위 — flash + thinking off는 프록시 쪽에 고정돼 있다.

export interface EnglishItem {
  id: string
  korean_full: string
  korean_chunks: string[]
  reference_english: string
  topic: string | null
  source_type: string
  created_at: string
}

export interface GradeFeedback {
  score: number
  corrected: string
  natural: string
  points: { type: 'grammar' | 'word' | 'natural' | 'good'; note: string }[]
}

export async function llmJson(system: string, user: string, maxTokens = 4000): Promise<unknown> {
  const url = process.env.VOICECARDS_SUPABASE_URL
  const key = process.env.VOICECARDS_SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('VOICECARDS_SUPABASE_URL / SERVICE_KEY not set')
  const res = await fetch(`${url}/functions/v1/llm-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ system, user, maxOutputTokens: maxTokens }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`llm-json proxy ${res.status}: ${text.slice(0, 300)}`)
  const content = (JSON.parse(text) as { text?: string }).text
  if (!content) throw new Error('llm-json proxy: empty response')
  // 모델이 코드펜스로 감싸는 경우 방어
  const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  return JSON.parse(stripped)
}
