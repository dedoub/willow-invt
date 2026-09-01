// ReviewNotes 공용 타입·상수 — 서버/클라이언트 양쪽에서 쓴다.
//
// reviewnotes-supabase.ts 는 시크릿 키로 DB 에 붙는 서버 전용 모듈이라 `server-only` 로 잠갔다.
// 클라이언트 컴포넌트(reviewnotes/page.tsx, _components/reviewnotes-block.tsx)가 필요로 하는
// 것은 타입과 순수 상수뿐이므로 여기로 갈라 두고, 클라이언트는 이 파일만 import 한다.
// (ETF 대시보드에서 etf-types.ts 로 같은 분리를 이미 한 적 있다.)

export type SubscriptionPlan = 'FREE' | 'BASIC' | 'STANDARD' | 'PRO'
export type UserRole = 'USER' | 'ADMIN'

// 플랜별 월 한도는 2026-08-24에 없어졌다. 리뷰노트는 구독을 접고 크레딧 잔액으로 갔다 —
// 가입 시 100을 받고(User.aiCreditBalance 기본값) 떨어지면 팩을 산다. 앱 lib/ai/ai-quota.ts는
// 이제 기능별 요율만 갖는다. subscriptionPlan 컬럼은 남아 있지만 아무것도 주지 않는다.

// AI 기능 키 (AiUsage.feature) → 표시 이름. 앱 lib/ai/credits.ts의 AiFeature와 같은 집합.
export const RN_AI_FEATURE_LABELS: Record<string, string> = {
  similarProblem: '유사문제',
  setSelection: '세트 선별',
  textTagSuggestion: '태그 추천',
  imageTagSuggestion: '이미지 태그',
  solutionGeneration: '해설 생성',
  tagReview: '태그 정리',
  documentExtraction: '문서 추출',
}

export interface RnAiFeatureUse { calls: number; credits: number }

// 통계 제외 계정 (2026-07-16 CEO): role=ADMIN + 스토어 심사용 PG Reviewer(role은 USER지만 관리자 계정).
// PG Reviewer는 role을 ADMIN으로 바꾸면 심사자에게 관리자 UI가 노출될 수 있어 이메일로 제외.
// SQL 쪽 동일 규칙: supabase/reviewnotes/*.sql 의 admins CTE — 두 곳이 항상 일치해야 함.
export function isExcludedReviewNotesUser(u: { role?: string | null; email?: string | null }): boolean {
  return u.role === 'ADMIN' || u.email === 'test@reviewnotes.app'
}

// 결제(LemonSqueezy) 쪽 제외 목록. 주문에는 role이 없고 이메일만 있어 위 규칙을 이메일로 편다.
// 운영 계정이 테스트 결제를 하면 매출·구매자에 섞이므로 여기서 걷어낸다.
// 계정이 늘면 위 규칙(DB role)과 여기를 같이 고칠 것.
export const RN_EXCLUDED_EMAILS: string[] = [
  'dwkim.august@gmail.com',
  'monorapps@gmail.com',
  'test@reviewnotes.app',
]

export interface ReviewNotesUser {
  id: string
  name: string | null
  email: string
  image: string | null
  subscriptionPlan: SubscriptionPlan
  role: UserRole
  storageUsed: number
  createdAt: string
  // 유저별 국가 (rn_user_country RPC) — EventLog↔PageView first-touch IP 국가. 방문 이력 없으면 null.
  country?: string | null
  lastActiveAt?: string | null // EventLog 마지막 활동 (rn_user_last_active RPC, 2026-06-24 트래킹 시작 이후)
  // 콘텐츠/학습 누적 + 오늘 증가분 (rn_user_content RPC) — 문제는 Note 경유 귀속
  notes?: number
  notesToday?: number
  problems?: number
  problemsToday?: number
  problemSets?: number
  problemSetsToday?: number
  solves?: number
  solvesToday?: number
  // AI 크레딧 잔액 (User.aiCreditBalance) — 가입 지급 100에서 쓴 만큼 줄고 팩을 사면 는다.
  // aiGenUsed/aiGenPeriod는 월 한도 시절의 컬럼이라 앱이 더 이상 쓰지 않는다(값이 고여 있다).
  creditBalance?: number
  // AI 기능 사용 내역 (AiUsage 원장, 2026-08-11 도입 — 그 이전 호출은 없음)
  aiCallsMonth?: number
  aiCallsTotal?: number
  aiCreditsTotal?: number
  aiFeaturesMonth?: Record<string, RnAiFeatureUse>
  aiFeaturesTotal?: Record<string, RnAiFeatureUse>
  // Not fetched by getReviewNotesUsers (column-scoped) and unused by any consumer.
  emailVerified?: string | null
  lemonSqueezyCustomerId?: string | null
  updatedAt?: string
}

