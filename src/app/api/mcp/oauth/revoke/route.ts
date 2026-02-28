import { NextRequest, NextResponse } from 'next/server'
import { revokeToken } from '@/lib/mcp/auth'

/**
 * OAuth 2.1 Token Revocation (RFC 7009)
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  let token: string | null = null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    const params = new URLSearchParams(text)
    token = params.get('token')
  } else if (contentType.includes('application/json')) {
    const json = await request.json()
    token = json.token
  }

  if (!token) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'token is required' },
      { status: 400 }
    )
  }

  await revokeToken(token)

  // RFC 7009: always return 200, even if token was already revoked/invalid
  return NextResponse.json({ success: true })
}
