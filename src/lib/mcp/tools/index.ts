import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerWikiTools } from './wiki'
import { registerProjectTools } from './projects'
import { registerInvoiceTools } from './invoices'
import { registerEtfTools } from './etf'
import { registerDashboardTools } from './dashboard'
import { registerRyuhaTools } from './ryuha'
import { registerWillowMgmtTools } from './willow-mgmt'
import { registerTenswMgmtTools } from './tensw-mgmt'

export function registerAllTools(server: McpServer) {
  registerWikiTools(server)
  registerProjectTools(server)
  registerInvoiceTools(server)
  registerEtfTools(server)
  registerDashboardTools(server)
  registerRyuhaTools(server)
  registerWillowMgmtTools(server)
  registerTenswMgmtTools(server)
}
