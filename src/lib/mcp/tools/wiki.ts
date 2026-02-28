import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerWikiTools(server: McpServer) {
  server.registerTool('list_wiki_notes', {
    description: '[업무위키] 위키 노트 목록을 조회합니다 (section 파라미터로 페이지별 구분)',
    inputSchema: z.object({
      section: z.string().optional().describe('섹션: akros | etf-etc | willow-mgmt | tensw-mgmt (기본: etf-etc)'),
    }),
  }, async ({ section }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('list_wiki_notes', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('work_wiki')
      .select('id, title, content, category, section, is_pinned, attachments, created_at, updated_at')
      .eq('section', section || 'etf-etc')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'list_wiki_notes', inputParams: { section } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('get_wiki_note', {
    description: '[업무위키] 위키 노트 상세 내용을 조회합니다',
    inputSchema: z.object({
      id: z.string().describe('위키 노트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_wiki_note', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('work_wiki')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_wiki_note', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('create_wiki_note', {
    description: '[업무위키] 새 위키 노트를 생성합니다',
    inputSchema: z.object({
      title: z.string().describe('노트 제목'),
      content: z.string().optional().describe('노트 내용'),
      section: z.string().optional().describe('섹션: akros | etf-etc | willow-mgmt | tensw-mgmt (기본: etf-etc)'),
      category: z.string().optional().describe('카테고리'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('create_wiki_note', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('work_wiki')
      .insert({
        user_id: user.email,
        title: input.title,
        content: input.content || '',
        section: input.section || 'etf-etc',
        category: input.category || null,
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'create_wiki_note', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('update_wiki_note', {
    description: '[업무위키] 위키 노트를 수정합니다',
    inputSchema: z.object({
      id: z.string().describe('위키 노트 ID'),
      title: z.string().optional().describe('제목'),
      content: z.string().optional().describe('내용'),
      category: z.string().optional().describe('카테고리'),
      is_pinned: z.boolean().optional().describe('고정 여부'),
    }),
  }, async ({ id, ...updates }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('update_wiki_note', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('work_wiki')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'update_wiki_note', inputParams: { id, ...updates } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('delete_wiki_note', {
    description: '[업무위키] 위키 노트를 삭제합니다',
    inputSchema: z.object({
      id: z.string().describe('위키 노트 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('delete_wiki_note', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from('work_wiki')
      .delete()
      .eq('id', id)

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'delete_wiki_note', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted_id: id }) }] }
  })
}
