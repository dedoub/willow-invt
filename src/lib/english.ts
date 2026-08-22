// 영작 연습 공용 — OpenRouter 호출 + 타입.
// /api/chat과 같은 OpenRouter 경로를 쓰되, 여기는 툴 없이 단발 JSON 응답만 필요해 얇게 유지한다.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
// 채점은 속도가 1순위 — flash 계열 고정 (chat 라우트와 동일 모델, 폴백 안정성 검증됨)
const MODEL = 'google/gemini-2.5-flash'

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
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set')
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://willow.vercel.app',
      'X-Title': 'Willow English Practice',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter: empty response')
  // 모델이 코드펜스로 감싸는 경우 방어
  const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  return JSON.parse(stripped)
}
