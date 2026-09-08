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

// 봇/자동화의 codex 호출이 공유하는 모델. 전역 codex config 는 건드리지 않고 -m 으로 덮는다.
// 여기 한 곳에만 둔다 — 예전엔 telegram-bot.ts 안에 상수로 있어서 다른 스크립트가
// 같은 스택을 쓰려면 문자열을 복사해야 했고, 모델을 바꿀 때 갈라지기 딱 좋았다.
// (모델이 "not supported"로 죽으면 되는 값으로 이 상수만 바꾼다.)
export const BOT_MODEL = 'gpt-5.6-sol'

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
