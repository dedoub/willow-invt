import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
type Variables = Record<string, string | string[]>
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js'
import { getUserFromAuthInfo } from '../auth'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>

export function registerAllResources(server: McpServer) {
  // Wiki notes list (static resource)
  server.registerResource('wiki-notes', 'willow://wiki/notes', {
    description: '위키 노트 목록',
    mimeType: 'application/json',
  }, async (_uri: URL, extra: Extra) => {
    const user = getUserFromAuthInfo(extra.authInfo)
    if (!user) return { contents: [{ uri: 'willow://wiki/notes', text: '[]' }] }

    const supabase = getServiceSupabase()
    const { data } = await supabase
      .from('work_wiki')
      .select('id, title, section, category, is_pinned, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50)

    await logMcpAction({ userId: user.userId, action: 'resource_read', resourceUri: 'willow://wiki/notes' })
    return { contents: [{ uri: 'willow://wiki/notes', text: JSON.stringify(data || [], null, 2) }] }
  })

  // User profile (static resource)
  server.registerResource('user-profile', 'willow://users/me', {
    description: '현재 사용자 프로필 및 권한',
    mimeType: 'application/json',
  }, async (_uri: URL, extra: Extra) => {
    const user = getUserFromAuthInfo(extra.authInfo)
    if (!user) return { contents: [{ uri: 'willow://users/me', text: 'Unauthorized' }] }

    const supabase = getServiceSupabase()
    const { data: profile } = await supabase
      .from('willow_users')
      .select('id, email, name, role, is_active, last_login_at')
      .eq('id', user.userId)
      .single()

    await logMcpAction({ userId: user.userId, action: 'resource_read', resourceUri: 'willow://users/me' })
    return {
      contents: [{
        uri: 'willow://users/me',
        text: JSON.stringify({
          ...profile,
          scopes: extra.authInfo?.scopes || [],
        }, null, 2),
      }],
    }
  })

  // Projects by section (template resource)
  server.registerResource('projects-by-section', new ResourceTemplate('willow://projects/{section}', { list: undefined }), {
    description: '섹션별 프로젝트 목록 (tensw, willow 등)',
    mimeType: 'application/json',
  }, async (uri: URL, variables: Variables, extra: Extra) => {
    const user = getUserFromAuthInfo(extra.authInfo)
    if (!user) return { contents: [{ uri: uri.href, text: '[]' }] }

    const section = Array.isArray(variables.section) ? variables.section[0] : variables.section
    const supabase = getServiceSupabase()

    const tableName = section === 'willow' ? 'willow_mgmt_projects' : 'tensw_mgmt_projects'
    const { data } = await supabase
      .from(tableName)
      .select('*')
      .order('order_index')

    await logMcpAction({ userId: user.userId, action: 'resource_read', resourceUri: uri.href })
    return { contents: [{ uri: uri.href, text: JSON.stringify(data || [], null, 2) }] }
  })
}
