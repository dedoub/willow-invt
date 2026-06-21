import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { fetchETFDocuments, uploadETFDocument, deleteETFDocument } from '@/lib/supabase-etf'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const symbol = req.nextUrl.searchParams.get('symbol') || ''
  return NextResponse.json(await fetchETFDocuments(symbol))
}

export async function POST(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const form = await req.formData()
  const symbol = String(form.get('symbol') || '')
  const file = form.get('file')
  if (!(file instanceof File) || !symbol) return NextResponse.json({ success: false, error: 'symbol and file required' }, { status: 400 })
  return NextResponse.json(await uploadETFDocument(symbol, file))
}

export async function DELETE(req: NextRequest) {
  if (!(await getAuthUser())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const symbol = req.nextUrl.searchParams.get('symbol') || ''
  const fileName = req.nextUrl.searchParams.get('fileName') || ''
  const ok = await deleteETFDocument(symbol, fileName)
  return NextResponse.json({ success: ok }, { status: ok ? 200 : 500 })
}
