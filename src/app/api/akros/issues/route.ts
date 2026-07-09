import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchAkrosEmailIssues, fetchAkrosEmailDeadlines } from '@/lib/supabase-etf'

// GET /api/akros/issues — 이메일 이슈 트래킹 + 다가오는 마감 (수퍼노바 DB)
export async function GET() {
  try {
    const authUser = await getAuthUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const [issues, deadlines] = await Promise.all([
      fetchAkrosEmailIssues(),
      fetchAkrosEmailDeadlines(),
    ])

    return NextResponse.json({ issues, deadlines })
  } catch (error) {
    console.error('[Akros Issues] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
