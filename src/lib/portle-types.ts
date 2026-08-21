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
  // 두 번째 활동일의 첫 기록 시각 — 퍼널 '재사용' 단계의 전환 시점. 활동일 1일이면 null.
  repeatAt: string | null
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

// 앱 퍼널 단계별 전환 시점 — 각 배열은 해당 단계에 처음 도달한 기기/사용자의 KST 날짜키(정렬됨).
// 값은 portle_app_events(앱 텔레메트리)에서 오고, 수집 전 단계는 빈 배열 → 카드는 '수집 대기'.
// signins만 예외: 이벤트가 없으면 AI 사용 로그의 google: subject 첫 사용일로 폴백.
export interface PortleAppFunnel {
  installs: string[]          // app_opened 기기 첫 발생일
  signins: string[]           // signin_completed (폴백: google subject 첫 AI 사용일)
  driveLinks: string[]        // drive_linked
  sheetActivations: string[]  // sheet_activated
}

export interface PortleStats {
  // 스토어 등록정보 방문 (portle_store_visits, 일별 플랫폼 합산) — 퍼널 최상단. 수집 전엔 빈 배열.
  storeVisits: Array<{ date: string; visitors: number }>
  funnel: PortleAppFunnel
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
