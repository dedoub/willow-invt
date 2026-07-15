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
    memberReferrers: [],
    memberCountries: [],
    paidReferrers: [],
    paidCountries: [],
  }

  if (!reviewnotesSupabase) return empty

  // PageView는 RLS로 raw select가 막혀 있어(anon 정책 없음, 2026-06-21 하드닝)
  // 집계 전용 SECURITY DEFINER RPC로 조회한다. 정본: supabase/reviewnotes/rn_traffic_stats.sql
  const { data, error } = await reviewnotesSupabase.rpc('rn_traffic_stats', { range_days: CUMULATIVE_RANGE_DAYS })
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
    memberReferrers: stats.memberReferrers ?? [],
    memberCountries: stats.memberCountries ?? [],
    paidReferrers: stats.paidReferrers ?? [],
    paidCountries: stats.paidCountries ?? [],
  }
}

// 유저 목록 조회
export async function getReviewNotesUsers(): Promise<ReviewNotesUser[]> {
  if (!reviewnotesSupabase) {
    throw new Error('ReviewNotes Supabase not configured')
  }

  const [{ data, error }, lastActiveRes] = await Promise.all([
    reviewnotesSupabase
      .from('User')
      // Only the columns consumed by getReviewNotesUserStats passes + the monor reviewnotes block.
      // (emailVerified / updatedAt / lemonSqueezyCustomerId are unused.)
      .select('id, name, email, image, subscriptionPlan, role, storageUsed, createdAt')
      .order('createdAt', { ascending: false }),
    // 마지막 활동 — EventLog는 RLS로 raw 접근 불가, 집계 RPC 사용 (실패해도 목록은 유지)
    reviewnotesSupabase.rpc('rn_user_last_active'),
  ])

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  const lastActiveMap = new Map<string, string>(
    ((lastActiveRes.data ?? []) as Array<{ user_id: string; last_active: string }>)
      .map(r => [r.user_id, r.last_active])
  )
  return (data || []).map(u => ({ ...u, lastActiveAt: lastActiveMap.get(u.id) ?? null }))
}

// 유저 통계 계산
export async function getReviewNotesUserStats(): Promise<ReviewNotesUserStats> {
  const users = await getReviewNotesUsers()

  // KST 기준 이번 달 1일 / 최근 7일(오늘 포함)
  const monthStartKst = kstMonthStart()
  const weekStartKst = kstDaysAgo(6)

  const stats: ReviewNotesUserStats = {
    totalUsers: users.length,
    adminUsers: users.filter(u => u.role === 'ADMIN').length,
    freeUsers: users.filter(u => u.subscriptionPlan === 'FREE').length,
    basicUsers: users.filter(u => u.subscriptionPlan === 'BASIC').length,
    standardUsers: users.filter(u => u.subscriptionPlan === 'STANDARD').length,
    proUsers: users.filter(u => u.subscriptionPlan === 'PRO').length,
    newUsersThisMonth: users.filter(u => kstDateKey(u.createdAt) >= monthStartKst).length,
    newUsersThisWeek: users.filter(u => kstDateKey(u.createdAt) >= weekStartKst).length,
    totalStorageUsed: users.reduce((sum, u) => sum + (u.storageUsed || 0), 0),
    users,
  }

  return stats
}
