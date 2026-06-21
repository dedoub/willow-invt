import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchETFDisplayData } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bank = req.nextUrl.searchParams.get('bank') || undefined
  return NextResponse.json(await fetchETFDisplayData(bank))
}