export interface ReviewNotesUserStats {
  totalUsers: number
  adminUsers: number
  freeUsers: number
  basicUsers: number
  standardUsers: number
  proUsers: number
  newUsersThisMonth: number
  newUsersThisWeek: number
  totalStorageUsed: number
  users: ReviewNotesUser[]
}

// 랜딩페이지 방문 통계 (PageView 테이블 — 봇 제외된 실제 방문만 기록됨)
export interface ReviewNotesTrafficStats {
  range: number
  totals: { views: number; visitors: number }
  change: { views: number; visitors: number }
  // 앱 내 로그인 활동 사용자 (EventLog 윈도우 내 distinct userId) — 퍼널 카드용
  activeUsers: number
  prevActiveUsers: number
  daily: Array<{ date: string; views: number; visitors: number }>
  // 일별 회원 로그인 — 하루에 유저당 1회만 카운트 (연인원 집계용)
  dailyLogins: Array<{ date: string; users: number }>
  // 일별 활동 사용자 — 회원(기존 가입자)/신규(그날 가입) 분리 (일별 활동자 차트용)
  /** anon은 비로그인 세션 수 — 로그인 활동자(active)와 세는 단위가 달라 합산하지 않는다.
   *  active30 = 그날을 포함한 직전 30일 순 활동 회원(MAU). active를 30일 더한 값이 아니라
   *  창 안에서 distinct로 다시 센 값이다 — 여러 날 온 사람이 겹쳐 잡히면 MAU가 부풀려진다. */
  dailyActive: Array<{ date: string; active: number; newUsers: number; member: number; anon: number; active30: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  // 기기 분포 (mobile/tablet/desktop, 방문자 기준) — 2026-07-15부터 수집, 이전 방문은 unknown
  devices: Array<{ device: string; count: number }>
  // 활성화 — 문제를 하나라도 등록한 유저의 첫 등록 시각 (rn_activation RPC)
  activation: Array<{ userId: string; firstProblemAt: string }>
  // 유료 전환 시점 — Subscription 최초 생성일, 수동 부여는 가입일 폴백 (rn_paid_users RPC)
  paidTimeline: Array<{ userId: string; paidAt: string }>
  // MRR 일별 스냅샷 (rn_mrr_snapshots — 대시보드 로드 시 기록 축적)
  mrrHistory: Array<{ date: string; mrr: number; activeSubs: number }>
  // 회원/유료 유입경로·국가 — EventLog↔PageView 방문자 ID 조인, 유저별 first-touch 귀속
  memberReferrers: Array<{ referrer: string; count: number }>
  memberCountries: Array<{ country: string; count: number }>
  paidReferrers: Array<{ referrer: string; count: number }>
  paidCountries: Array<{ country: string; count: number }>
}

// 콘텐츠/학습 카운트 (rn_content_stats RPC) — 노트/문제/문제 세트/풀이/학습 노트,
// 총계 + 오늘/7일 + 일별(daily, 누적 스파크라인용)
export interface ContentMetric {
  total: number
  today: number
  d7: number
  daily: Array<{ date: string; n: number }>
}

export interface ReviewNotesContentStats {
  notes: ContentMetric
  problems: ContentMetric
  problemSets: ContentMetric
  studyResults: ContentMetric & { correct: number }
  studyNotes: ContentMetric
}
