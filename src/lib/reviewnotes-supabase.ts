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
