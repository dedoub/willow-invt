import { NextResponse } from 'next/server'
import { getAuthUrl, GmailContext } from '@/lib/gmail-server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = (searchParams.get('context') || 'default') as GmailContext
    const authUrl = getAuthUrl(context)
    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error('Error generating auth URL:', error)
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 })
  }
}
