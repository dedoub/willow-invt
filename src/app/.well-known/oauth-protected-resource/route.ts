import { NextRequest, NextResponse } from 'next/server'

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * Tells MCP clients where the authorization server is.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const baseUrl = `${proto}://${host}`

  return NextResponse.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
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
