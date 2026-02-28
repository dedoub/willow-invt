import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAllTools } from './tools'
import { registerAllResources } from './resources'

/**
 * Creates a fresh McpServer per request.
 * In serverless (Vercel), each request needs its own server+transport pair
 * because McpServer.connect() can only be called once per instance.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'willow-dashboard',
    version: '1.0.0',
  })

  registerAllTools(server)
  registerAllResources(server)

  return server
}
