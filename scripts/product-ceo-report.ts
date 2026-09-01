import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'
import { getProductCeoReportConfig } from './lib/product-ceo-report-config'

const ROOT = '/Volumes/PRO-G40/app-dev/willow-invt'
const CLAUDE = '/opt/homebrew/bin/claude'
const MCP_CONFIG = join(ROOT, '.mcp.json')
const LOCK_STALE_MS = 2 * 60 * 60 * 1000

function timestamp(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date())
}

function main() {
  const config = getProductCeoReportConfig(process.argv[2] || '')
  mkdirSync(config.logDir, { recursive: true })

  const logPath = join(config.logDir, 'report.log')
  const lockPath = join(config.logDir, '.running.lock')
  const log = (message: string) => appendFileSync(logPath, `${message}\n`)

  if (existsSync(lockPath)) {
    const age = Date.now() - statSync(lockPath).mtimeMs
    if (age > LOCK_STALE_MS) rmSync(lockPath, { recursive: true, force: true })
    else {
      log(`[${timestamp()}] 이미 실행 중 — 건너뜀`)
      return
    }
  }

  mkdirSync(lockPath)
  try {
    if (!existsSync(config.promptPath)) throw new Error(`프롬프트 없음: ${config.promptPath}`)
    if (!existsSync(MCP_CONFIG)) throw new Error(`MCP 설정 없음: ${MCP_CONFIG}`)

    const prompt = readFileSync(config.promptPath, 'utf8')
    log(`================ ${timestamp()} ${config.label} run start ================`)

    const result = spawnSync(CLAUDE, [
      '-p', prompt,
      '--model', 'sonnet',
      '--mcp-config', MCP_CONFIG,
      '--strict-mcp-config',
      '--allowedTools', 'mcp__supabase__execute_sql,mcp__supabase__get_logs',
      '--output-format', 'text',
    ], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: '/Users/dongwookkim',
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      },
      timeout: 30 * 60 * 1000,
    })

    if (result.stdout) log(result.stdout.trimEnd())
    if (result.stderr) log(result.stderr.trimEnd())
    const exitCode = result.status ?? (result.signal ? 128 : 1)
    log(`================ exit ${exitCode} ${timestamp()} ================`)
    if (exitCode !== 0) process.exitCode = exitCode
  } finally {
    rmSync(lockPath, { recursive: true, force: true })
  }
}

main()
