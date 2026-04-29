import { NextResponse } from 'next/server'
import { tenswListBankBalances, tenswUpsertBankBalance } from '@/lib/tensw-mgmt/queries'

export async function GET() {
  const result = await tenswListBankBalances()
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const result = await tenswUpsertBankBalance(body)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
