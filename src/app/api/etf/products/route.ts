import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchETFProducts, createETFProduct, updateETFProduct, deleteETFProduct } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bank = req.nextUrl.searchParams.get('bank') || undefined
  return NextResponse.json(await fetchETFProducts(bank))
}

export async function POST(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const input = await req.json()
  const created = await createETFProduct(input)
  if (!created) return NextResponse.json({ error: 'create failed' }, { status: 500 })
  return NextResponse.json(created)
}

export async function PATCH(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id, input } = await req.json()
  const updated = await updateETFProduct(id, input)
  if (!updated) return NextResponse.json({ error: 'update failed' }, { status: 500 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const id = Number(req.nextUrl.searchParams.get('id'))
  const ok = await deleteETFProduct(id)
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 500 })
}
