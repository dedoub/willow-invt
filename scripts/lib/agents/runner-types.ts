export interface CodexProgress {
  phase: 'turn_started' | 'item_started' | 'item_completed' | 'turn_completed'
  itemType?: string
  text?: string
  command?: string
  status?: string
  files?: string[]
  usage?: { input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number }
}

export type AgentRunnerKind = 'cli' | 'sdk' | 'auto'
export type AgentBackendKind = 'codex-cli' | 'codex-sdk'

export interface AgentThreadEvent {
  threadId: string
  mode: 'started' | 'resumed'
}

export interface AgentOptions {
  cwd?: string
  allowedTools?: string[]
  timeoutMs?: number
  model?: string
  // 추론 강도 오버라이드 (미지정 시 codex config 기본값). CLI: -c model_reasoning_effort, SDK: modelReasoningEffort
  effort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  backend?: 'claude' | 'codex'
  onProgress?: (p: CodexProgress) => void
  signal?: AbortSignal
  runner?: AgentRunnerKind
  threadId?: string | null
  onThreadEvent?: (event: AgentThreadEvent) => void
}

export interface AgentRunResult {
  text: string
  backend: AgentBackendKind
  threadId: string | null
  usage?: { input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number } | null
}

export interface AgentRunner {
  kind: Exclude<AgentRunnerKind, 'auto'>
  run(prompt: string, opts?: AgentOptions): Promise<AgentRunResult>
}
