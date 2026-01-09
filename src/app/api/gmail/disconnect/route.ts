import { NextResponse } from 'next/server'
import { deleteTokens } from '@/lib/gmail-server'

export async function POST() {
  try {
    await deleteTokens()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error disconnecting Gmail:', error)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
