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

// 앱 퍼널에서 이 사람이 도달한 가장 먼 단계. 앱 이벤트가 있어야 알 수 있다.
// ledger = 원장에 첫 기록 (구글 시트든 기기 원장이든). 기기 원장은 로그인·연동 없이도
// 열리므로, 단계 순서는 "얼마나 멀리 갔나"의 편의상 순서지 반드시 거치는 계단은 아니다.
export type PortleUserStage = 'install' | 'signin' | 'drive' | 'ledger'

export const PORTLE_STAGE_LABELS: Record<PortleUserStage, string> = {
  install: '설치',
  signin: '로그인',
  drive: '연동',
  ledger: '원장',
}

export interface PortleUserRow {
  subject: string
  // 로그인 사용자(google)와 비로그인 기기(device) — VoiceCards처럼 둘 다 정상 사용자로 본다.
  type: 'google' | 'device' | 'other'
  // 구글 계정 id(sub). 로그인이 확인된 사람만 채워진다 — 이 값이 있으면 '가입자'로 보여준다.
  accountId: string | null
  // 가입자 이메일 (portle_users). 서버가 검증된 구글 토큰에서 읽어 넣는다. 이름은 없다 —
  // 포틀 개인정보처리방침이 밝힌 범위가 id 와 이메일까지다. 그 사람이 앱을 다시 열어
  // 토큰 요청을 보내기 전까지는 null 이므로, 없으면 계정 id 로 부른다.
  email: string | null
  // 이 사람에게 귀속된 기기. 앱 이벤트가 없는 사람(AI 로그만 있는 사람)은 빈 배열.
  deviceIds: string[]
  platform: 'ios' | 'android' | 'other' | null
  appVersion: string | null
  // 국가코드 — 기기 설정 지역(앱) 우선, 없으면 접속 IP 나라(백엔드). 앱 이벤트가 없거나 옛 앱이면 null.
  country: string | null
  // 기기 로케일 (앱이 보낸다, 1.0.3부터). 없으면 null.
  locale: string | null
  stage: PortleUserStage | null
  // 앱을 처음 연 날(app_opened). 앱 이벤트가 없으면 null.
  installedAt: string | null
  // 구글 로그인을 마친 시각(signin_completed). 로그인 전이면 null.
  signedInAt: string | null
  // 드라이브 연동을 마친 시각(drive_linked). 안 했으면 null.
  driveLinkedAt: string | null
  // 원장에 처음 기록한 시각 — 구글 시트든 기기 원장이든 이른 쪽. 안 했으면 null.
  ledgerActivatedAt: string | null
  // 첫 활동 — 앱 이벤트와 AI 호출을 통틀어 가장 이른 시각.
  firstAt: string
  lastAt: string
  activeDays: number
  // 최근 7일(오늘 포함) 중 활동한 날 수 — 지금 살아 있는 사람인지 보는 창.
  activeDays7d: number
  // 두 번째 AI 사용일의 첫 호출 시각 — AI 재사용 전환 시점. 활동일(activeDays)은 앱
  // 이벤트까지 세지만 이 값은 AI 호출만 본다.
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
  // 원장 활성화 — 기기가 어느 원장에든 처음 기록한 날. sheet_activated(구글 시트)와
  // local_ledger_activated(기기 원장) 중 이른 쪽. 두 갈래 각각도 함께 준다 (합은 겹칠 수 있다 —
  // 한 기기가 기기 원장으로 시작해 나중에 시트로 옮기면 양쪽에 다 선다).
  ledgerActivations: string[]
  sheetActivations: string[]  // sheet_activated
  localActivations: string[]  // local_ledger_activated
}

// 일별 활동자 — 보이스카드 '일별 활동자' 차트와 같은 네 칸. 활동 = 그날 앱 이벤트(실행·퍼널)
// 또는 AI 호출이 하나라도 있었던 사람. 사람 단위는 사용자 표와 같다(로그인 기기는 계정에 합친다).
// 로그인 = google 계정 사람, 기기 = 로그인 없는 기기. 신규 = 그날이 그 사람의 첫 활동일.
export interface PortleDailyActive {
  date: string
  total: number
  loggedMember: number   // 로그인 · 기존
  loggedNew: number      // 로그인 · 신규
  deviceMember: number   // 기기 · 기존
  deviceNew: number      // 기기 · 신규
}

export interface PortleStats {
  // 스토어 등록정보 방문 (portle_store_visits, 일별 플랫폼 합산) — 퍼널 최상단. 수집 전엔 빈 배열.
  storeVisits: Array<{ date: string; visitors: number }>
  funnel: PortleAppFunnel
  totals: {
    // AI를 한 번이라도 호출한 사람 수. users 행 수와 다르다 — users 에는 설치만 한
    // 기기도 들어 있다(아래 deviceOnly 가 그 수).
    subjects: number
    // 설치만 하고 AI 는 안 쓴 사람 수 (users.length - subjects)
    deviceOnly: number
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
  dailyActive: PortleDailyActive[]
  byKind: PortleKindStats[]
  users: PortleUserRow[]
  fetchedAt: string
}
