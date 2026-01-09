import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail-server'

export async function GET() {
  try {
    const gmail = await getGmailClient()

    if (!gmail) {
      return NextResponse.json({ isConnected: false })
    }

    // 프로필 조회로 연결 상태 확인
    const profile = await gmail.users.getProfile({ userId: 'me' })

    return NextResponse.json({
      isConnected: true,
      email: profile.data.emailAddress,
    })
  } catch (error) {
    console.error('Error checking Gmail status:', error)
    return NextResponse.json({ isConnected: false })
  }
}
