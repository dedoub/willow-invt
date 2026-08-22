// 영작 연습 공용 — 보이스카드 프로젝트의 Gemini 키를 프록시로 빌려 쓴다 (CEO 지시, 2026-08-22).
// geo-ask와 같은 철학: 키는 보이스카드 엣지 시크릿에 두고, llm-json 엣지 함수로 호출만 빌린다.
// (윌로우 자체 GEMINI_API_KEY는 무료 티어(flash 20회/일)라 이 기능에 못 쓴다.)
// 채점은 속도가 1순위 — flash + thinking off는 프록시 쪽에 고정돼 있다.

// 연습 프로필 — ceo: 미국식 비즈니스 영작(업무위키/이메일 소재),
// ryuha: 영국식 구어체 ISEB 인터뷰 대비, ryuha_written: 영국식 문어체 리딩/라이팅 시험 대비 (둘 다 류하 노트+ISEB 문항 소재)
export type EnglishProfile = 'ceo' | 'ryuha' | 'ryuha_written'

export function asProfile(v: unknown): EnglishProfile {
  return v === 'ryuha' ? 'ryuha' : v === 'ryuha_written' ? 'ryuha_written' : 'ceo'
}

// 보이스카드 내보내기 대상 덱 — 프로필별로 다른 스프레드시트
const RYUHA_DECK = { spreadsheetId: '1ThEDOoNDdS7HcUhAR36JACM6A1VpBgt7xG34Fy7xTzs', tabTitle: 'Voice Cards' }
export const DECKS: Record<EnglishProfile, { spreadsheetId: string; gid?: number; tabTitle?: string }> = {
  // CEO 영어 덱 (add-chunked-translation-to-voicecards 스킬의 기본 대상)
  ceo: { spreadsheetId: '1igjdCEgPeKDzcuYiDvHyct3bmE4KplsmJROwhvisrcs', gid: 1079541785 },
  // 류하 전용 덱 (scripts/lib/ryuha-chunked-translation.ts와 동일) — 구어/문어 모두 같은 덱
  ryuha: RYUHA_DECK,
  ryuha_written: RYUHA_DECK,
}

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
