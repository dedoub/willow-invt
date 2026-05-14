/**
 * Agent CLI wrapper — Claude Code (`claude -p`) ↔ OpenAI Codex CLI (`codex exec`) 토글
 *
 * 2026-06-15부터 Claude Agent SDK는 별도 크레딧을 소비해서,
 * 백그라운드 자동화 스크립트를 Codex CLI로 옮긴다.
 *
 * 사용:
 *   import { runAgent } from './lib/agent-cli'
 *   const result = await runAgent('your prompt', { allowedTools: ['Read', 'Bash'] })
 *
 * 환경변수:
 *   AGENT_CLI=codex (default) | claude
 */

import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export interface AgentOptions {
  cwd?: string
  allowedTools?: string[]
  timeoutMs?: number
  model?: string
  // sandbox 모드 (Codex 전용): read-only | workspace-write | danger-full-access
  // 기본: danger-full-access (Claude의 --dangerously-skip-permissions 대응)
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access'
  // 스크립트별 강제 백엔드 지정. env(AGENT_CLI) 보다 우선.
  // 점진적 마이그레이션 — 검증된 스크립트는 'codex'로 강제 가능.
  backend?: 'claude' | 'codex'
}

type Backend = 'claude' | 'codex'

function getBackend(opts?: AgentOptions): Backend {
  if (opts?.backend === 'claude') return 'claude'
  if (opts?.backend === 'codex') return 'codex'
  const env = (process.env.AGENT_CLI || 'codex').toLowerCase()
  return env === 'claude' ? 'claude' : 'codex'
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

    const args = ['exec']
    if (sandbox === 'danger-full-access') {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    } else {
      args.push('-s', sandbox)
    }
    args.push('-o', outFile)
    if (opts?.model) args.push('-m', opts.model)
    if (opts?.cwd) args.push('-C', opts.cwd)
    args.push('-')  // stdin에서 prompt 읽음

    const proc = spawn('codex', args, {
      cwd: opts?.cwd || process.cwd(),
      env: cleanEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.stdout.on('data', () => { /* 진행 로그 무시 */ })

    const timer = opts?.timeoutMs
      ? setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('codex timeout')) }, opts.timeoutMs)
      : null

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
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
  const backend = getBackend(opts)
  if (backend === 'claude') return runClaude(prompt, opts)
  return runCodex(prompt, opts)
}

export function getAgentBackend(opts?: AgentOptions): Backend {
  return getBackend(opts)
}
