import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getUserFromAuthInfo } from '../auth'
import { checkToolPermission } from '../permissions'
import { logMcpAction } from '../audit'
import { getServiceSupabase } from '@/lib/supabase'

export function registerInvoiceTools(server: McpServer) {
  server.registerTool('etc_list_invoices', {
    description: '[ETF/Etc] 인보이스 목록을 조회합니다 (willow_invoices)',
    inputSchema: z.object({
      status: z.string().optional().describe('상태 필터 (draft, sent, paid, overdue, cancelled)'),
      limit: z.number().optional().describe('조회 수 (기본: 50)'),
    }),
  }, async ({ status, limit }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('etc_list_invoices', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    let query = supabase
      .from('willow_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit || 50)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'etc_list_invoices', inputParams: { status, limit } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('etc_get_invoice', {
    description: '[ETF/Etc] 인보이스 상세 정보를 조회합니다',
    inputSchema: z.object({
      id: z.string().describe('인보이스 ID'),
    }),
  }, async ({ id }, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('etc_get_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('willow_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'etc_get_invoice', inputParams: { id } })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })

  server.registerTool('etc_create_invoice', {
    description: '[ETF/Etc] 새 인보이스를 생성합니다',
    inputSchema: z.object({
      invoice_date: z.string().describe('인보이스 날짜 (YYYY-MM-DD)'),
      bill_to_company: z.string().optional().describe('수신 회사명'),
      attention: z.string().optional().describe('담당자'),
      line_items: z.array(z.object({
        description: z.string(),
        qty: z.number().optional(),
        unitPrice: z.number().optional(),
        amount: z.number(),
      })).describe('항목 목록'),
      notes: z.string().optional().describe('비고'),
    }),
  }, async (input, { authInfo }) => {
    const user = getUserFromAuthInfo(authInfo)
    if (!user) return { content: [{ type: 'text' as const, text: 'Unauthorized' }], isError: true }

    const perm = checkToolPermission('etc_create_invoice', user, authInfo?.scopes || [])
    if (!perm.allowed) return { content: [{ type: 'text' as const, text: perm.reason! }], isError: true }

    const totalAmount = input.line_items.reduce((sum, item) => sum + (item.amount || 0), 0)

    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('willow_invoices')
      .insert({
        user_id: user.userId,
        invoice_date: input.invoice_date,
        bill_to_company: input.bill_to_company || 'Exchange Traded Concepts, LLC',
        attention: input.attention || 'Garrett Stevens',
        line_items: input.line_items,
        total_amount: totalAmount,
        currency: 'USD',
        status: 'draft',
        notes: input.notes,
      })
      .select()
      .single()

    if (error) return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true }

    await logMcpAction({ userId: user.userId, action: 'tool_call', toolName: 'etc_create_invoice', inputParams: input })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  })
}
