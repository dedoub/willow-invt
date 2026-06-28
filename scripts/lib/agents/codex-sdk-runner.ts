import type { ThreadEvent, ThreadItem, ThreadOptions } from '@openai/codex-sdk'
import type { AgentOptions, AgentRunResult, AgentRunner, CodexProgress } from './runner-types'

type CodexSdkModule = typeof import('@openai/codex-sdk')

let sdkClientPromise: Promise<InstanceType<CodexSdkModule['Codex']>> | null = null

async function getSdkClient(): Promise<InstanceType<CodexSdkModule['Codex']>> {
  if (!sdkClientPromise) {
    sdkClientPromise = import('@openai/codex-sdk').then(({ Codex }) => new Codex())
  }
  return sdkClientPromise
}

function mapSandboxMode(mode?: AgentOptions['sandbox']): ThreadOptions['sandboxMode'] {
  return mode ?? 'danger-full-access'
}

function emitProgress(opts: AgentOptions | undefined, progress: CodexProgress) {
  if (!opts?.onProgress) return
  try { opts.onProgress(progress) } catch { /* ignore */ }
}

function itemFiles(item: ThreadItem): string[] | undefined {
  if (item.type !== 'file_change') return undefined
  return item.changes.map(change => change.path)
}

function mapItemText(item: ThreadItem): string | undefined {
  switch (item.type) {
    case 'agent_message':
    case 'reasoning':
      return item.text
    case 'web_search':
      return item.query
    case 'mcp_tool_call':
      return `${item.server}.${item.tool}`
    default:
      return undefined
  }
}

function mapItemCommand(item: ThreadItem): string | undefined {
  return item.type === 'command_execution' ? item.command : undefined
}

function mapItemStatus(item: ThreadItem): string | undefined {
  switch (item.type) {
    case 'command_execution':
    case 'mcp_tool_call':
    case 'file_change':
      return item.status
    default:
      return undefined
  }
}

function mapThreadEvent(event: ThreadEvent): CodexProgress | null {
  if (event.type === 'turn.started') return { phase: 'turn_started' }
  if (event.type === 'turn.completed') return { phase: 'turn_completed', usage: event.usage }
  if (event.type === 'item.started' || event.type === 'item.completed') {
    return {
      phase: event.type === 'item.started' ? 'item_started' : 'item_completed',
      itemType: event.item.type,
      text: mapItemText(event.item),
      command: mapItemCommand(event.item),
      status: mapItemStatus(event.item),
      files: itemFiles(event.item),
    }
  }
  return null
}

export const codexSdkRunner: AgentRunner = {
  kind: 'sdk',
  async run(prompt: string, opts?: AgentOptions): Promise<AgentRunResult> {
    const sdkClient = await getSdkClient()
    const threadOptions: ThreadOptions = {
      workingDirectory: opts?.cwd || process.cwd(),
      sandboxMode: mapSandboxMode(opts?.sandbox),
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
      networkAccessEnabled: true,
      ...(opts?.model ? { model: opts.model } : {}),
    }

    const thread = opts?.threadId
      ? sdkClient.resumeThread(opts.threadId, threadOptions)
      : sdkClient.startThread(threadOptions)

    if (opts?.threadId) {
      try { opts.onThreadEvent?.({ threadId: opts.threadId, mode: 'resumed' }) } catch { /* ignore */ }
    }

    const streamed = await thread.runStreamed(prompt, { signal: opts?.signal })
    let finalResponse = ''
    let usage: AgentRunResult['usage'] = null
    let announcedThread = Boolean(opts?.threadId)
    let failureMessage: string | null = null

    for await (const event of streamed.events) {
      if (event.type === 'thread.started') {
        if (!announcedThread) {
          announcedThread = true
          try { opts?.onThreadEvent?.({ threadId: event.thread_id, mode: 'started' }) } catch { /* ignore */ }
        }
        continue
      }

      if (event.type === 'turn.failed') failureMessage = event.error.message
      if (event.type === 'item.completed' && event.item.type === 'agent_message') finalResponse = event.item.text
      if (event.type === 'turn.completed') usage = event.usage

      const mapped = mapThreadEvent(event)
      if (mapped) emitProgress(opts, mapped)
    }

    if (failureMessage) throw new Error(failureMessage)

    return {
      text: finalResponse.trim(),
      backend: 'codex-sdk',
      threadId: thread.id,
      usage,
    }
  },
}
