// Scripta 공용 타입·상수 — 서버/클라이언트 양쪽에서 쓴다.
//
// scripta-supabase.ts 는 시크릿 키로 DB 에 붙는 서버 전용 모듈이라 `server-only` 로 잠갔다.
// 클라이언트 컴포넌트(scripta/page.tsx, _components/scripta-block.tsx)가 필요로 하는 것은
// 타입과 순수 상수뿐이라 여기로 갈라 두고, 클라이언트는 이 파일만 import 한다.
// (리뷰노트에서 reviewnotes-types.ts 로 같은 분리를 이미 한 적 있다.)

/** 총계 + 오늘/7일 + 일별 — supabase/scripta/sc_dashboard.sql 의 sc__metric() 반환 모양 */
export interface ScMetric {
  total: number
  today: number
  d7: number
  daily: Array<{ date: string; n: number }>
}

/** 연습 단위 — unit_id가 없는 시도는 글 전체 재구성(text) */
export type ScLevel = 'sentence' | 'paragraph' | 'text'

export const SC_LEVEL_LABELS: Record<string, string> = {
  sentence: '문장',
  paragraph: '문단',
  text: '전체 글',
}

// 크레딧 차감 사유 (scripta_credit_ledger.reason) → 표시 이름.
// Scripta 앱 lib/credits 의 사유 키와 같은 집합이라 앱에서 바꾸면 여기도 같이 바꾼다.
export const SC_CREDIT_REASON_LABELS: Record<string, string> = {
  structure_generation: '구조 생성',
  sentence_grading: '문장 채점',
  semantic_grading: '의미 채점',
  paragraph_grading: '문단 채점',
  text_grading: '전체 글 채점',
  handwriting_read: '필기 인식',
}

// Cortex 목표 언어 코드 → 표시 이름
export const SC_LANGUAGE_LABELS: Record<string, string> = {
  en: '영어', ko: '한국어', ja: '일본어', zh: '중국어', de: '독일어',
  fr: '프랑스어', es: '스페인어', it: '이탈리아어', pt: '포르투갈어', ru: '러시아어',
}

// 통계 제외 계정 — 실사용자 유입 전이라 지금은 비워 둔다(CEO 계정도 통계에 포함).
// 외부 가입이 붙기 시작하면 여기에 운영 계정 이메일을 넣어 리뷰노트와 같은 규칙으로 뺀다.
export const SC_EXCLUDED_EMAILS: string[] = []

export function isExcludedScriptaUser(u: { email?: string | null }): boolean {
  return !!u.email && SC_EXCLUDED_EMAILS.includes(u.email)
}

export interface ScriptaUser {
  userId: string
  email: string
  name: string | null
  avatarUrl: string | null
  createdAt: string
  lastSignInAt: string | null
  /** 로그인·글 등록·연습·크레딧 사용 중 가장 최근 */
  lastActivity: string | null
  cortices: number
  texts: number
  sentences: number
  attempts: number
  attemptsToday: number
  passed: number
  avgScore: number
  /** 현재 크레딧 잔액 (scripta_credit_accounts) */
  balance: number
  /** 누적 크레딧 차감 (환불 전 총 사용) */
  spent: number
  /** AI 채점 요청 수 (scripta_ai_grade_requests) */
  aiCalls: number
}

export interface ScriptaStats {
  users: ScMetric
  content: {
    cortices: ScMetric
    texts: ScMetric
    paragraphs: ScMetric
    sentences: ScMetric
    chunks: ScMetric
  }
  attempts: ScMetric
  aiGrades: ScMetric
  practice: { passed: number; avgScore: number }
  byLevel: Array<{ level: ScLevel; attempts: number; passed: number; avgScore: number }>
  credits: {
    balance: number
    spent: number
    refunded: number
    granted: number
    /** 결제로 유입된 크레딧 — 결제 연동 전이라 지금은 0 */
    purchased: number
    byReason: Array<{ reason: string; calls: number; credits: number }>
    dailySpent: Array<{ date: string; n: number }>
  }
  payments: { events: number; processed: number }
  languages: Array<{ language: string; n: number }>
  /** 활성화 = 글을 하나라도 등록한 유저의 첫 등록 시각 */
  activation: Array<{ userId: string; at: string }>
  /** 연습 시작 = 첫 연습 시도 시각 */
  practiceStart: Array<{ userId: string; at: string }>
  /** 일별 활동자 — 활동 = 글 등록·연습·크레딧 사용 (비로그인 트래킹 없음) */
  dailyActive: Array<{ date: string; active: number; newUsers: number; member: number }>
}

export interface ScriptaPayload {
  stats: ScriptaStats
  users: ScriptaUser[]
  fetchedAt: string
}
