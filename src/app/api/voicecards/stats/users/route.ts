import { NextResponse } from 'next/server'
import { getVoicecardsUserStats } from '@/lib/voicecards-server'

export const maxDuration = 300

export async function GET() {
  try {
    const userStats = await getVoicecardsUserStats()
    return NextResponse.json({ success: true, userStats })
  } catch (error) {
    console.error('Error fetching voicecards user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch user stats' }, { status: 500 })
  }
}
