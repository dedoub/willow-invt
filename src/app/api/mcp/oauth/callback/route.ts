import { NextRequest, NextResponse } from 'next/server'
import { createAuthCode, validateClient } from '@/lib/mcp/auth'
import { verifyToken } from '@/lib/auth'
import { getDefaultScopes } from '@/lib/mcp/permissions'
import { logMcpAction } from '@/lib/mcp/audit'

/**
 * OAuth callback: after user authenticates in the login UI,
 * this endpoint reads OAuth params from cookie, generates an auth code,
 * and redirects back to the MCP client.
 */
export async function POST(request: NextRequest) {
  // Read OAuth params from cookie
  const oauthParamsCookie = request.cookies.get('mcp_oauth_params')?.value
  if (!oauthParamsCookie) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'OAuth session expired. Please start the authorization flow again.' },
      { status: 400 }
    )
  }

  let oauthParams: {
    client_id: string
    redirect_uri: string
    code_challenge: string
    code_challenge_method: string
    scope: string
    state: string
  }

  try {
    oauthParams = JSON.parse(oauthParamsCookie)
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid OAuth session data' },
      { status: 400 }
    )
  }

  const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, scope, state } = oauthParams

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing required parameters in OAuth session' },
      { status: 400 }
    )
  }

  // Validate client
  const { valid } = await validateClient(clientId, redirectUri)
  if (!valid) {
    return NextResponse.json(
      { error: 'invalid_client' },
      { status: 400 }
    )
  }

  // Read credentials from POST body
  const body = await request.json()
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Email and password are required' },
      { status: 400 }
    )
  }

  // Authenticate user via login API (internal call)
  const loginRes = await fetch(new URL('/api/auth/login', request.nextUrl.origin).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!loginRes.ok) {
    const loginData = await loginRes.json()
    return NextResponse.json(
      { error: 'access_denied', error_description: loginData.error || 'Login failed' },
      { status: 401 }
    )
  }

  // Extract auth token from login response Set-Cookie header
  const setCookieHeader = loginRes.headers.get('set-cookie') || ''
  const tokenMatch = setCookieHeader.match(/auth_token=([^;]+)/)
  const authToken = tokenMatch?.[1]

  if (!authToken) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to obtain auth token' },
      { status: 500 }
    )
  }

  const user = await verifyToken(authToken)
  if (!user) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Invalid auth token' },
      { status: 401 }
    )
  }

  // Determine effective scope
  const allowedScopes = getDefaultScopes(user.role)
  const requestedScopes = scope ? scope.split(' ').filter(Boolean) : allowedScopes
  const effectiveScopes = requestedScopes.filter(s => allowedScopes.includes(s))
  const effectiveScope = effectiveScopes.join(' ')

  // Create authorization code
  const code = await createAuthCode({
    clientId,
    userId: user.userId,
    redirectUri,
    scope: effectiveScope,
    codeChallenge,
    codeChallengeMethod,
  })

  // Audit log
  await logMcpAction({
    userId: user.userId,
    clientId,
    action: 'auth_login',
    resultSummary: `Authorization code issued for ${clientId}`,
    ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
  })

  // Build redirect URL with auth code
  const redirect = new URL(redirectUri)
  redirect.searchParams.set('code', code)
  if (state) redirect.searchParams.set('state', state)

  // Clear the OAuth params cookie and return redirect URL
  const response = NextResponse.json({ redirect_uri: redirect.toString() })
  response.cookies.delete('mcp_oauth_params')

  return response
}
