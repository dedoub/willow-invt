/**
 * Agent CLI wrapper — OpenAI Codex CLI (`codex exec`) 전용
 *
 * 2026-05-21: CEO 지시로 모든 백그라운드 자동화는 Codex로 일원화.
 * `claude -p` / Claude Agent SDK 호출은 사용하지 않는다.
 * (runClaude는 더 이상 호출되지 않지만 정리 PR 전까지 남겨둠 — backend 옵션은 무시)
 *
 * 사용:
 *   import { runAgent } from './lib/agent-cli'
 *   const result = await runAgent('your prompt', { allowedTools: ['mcp__foo__*'] })
 */

import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// 코덱스 실행 중 실시간 진행상황 이벤트 (`codex exec --json` JSONL 파싱).
export interface CodexProgress {
  phase: 'turn_started' | 'item_started' | 'item_completed' | 'turn_completed'
  itemType?: string   // agent_message | command_execution | file_change | reasoning | mcp_tool_call | web_search | ...
  text?: string       // agent_message 텍스트
  command?: string    // command_execution 명령
  status?: string     // in_progress | completed | failed
  files?: string[]    // file_change 대상 경로
  usage?: { input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number }
}

export interface AgentOptions {
  cwd?: string
  allowedTools?: string[]
  timeoutMs?: number
  model?: string
  // sandbox 모드 (Codex 전용): read-only | workspace-write | danger-full-access
  // 기본: danger-full-access (Claude의 --dangerously-skip-permissions 대응)
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  // @deprecated codex 전용 정책 (2026-05-21). 옵션은 받지만 항상 codex로 동작.
  backend?: 'claude' | 'codex'
  // 실시간 진행상황 콜백 (지정 시 codex를 --json으로 실행해 이벤트 스트리밍)
  onProgress?: (p: CodexProgress) => void
  // abort 시 codex 프로세스를 즉시 종료(SIGTERM)하고 reject. 메시지 배칭 재처리 시
  // 이전 run의 codex가 끝까지 돌아 같은 작업을 중복 수행하던 버그 방지.
  signal?: AbortSignal
}

// abort로 종료된 codex run 식별용. 호출측은 이 에러면 조용히 무시.
export class AgentAbortError extends Error {
  constructor() { super('agent aborted'); this.name = 'AgentAbortError' }
}

// codex --json 이벤트 1건 → CodexProgress 정규화. 파싱 실패/무관 이벤트는 null.
function parseCodexEvent(line: string): CodexProgress | null {
  let e: Record<string, unknown>
  try { e = JSON.parse(line) } catch { return null }
  const type = e.type as string | undefined
  if (type === 'turn.started') return { phase: 'turn_started' }
  if (type === 'turn.completed') {
    return { phase: 'turn_completed', usage: e.usage as CodexProgress['usage'] }
  }
  if (type === 'item.started' || type === 'item.completed') {
    const item = (e.item || {}) as Record<string, unknown>
    const itemType = (item.type || item.item_type) as string | undefined
    const files = Array.isArray(item.changes)
      ? (item.changes as Array<{ path?: string }>).map((c) => c.path || '').filter(Boolean)
      : (item.path ? [String(item.path)] : undefined)
    return {
      phase: type === 'item.started' ? 'item_started' : 'item_completed',
      itemType,
      text: typeof item.text === 'string' ? item.text : undefined,
      command: typeof item.command === 'string' ? item.command : undefined,
      status: typeof item.status === 'string' ? item.status : undefined,
      files,
    }
  }
  return null
}

type Backend = 'codex'

function getBackend(_opts?: AgentOptions): Backend {
  // codex 전용 — backend 옵션 / AGENT_CLI env 모두 무시.
  return 'codex'
}

function cleanEnv(): NodeJS.ProcessEnv {
  // CLAUDECODE 환경변수 제거해야 중첩 세션 에러 방지 (Claude/Codex 둘 다 안전)
  const env = { ...process.env }
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_SSE_PORT
  delete env.CLAUDE_CODE_ENTRYPOINT
  delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  return env
}

// ─── Claude backend (기존 로직 유지, 비상용) ────────────────────────────────
function extractTextFromClaudeJson(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout)
    const events = Array.isArray(parsed) ? parsed : [parsed]
    let lastText = ''
    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        const texts = event.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text)
        if (texts.length > 0) lastText = texts.join('\n').trim()
      }
    }
    if (lastText) return lastText
    const resultEvent = events.find((e: { type: string }) => e.type === 'result')
    return resultEvent?.result?.trim() || ''
  } catch {
    return stdout.trim()
  }
}

