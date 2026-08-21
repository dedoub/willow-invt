// Portle(포트원장 앱) 통계 타입 — 클라이언트 컴포넌트가 import 하므로 서버 의존성 없이 유지.
// 서버 집계는 portle-supabase.ts.

export type PortleAiOutcome = 'success' | 'empty' | 'failure'

// AI 호출 종류 라벨. 새 kind가 서버에 생겨도 화면이 깨지지 않게 키를 열어 둔다.
export const PORTLE_KIND_LABELS: Record<string, string> = {
  echo_news: '에코 뉴스',
  ingest_transactions: '거래 입력',
  translate_rule: '규칙 번역',
}

export interface PortleDailyUsage {
  date: string          // YYYY-MM-DD (KST)
  success: number
  empty: number
  failure: number
  subjects: number      // 그날 AI를 호출한 사용자 수 (distinct subject)
}

export interface PortleKindStats {
  kind: string
  calls: number
  success: number
  empty: number
  failure: number
  subjects: number
  inputTokens: number
  outputTokens: number
  callsToday: number
  calls7d: number
  lastAt: string | null
}

export interface PortleEntitlement {
  subject: string
  store: string
  productId: string
  expiresAt: string
  active: boolean
  updatedAt: string
}

export interface PortleUserRow {
  subject: string
  // 로그인 사용자(google)와 비로그인 기기(device) — VoiceCards처럼 둘 다 정상 사용자로 본다.
  type: 'google' | 'device' | 'other'
  firstAt: string
  lastAt: string
  activeDays: number
  calls: number
  success: number
  empty: number
  failure: number
  byKind: Record<string, number>
  inputTokens: number
  outputTokens: number
  sharedSheets: number
  entitlement: PortleEntitlement | null
}

export interface PortleStats {
  totals: {
    subjects: number
    subjectsToday: number
    subjects7d: number
    calls: number
    callsToday: number
    calls7d: number
    successRate: number     // 전 기간 성공 ÷ 전체 호출 %
    successRate7d: number   // 최근 7일 %
    inputTokens: number
    outputTokens: number
    activeEntitlements: number
    sharedSheets: number
  }
  daily: PortleDailyUsage[]
  byKind: PortleKindStats[]
  users: PortleUserRow[]
  fetchedAt: string
}
