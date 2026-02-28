import { getServiceSupabase } from '@/lib/supabase'

/**
 * Log an MCP action to the audit log.
 */
export async function logMcpAction(params: {
  userId: string
  clientId?: string
  toolName?: string
  resourceUri?: string
  action: 'tool_call' | 'resource_read' | 'auth_login' | 'auth_token' | 'auth_revoke'
  inputParams?: Record<string, unknown>
  resultSummary?: string
  ipAddress?: string
}): Promise<void> {
  try {
    const supabase = getServiceSupabase()
    await supabase.from('mcp_audit_log').insert({
      user_id: params.userId,
      client_id: params.clientId,
      tool_name: params.toolName,
      resource_uri: params.resourceUri,
      action: params.action,
      input_params: params.inputParams || null,
      result_summary: params.resultSummary,
      ip_address: params.ipAddress,
    })
  } catch {
    // Don't let audit logging failures break the request
    console.error('[MCP Audit] Failed to log action:', params.action)
  }
}
