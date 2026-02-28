import { NextRequest } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp/server'
import { validateMcpToken, buildAuthInfo } from '@/lib/mcp/auth'
import { rateLimit } from '@/lib/rate-limit'

function getResourceMetadataUrl(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'willow-invt.vercel.app'
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  return `${proto}://${host}/.well-known/oauth-protected-resource`
}

function unauthorized(request: NextRequest, message: string) {
  const resourceMetadataUrl = getResourceMetadataUrl(request)
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
    },
  })
}

/**
 * MCP Streamable HTTP Endpoint
 * POST: JSON-RPC requests from MCP clients
 * GET: SSE stream for server-initiated messages
 * DELETE: Session termination
 */
export async function POST(request: NextRequest) {
  // Validate Bearer token
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(request, 'Unauthorized')
  }

  const rawToken = authHeader.slice(7)
  const tokenData = await validateMcpToken(rawToken)
  if (!tokenData) {
    return unauthorized(request, 'Invalid or expired token')
  }

  // Rate limit per user
  const { success } = rateLimit(`mcp:${tokenData.userId}`, { limit: 60, windowMs: 60_000 })
  if (!success) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Create fresh server + transport per request (required for serverless)
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  })

  await server.connect(transport)

  const authInfo = buildAuthInfo(tokenData, rawToken)
  const body = await request.json()

  return transport.handleRequest(request, {
    parsedBody: body,
    authInfo,
  })
}

export async function GET(request: NextRequest) {
  // SSE endpoint for server-to-client streaming
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorized(request, 'Unauthorized')
  }

  const rawToken = authHeader.slice(7)
  const tokenData = await validateMcpToken(rawToken)
  if (!tokenData) {
    return unauthorized(request, 'Invalid or expired token')
  }

  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  const authInfo = buildAuthInfo(tokenData, rawToken)

  return transport.handleRequest(request, { authInfo })
}

export async function DELETE(request: NextRequest) {
  // Session termination (stateless, so just acknowledge)
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)

  return transport.handleRequest(request)
}
