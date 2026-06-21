import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchYearLaunches } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()
  return NextResponse.json({ count: await fetchYearLaunches(year) })
}
