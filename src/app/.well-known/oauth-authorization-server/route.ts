import { NextRequest, NextResponse } from 'next/server'

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Tells MCP clients the OAuth endpoints.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = `${proto}://${host}`

  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/oauth/token`,
    registration_endpoint: `${baseUrl}/api/mcp/oauth/register`,
    revocation_endpoint: `${baseUrl}/api/mcp/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [
      'wiki:read', 'wiki:write',
      'projects:read', 'projects:write',
      'schedules:read', 'schedules:write',
      'invoices:read', 'invoices:write',
      'etf:read',
      'dashboard:read',
      'admin:read', 'admin:write',
    ],
  })
}
