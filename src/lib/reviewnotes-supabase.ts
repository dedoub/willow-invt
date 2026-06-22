import { createClient } from '@supabase/supabase-js'

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
  emailVerified: string | null
  image: string | null
  subscriptionPlan: SubscriptionPlan
  role: UserRole
  storageUsed: number
  lemonSqueezyCustomerId: string | null
  createdAt: string
  updatedAt: string
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
  daily: Array<{ date: string; views: number; visitors: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
}

interface PageViewRow {
  referrer: string | null
  country: string | null
  sessionId: string
  createdAt: string
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getReviewNotesTrafficStats(range = 30): Promise<ReviewNotesTrafficStats> {
  const empty: ReviewNotesTrafficStats = {
    range,
    totals: { views: 0, visitors: 0 },
    change: { views: 0, visitors: 0 },
    daily: [],
    topReferrers: [],
    topCountries: [],
  }

  if (!reviewnotesSupabase) return empty

  const now = new Date()
  const start = new Date(now.getTime() - range * 24 * 60 * 60 * 1000)
  const prevStart = new Date(now.getTime() - 2 * range * 24 * 60 * 60 * 1000)

  // 현재 기간 + 이전 기간(증감률 계산용)을 한 번에 조회
  const { data, error } = await reviewnotesSupabase
    .from('PageView')
    .select('referrer, country, sessionId, createdAt')
    .gte('createdAt', prevStart.toISOString())
    .order('createdAt', { ascending: true })
    .limit(50000)

  if (error || !data) {
    console.error('Error fetching PageView traffic:', error)
    return empty
  }

  const rows = data as PageViewRow[]
  const current = rows.filter(r => new Date(r.createdAt) >= start)
  const previous = rows.filter(r => {
    const d = new Date(r.createdAt)
    return d >= prevStart && d < start
  })

  const distinct = (arr: PageViewRow[]) => new Set(arr.map(r => r.sessionId)).size

  // 일별 추이 (빈 날짜 채우기)
  const dailyMap = new Map<string, { views: number; sessions: Set<string> }>()
  for (const r of current) {
    const key = toDateKey(new Date(r.createdAt))
    const entry = dailyMap.get(key) ?? { views: 0, sessions: new Set<string>() }
    entry.views += 1
    entry.sessions.add(r.sessionId)
    dailyMap.set(key, entry)
  }
  const daily: ReviewNotesTrafficStats['daily'] = []
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = toDateKey(d)
    const entry = dailyMap.get(key)
    daily.push({ date: key, views: entry?.views ?? 0, visitors: entry?.sessions.size ?? 0 })
  }

  // 유입 경로 / 국가 집계 (상위 6개)
  const tally = (key: 'referrer' | 'country', fallback: string) => {
    const counts = new Map<string, number>()
    for (const r of current) {
      const label = (r[key] || fallback) as string
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }))
  }

  return {
    range,
    totals: { views: current.length, visitors: distinct(current) },
    change: {
      views: pctChange(current.length, previous.length),
      visitors: pctChange(distinct(current), distinct(previous)),
    },
    daily,
    topReferrers: tally('referrer', 'direct').map(r => ({ referrer: r.label, count: r.count })),
    topCountries: tally('country', 'Unknown').map(r => ({ country: r.label, count: r.count })),
  }
}

// 유저 목록 조회
export async function getReviewNotesUsers(): Promise<ReviewNotesUser[]> {
  if (!reviewnotesSupabase) {
    throw new Error('ReviewNotes Supabase not configured')
  }

  const { data, error } = await reviewnotesSupabase
    .from('User')
    .select('*')
    .order('createdAt', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  return data || []
}

// 유저 통계 계산
export async function getReviewNotesUserStats(): Promise<ReviewNotesUserStats> {
  const users = await getReviewNotesUsers()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)

  const stats: ReviewNotesUserStats = {
    totalUsers: users.length,
    adminUsers: users.filter(u => u.role === 'ADMIN').length,
    freeUsers: users.filter(u => u.subscriptionPlan === 'FREE').length,
    basicUsers: users.filter(u => u.subscriptionPlan === 'BASIC').length,
    standardUsers: users.filter(u => u.subscriptionPlan === 'STANDARD').length,
    proUsers: users.filter(u => u.subscriptionPlan === 'PRO').length,
    newUsersThisMonth: users.filter(u => new Date(u.createdAt) >= monthStart).length,
    newUsersThisWeek: users.filter(u => new Date(u.createdAt) >= weekStart).length,
    totalStorageUsed: users.reduce((sum, u) => sum + (u.storageUsed || 0), 0),
    users,
  }

  return stats
}
