import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchAllTimeSeriesData } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await fetchAllTimeSeriesData())
}
