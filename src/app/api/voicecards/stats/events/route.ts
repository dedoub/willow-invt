import { NextResponse } from 'next/server'
import { getAnonymousEventStats } from '@/lib/voicecards-server'

export const maxDuration = 300

export async function GET() {
  try {
    const anonymousStats = await getAnonymousEventStats()
    return NextResponse.json({ success: true, anonymousStats })
  } catch (error) {
    console.error('Error fetching voicecards anonymous events:', error)
    return NextResponse.json({ error: 'Failed to fetch anonymous events' }, { status: 500 })
  }
}
