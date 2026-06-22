import { NextResponse } from 'next/server'
import { getValueChainStats } from '@/lib/valuechain-supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getValueChainStats()
    return NextResponse.json({ success: true, stats })
  } catch (error) {
    console.error('Error fetching ValueChain stats:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to fetch ValueChain stats' },
      { status: 500 }
    )
  }
}
