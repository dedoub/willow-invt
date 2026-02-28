import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, refreshAccessToken } from '@/lib/mcp/auth'
import { rateLimit } from '@/lib/rate-limit'

/**
 * OAuth 2.1 Token Endpoint
 * Handles authorization_code and refresh_token grant types.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'

  // Rate limit
  const { success } = rateLimit(`mcp-token:${ip}`, { limit: 20, windowMs: 60_000 })
  if (!success) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      { status: 429 }
    )
  }

  const contentType = request.headers.get('content-type') || ''
  let params: URLSearchParams

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    params = new URLSearchParams(text)
  } else if (contentType.includes('application/json')) {
    const json = await request.json()
    params = new URLSearchParams(json)
  } else {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Content-Type must be application/x-www-form-urlencoded or application/json' },
      { status: 400 }
    )
  }

  const grantType = params.get('grant_type')

  if (grantType === 'authorization_code') {
    const code = params.get('code')
    const clientId = params.get('client_id')
    const redirectUri = params.get('redirect_uri')
    const codeVerifier = params.get('code_verifier')

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'code, client_id, redirect_uri, and code_verifier are required' },
        { status: 400 }
      )
    }

    const result = await exchangeCodeForTokens({ code, clientId, redirectUri, codeVerifier })

    if (!result) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
        { status: 400 }
      )
    }

    return NextResponse.json(result)
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token')
    const clientId = params.get('client_id')

    if (!refreshToken || !clientId) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'refresh_token and client_id are required' },
        { status: 400 }
      )
    }

    const result = await refreshAccessToken({ refreshToken, clientId })

    if (!result) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
        { status: 400 }
      )
    }

    return NextResponse.json(result)
  }

  return NextResponse.json(
    { error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported' },
    { status: 400 }
  )
}
