import { NextRequest, NextResponse } from 'next/server'

function getBaseUrl(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'willow-invt.vercel.app'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * MCP clients discover this first, then use authorization_servers to find the OAuth server.
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request)

  return NextResponse.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [`${baseUrl}`],
    scopes_supported: [
      'wiki:read', 'wiki:write',
      'projects:read', 'projects:write',
      'schedules:read', 'schedules:write',
      'invoices:read', 'invoices:write',
      'etf:read',
      'dashboard:read',
      'admin:read', 'admin:write',
    ],
    bearer_methods_supported: ['header'],
  })
}
