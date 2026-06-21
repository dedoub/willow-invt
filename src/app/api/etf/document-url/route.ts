import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getDocumentDownloadUrl } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const symbol = req.nextUrl.searchParams.get('symbol') || ''
  const fileName = req.nextUrl.searchParams.get('fileName') || ''
  return NextResponse.json({ url: await getDocumentDownloadUrl(symbol, fileName) })
}
