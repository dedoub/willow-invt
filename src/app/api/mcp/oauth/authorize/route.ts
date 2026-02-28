import { NextRequest, NextResponse } from 'next/server'
import { validateClient } from '@/lib/mcp/auth'

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'willow-invt.vercel.app'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

/**
 * OAuth 2.1 Authorization Endpoint
 * Validates params, stores them in a cookie, and redirects to login UI.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const responseType = searchParams.get('response_type')
  const clientId = searchParams.get('client_id')
  const redirectUri = searchParams.get('redirect_uri')
  const codeChallenge = searchParams.get('code_challenge')
  const codeChallengeMethod = searchParams.get('code_challenge_method')
  const state = searchParams.get('state')
  const scope = searchParams.get('scope') || ''

  // Validate required params
  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type', error_description: 'Only "code" is supported' },
      { status: 400 }
    )
  }

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'client_id and redirect_uri are required' },
      { status: 400 }
    )
  }

  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'PKCE with S256 is required' },
      { status: 400 }
    )
  }

  // Validate client
  const { valid } = await validateClient(clientId, redirectUri)
  if (!valid) {
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Unknown client_id or invalid redirect_uri' },
      { status: 400 }
    )
  }

  // Store OAuth params in a cookie
  const oauthParams = JSON.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    state: state || '',
  })

  const baseUrl = getBaseUrl(request)
  const loginUrl = new URL('/mcp/authorize', baseUrl)

  const response = NextResponse.redirect(loginUrl.toString())
  response.cookies.set('mcp_oauth_params', oauthParams, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })

  return response
}
