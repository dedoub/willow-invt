import { NextResponse } from 'next/server'
import { tenswGetBalanceHistory } from '@/lib/tensw-mgmt/queries'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('start_date') || undefined
  const endDate = searchParams.get('end_date') || undefined
  const result = await tenswGetBalanceHistory({ startDate, endDate })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
