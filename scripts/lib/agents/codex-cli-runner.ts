import { spawn, type ChildProcess } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { AgentOptions, AgentRunResult, AgentRunner, CodexProgress } from './runner-types'

export class AgentAbortError extends Error {
  constructor() { super('agent aborted'); this.name = 'AgentAbortError' }
}

// timeoutMs를 안 넘기는 호출부(텔레그램 봇의 askClaude 등)가 있어서, 예전엔 타이머가
// 아예 안 걸렸다. codex가 물리면 프로미스가 영영 안 풀려 자식이 그대로 남았다.
// 무제한 대기는 이제 불가능하다. 30분 주기인 봇의 자율 점검이 겹치지 않게 10분으로 잡는다.
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
// SIGTERM을 무시하는 codex가 실제로 있었다(MCP 전송이 죽은 채 물린 경우). 유예 후 SIGKILL.
export const KILL_GRACE_MS = 5_000

export function resolveTimeoutMs(timeoutMs?: number): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT_MS
}

// codex는 MCP 서버들을 자식으로 띄운다. detached로 띄워 자기 프로세스 그룹의 리더가 되게
// 했으므로, 음수 pid로 신호를 보내면 그 자식들까지 한 번에 정리된다.
function killTree(proc: ChildProcess, signal: NodeJS.Signals): void {
  const pid = proc.pid
  if (pid === undefined) return
  if (proc.exitCode !== null || proc.signalCode !== null) return
  try {
    process.kill(-pid, signal)
  } catch {
    try { proc.kill(signal) } catch { /* 이미 죽었다 */ }
  }
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_SSE_PORT
  delete env.CLAUDE_CODE_ENTRYPOINT
  delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  return env
}

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

export const codexCliRunner: AgentRunner = {
  kind: 'cli',
  async run(prompt: string, opts?: AgentOptions): Promise<AgentRunResult> {
    return new Promise((resolve, reject) => {
      const outFile = join(tmpdir(), `codex-out-${randomUUID()}.txt`)
      const sandbox = opts?.sandbox ?? 'danger-full-access'
      const wantProgress = typeof opts?.onProgress === 'function'
      const args = ['exec']

      if (sandbox === 'danger-full-access') args.push('--dangerously-bypass-approvals-and-sandbox')
      else args.push('-s', sandbox)

      if (wantProgress) args.push('--json')
      args.push('-o', outFile)
      if (opts?.model) args.push('-m', opts.model)
      if (opts?.effort) args.push('-c', `model_reasoning_effort="${opts.effort}"`)
      if (opts?.cwd) args.push('-C', opts.cwd)
      args.push('-')

      if (opts?.signal?.aborted) { reject(new AgentAbortError()); return }

      const proc = spawn('codex', args, {
        cwd: opts?.cwd || process.cwd(),
        env: cleanEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true, // 프로세스 그룹 리더로 만들어 MCP 자식까지 함께 죽일 수 있게 한다
      })

      let killTimer: NodeJS.Timeout | null = null
      const stopKillTimer = () => {
        if (killTimer) { clearTimeout(killTimer); killTimer = null }
      }
      // SIGTERM 한 번으로 끝내지 않는다. 유예 후 SIGKILL까지 확실히 올라간다.
      const terminateTree = () => {
        killTree(proc, 'SIGTERM')
        stopKillTimer()
        killTimer = setTimeout(() => killTree(proc, 'SIGKILL'), KILL_GRACE_MS)
        killTimer.unref?.()
      }

      let aborted = false
      const onAbort = () => {
        aborted = true
        terminateTree()
      }
      opts?.signal?.addEventListener('abort', onAbort, { once: true })
      const cleanupAbort = () => opts?.signal?.removeEventListener('abort', onAbort)

      let stderr = ''
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      if (wantProgress) {
        let buf = ''
        proc.stdout.on('data', (d: Buffer) => {
          buf += d.toString()
          let nl
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim()
            buf = buf.slice(nl + 1)
            if (!line) continue
            const ev = parseCodexEvent(line)
            if (ev) {
              try { opts!.onProgress!(ev) } catch { /* ignore */ }
            }
          }
        })
      } else {
        proc.stdout.on('data', () => { /* ignore */ })
      }

      let timer: NodeJS.Timeout | null = null
      let settled = false
      const removeOutFile = () => { try { unlinkSync(outFile) } catch { /* 없으면 그만 */ } }
      const settle = () => {
        settled = true
        if (timer) { clearTimeout(timer); timer = null }
        cleanupAbort()
      }
      const fail = (err: Error) => {
        if (settled) return
        settle()
        reject(err)
      }
      const succeed = (result: AgentRunResult) => {
        if (settled) return
        settle()
        resolve(result)
      }

      // 타임아웃은 이제 선택이 아니다 — 안 넘기면 기본값이 걸린다.
      timer = setTimeout(() => {
        terminateTree()
        fail(new Error('codex timeout'))
      }, resolveTimeoutMs(opts?.timeoutMs))

      proc.on('close', (code) => {
        stopKillTimer()
        // 타임아웃으로 이미 거절했더라도 임시 파일은 여기서 치운다.
        if (settled) { removeOutFile(); return }
        if (aborted) {
          removeOutFile()
          fail(new AgentAbortError())
          return
        }
        if (code === 0) {
          try {
            const result = readFileSync(outFile, 'utf-8').trim()
            removeOutFile()
            succeed({
              text: result,
              backend: 'codex-cli',
              threadId: null,
              usage: null,
            })
          } catch (e) {
            removeOutFile()
            fail(new Error(`codex output read failed: ${(e as Error).message}\n${stderr}`))
          }
        } else {
          removeOutFile()
          fail(new Error(`codex exited ${code}: ${stderr}`))
        }
      })

      proc.on('error', (err) => {
        stopKillTimer()
        removeOutFile()
        fail(new Error(`Failed to spawn codex: ${err.message}`))
      })

      // 프롬프트를 다 넘기기 전에 codex가 죽으면 EPIPE가 난다. 봇을 죽이지 않게 삼킨다
      // (실제 실패 사유는 close/error 핸들러가 stderr와 함께 보고한다).
      proc.stdin.on('error', () => { /* ignore */ })
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  },
}
