import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createAuthCode, validateClient } from '@/lib/mcp/auth'
import { getDefaultScopes } from '@/lib/mcp/permissions'
import { logMcpAction } from '@/lib/mcp/audit'
import { getServiceSupabase } from '@/lib/supabase'
import type { UserRole } from '@/lib/auth'

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

  // Authenticate user directly (no internal fetch)
  const supabase = getServiceSupabase()
  const { data: user, error: dbError } = await supabase
    .from('willow_users')
    .select('id, email, name, role, is_active, password_hash')
    .eq('email', email.toLowerCase())
    .single()

  if (dbError || !user) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Invalid email or password' },
      { status: 401 }
    )
  }

  if (!user.is_active) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Account is deactivated' },
      { status: 401 }
    )
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash)
  if (!isValidPassword) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Invalid email or password' },
      { status: 401 }
    )
  }

  // Determine effective scope
  const userRole = user.role as UserRole
  const allowedScopes = getDefaultScopes(userRole)
  const requestedScopes = scope ? scope.split(' ').filter(Boolean) : allowedScopes
  const effectiveScopes = requestedScopes.filter(s => allowedScopes.includes(s))
  const effectiveScope = effectiveScopes.join(' ')

  // Create authorization code
  let code: string
  try {
    code = await createAuthCode({
      clientId,
      userId: user.id,
      redirectUri,
      scope: effectiveScope,
      codeChallenge,
      codeChallengeMethod,
    })
  } catch (err) {
    console.error('MCP OAuth callback: failed to create auth code', err)
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to create authorization code' },
      { status: 500 }
    )
  }

  // Audit log
  await logMcpAction({
    userId: user.id,
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
