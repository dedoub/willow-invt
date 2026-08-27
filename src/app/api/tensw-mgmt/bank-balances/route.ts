import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { tenswListBankBalances, tenswUpsertBankBalance } from '@/lib/tensw-mgmt/queries'

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const result = await tenswListBankBalances()
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}

export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const result = await tenswUpsertBankBalance(body)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
