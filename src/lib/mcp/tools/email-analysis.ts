import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

/**
 * Register email analysis & todo tools for a specific context (akros/etc).
 */
function registerContextTools(
  server: McpServer,
  prefix: 'akros' | 'etc',
  defaultLabel: string,
  description: string,
) {
  const toolNames = {
    getAnalysis: `${prefix}_get_analysis`,
    listTodos: `${prefix}_list_todos`,
    toggleTodo: `${prefix}_toggle_todo`,
    deleteTodo: `${prefix}_delete_todo`,
  }

  // GET Analysis + Todos
  server.registerTool(toolNames.getAnalysis, {
    description: `[${description}] 이메일 AI 분석 결과와 후속조치(TODO) 목록을 조회합니다`,
    inputSchema: z.object({
      label: z.string().optional().describe(`Gmail 라벨 (기본: ${defaultLabel})`),
    }),
  }, async ({ label }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission(toolNames.getAnalysis, user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const effectiveLabel = label || defaultLabel

    const [analysisRes, todosRes] = await Promise.all([
      supabase
        .from('email_analysis')
        .select('*')
        .eq('user_id', user.email)
        .eq('label', effectiveLabel)
        .maybeSingle(),
      supabase
        .from('email_todos')
        .select('*')
        .eq('user_id', user.email)
        .eq('label', effectiveLabel)
        .order('created_at', { ascending: false }),
    ])

    if (analysisRes.error) return { content: [{ type: 'text' as const, text: `Error: ${analysisRes.error.message}` }], isError: true }

    const result = {
      analysis: analysisRes.data || null,
      todos: todosRes.data || [],
      summary: {
        total: (todosRes.data || []).length,
        completed: (todosRes.data || []).filter((t: { completed: boolean }) => t.completed).length,
        pending: (todosRes.data || []).filter((t: { completed: boolean }) => !t.completed).length,
      },
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: toolNames.getAnalysis, inputParams: { label: effectiveLabel } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  })

  // List Todos
  server.registerTool(toolNames.listTodos, {
    description: `[${description}] 이메일 후속조치(TODO) 목록을 조회합니다`,
    inputSchema: z.object({
      label: z.string().optional().describe(`Gmail 라벨 (기본: ${defaultLabel})`),
      completed: z.boolean().optional().describe('완료 여부 필터 (미지정시 전체)'),
    }),
  }, async ({ label, completed }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission(toolNames.listTodos, user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const effectiveLabel = label || defaultLabel

    let query = supabase
      .from('email_todos')
      .select('*')
      .eq('user_id', user.email)
      .eq('label', effectiveLabel)
      .order('created_at', { ascending: false })

    if (completed !== undefined) {
      query = query.eq('completed', completed)
    }

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: toolNames.listTodos, inputParams: { label: effectiveLabel, completed } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  // Toggle Todo
  server.registerTool(toolNames.toggleTodo, {
    description: `[${description}] 이메일 후속조치(TODO)의 완료 상태를 변경합니다`,
    inputSchema: z.object({
      id: z.string().describe('TODO ID'),
      completed: z.boolean().describe('완료 여부'),
    }),
  }, async ({ id, completed }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission(toolNames.toggleTodo, user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('email_todos')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('user_id', user.email)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }
    if (!data) return { content: [{ type: 'text' as const, text: 'Todo not found' }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: toolNames.toggleTodo, inputParams: { id, completed } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  // Delete Todo
  server.registerTool(toolNames.deleteTodo, {
    description: `[${description}] 이메일 후속조치(TODO)를 삭제합니다`,
    inputSchema: z.object({
      id: z.string().describe('TODO ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission(toolNames.deleteTodo, user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('email_todos')
      .delete()
      .eq('id', id)
      .eq('user_id', user.email)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: toolNames.deleteTodo, inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })
}

export function registerEmailAnalysisTools(server: McpServer) {
  registerContextTools(server, 'akros', 'Akros', 'Akros')
  registerContextTools(server, 'etc', 'ETC', 'ETF/Etc')
}
