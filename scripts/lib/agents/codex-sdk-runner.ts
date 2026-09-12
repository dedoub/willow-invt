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

/**
 * <b>이어받기가 깨진 오류인가.</b>
 *
 * 2026-09-12 실측: 6월에 만든 스레드를 이어받으려다
 * `thread/resume failed: paginated_threads is not supported yet (code -32601)` 로
 * 죽었다. 새로 만든 스레드는 멀쩡히 이어받아진다 — 오래된 스레드가 지금 깔린
 * codex 로는 열리지 않는 것이다.
 *
 * <b>이 오류만 골라낸다.</b> 아무 실패에나 물러서서 새 스레드로 다시 돌리면,
 * 이미 절반쯤 일한 턴을 한 번 더 시키게 된다(값도 두 번 나간다).
 */
export function isResumeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message.includes('thread/resume')
}

type SdkClient = InstanceType<CodexSdkModule['Codex']>

/**
 * 클라이언트를 <b>받아서</b> 돈다 — 시험이 가짜를 끼울 자리가 여기다.
 * 실제 실행은 아래 `codexSdkRunner.run` 이 진짜 클라이언트를 넘긴다.
 */
export async function runWithClient(
  sdkClient: SdkClient,
  prompt: string,
  opts?: AgentOptions,
): Promise<AgentRunResult> {
    const threadOptions: ThreadOptions = {
      workingDirectory: opts?.cwd || process.cwd(),
      sandboxMode: mapSandboxMode(opts?.sandbox),
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
      networkAccessEnabled: true,
      ...(opts?.model ? { model: opts.model } : {}),
      ...(opts?.effort ? { modelReasoningEffort: opts.effort } : {}),
    }

    let thread = opts?.threadId
      ? sdkClient.resumeThread(opts.threadId, threadOptions)
      : sdkClient.startThread(threadOptions)

    if (opts?.threadId) {
      try { opts.onThreadEvent?.({ threadId: opts.threadId, mode: 'resumed' }) } catch { /* ignore */ }
    }

    /**
     * <b>이어받기가 깨지면 새 스레드로 한 번 물러선다.</b>
     *
     * 죽은 thread id 는 파일에 적혀 있어서(`willy-agent-threads.json`), 물러설
     * 자리가 없으면 프로세스를 다시 띄워도 같은 id 를 또 집어 든다 — 그
     * 워크스페이스의 대화가 <b>영원히</b> 실패한다. 실제로 그랬다.
     *
     * <b>이벤트를 읽는 중에도 터진다.</b> 실측에서 이어받기 실패는 `runStreamed`
     * 가 무사히 반환한 <b>뒤</b> 첫 이벤트를 꺼낼 때 났다. `await` 만 감싸면
     * 고쳐 놓고도 안 걸린다.
     *
     * 맥락은 잃지만 대화는 산다. 새 id 를 돌려주므로 호출부가 죽은 id 를
     * 갈아 끼운다(`upsertAgentThread`).
     */
    const drain = async (target: typeof thread, announceStarted: boolean, counter: { count: number }) => {
      const streamed = await target.runStreamed(prompt, { signal: opts?.signal })
      let announced = announceStarted
      let text = ''
      let turnUsage: AgentRunResult['usage'] = null
      let failure: string | null = null
      let consumed = 0

      for await (const event of streamed.events) {
        consumed += 1
        counter.count += 1
        if (event.type === 'thread.started') {
          if (!announced) {
            announced = true
            try { opts?.onThreadEvent?.({ threadId: event.thread_id, mode: 'started' }) } catch { /* ignore */ }
          }
          continue
        }

        if (event.type === 'turn.failed') failure = event.error.message
        if (event.type === 'item.completed' && event.item.type === 'agent_message') text = event.item.text
        if (event.type === 'turn.completed') turnUsage = event.usage

        const mapped = mapThreadEvent(event)
        if (mapped) emitProgress(opts, mapped)
      }
      return { text, usage: turnUsage, failure, consumed }
    }

    /** 이미 이벤트를 받은 뒤에 깨졌다면 물러서지 않는다 — 일한 턴을 두 번 시킨다. */
    const consumedByFailedRun = { count: 0 }
    let outcome
    try {
      outcome = await drain(thread, Boolean(opts?.threadId), consumedByFailedRun)
    } catch (error) {
      if (!opts?.threadId || !isResumeFailure(error) || consumedByFailedRun.count > 0) throw error
      try { opts.onThreadEvent?.({ threadId: opts.threadId, mode: 'resume_failed' }) } catch { /* ignore */ }
      thread = sdkClient.startThread(threadOptions)
      outcome = await drain(thread, false, { count: 0 })
    }

    const finalResponse = outcome.text
    const usage = outcome.usage
    const failureMessage = outcome.failure

    if (failureMessage) throw new Error(failureMessage)

    return {
      text: finalResponse.trim(),
      backend: 'codex-sdk',
      threadId: thread.id,
      usage,
    }
}

export const codexSdkRunner: AgentRunner = {
  kind: 'sdk',
  async run(prompt: string, opts?: AgentOptions): Promise<AgentRunResult> {
    return runWithClient(await getSdkClient(), prompt, opts)
  },
}
