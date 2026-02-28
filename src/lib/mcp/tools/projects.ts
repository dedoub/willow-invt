import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerProjectTools(server: McpServer) {
  server.registerTool('list_clients', {
    description: 'Tensoftworks 클라이언트 목록을 조회합니다',
    inputSchema: z.object({}),
  }, async (_input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_clients', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .select('*')
      .order('order_index')

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_clients' })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('list_projects', {
    description: '프로젝트 목록을 조회합니다 (클라이언트별 필터 가능)',
    inputSchema: z.object({
      client_id: z.string().optional().describe('클라이언트 ID로 필터'),
    }),
  }, async ({ client_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_projects', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_projects')
      .select('*, client:tensw_mgmt_clients(id, name, color, icon)')
      .order('order_index')

    if (client_id) {
      query = query.eq('client_id', client_id)
    }

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_projects', inputParams: { client_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('get_project', {
    description: '프로젝트 상세 정보를 마일스톤과 함께 조회합니다',
    inputSchema: z.object({
      id: z.string().describe('프로젝트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_project', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_projects')
      .select('*, client:tensw_mgmt_clients(*), milestones:tensw_mgmt_milestones(*)')
      .eq('id', id)
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_project', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('list_milestones', {
    description: '프로젝트 마일스톤 목록을 조회합니다',
    inputSchema: z.object({
      project_id: z.string().describe('프로젝트 ID'),
    }),
  }, async ({ project_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_milestones', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_milestones')
      .select('*')
      .eq('project_id', project_id)
      .order('order_index')

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_milestones', inputParams: { project_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('list_schedules', {
    description: '일정/스케줄 목록을 조회합니다',
    inputSchema: z.object({
      type: z.string().optional().describe('일정 유형 필터 (task, meeting, deadline)'),
    }),
  }, async ({ type }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_schedules', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_schedules')
      .select('*, tasks:tensw_mgmt_tasks(*)')
      .order('schedule_date', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_schedules', inputParams: { type } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('list_tasks', {
    description: '태스크 목록을 조회합니다',
    inputSchema: z.object({
      schedule_id: z.string().optional().describe('스케줄 ID로 필터'),
    }),
  }, async ({ schedule_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_tasks', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_tasks')
      .select('*')
      .order('order_index')

    if (schedule_id) {
      query = query.eq('schedule_id', schedule_id)
    }

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_tasks', inputParams: { schedule_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })
}
