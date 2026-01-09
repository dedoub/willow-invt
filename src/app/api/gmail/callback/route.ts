import { NextRequest, NextResponse } from 'next/server'
import { getOAuth2Client } from '@/lib/gmail-server'

const GMAIL_TOKEN_COOKIE = 'gmail_tokens'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // 기본 리다이렉트 URL (호스트 기반)
  const baseUrl = request.nextUrl.origin

  if (error) {
    console.error('Gmail OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}/etf/etc?gmail_error=${error}`)
  }

  if (!code) {
    console.error('Gmail OAuth: No code received')
    return NextResponse.redirect(`${baseUrl}/etf/etc?gmail_error=no_code`)
  }

  try {
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    console.log('Gmail tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    })

    if (!tokens.access_token) {
      console.error('Gmail OAuth: No access token received')
      return NextResponse.redirect(`${baseUrl}/etf/etc?gmail_error=no_access_token`)
    }

    // 토큰 데이터 생성
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || '',
      expires_at: tokens.expiry_date || Date.now() + 3600 * 1000,
    }

    // 리다이렉트 응답 생성 후 쿠키 설정
    const response = NextResponse.redirect(`${baseUrl}/etf/etc?gmail_connected=true`)

    response.cookies.set(GMAIL_TOKEN_COOKIE, JSON.stringify(tokenData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: '/',
    })

    return response
  } catch (err) {
    console.error('Error exchanging code for tokens:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(`${baseUrl}/etf/etc?gmail_error=token_exchange_failed&details=${encodeURIComponent(errorMessage)}`)
  }
}
