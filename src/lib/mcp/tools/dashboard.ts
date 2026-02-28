import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerDashboardTools(server: McpServer) {
  server.registerTool('get_dashboard', {
    description: '대시보드 요약 정보를 조회합니다 (프로젝트 현황, 최근 일정, 위키 요약)',
    inputSchema: z.object({}),
  }, async (_input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('get_dashboard', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()

    // Fetch dashboard data in parallel
    const [projectsRes, schedulesRes, wikiRes, invoicesRes] = await Promise.all([
      // Active projects count
      supabase
        .from('tensw_mgmt_projects')
        .select('id, name, status, client:tensw_mgmt_clients(name)')
        .eq('status', 'active'),

      // Upcoming schedules (next 7 days)
      supabase
        .from('tensw_mgmt_schedules')
        .select('id, title, schedule_date, type, is_completed')
        .gte('schedule_date', new Date().toISOString().split('T')[0])
        .lte('schedule_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .eq('is_completed', false)
        .order('schedule_date'),

      // Recent wiki notes
      supabase
        .from('work_wiki')
        .select('id, title, section, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5),

      // Recent invoices
      supabase
        .from('willow_invoices')
        .select('id, invoice_no, status, total_amount, currency')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const dashboard = {
      active_projects: projectsRes.data || [],
      upcoming_schedules: schedulesRes.data || [],
      recent_wiki_notes: wikiRes.data || [],
      recent_invoices: invoicesRes.data || [],
      summary: {
        active_project_count: (projectsRes.data || []).length,
        upcoming_schedule_count: (schedulesRes.data || []).length,
      },
    }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'get_dashboard' })
    return { content: [{ type: 'text' as const, text: JSON.stringify(dashboard, null, 2) }] }
  })
}
