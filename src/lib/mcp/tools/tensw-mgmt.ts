import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerTenswMgmtTools(server: McpServer) {
  // =============================================
  // 클라이언트 (Clients)
  // =============================================

  server.registerTool('tensw_list_clients', {
    description: '[텐소프트웍스 > 경영관리] 클라이언트 목록을 조회합니다',
    inputSchema: z.object({}),
  }, async (_input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_clients', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .select('*')
      .order('order_index')

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_clients' })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_create_client', {
    description: '[텐소프트웍스 > 경영관리] 클라이언트를 생성합니다',
    inputSchema: z.object({
      name: z.string().describe('클라이언트명'),
      color: z.string().optional().describe('색상 코드 (예: #3B82F6)'),
      icon: z.string().optional().describe('아이콘명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_client', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_client', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_update_client', {
    description: '[텐소프트웍스 > 경영관리] 클라이언트를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('클라이언트 ID'),
      name: z.string().optional().describe('클라이언트명'),
      color: z.string().optional().describe('색상 코드'),
      icon: z.string().optional().describe('아이콘명'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_client', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_client', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_client', {
    description: '[텐소프트웍스 > 경영관리] 클라이언트를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('클라이언트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_client', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_clients')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_client', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 프로젝트 (Projects)
  // =============================================

  server.registerTool('tensw_list_projects', {
    description: '[텐소프트웍스 > 경영관리] 프로젝트 목록을 조회합니다',
    inputSchema: z.object({
      client_id: z.string().optional().describe('클라이언트 ID로 필터'),
    }),
  }, async ({ client_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_projects', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_projects')
      .select('*, client:tensw_mgmt_clients(*), milestones:tensw_mgmt_milestones(count)')
      .order('order_index')

    if (client_id) query = query.eq('client_id', client_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_projects', inputParams: { client_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_get_project', {
    description: '[텐소프트웍스 > 경영관리] 프로젝트 상세 정보를 조회합니다',
    inputSchema: z.object({
      id: z.string().describe('프로젝트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_get_project', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_projects')
      .select('*, client:tensw_mgmt_clients(*), milestones:tensw_mgmt_milestones(*)')
      .eq('id', id)
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_get_project', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_create_project', {
    description: '[텐소프트웍스 > 경영관리] 프로젝트를 생성합니다',
    inputSchema: z.object({
      client_id: z.string().describe('클라이언트 ID'),
      name: z.string().describe('프로젝트명'),
      description: z.string().optional().describe('설명'),
      status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).optional().describe('상태'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_project', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_projects')
      .insert(input)
      .select('*, client:tensw_mgmt_clients(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_project', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_update_project', {
    description: '[텐소프트웍스 > 경영관리] 프로젝트를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('프로젝트 ID'),
      name: z.string().optional().describe('프로젝트명'),
      description: z.string().optional().describe('설명'),
      status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).optional().describe('상태'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_project', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_projects')
      .update(updates)
      .eq('id', id)
      .select('*, client:tensw_mgmt_clients(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_project', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_project', {
    description: '[텐소프트웍스 > 경영관리] 프로젝트를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('프로젝트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_project', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_projects')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_project', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 마일스톤 (Milestones)
  // =============================================

  server.registerTool('tensw_list_milestones', {
    description: '[텐소프트웍스 > 경영관리] 마일스톤 목록을 조회합니다',
    inputSchema: z.object({
      project_id: z.string().optional().describe('프로젝트 ID로 필터'),
    }),
  }, async ({ project_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_milestones', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_milestones')
      .select('*, project:tensw_mgmt_projects(*, client:tensw_mgmt_clients(*))')
      .order('order_index')

    if (project_id) query = query.eq('project_id', project_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_milestones', inputParams: { project_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_create_milestone', {
    description: '[텐소프트웍스 > 경영관리] 마일스톤을 생성합니다',
    inputSchema: z.object({
      project_id: z.string().describe('프로젝트 ID'),
      name: z.string().describe('마일스톤명'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
      status: z.enum(['pending', 'in_progress', 'review_pending', 'completed']).optional().describe('상태'),
      target_date: z.string().optional().describe('목표일 (YYYY-MM-DD)'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_milestone', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_milestones')
      .insert(input)
      .select('*, project:tensw_mgmt_projects(*, client:tensw_mgmt_clients(*))')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_milestone', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_update_milestone', {
    description: '[텐소프트웍스 > 경영관리] 마일스톤을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('마일스톤 ID'),
      name: z.string().optional().describe('마일스톤명'),
      description: z.string().optional().describe('설명'),
      order_index: z.number().optional().describe('정렬 순서'),
      status: z.enum(['pending', 'in_progress', 'review_pending', 'completed']).optional().describe('상태'),
      target_date: z.string().optional().describe('목표일 (YYYY-MM-DD)'),
      review_completed: z.boolean().optional().describe('리뷰 완료 여부'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_milestone', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const updateData: Record<string, unknown> = { ...updates }
    if (updates.status === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_milestones')
      .update(updateData)
      .eq('id', id)
      .select('*, project:tensw_mgmt_projects(*, client:tensw_mgmt_clients(*))')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_milestone', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_milestone', {
    description: '[텐소프트웍스 > 경영관리] 마일스톤을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('마일스톤 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_milestone', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_milestones')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_milestone', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 스케줄 (Schedules)
  // =============================================

  server.registerTool('tensw_list_schedules', {
    description: '[텐소프트웍스 > 경영관리] 스케줄 목록을 조회합니다',
    inputSchema: z.object({
      start_date: z.string().optional().describe('시작일 필터 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 필터 (YYYY-MM-DD)'),
      client_id: z.string().optional().describe('클라이언트 ID로 필터'),
    }),
  }, async ({ start_date, end_date, client_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_schedules', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_schedules')
      .select('*, client:tensw_mgmt_clients(*), milestone:tensw_mgmt_milestones(*, project:tensw_mgmt_projects(*)), tasks:tensw_mgmt_tasks(*)')
      .order('schedule_date')
      .order('start_time')

    if (start_date) query = query.gte('schedule_date', start_date)
    if (end_date) query = query.lte('schedule_date', end_date)
    if (client_id) query = query.eq('client_id', client_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    // Fetch milestones for milestone_ids arrays
    const allMilestoneIds = new Set<string>()
    for (const schedule of data || []) {
      if (schedule.milestone_ids?.length > 0) {
        schedule.milestone_ids.forEach((id: string) => allMilestoneIds.add(id))
      }
    }

    let milestonesMap: Record<string, unknown> = {}
    if (allMilestoneIds.size > 0) {
      const { data: milestones } = await supabase
        .from('tensw_mgmt_milestones')
        .select('*, project:tensw_mgmt_projects(*, client:tensw_mgmt_clients(*))')
        .in('id', Array.from(allMilestoneIds))

      if (milestones) {
        milestonesMap = Object.fromEntries(milestones.map(m => [m.id, m]))
      }
    }

    const schedulesWithMilestones = (data || []).map(schedule => ({
      ...schedule,
      milestones: schedule.milestone_ids?.length > 0
        ? schedule.milestone_ids.map((id: string) => milestonesMap[id]).filter(Boolean)
        : [],
    }))

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_schedules', inputParams: { start_date, end_date, client_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(schedulesWithMilestones, null, 2) }] }
  })

  server.registerTool('tensw_create_schedule', {
    description: '[텐소프트웍스 > 경영관리] 스케줄을 생성합니다',
    inputSchema: z.object({
      title: z.string().describe('스케줄 제목'),
      schedule_date: z.string().describe('날짜 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 (YYYY-MM-DD)'),
      start_time: z.string().optional().describe('시작 시간 (HH:MM)'),
      end_time: z.string().optional().describe('종료 시간 (HH:MM)'),
      type: z.enum(['task', 'meeting', 'deadline']).optional().describe('유형'),
      client_id: z.string().optional().describe('클라이언트 ID'),
      milestone_id: z.string().optional().describe('마일스톤 ID'),
      milestone_ids: z.array(z.string()).optional().describe('마일스톤 ID 배열'),
      description: z.string().optional().describe('설명'),
      color: z.string().optional().describe('색상 코드'),
      task_content: z.string().optional().describe('태스크 내용'),
      task_deadline: z.string().optional().describe('태스크 마감일'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_schedules')
      .insert(input)
      .select('*, client:tensw_mgmt_clients(*), milestone:tensw_mgmt_milestones(*, project:tensw_mgmt_projects(*)), tasks:tensw_mgmt_tasks(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_schedule', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_update_schedule', {
    description: '[텐소프트웍스 > 경영관리] 스케줄을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('스케줄 ID'),
      title: z.string().optional().describe('제목'),
      schedule_date: z.string().optional().describe('날짜 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 (YYYY-MM-DD)'),
      start_time: z.string().optional().describe('시작 시간 (HH:MM)'),
      end_time: z.string().optional().describe('종료 시간 (HH:MM)'),
      type: z.enum(['task', 'meeting', 'deadline']).optional().describe('유형'),
      client_id: z.string().optional().describe('클라이언트 ID'),
      milestone_id: z.string().optional().describe('마일스톤 ID'),
      milestone_ids: z.array(z.string()).optional().describe('마일스톤 ID 배열'),
      description: z.string().optional().describe('설명'),
      color: z.string().optional().describe('색상 코드'),
      is_completed: z.boolean().optional().describe('완료 여부'),
      task_content: z.string().optional().describe('태스크 내용'),
      task_deadline: z.string().optional().describe('태스크 마감일'),
      task_completed: z.boolean().optional().describe('태스크 완료 여부'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_schedules')
      .update(updates)
      .eq('id', id)
      .select('*, client:tensw_mgmt_clients(*), milestone:tensw_mgmt_milestones(*, project:tensw_mgmt_projects(*)), tasks:tensw_mgmt_tasks(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_schedule', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_schedule', {
    description: '[텐소프트웍스 > 경영관리] 스케줄을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('스케줄 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_schedule', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_schedules')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_schedule', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  server.registerTool('tensw_toggle_schedule_date', {
    description: '[텐소프트웍스 > 경영관리] 멀티데이 스케줄의 특정 날짜 완료 상태를 토글합니다',
    inputSchema: z.object({
      schedule_id: z.string().describe('스케줄 ID'),
      date: z.string().describe('토글할 날짜 (YYYY-MM-DD)'),
    }),
  }, async ({ schedule_id, date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_toggle_schedule_date', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    const { data: schedule, error: fetchError } = await supabase
      .from('tensw_mgmt_schedules')
      .select('completed_dates, schedule_date, end_date')
      .eq('id', schedule_id)
      .single()

    if (fetchError) return { content: [{ type: 'text' as const, text: `Error: ${fetchError.message}` }], isError: true }

    const completedDates: string[] = schedule.completed_dates || []
    const isCompleted = completedDates.includes(date)

    const newCompletedDates = isCompleted
      ? completedDates.filter((d: string) => d !== date)
      : [...completedDates, date]

    const startDate = new Date(schedule.schedule_date)
    const endDate = schedule.end_date ? new Date(schedule.end_date) : startDate
    const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const allCompleted = newCompletedDates.length >= totalDays

    const { data, error } = await supabase
      .from('tensw_mgmt_schedules')
      .update({
        completed_dates: newCompletedDates,
        is_completed: allCompleted,
      })
      .eq('id', schedule_id)
      .select('*, client:tensw_mgmt_clients(*), milestone:tensw_mgmt_milestones(*, project:tensw_mgmt_projects(*)), tasks:tensw_mgmt_tasks(*)')
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_toggle_schedule_date', inputParams: { schedule_id, date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  // =============================================
  // 태스크 (Tasks)
  // =============================================

  server.registerTool('tensw_list_tasks', {
    description: '[텐소프트웍스 > 경영관리] 태스크 목록을 조회합니다',
    inputSchema: z.object({
      schedule_id: z.string().optional().describe('스케줄 ID로 필터'),
    }),
  }, async ({ schedule_id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_tasks', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_tasks')
      .select('*')
      .order('deadline')
      .order('order_index')

    if (schedule_id) query = query.eq('schedule_id', schedule_id)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_tasks', inputParams: { schedule_id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_create_task', {
    description: '[텐소프트웍스 > 경영관리] 태스크를 생성합니다',
    inputSchema: z.object({
      schedule_id: z.string().describe('스케줄 ID'),
      content: z.string().describe('태스크 내용'),
      deadline: z.string().optional().describe('마감일 (YYYY-MM-DD)'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_task', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_tasks')
      .insert(input)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_task', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_update_task', {
    description: '[텐소프트웍스 > 경영관리] 태스크를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('태스크 ID'),
      content: z.string().optional().describe('태스크 내용'),
      deadline: z.string().optional().describe('마감일 (YYYY-MM-DD)'),
      is_completed: z.boolean().optional().describe('완료 여부'),
      order_index: z.number().optional().describe('정렬 순서'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_task', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const updateData: Record<string, unknown> = { ...updates }
    if (updates.is_completed !== undefined) {
      updateData.completed_at = updates.is_completed ? new Date().toISOString() : null
    }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_task', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_task', {
    description: '[텐소프트웍스 > 경영관리] 태스크를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('태스크 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_task', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_tasks')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_task', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })

  // =============================================
  // 메모 (Daily Memos)
  // =============================================

  server.registerTool('tensw_list_memos', {
    description: '[텐소프트웍스 > 경영관리] 일일 메모 목록을 조회합니다',
    inputSchema: z.object({
      start_date: z.string().optional().describe('시작일 필터 (YYYY-MM-DD)'),
      end_date: z.string().optional().describe('종료일 필터 (YYYY-MM-DD)'),
    }),
  }, async ({ start_date, end_date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_memos', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_mgmt_daily_memos')
      .select('*')
      .order('memo_date')

    if (start_date) query = query.gte('memo_date', start_date)
    if (end_date) query = query.lte('memo_date', end_date)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_memos', inputParams: { start_date, end_date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_upsert_memo', {
    description: '[텐소프트웍스 > 경영관리] 일일 메모를 생성하거나 수정합니다 (날짜 기준 upsert)',
    inputSchema: z.object({
      memo_date: z.string().describe('메모 날짜 (YYYY-MM-DD)'),
      content: z.string().describe('메모 내용'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_upsert_memo', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .upsert(
        { memo_date: input.memo_date, content: input.content },
        { onConflict: 'memo_date' }
      )
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_upsert_memo', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('tensw_delete_memo', {
    description: '[텐소프트웍스 > 경영관리] 일일 메모를 삭제합니다',
    inputSchema: z.object({
      date: z.string().describe('메모 날짜 (YYYY-MM-DD)'),
    }),
  }, async ({ date }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_memo', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_mgmt_daily_memos')
      .delete()
      .eq('memo_date', date)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_memo', inputParams: { date } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_date: date }) }] }
  })

  // =============================================
  // 인보이스/현금관리 (Invoices/Cash Management)
  // =============================================

  server.registerTool('tensw_list_invoices', {
    description: '[텐소프트웍스 > 경영관리] 인보이스/현금관리 목록을 조회합니다',
    inputSchema: z.object({
      type: z.enum(['revenue', 'expense', 'asset', 'liability']).optional().describe('유형 필터 (수입/지출/자산/부채)'),
      status: z.enum(['issued', 'completed']).optional().describe('상태 필터'),
    }),
  }, async ({ type, status }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_list_invoices', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('tensw_invoices')
      .select('*')
      .order('created_at', { ascending: false })

    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    const invoices = (data || []).map(inv => ({
      ...inv,
      amount: Number(inv.amount),
    }))

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_list_invoices', inputParams: { type, status } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(invoices, null, 2) }] }
  })

  server.registerTool('tensw_create_invoice', {
    description: '[텐소프트웍스 > 경영관리] 인보이스/현금관리 항목을 생성합니다',
    inputSchema: z.object({
      type: z.enum(['revenue', 'expense', 'asset', 'liability']).describe('유형 (revenue=수입, expense=지출, asset=자산, liability=부채)'),
      counterparty: z.string().describe('거래처'),
      amount: z.number().describe('금액'),
      description: z.string().optional().describe('설명'),
      issue_date: z.string().optional().describe('세금계산서 발행일 (YYYY-MM-DD)'),
      payment_date: z.string().optional().describe('입금일/지급일 (YYYY-MM-DD)'),
      status: z.enum(['issued', 'completed']).optional().describe('상태 (기본: issued)'),
      notes: z.string().optional().describe('비고'),
      account_number: z.string().optional().describe('계좌번호'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_create_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_invoices')
      .insert({
        type: input.type,
        counterparty: input.counterparty,
        amount: input.amount,
        description: input.description || null,
        issue_date: input.issue_date || null,
        payment_date: input.payment_date || null,
        status: input.status || 'issued',
        attachments: [],
        notes: input.notes || null,
        account_number: input.account_number || null,
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_create_invoice', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ...data, amount: Number(data.amount) }, null, 2) }] }
  })

  server.registerTool('tensw_update_invoice', {
    description: '[텐소프트웍스 > 경영관리] 인보이스/현금관리 항목을 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('인보이스 ID'),
      type: z.enum(['revenue', 'expense', 'asset', 'liability']).optional().describe('유형'),
      counterparty: z.string().optional().describe('거래처'),
      amount: z.number().optional().describe('금액'),
      description: z.string().optional().describe('설명'),
      issue_date: z.string().optional().describe('세금계산서 발행일 (YYYY-MM-DD)'),
      payment_date: z.string().optional().describe('입금일/지급일 (YYYY-MM-DD)'),
      status: z.enum(['issued', 'completed']).optional().describe('상태'),
      notes: z.string().optional().describe('비고'),
      account_number: z.string().optional().describe('계좌번호'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_update_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('tensw_invoices')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_update_invoice', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ...data, amount: Number(data.amount) }, null, 2) }] }
  })

  server.registerTool('tensw_delete_invoice', {
    description: '[텐소프트웍스 > 경영관리] 인보이스/현금관리 항목을 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('인보이스 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('tensw_delete_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('tensw_invoices')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'tensw_delete_invoice', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })
}
