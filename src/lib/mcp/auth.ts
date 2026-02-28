import { randomBytes, createHash } from 'crypto'
import { getServiceSupabase } from '@/lib/supabase'
import type { UserRole } from '@/lib/auth'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'

// =============================================
// MCP OAuth Token Management
// =============================================

export interface McpUser {
  userId: string
  email: string
  name: string
  role: UserRole
  isActive: boolean
}

export interface McpTokenData {
  userId: string
  clientId: string
  scope: string
  user: McpUser
}

/**
 * Validate an MCP OAuth access token and resolve the user.
 */
export async function validateMcpToken(token: string): Promise<McpTokenData | null> {
  const supabase = getServiceSupabase()

  const { data: tokenRow } = await supabase
    .from('mcp_oauth_tokens')
    .select('user_id, client_id, scope, expires_at, revoked')
    .eq('access_token', token)
    .single()

  if (!tokenRow || tokenRow.revoked) return null

  // Check expiry
  if (new Date(tokenRow.expires_at) < new Date()) return null

  // Fetch user with current role
  const { data: user } = await supabase
    .from('willow_users')
    .select('id, email, name, role, is_active')
    .eq('id', tokenRow.user_id)
    .single()

  if (!user || !user.is_active) return null

  return {
    userId: user.id,
    clientId: tokenRow.client_id,
    scope: tokenRow.scope || '',
    user: {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      isActive: user.is_active,
    },
  }
}

/**
 * Build AuthInfo from validated token data (for MCP transport).
 */
export function buildAuthInfo(tokenData: McpTokenData, rawToken: string): AuthInfo {
  return {
    token: rawToken,
    clientId: tokenData.clientId,
    scopes: tokenData.scope.split(' ').filter(Boolean),
    extra: {
      userId: tokenData.userId,
      role: tokenData.user.role,
      name: tokenData.user.name,
      email: tokenData.user.email,
    },
  }
}

/**
 * Extract McpUser from AuthInfo.extra (used in tool handlers).
 */
export function getUserFromAuthInfo(authInfo?: AuthInfo): McpUser | null {
  if (!authInfo?.extra) return null
  const extra = authInfo.extra as Record<string, unknown>
  return {
    userId: extra.userId as string,
    email: extra.email as string,
    name: extra.name as string,
    role: extra.role as UserRole,
    isActive: true,
  }
}

// =============================================
// OAuth Code & Token Generation
// =============================================

export function generateCode(): string {
  return randomBytes(32).toString('hex')
}

export function generateToken(): string {
  return randomBytes(64).toString('hex')
}

/**
 * Verify PKCE code_verifier against code_challenge (S256).
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash('sha256').update(codeVerifier).digest('base64url')
  return hash === codeChallenge
}

/**
 * Create an authorization code.
 */
export async function createAuthCode(params: {
  clientId: string
  userId: string
  redirectUri: string
  scope: string
  codeChallenge: string
  codeChallengeMethod: string
}): Promise<string> {
  const code = generateCode()
  const supabase = getServiceSupabase()

  await supabase.from('mcp_oauth_codes').insert({
    code,
    client_id: params.clientId,
    user_id: params.userId,
    redirect_uri: params.redirectUri,
    scope: params.scope,
    code_challenge: params.codeChallenge,
    code_challenge_method: params.codeChallengeMethod,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
  })

  return code
}

/**
 * Exchange authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<{
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
} | null> {
  const supabase = getServiceSupabase()

  // Find and validate code
  const { data: codeRow } = await supabase
    .from('mcp_oauth_codes')
    .select('*')
    .eq('code', params.code)
    .eq('client_id', params.clientId)
    .eq('used', false)
    .single()

  if (!codeRow) return null

  // Check expiry
  if (new Date(codeRow.expires_at) < new Date()) return null

  // Verify redirect_uri matches
  if (codeRow.redirect_uri !== params.redirectUri) return null

  // Verify PKCE
  if (!verifyPkce(params.codeVerifier, codeRow.code_challenge)) return null

  // Mark code as used
  await supabase
    .from('mcp_oauth_codes')
    .update({ used: true })
    .eq('id', codeRow.id)

  // Generate tokens
  const accessToken = generateToken()
  const refreshToken = generateToken()
  const expiresIn = 3600 // 1 hour

  await supabase.from('mcp_oauth_tokens').insert({
    access_token: accessToken,
    refresh_token: refreshToken,
    client_id: params.clientId,
    user_id: codeRow.user_id,
    scope: codeRow.scope,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  })

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: codeRow.scope,
  }
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(params: {
  refreshToken: string
  clientId: string
}): Promise<{
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope: string
} | null> {
  const supabase = getServiceSupabase()

  const { data: tokenRow } = await supabase
    .from('mcp_oauth_tokens')
    .select('*')
    .eq('refresh_token', params.refreshToken)
    .eq('client_id', params.clientId)
    .eq('revoked', false)
    .single()

  if (!tokenRow) return null

  // Check refresh token expiry
  if (tokenRow.refresh_expires_at && new Date(tokenRow.refresh_expires_at) < new Date()) {
    return null
  }

  // Revoke old tokens (rotation)
  await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked: true })
    .eq('id', tokenRow.id)

  // Issue new tokens
  const newAccessToken = generateToken()
  const newRefreshToken = generateToken()
  const expiresIn = 3600

  await supabase.from('mcp_oauth_tokens').insert({
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    client_id: params.clientId,
    user_id: tokenRow.user_id,
    scope: tokenRow.scope,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    scope: tokenRow.scope,
  }
}

/**
 * Revoke a token (access or refresh).
 */
export async function revokeToken(token: string): Promise<void> {
  const supabase = getServiceSupabase()

  // Try access token first
  const { data: byAccess } = await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked: true })
    .eq('access_token', token)
    .select('id')

  if (byAccess && byAccess.length > 0) return

  // Try refresh token
  await supabase
    .from('mcp_oauth_tokens')
    .update({ revoked: true })
    .eq('refresh_token', token)
}

/**
 * Validate a client_id and redirect_uri.
 */
export async function validateClient(
  clientId: string,
  redirectUri?: string
): Promise<{ valid: boolean; client?: { client_name: string; is_trusted: boolean; scopes: string[] } }> {
  const supabase = getServiceSupabase()

  const { data: client } = await supabase
    .from('mcp_oauth_clients')
    .select('client_name, redirect_uris, is_trusted, scopes')
    .eq('client_id', clientId)
    .single()

  if (!client) return { valid: false }

  if (redirectUri) {
    const matches = (client.redirect_uris as string[]).some((pattern: string) => {
      if (pattern.endsWith(':*')) {
        const prefix = pattern.slice(0, -1)
        return redirectUri.startsWith(prefix) || redirectUri === pattern.slice(0, -2)
      }
      return redirectUri === pattern || redirectUri.startsWith(pattern + '/')
    })
    if (!matches) return { valid: false }
  }

  return {
    valid: true,
    client: {
      client_name: client.client_name,
      is_trusted: client.is_trusted,
      scopes: client.scopes || [],
    },
  }
}
