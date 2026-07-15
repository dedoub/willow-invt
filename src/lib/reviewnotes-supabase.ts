import { createClient } from '@supabase/supabase-js'
import { kstDateKey, kstMonthStart, kstDaysAgo } from '@/lib/kst'

// ReviewNotes Supabase 클라이언트
const supabaseUrl = process.env.REVIEWNOTES_SUPABASE_URL
const supabaseKey = process.env.REVIEWNOTES_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('ReviewNotes Supabase credentials not configured')
}

export const reviewnotesSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

// 타입 정의
export type SubscriptionPlan = 'FREE' | 'BASIC' | 'STANDARD' | 'PRO'
export type UserRole = 'USER' | 'ADMIN'

export interface ReviewNotesUser {
  id: string
  name: string | null
  email: string
  image: string | null
  subscriptionPlan: SubscriptionPlan
  role: UserRole
  storageUsed: number
  createdAt: string
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

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function toDateKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) // KST 날짜
}

// 집계 시작(PageView 트래킹 2026-06-24) 이후 전체 누적 — 윈도우 없음 (2026-07-15 CEO).
// range_days는 전 기간을 덮는 큰 값으로 넘긴다.
const CUMULATIVE_RANGE_DAYS = 3650

export async function getReviewNotesTrafficStats(): Promise<ReviewNotesTrafficStats> {
  const empty: ReviewNotesTrafficStats = {
    range: 0,
    totals: { views: 0, visitors: 0 },
    change: { views: 0, visitors: 0 },
    activeUsers: 0,
    prevActiveUsers: 0,
    daily: [],
    dailyLogins: [],
    topReferrers: [],
    topCountries: [],
    devices: [],
    activation: [],
    paidTimeline: [],
    mrrHistory: [],
    memberReferrers: [],
    memberCountries: [],
    paidReferrers: [],
    paidCountries: [],
  }

  if (!reviewnotesSupabase) return empty

  // PageView는 RLS로 raw select가 막혀 있어(anon 정책 없음, 2026-06-21 하드닝)
  // 집계 전용 SECURITY DEFINER RPC로 조회한다. 정본: supabase/reviewnotes/rn_traffic_stats.sql
  const [{ data, error }, activationRes, paidRes, mrrHistRes] = await Promise.all([
    reviewnotesSupabase.rpc('rn_traffic_stats', { range_days: CUMULATIVE_RANGE_DAYS }),
    // 활성화(첫 문제 등록) / 유료 전환 시점 / MRR 스냅샷 — 실패해도 트래픽 통계는 유지 (best-effort)
    reviewnotesSupabase.rpc('rn_activation'),
    reviewnotesSupabase.rpc('rn_paid_users'),
    reviewnotesSupabase.rpc('rn_mrr_history'),
  ])
  if (error || !data) {
    console.error('Error fetching rn_traffic_stats:', error)
    return empty
  }

  const stats = data as {
    totals: { views: number; visitors: number }
    prev: { views: number; visitors: number }
    activeUsers?: number
    prevActiveUsers?: number
    daily: Array<{ date: string; views: number; visitors: number }>
    dailyLogins?: Array<{ date: string; users: number }>
    topReferrers: Array<{ referrer: string; count: number }>
    topCountries: Array<{ country: string; count: number }>
    devices?: Array<{ device: string; count: number }>
    memberReferrers?: Array<{ referrer: string; count: number }>
    memberCountries?: Array<{ country: string; count: number }>
    paidReferrers?: Array<{ referrer: string; count: number }>
    paidCountries?: Array<{ country: string; count: number }>
  }

  // 일별 추이 — 첫 데이터 날짜(집계 시작)부터 오늘까지, 활동 없는 날짜 0으로 채우기 (KST)
  const dailyMap = new Map(stats.daily.map(d => [d.date, d]))
  const now = new Date()
  const todayKey = toDateKey(now)
  const firstKey = stats.daily.length ? stats.daily[0].date : todayKey
  const daily: ReviewNotesTrafficStats['daily'] = []
  for (let d = new Date(`${firstKey}T00:00:00+09:00`); ; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d)
    if (key > todayKey) break
    const entry = dailyMap.get(key)
    daily.push({ date: key, views: entry?.views ?? 0, visitors: entry?.visitors ?? 0 })
  }

  return {
    range: daily.length,
    totals: { views: stats.totals.views, visitors: stats.totals.visitors },
    change: {
      views: pctChange(stats.totals.views, stats.prev.views),
      visitors: pctChange(stats.totals.visitors, stats.prev.visitors),
    },
    activeUsers: stats.activeUsers ?? 0,
    prevActiveUsers: stats.prevActiveUsers ?? 0,
    daily,
    dailyLogins: stats.dailyLogins ?? [],
    topReferrers: stats.topReferrers ?? [],
    topCountries: stats.topCountries ?? [],
    devices: stats.devices ?? [],
    activation: ((activationRes.data ?? []) as Array<{ user_id: string; first_problem_at: string }>)
      .map(r => ({ userId: r.user_id, firstProblemAt: r.first_problem_at })),
    paidTimeline: ((paidRes.data ?? []) as Array<{ user_id: string; paid_at: string }>)
      .map(r => ({ userId: r.user_id, paidAt: r.paid_at })),
    mrrHistory: ((mrrHistRes.data ?? []) as Array<{ date: string; mrr: number; active_subs: number }>)
      .map(r => ({ date: r.date, mrr: Number(r.mrr) || 0, activeSubs: Number(r.active_subs) || 0 })),
    memberReferrers: stats.memberReferrers ?? [],
    memberCountries: stats.memberCountries ?? [],
    paidReferrers: stats.paidReferrers ?? [],
    paidCountries: stats.paidCountries ?? [],
  }
}

