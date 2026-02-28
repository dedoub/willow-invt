import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * OAuth 2.1 Dynamic Client Registration (RFC 7591)
 */
export async function POST(request: NextRequest) {
  const body = await request.json()

  const { client_name, redirect_uris } = body

  if (!client_name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'client_name and redirect_uris are required' },
      { status: 400 }
    )
  }

  const clientId = randomBytes(16).toString('hex')
  const supabase = getServiceSupabase()

  const { error } = await supabase.from('mcp_oauth_clients').insert({
    client_id: clientId,
    client_name,
    redirect_uris,
    scopes: body.scope ? body.scope.split(' ') : [],
    is_trusted: false,
  })

  if (error) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to register client' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    client_id: clientId,
    client_name,
    redirect_uris,
    token_endpoint_auth_method: 'none',
  }, { status: 201 })
}
