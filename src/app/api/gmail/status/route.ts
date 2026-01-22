import { NextResponse } from 'next/server'
import { getGmailClient, GmailContext } from '@/lib/gmail-server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = (searchParams.get('context') || 'default') as GmailContext
    const gmail = await getGmailClient(context)

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
