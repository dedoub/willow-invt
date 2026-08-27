import { NextResponse } from 'next/server'
import { denyUnlessDashboardAccess } from '@/lib/api-auth'
import { willowListBankBalances, willowUpsertBankBalance } from '@/lib/willow-mgmt/queries'

export async function GET(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const result = await willowListBankBalances()
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}

export async function POST(request: Request) {
  const denied = await denyUnlessDashboardAccess(request)
  if (denied) return denied

  const body = await request.json()
  const result = await willowUpsertBankBalance(body)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
