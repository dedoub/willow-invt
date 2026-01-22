import { NextResponse } from 'next/server'
import { deleteTokens, GmailContext } from '@/lib/gmail-server'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = (searchParams.get('context') || 'default') as GmailContext
    await deleteTokens(context)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting Gmail:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
