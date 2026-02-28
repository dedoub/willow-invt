import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getOAuth2Client, saveTokens, GmailContext } from '@/lib/gmail-server'

// Context별 리다이렉트 경로 매핑
const CONTEXT_REDIRECT_PATHS: Record<GmailContext, string> = {
  default: '/etf/etc',
  tensoftworks: '/tensoftworks/management',
  willow: '/willow-investment/management',
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state') as GmailContext | null
  const context: GmailContext = state && (state === 'default' || state === 'tensoftworks' || state === 'willow') ? state : 'default'

  // 기본 리다이렉트 URL (호스트 기반)
  const baseUrl = request.nextUrl.origin
  const redirectPath = CONTEXT_REDIRECT_PATHS[context]

  if (error) {
    console.error('Gmail OAuth error:', error)
    return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_error=${error}`)
  }

  if (!code) {
    console.error('Gmail OAuth: No code received')
    return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_error=no_code`)
  }

  try {
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    console.log('Gmail tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      context,
    })

    if (!tokens.access_token) {
      console.error('Gmail OAuth: No access token received')
      return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_error=no_access_token`)
    }

    // Gmail 이메일 주소 가져오기
    oauth2Client.setCredentials(tokens)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    let gmailEmail = ''
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' })
      gmailEmail = profile.data.emailAddress || ''
    } catch (e) {
      console.error('Failed to get Gmail profile:', e)
    }

    // 토큰을 DB에 저장 (context 포함)
    const saveResult = await saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
      gmail_email: gmailEmail,
      context,
    })

    if (!saveResult.success) {
      console.error(`Gmail OAuth: Failed to save tokens for context=${context}:`, saveResult.error)
      return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_error=save_failed&details=${encodeURIComponent(saveResult.error || 'unknown')}`)
    }

    return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_connected=true`)
  } catch (err) {
    console.error('Error exchanging code for tokens:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown'
    return NextResponse.redirect(`${baseUrl}${redirectPath}?gmail_error=token_exchange_failed&details=${encodeURIComponent(errorMessage)}`)
  }
}
