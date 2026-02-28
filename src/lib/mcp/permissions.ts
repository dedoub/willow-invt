import type { UserRole } from '@/lib/auth'
import type { McpUser } from './auth'

// =============================================
// MCP Role-Permission Matrix
// =============================================

export type McpScope =
  | 'wiki:read' | 'wiki:write'
  | 'projects:read' | 'projects:write'
  | 'schedules:read' | 'schedules:write'
  | 'invoices:read' | 'invoices:write'
  | 'etf:read'
  | 'dashboard:read'
  | 'admin:read' | 'admin:write'

interface ToolPermission {
  roles: UserRole[]
  scopes: McpScope[]
}

/**
 * Permission matrix: tool name → required roles and scopes.
 */
const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  // Wiki
  list_wiki_notes:   { roles: ['admin', 'editor', 'viewer'], scopes: ['wiki:read'] },
  get_wiki_note:     { roles: ['admin', 'editor', 'viewer'], scopes: ['wiki:read'] },
  create_wiki_note:  { roles: ['admin', 'editor'], scopes: ['wiki:write'] },
  update_wiki_note:  { roles: ['admin', 'editor'], scopes: ['wiki:write'] },
  delete_wiki_note:  { roles: ['admin', 'editor'], scopes: ['wiki:write'] },

  // Projects (Willow/Tensw Management)
  list_clients:      { roles: ['admin', 'editor', 'viewer'], scopes: ['projects:read'] },
  list_projects:     { roles: ['admin', 'editor', 'viewer'], scopes: ['projects:read'] },
  get_project:       { roles: ['admin', 'editor', 'viewer'], scopes: ['projects:read'] },
  list_milestones:   { roles: ['admin', 'editor', 'viewer'], scopes: ['projects:read'] },
  list_schedules:    { roles: ['admin', 'editor', 'viewer'], scopes: ['schedules:read'] },
  list_tasks:        { roles: ['admin', 'editor', 'viewer'], scopes: ['projects:read'] },

  // Invoices
  list_invoices:     { roles: ['admin', 'editor'], scopes: ['invoices:read'] },
  get_invoice:       { roles: ['admin', 'editor'], scopes: ['invoices:read'] },
  create_invoice:    { roles: ['admin'], scopes: ['invoices:write'] },

  // ETF
  list_etf_products: { roles: ['admin', 'editor', 'viewer'], scopes: ['etf:read'] },
  get_aum_data:      { roles: ['admin', 'editor'], scopes: ['etf:read'] },

  // Dashboard
  get_dashboard:     { roles: ['admin', 'editor', 'viewer'], scopes: ['dashboard:read'] },
}

/**
 * Check if a user has permission to use a specific tool.
 */
export function checkToolPermission(
  toolName: string,
  user: McpUser,
  tokenScopes: string[]
): { allowed: boolean; reason?: string } {
  const perm = TOOL_PERMISSIONS[toolName]
  if (!perm) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` }
  }

  // Check role
  if (!perm.roles.includes(user.role)) {
    return { allowed: false, reason: `Role '${user.role}' does not have access to '${toolName}'` }
  }

  // Check scopes
  const hasScope = perm.scopes.every(s => tokenScopes.includes(s))
  if (!hasScope) {
    return { allowed: false, reason: `Missing required scope(s): ${perm.scopes.join(', ')}` }
  }

  return { allowed: true }
}

/**
 * Get default scopes for a user role.
 */
export function getDefaultScopes(role: UserRole): string[] {
  switch (role) {
    case 'admin':
      return [
        'wiki:read', 'wiki:write',
        'projects:read', 'projects:write',
        'schedules:read', 'schedules:write',
        'invoices:read', 'invoices:write',
        'etf:read',
        'dashboard:read',
        'admin:read', 'admin:write',
      ]
    case 'editor':
      return [
        'wiki:read', 'wiki:write',
        'projects:read', 'projects:write',
        'schedules:read', 'schedules:write',
        'invoices:read',
        'etf:read',
        'dashboard:read',
      ]
    case 'viewer':
      return [
        'wiki:read',
        'projects:read',
        'schedules:read',
        'etf:read',
        'dashboard:read',
      ]
    default:
      return ['wiki:read', 'projects:read']
  }
}