function runClaude(prompt: string, opts?: AgentOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--verbose', '--dangerously-skip-permissions']
    const tools = opts?.allowedTools && opts.allowedTools.length > 0
      ? [...opts.allowedTools, 'Edit', 'Write', 'Bash', 'Read', 'Glob', 'Grep']
      : null
    if (tools) args.push('--allowedTools', tools.join(','))
    if (opts?.model) args.push('--model', opts.model)

    const proc = spawn('claude', args, {
      cwd: opts?.cwd || process.cwd(),
      env: cleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = '', stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = opts?.timeoutMs
      ? setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('claude timeout')) }, opts.timeoutMs)
      : null

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve(extractTextFromClaudeJson(stdout))
      else reject(new Error(`claude exited ${code}: ${stderr}`))
    })
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(new Error(`Failed to spawn claude: ${err.message}`))
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ─── Codex backend ─────────────────────────────────────────────────────────
function runCodex(prompt: string, opts?: AgentOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // 최종 응답을 파일로 저장 → JSON 파싱 불필요
    const outFile = join(tmpdir(), `codex-out-${randomUUID()}.txt`)
    // prompt도 큰 경우가 있으니 stdin으로 전달
    const sandbox = opts?.sandbox ?? 'danger-full-access'

    const wantProgress = typeof opts?.onProgress === 'function'

    const args = ['exec']
    if (sandbox === 'danger-full-access') {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else {
      args.push('-s', sandbox)
    }
    // 진행상황 콜백이 있으면 JSONL 이벤트 스트리밍
    if (wantProgress) args.push('--json')
    args.push('-o', outFile)
    if (opts?.model) args.push('-m', opts.model)
    if (opts?.cwd) args.push('-C', opts.cwd)
    args.push('-')  // stdin에서 prompt 읽음

    // 이미 abort된 상태면 시작도 하지 않음
    if (opts?.signal?.aborted) { reject(new AgentAbortError()); return }

    const proc = spawn('codex', args, {
      cwd: opts?.cwd || process.cwd(),
      env: cleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // abort 시 codex 프로세스 즉시 종료 → 중복 작업 방지
    let aborted = false
    const onAbort = () => {
      aborted = true
      try { proc.kill('SIGTERM') } catch { /* ignore */ }
    }
    opts?.signal?.addEventListener('abort', onAbort, { once: true })
    const cleanupAbort = () => opts?.signal?.removeEventListener('abort', onAbort)

    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    if (wantProgress) {
      // stdout JSONL 스트림 — 청크가 라인 중간에서 끊길 수 있어 버퍼링.
      let buf = ''
      proc.stdout.on('data', (d: Buffer) => {
        buf += d.toString()
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const ev = parseCodexEvent(line)
          if (ev) { try { opts!.onProgress!(ev) } catch { /* 콜백 에러 무시 */ } }
        }
      })
    } else {
      proc.stdout.on('data', () => { /* 진행 로그 무시 */ })
    }

    const timer = opts?.timeoutMs
      ? setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('codex timeout')) }, opts.timeoutMs)
      : null

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      cleanupAbort()
      if (aborted) {
        try { unlinkSync(outFile) } catch { /* ignore */ }
        reject(new AgentAbortError())
        return
      }
      if (code === 0) {
        try {
          const result = readFileSync(outFile, 'utf-8').trim()
          try { unlinkSync(outFile) } catch { /* ignore */ }
          resolve(result)
        } catch (e) {
          reject(new Error(`codex output read failed: ${(e as Error).message}\n${stderr}`))
        }
      } else {
        try { unlinkSync(outFile) } catch { /* ignore */ }
        reject(new Error(`codex exited ${code}: ${stderr}`))
      }
    })
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer)
      cleanupAbort()
      try { unlinkSync(outFile) } catch { /* ignore */ }
      reject(new Error(`Failed to spawn codex: ${err.message}`))
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

// ─── Public API ────────────────────────────────────────────────────────────
/**
 * 에이전트 CLI 실행 (Claude 또는 Codex)
 * @param prompt 프롬프트 텍스트
 * @param opts 옵션 (도구 권한, cwd 등)
 * @returns 에이전트의 최종 응답 텍스트
 */
export async function runAgent(prompt: string, opts?: AgentOptions): Promise<string> {
  // codex 전용. runClaude는 dead code로 남겨두되 호출하지 않음.
  return runCodex(prompt, opts)
}

export function getAgentBackend(_opts?: AgentOptions): Backend {
  return 'codex'
}
