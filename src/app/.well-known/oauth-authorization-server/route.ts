import { NextRequest, NextResponse } from 'next/server'

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'willow-invt.vercel.app'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

/**
 * OAuth 2.1 Authorization Server Metadata (RFC 8414)
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request)

  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/mcp/oauth/token`,
    revocation_endpoint: `${baseUrl}/api/mcp/oauth/revoke`,
    registration_endpoint: `${baseUrl}/api/mcp/oauth/register`,
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
