import { AgentAbortError, codexCliRunner } from './agents/codex-cli-runner'
import { codexSdkRunner } from './agents/codex-sdk-runner'
import type {
  AgentBackendKind,
  AgentOptions,
  AgentRunResult,
  AgentRunner,
  AgentRunnerKind,
  AgentThreadEvent,
  CodexProgress,
} from './agents/runner-types'

export { AgentAbortError }
export type {
  AgentBackendKind,
  AgentOptions,
  AgentRunResult,
  AgentRunnerKind,
  AgentThreadEvent,
  CodexProgress,
}

function resolveRunner(kind?: AgentRunnerKind): AgentRunner {
  const selected = kind ?? (process.env.CODEX_RUNNER as AgentRunnerKind | undefined) ?? 'cli'
  if (selected === 'sdk') return codexSdkRunner
  if (selected === 'auto') {
    return process.env.OPENAI_API_KEY ? codexSdkRunner : codexCliRunner
  }
  return codexCliRunner
}

export async function runAgentTurn(prompt: string, opts?: AgentOptions): Promise<AgentRunResult> {
  const runner = resolveRunner(opts?.runner)
  return runner.run(prompt, opts)
}

export async function runAgent(prompt: string, opts?: AgentOptions): Promise<string> {
  const result = await runAgentTurn(prompt, opts)
  return result.text
}

export function getAgentBackend(opts?: AgentOptions): AgentBackendKind {
  return resolveRunner(opts?.runner).kind === 'sdk' ? 'codex-sdk' : 'codex-cli'
}
