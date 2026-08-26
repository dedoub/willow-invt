// 시크릿 키로 Scripta DB에 붙는 서버 전용 모듈. 클라이언트가 import 하면 빌드가 깨지도록 잠근다.
// 클라이언트가 쓰는 타입·상수는 scripta-types.ts 로 갈라 뒀다 (리뷰노트와 같은 패턴).
//
// Scripta는 유저가 auth.users에 있어 REST로 직접 못 읽고(auth 스키마 미노출), 나머지 테이블도
// RLS로 잠겨 있다. 그래서 집계는 전부 SECURITY DEFINER RPC 두 개로 받는다.
// 정본 SQL: supabase/scripta/sc_dashboard.sql
import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { ScriptaPayload, ScriptaStats, ScriptaUser } from '@/lib/scripta-types'

export * from '@/lib/scripta-types'

const supabaseUrl = process.env.SCRIPTA_SUPABASE_URL
const supabaseKey = process.env.SCRIPTA_SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('Scripta Supabase credentials not configured')
}

export const scriptaSupabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null

interface ScUserRow {
  user_id: string
  email: string | null
  name: string | null
  avatar_url: string | null
  created_at: string
  last_sign_in_at: string | null
  last_activity: string | null
  cortices: number
  texts: number
  sentences: number
  attempts: number
  attempts_today: number
  passed: number
  avg_score: number | string | null
  balance: number | string | null
  spent: number | string | null
  ai_calls: number
}

const num = (v: unknown): number => Number(v) || 0

export async function getScriptaStats(): Promise<ScriptaPayload> {
  if (!scriptaSupabase) {
    throw new Error('Scripta Supabase 미설정 (SCRIPTA_SUPABASE_URL / SCRIPTA_SUPABASE_SERVICE_KEY)')
  }

  const [statsRes, usersRes] = await Promise.all([
    scriptaSupabase.rpc('sc_dashboard_stats'),
    scriptaSupabase.rpc('sc_users'),
  ])
  if (statsRes.error) throw new Error(`sc_dashboard_stats 조회 실패: ${statsRes.error.message}`)
  if (usersRes.error) throw new Error(`sc_users 조회 실패: ${usersRes.error.message}`)

  const stats = statsRes.data as ScriptaStats
  const users: ScriptaUser[] = ((usersRes.data ?? []) as ScUserRow[]).map(r => ({
    userId: r.user_id,
    email: r.email ?? '',
    name: r.name,
    avatarUrl: r.avatar_url,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
    lastActivity: r.last_activity,
    cortices: num(r.cortices),
    texts: num(r.texts),
    sentences: num(r.sentences),
    attempts: num(r.attempts),
    attemptsToday: num(r.attempts_today),
    passed: num(r.passed),
    avgScore: num(r.avg_score),
    balance: num(r.balance),
    spent: num(r.spent),
    aiCalls: num(r.ai_calls),
  }))

  return { stats, users, fetchedAt: new Date().toISOString() }
}
