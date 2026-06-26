import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { formatWithOptions } from 'util'

type RuntimeLogLevel = 'info' | 'warn' | 'error'

interface RuntimeLogEntry {
  ts: string
  bot_key: string
  level: RuntimeLogLevel
  source: string
  message: string
  pid: number
  details?: unknown
}

interface RuntimeConsoleCaptureOptions {
  botKey: string
  jsonlPath: string
}

interface RuntimeProcessMonitorOptions {
  botKey: string
  jsonlPath: string
}

interface RecordRuntimeEventOptions {
  botKey: string
  jsonlPath: string
  level?: RuntimeLogLevel
  source: string
  message: string
  details?: unknown
}

interface RuntimeLogContextOptions {
  botLabel: string
  botKey: string
  jsonlPath: string
  textLogPath?: string
  sinceHours?: number
  maxIssueLines?: number
  maxHealthyLines?: number
}

const MAX_JSONL_BYTES = 4 * 1024 * 1024
const KEEP_JSONL_BYTES = 2 * 1024 * 1024
const CONTEXT_CACHE_TTL = 15 * 1000

const installedConsoleCapture = new Set<string>()
const installedProcessMonitors = new Set<string>()
const contextCache = new Map<string, { value: string; updatedAt: number }>()

function ensureParentDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function oneLine(value: string, max = 120): string {
  const text = (value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function serializeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    const cause = (value as Error & { cause?: unknown }).cause
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: cause ? serializeValue(cause, seen) : undefined,
    }
  }
  if (typeof value === 'bigint') return value.toString()
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(item => serializeValue(item, seen))
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]'
    seen.add(value as object)
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializeValue(item, seen)
    }
    seen.delete(value as object)
    return out
  }
  return String(value)
}

function formatConsoleArgs(args: unknown[]): string {
  return formatWithOptions({ colors: false, depth: 5, breakLength: 120 }, ...args)
}

function invalidateRuntimeContextCache(jsonlPath: string) {
  for (const key of Array.from(contextCache.keys())) {
    if (key.startsWith(`${jsonlPath}::`)) contextCache.delete(key)
  }
}

function trimJsonlFile(jsonlPath: string) {
  if (!existsSync(jsonlPath)) return
  const size = statSync(jsonlPath).size
  if (size <= MAX_JSONL_BYTES) return

  const raw = readFileSync(jsonlPath, 'utf-8')
  const tail = raw.slice(-KEEP_JSONL_BYTES)
  const firstBreak = tail.indexOf('\n')
  writeFileSync(jsonlPath, firstBreak >= 0 ? tail.slice(firstBreak + 1) : tail, 'utf-8')
}

function appendRuntimeEntry(jsonlPath: string, entry: RuntimeLogEntry) {
  ensureParentDir(jsonlPath)
  appendFileSync(jsonlPath, `${JSON.stringify(entry)}\n`, 'utf-8')
  trimJsonlFile(jsonlPath)
  invalidateRuntimeContextCache(jsonlPath)
}

function parseRuntimeEntries(jsonlPath: string): RuntimeLogEntry[] {
  if (!existsSync(jsonlPath)) return []
  const raw = readFileSync(jsonlPath, 'utf-8').trim()
  if (!raw) return []
  const lines = raw.split('\n').slice(-800)
  const entries: RuntimeLogEntry[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as RuntimeLogEntry)
    } catch {
      // ignore malformed line
    }
  }
  return entries
}