// 콘텐츠/학습 카운트 (rn_content_stats RPC) — 노트/문제/문제 세트/풀이/학습 노트,
// 총계 + 오늘/7일 + 일별(daily, 누적 스파크라인용)
interface ContentMetric {
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

export async function getReviewNotesContentStats(): Promise<ReviewNotesContentStats | null> {
  if (!reviewnotesSupabase) return null
  const { data, error } = await reviewnotesSupabase.rpc('rn_content_stats')
  if (error || !data) {
    console.error('Error fetching rn_content_stats:', error)
    return null
  }
  return data as ReviewNotesContentStats
}

// MRR 스냅샷 기록 — LemonSqueezy에서 계산한 오늘 MRR을 리뷰노트 DB에 남겨 히스토리 축적.
// 리뷰노트 쪽에 크론이 없어 대시보드 로드가 기록 트리거 (하루 1행 upsert, 실패 무시).
export async function recordReviewNotesMrr(mrr: number, activeSubs: number): Promise<void> {
  if (!reviewnotesSupabase) return
  const { error } = await reviewnotesSupabase.rpc('rn_record_mrr', { p_mrr: Math.round(mrr), p_subs: activeSubs })
  if (error) console.error('rn_record_mrr failed (non-fatal):', error)
}

// 유저 목록 조회
export async function getReviewNotesUsers(): Promise<ReviewNotesUser[]> {
  if (!reviewnotesSupabase) {
    throw new Error('ReviewNotes Supabase not configured')
  }

  const [{ data, error }, lastActiveRes, contentRes] = await Promise.all([
    reviewnotesSupabase
      .from('User')
      // Only the columns consumed by getReviewNotesUserStats passes + the monor reviewnotes block.
      // (emailVerified / updatedAt / lemonSqueezyCustomerId are unused.)
      .select('id, name, email, image, subscriptionPlan, role, storageUsed, createdAt')
      .order('createdAt', { ascending: false }),
    // 마지막 활동 / 유저별 콘텐츠 — RLS로 raw 접근 불가, 집계 RPC 사용 (실패해도 목록은 유지)
    reviewnotesSupabase.rpc('rn_user_last_active'),
    reviewnotesSupabase.rpc('rn_user_content'),
  ])

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  const lastActiveMap = new Map<string, string>(
    ((lastActiveRes.data ?? []) as Array<{ user_id: string; last_active: string }>)
      .map(r => [r.user_id, r.last_active])
  )
  type ContentRow = {
    user_id: string
    notes: number; notes_today: number
    problems: number; problems_today: number
    problem_sets: number; problem_sets_today: number
    solves: number; solves_today: number
  }
  const contentMap = new Map<string, ContentRow>(
    ((contentRes.data ?? []) as ContentRow[]).map(r => [r.user_id, r])
  )
  return (data || []).map(u => {
    const c = contentMap.get(u.id)
    return {
      ...u,
      lastActiveAt: lastActiveMap.get(u.id) ?? null,
      notes: Number(c?.notes) || 0,
      notesToday: Number(c?.notes_today) || 0,
      problems: Number(c?.problems) || 0,
      problemsToday: Number(c?.problems_today) || 0,
      problemSets: Number(c?.problem_sets) || 0,
      problemSetsToday: Number(c?.problem_sets_today) || 0,
      solves: Number(c?.solves) || 0,
      solvesToday: Number(c?.solves_today) || 0,
    }
  })
}

// 통계 제외 계정 (2026-07-16 CEO): role=ADMIN + 스토어 심사용 PG Reviewer(role은 USER지만 관리자 계정).
// PG Reviewer는 role을 ADMIN으로 바꾸면 심사자에게 관리자 UI가 노출될 수 있어 이메일로 제외.
// SQL 쪽 동일 규칙: supabase/reviewnotes/*.sql 의 admins CTE — 두 곳이 항상 일치해야 함.
export function isExcludedReviewNotesUser(u: { role?: string | null; email?: string | null }): boolean {
  return u.role === 'ADMIN' || u.email === 'test@reviewnotes.app'
}

// 유저 통계 계산 — 집계 수치는 관리자 제외.
// users 배열은 전체 유지 (사용자 테이블에는 관리자도 표시, 통계 소비처에서 필터).
export async function getReviewNotesUserStats(): Promise<ReviewNotesUserStats> {
  const users = await getReviewNotesUsers()
  const real = users.filter(u => !isExcludedReviewNotesUser(u))

  // KST 기준 이번 달 1일 / 최근 7일(오늘 포함)
  const monthStartKst = kstMonthStart()
  const weekStartKst = kstDaysAgo(6)

  const stats: ReviewNotesUserStats = {
    totalUsers: real.length,
    adminUsers: users.filter(u => u.role === 'ADMIN').length,
    freeUsers: real.filter(u => u.subscriptionPlan === 'FREE').length,
    basicUsers: real.filter(u => u.subscriptionPlan === 'BASIC').length,
    standardUsers: real.filter(u => u.subscriptionPlan === 'STANDARD').length,
    proUsers: real.filter(u => u.subscriptionPlan === 'PRO').length,
    newUsersThisMonth: real.filter(u => kstDateKey(u.createdAt) >= monthStartKst).length,
    newUsersThisWeek: real.filter(u => kstDateKey(u.createdAt) >= weekStartKst).length,
    totalStorageUsed: real.reduce((sum, u) => sum + (u.storageUsed || 0), 0),
    users,
  }

  return stats
}
