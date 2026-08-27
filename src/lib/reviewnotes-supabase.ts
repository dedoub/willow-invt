// 시크릿 키로 DB에 붙는 서버 전용 모듈. 클라이언트 컴포넌트가 import 하면 빌드가 깨지도록 잠근다.
// 클라이언트가 쓰던 타입·상수는 reviewnotes-types.ts 로 갈라 뒀다.
import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { kstDateKey, kstMonthStart, kstDaysAgo } from '@/lib/kst'
import { isExcludedReviewNotesUser } from '@/lib/reviewnotes-types'
import type {
  ReviewNotesUser, ReviewNotesUserStats, ReviewNotesTrafficStats,
  ReviewNotesContentStats, RnAiFeatureUse,
} from '@/lib/reviewnotes-types'

// 기존 소비처(서버 라우트)가 한 곳에서 계속 가져올 수 있게 재수출
export * from '@/lib/reviewnotes-types'

// ReviewNotes Supabase 클라이언트
// 서버 전용 — 시크릿 키 우선. 퍼블리셔블 키는 anon 역할이라 User 전체 열람이 RLS 정책에
// 의존하는데, 그 정책을 잠그려면 여기가 먼저 시크릿 키로 붙어야 한다(voicecards 와 같은 패턴).
const supabaseUrl = process.env.REVIEWNOTES_SUPABASE_URL
const supabaseKey = process.env.REVIEWNOTES_SUPABASE_SERVICE_KEY || process.env.REVIEWNOTES_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('ReviewNotes Supabase credentials not configured')
}

export const reviewnotesSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null

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
    dailyActive: [],
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
  const [{ data, error }, activationRes, paidRes, mrrHistRes, dailyActiveRes] = await Promise.all([
    reviewnotesSupabase.rpc('rn_traffic_stats', { range_days: CUMULATIVE_RANGE_DAYS }),
    // 활성화(첫 문제 등록) / 유료 전환 시점 / MRR 스냅샷 / 일별 활동 — 실패해도 트래픽 통계는 유지 (best-effort)
    reviewnotesSupabase.rpc('rn_activation'),
    reviewnotesSupabase.rpc('rn_paid_users'),
    reviewnotesSupabase.rpc('rn_mrr_history'),
    reviewnotesSupabase.rpc('rn_daily_active', { range_days: 60 }),
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
    dailyActive: ((dailyActiveRes.data ?? []) as Array<{ date: string; active: number; new_users: number; member: number; anon: number }>)
      .map(r => ({
        date: r.date,
        active: Number(r.active) || 0,
        newUsers: Number(r.new_users) || 0,
        member: Number(r.member) || 0,
        anon: Number(r.anon) || 0,
      })),
    memberReferrers: stats.memberReferrers ?? [],
    memberCountries: stats.memberCountries ?? [],
    paidReferrers: stats.paidReferrers ?? [],
    paidCountries: stats.paidCountries ?? [],
  }
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

// MRR 스냅샷 기록 — 구독을 접은 뒤로는 호출하지 않는다(2026-08-24 이후 값이 늘 0이라
// 0을 계속 쌓으면 옛 구간의 진짜 기록까지 0선에 묻힌다). rn_mrr_snapshots의 과거 43행은
// 구독 시절의 기록이라 지우지 않고 남겨 둔다. 구독형으로 돌아가면 이 호출만 되살리면 된다.
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

  const [{ data, error }, lastActiveRes, contentRes, countryRes, aiUsageRes] = await Promise.all([
    reviewnotesSupabase
      .from('User')
      // Only the columns consumed by getReviewNotesUserStats passes + the monor reviewnotes block.
      // (emailVerified / updatedAt / lemonSqueezyCustomerId are unused.)
      .select('id, name, email, image, subscriptionPlan, role, storageUsed, createdAt, aiCreditBalance')
      .order('createdAt', { ascending: false }),
    // 마지막 활동 / 유저별 콘텐츠 / 국가 / AI 사용 — RLS로 raw 접근 불가, 집계 RPC 사용
    // (실패해도 목록은 유지)
    reviewnotesSupabase.rpc('rn_user_last_active'),
    reviewnotesSupabase.rpc('rn_user_content'),
    reviewnotesSupabase.rpc('rn_user_country'),
    reviewnotesSupabase.rpc('rn_user_ai_usage'),
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
  const countryMap = new Map<string, string>(
    ((countryRes.data ?? []) as Array<{ user_id: string; country: string }>)
      .filter(r => r.country)
      .map(r => [r.user_id, r.country])
  )
  type AiUsageRow = {
    user_id: string
    calls_total: number; credits_total: number
    calls_period: number; credits_period: number
    features_period: Record<string, RnAiFeatureUse> | null
    features_total: Record<string, RnAiFeatureUse> | null
  }
  const aiUsageMap = new Map<string, AiUsageRow>(
    ((aiUsageRes.data ?? []) as AiUsageRow[]).map(r => [r.user_id, r])
  )
  return (data || []).map(u => {
    const c = contentMap.get(u.id)
    const ai = aiUsageMap.get(u.id)
    return {
      ...u,
      country: countryMap.get(u.id) ?? null,
      creditBalance: Number(u.aiCreditBalance) || 0,
      aiCallsMonth: Number(ai?.calls_period) || 0,
      aiCallsTotal: Number(ai?.calls_total) || 0,
      aiCreditsTotal: Number(ai?.credits_total) || 0,
      aiFeaturesMonth: ai?.features_period ?? {},
      aiFeaturesTotal: ai?.features_total ?? {},
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
