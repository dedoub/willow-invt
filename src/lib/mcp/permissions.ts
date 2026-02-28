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
  | 'ryuha:read' | 'ryuha:write'
  | 'willow:read' | 'willow:write'
  | 'tensw:read' | 'tensw:write'
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

  // ETF/Etc Invoices
  etc_list_invoices:  { roles: ['admin', 'editor'], scopes: ['invoices:read'] },
  etc_get_invoice:    { roles: ['admin', 'editor'], scopes: ['invoices:read'] },
  etc_create_invoice: { roles: ['admin'], scopes: ['invoices:write'] },

  // Akros
  akros_list_products:       { roles: ['admin', 'editor', 'viewer'], scopes: ['etf:read'] },
  akros_get_aum_data:        { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_get_exchange_rates:  { roles: ['admin', 'editor', 'viewer'], scopes: ['etf:read'] },
  akros_get_time_series:     { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_list_tax_invoices:   { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_create_tax_invoice:  { roles: ['admin'], scopes: ['etf:read'] },
  akros_update_tax_invoice:  { roles: ['admin'], scopes: ['etf:read'] },
  akros_delete_tax_invoice:  { roles: ['admin'], scopes: ['etf:read'] },

  // ETF/Etc
  etc_list_products:   { roles: ['admin', 'editor', 'viewer'], scopes: ['etf:read'] },
  etc_create_product:  { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  etc_update_product:  { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  etc_delete_product:  { roles: ['admin'], scopes: ['etf:read'] },
  etc_get_stats:       { roles: ['admin', 'editor', 'viewer'], scopes: ['etf:read'] },

  // Email Analysis & Todos (Akros)
  akros_get_analysis:  { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_list_todos:    { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_toggle_todo:   { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  akros_delete_todo:   { roles: ['admin'], scopes: ['etf:read'] },

  // Email Analysis & Todos (Etc)
  etc_get_analysis:    { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  etc_list_todos:      { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  etc_toggle_todo:     { roles: ['admin', 'editor'], scopes: ['etf:read'] },
  etc_delete_todo:     { roles: ['admin'], scopes: ['etf:read'] },

  // Dashboard
  get_dashboard:     { roles: ['admin', 'editor', 'viewer'], scopes: ['dashboard:read'] },

  // Ryuha (류하 학습관리)
  ryuha_list_subjects:      { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_subject:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_subject:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_subject:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_textbooks:     { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_textbook:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_textbook:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_textbook:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_chapters:      { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_chapter:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_chapter:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_chapter:     { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_schedules:     { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_schedule:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_schedule:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_schedule:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_homework:      { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_homework:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_homework:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_homework:    { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_memos:         { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_upsert_memo:        { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_memo:        { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_list_body_records:  { roles: ['admin', 'editor', 'viewer'], scopes: ['ryuha:read'] },
  ryuha_create_body_record: { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_update_body_record: { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },
  ryuha_delete_body_record: { roles: ['admin', 'editor'], scopes: ['ryuha:write'] },

  // Willow Investment (윌로우 경영관리)
  willow_list_clients:          { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_create_client:         { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_update_client:         { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_client:         { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_projects:         { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_create_project:        { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_update_project:        { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_project:        { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_milestones:       { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_create_milestone:      { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_update_milestone:      { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_milestone:      { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_schedules:        { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_create_schedule:       { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_update_schedule:       { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_schedule:       { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_toggle_schedule_date:  { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_tasks:            { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_create_task:           { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_update_task:           { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_task:           { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_memos:            { roles: ['admin', 'editor', 'viewer'], scopes: ['willow:read'] },
  willow_upsert_memo:           { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_delete_memo:           { roles: ['admin', 'editor'], scopes: ['willow:write'] },
  willow_list_invoices:         { roles: ['admin', 'editor'], scopes: ['willow:read'] },
  willow_create_invoice:        { roles: ['admin'], scopes: ['willow:write'] },
  willow_update_invoice:        { roles: ['admin'], scopes: ['willow:write'] },
  willow_delete_invoice:        { roles: ['admin'], scopes: ['willow:write'] },

  // Tensoftworks (텐소프트웍스 경영관리)
  tensw_list_clients:          { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_create_client:         { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_update_client:         { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_client:         { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_projects:         { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_get_project:           { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_create_project:        { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_update_project:        { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_project:        { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_milestones:       { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_create_milestone:      { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_update_milestone:      { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_milestone:      { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_schedules:        { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_create_schedule:       { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_update_schedule:       { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_schedule:       { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_toggle_schedule_date:  { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_tasks:            { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_create_task:           { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_update_task:           { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_task:           { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_memos:            { roles: ['admin', 'editor', 'viewer'], scopes: ['tensw:read'] },
  tensw_upsert_memo:           { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_delete_memo:           { roles: ['admin', 'editor'], scopes: ['tensw:write'] },
  tensw_list_invoices:         { roles: ['admin', 'editor'], scopes: ['tensw:read'] },
  tensw_create_invoice:        { roles: ['admin'], scopes: ['tensw:write'] },
  tensw_update_invoice:        { roles: ['admin'], scopes: ['tensw:write'] },
  tensw_delete_invoice:        { roles: ['admin'], scopes: ['tensw:write'] },
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
        'ryuha:read', 'ryuha:write',
        'willow:read', 'willow:write',
        'tensw:read', 'tensw:write',
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
        'ryuha:read', 'ryuha:write',
        'willow:read', 'willow:write',
        'tensw:read', 'tensw:write',
      ]
    case 'viewer':
      return [
        'wiki:read',
        'projects:read',
        'schedules:read',
        'etf:read',
        'dashboard:read',
        'ryuha:read',
        'willow:read',
        'tensw:read',
      ]
    default:
      return ['wiki:read', 'projects:read']
  }
}
