import { spawn } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { AgentOptions, AgentRunResult, AgentRunner, CodexProgress } from './runner-types'

export class AgentAbortError extends Error {
  constructor() { super('agent aborted'); this.name = 'AgentAbortError' }
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
      })

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
            resolve({
              text: result,
              backend: 'codex-cli',
              threadId: null,
              usage: null,
            })
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
  },
}