function formatKst(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ts
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function installRuntimeConsoleCapture(opts: RuntimeConsoleCaptureOptions) {
  if (installedConsoleCapture.has(opts.botKey)) return
  installedConsoleCapture.add(opts.botKey)

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  const wrap = (
    method: 'log' | 'info' | 'warn' | 'error',
    level: RuntimeLogLevel
  ) => (...args: unknown[]) => {
    original[method](...args)
    try {
      appendRuntimeEntry(opts.jsonlPath, {
        ts: new Date().toISOString(),
        bot_key: opts.botKey,
        level,
        source: 'console',
        message: oneLine(formatConsoleArgs(args), 240),
        pid: process.pid,
        details: args.map(arg => serializeValue(arg)),
      })
    } catch {
      // ignore logging errors to avoid recursion
    }
  }

  console.log = wrap('log', 'info')
  console.info = wrap('info', 'info')
  console.warn = wrap('warn', 'warn')
  console.error = wrap('error', 'error')
}

export function installRuntimeProcessMonitor(opts: RuntimeProcessMonitorOptions) {
  if (installedProcessMonitors.has(opts.botKey)) return
  installedProcessMonitors.add(opts.botKey)

  process.on('uncaughtExceptionMonitor', (err) => {
    recordRuntimeEvent({
      botKey: opts.botKey,
      jsonlPath: opts.jsonlPath,
      level: 'error',
      source: 'process_uncaught_exception',
      message: err.message || 'uncaught exception',
      details: serializeValue(err),
    })
  })

  process.on('unhandledRejection', (reason) => {
    recordRuntimeEvent({
      botKey: opts.botKey,
      jsonlPath: opts.jsonlPath,
      level: 'error',
      source: 'process_unhandled_rejection',
      message: reason instanceof Error ? reason.message : 'unhandled rejection',
      details: serializeValue(reason),
    })
  })

  process.on('SIGTERM', () => {
    recordRuntimeEvent({
      botKey: opts.botKey,
      jsonlPath: opts.jsonlPath,
      source: 'process_signal',
      message: 'SIGTERM received',
    })
  })

  process.on('SIGINT', () => {
    recordRuntimeEvent({
      botKey: opts.botKey,
      jsonlPath: opts.jsonlPath,
      source: 'process_signal',
      message: 'SIGINT received',
    })
  })

  process.on('exit', (code) => {
    recordRuntimeEvent({
      botKey: opts.botKey,
      jsonlPath: opts.jsonlPath,
      source: 'process_exit',
      message: `process exit (${code})`,
      details: { exitCode: code },
    })
  })
}

export function recordRuntimeEvent(opts: RecordRuntimeEventOptions) {
  try {
    appendRuntimeEntry(opts.jsonlPath, {
      ts: new Date().toISOString(),
      bot_key: opts.botKey,
      level: opts.level || 'info',
      source: opts.source,
      message: oneLine(opts.message, 240),
      pid: process.pid,
      details: opts.details !== undefined ? serializeValue(opts.details) : undefined,
    })
  } catch {
    // ignore logging errors
  }
}

export async function getRuntimeLogContext(opts: RuntimeLogContextOptions): Promise<string> {
  const cacheKey = `${opts.jsonlPath}::${opts.sinceHours || 72}::${opts.maxIssueLines || 6}::${opts.maxHealthyLines || 3}`
  const cached = contextCache.get(cacheKey)
  if (cached && Date.now() - cached.updatedAt < CONTEXT_CACHE_TTL) {
    return cached.value
  }

  const sinceMs = (opts.sinceHours || 72) * 60 * 60 * 1000
  const cutoff = Date.now() - sinceMs
  const entries = parseRuntimeEntries(opts.jsonlPath)
  const recent = entries.filter(entry => {
    const ts = new Date(entry.ts).getTime()
    return Number.isFinite(ts) && ts >= cutoff
  })

  const infoCount = recent.filter(entry => entry.level === 'info').length
  const warnCount = recent.filter(entry => entry.level === 'warn').length
  const errorCount = recent.filter(entry => entry.level === 'error').length

  const issueLines = recent
    .filter(entry => entry.level === 'warn' || entry.level === 'error')
    .slice(-(opts.maxIssueLines || 6))
    .reverse()
    .map(entry => `- [${formatKst(entry.ts)}] ${entry.level.toUpperCase()} · ${entry.source}: ${oneLine(entry.message)}`)

  const healthyLines = recent
    .filter(entry => entry.level === 'info' && ['startup_ready', 'message_completed', 'self_check', 'service_restart'].includes(entry.source))
    .slice(-(opts.maxHealthyLines || 3))
    .reverse()
    .map(entry => `- [${formatKst(entry.ts)}] ${entry.source}: ${oneLine(entry.message)}`)

  const lines = [
    `## ${opts.botLabel} 런타임 로그`,
    `- bot_key: ${opts.botKey}`,
    `- structured_log: ${opts.jsonlPath}`,
    opts.textLogPath ? `- text_log: ${opts.textLogPath}` : '',
    `- 최근 ${opts.sinceHours || 72}시간 이벤트: info ${infoCount} · warn ${warnCount} · error ${errorCount}`,
    issueLines.length
      ? `- 최근 경고/오류:\n${issueLines.join('\n')}`
      : '- 최근 경고/오류: 없음',
    healthyLines.length
      ? `- 최근 정상 신호:\n${healthyLines.join('\n')}`
      : '- 최근 정상 신호: 아직 기록 없음',
    '참고: 장애 진단이나 수정이 필요하면 위 로그 파일을 직접 읽고, 저위험 변경만 적용한 뒤 관련 서비스를 다시 확인하세요.',
  ].filter(Boolean)

  const value = lines.join('\n')
  contextCache.set(cacheKey, { value, updatedAt: Date.now() })
  return value
}
