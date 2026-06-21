import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchHistoricalData } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { products, days } = await req.json()
  return NextResponse.json(await fetchHistoricalData(products ?? [], days ?? 30))
}
