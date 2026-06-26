import { spawn } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const PROJECT_ROOT = join(__dirname, '..', '..')
const SCRIPTS_DIR = join(PROJECT_ROOT, 'scripts')
const LOG_DIR = join(SCRIPTS_DIR, 'logs')
const DEFAULT_PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
const SERVICE_CACHE_TTL = 15 * 1000

type ServiceKind = 'daemon' | 'job'
type StartMode = 'command' | 'detached'

export interface LocalServiceDefinition {
  key: string
  displayName: string
  description: string
  kind: ServiceKind
  startMode: StartMode
  cwd?: string
  startCommand?: string[]
  stopCommand?: string[]
  pidFile?: string
  lockFile?: string
  logPath?: string
  processPatterns?: string[]
  launchdLabel?: string
  healthcheckUrl?: string
  aliases?: string[]
  isEnabled?: boolean
  isProtected?: boolean
  source?: 'static' | 'db'
}

interface LocalServiceRow {
  id?: string
  service_key: string
  display_name: string
  description: string | null
  kind: ServiceKind
  start_mode: StartMode
  cwd: string | null
  start_command: unknown
  stop_command: unknown
  pid_file: string | null
  lock_file: string | null
  log_path: string | null
  process_patterns: unknown
  launchd_label: string | null
  healthcheck_url: string | null
  aliases: unknown
  is_enabled: boolean
  is_protected: boolean
  metadata?: unknown
}

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface ServiceStatus {
  service: LocalServiceDefinition
  state: 'running' | 'stopped' | 'idle'
  pids: number[]
  healthText?: string
  healthOk?: boolean
  launchdLoaded?: boolean
  logUpdatedAt?: Date
}

interface TimedCache<T> {
  value: T
  updatedAt: number
}

const STATIC_SERVICE_REGISTRY: LocalServiceDefinition[] = [
  {
    key: 'willy-bot',
    displayName: 'Willy Telegram Bot',
    description: '윌로우 COO 텔레그램 에이전트',
    kind: 'daemon',
    startMode: 'command',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-telegram-bot.sh'), '--daemon'],
    pidFile: join(LOG_DIR, 'telegram-bot.pid'),
    lockFile: join(LOG_DIR, 'telegram-bot.lock'),
    logPath: join(LOG_DIR, 'telegram-bot.log'),
    processPatterns: ['scripts/telegram-bot.ts'],
    launchdLabel: 'com.willow.telegram-bot',
    aliases: ['윌리', '윌리봇', 'telegram-bot', 'willy bot'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'rina-bot',
    displayName: 'Rina Study Bot',
    description: '류하 학습관리 텔레그램 봇',
    kind: 'daemon',
    startMode: 'command',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-ryuha-bot.sh'), '--daemon'],
    pidFile: join(LOG_DIR, 'ryuha-bot.pid'),
    lockFile: join(LOG_DIR, 'ryuha-bot.lock'),
    logPath: join(LOG_DIR, 'ryuha-bot.log'),
    processPatterns: ['scripts/ryuha-telegram-bot.ts'],
    aliases: ['리나', '리나봇', '류하봇', 'ryuha-bot', 'rina bot'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'market-research-scan',
    displayName: 'Market Research Scan',
    description: '밸류체인/소형주 통합 리서치 스캔',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-market-research-scan.sh')],
    logPath: join(LOG_DIR, 'market-research-scan.log'),
    processPatterns: ['scripts/market-research-scan.ts'],
    aliases: ['리서치스캔', '시장리서치', 'smallcap scan'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'knowledge-distill',
    displayName: 'Knowledge Distill',
    description: '지식 정제 파이프라인',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-knowledge-distill.sh')],
    logPath: join(LOG_DIR, 'knowledge-distill.log'),
    processPatterns: ['scripts/knowledge-distill.ts'],
    aliases: ['지식정제', 'knowledge distill'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'real-estate-sync',
    displayName: 'Real Estate Sync',
    description: '부동산 실거래가 동기화',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-real-estate-sync.sh')],
    logPath: join(LOG_DIR, 'real-estate-sync.log'),
    processPatterns: ['scripts/real-estate-pipeline.ts'],
    aliases: ['부동산동기화', '실거래가', 'real estate'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'sector-rotation',
    displayName: 'Sector Rotation',
    description: '섹터 로테이션 데이터 수집',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-sector-rotation.sh')],
    logPath: join(LOG_DIR, 'sector-rotation.log'),
    processPatterns: ['scripts/sector-rotation-fetch.ts'],
    launchdLabel: 'com.willow.sector-rotation',
    aliases: ['섹터로테이션', 'sector rotation'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'toss-sync',
    displayName: 'Toss Sync',
    description: '토스 거래내역/잔고 동기화',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-toss-sync.sh')],
    logPath: join(LOG_DIR, 'toss-sync.log'),
    processPatterns: ['scripts/toss-sync.ts'],
    aliases: ['토스싱크', 'toss sync'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'toss-prices',
    displayName: 'Toss Prices',
    description: '토스 시세 업데이트',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-toss-prices.sh')],
    logPath: join(LOG_DIR, 'toss-prices.log'),
    processPatterns: ['scripts/toss-prices.ts'],
    aliases: ['토스시세', 'toss prices'],
    isEnabled: true,
    isProtected: true,
    source: 'static',
  },
  {
    key: 'tensw-weekly-reports',
    displayName: 'Tensw Weekly Reports',
    description: '텐소프트웍스 주간 리포트 생성 (현재 비활성화)',
    kind: 'job',
    startMode: 'detached',
    startCommand: ['/bin/bash', join(SCRIPTS_DIR, 'run-tensw-weekly-reports.sh')],
    logPath: join(LOG_DIR, 'tensw-weekly-reports.log'),
    processPatterns: ['run-tensw-weekly-reports.sh'],
    aliases: ['주간리포트', 'weekly reports', 'tensw weekly'],
    isEnabled: false,
    isProtected: true,
    source: 'static',
  },
]

let supabaseClient: ReturnType<typeof createClient> | null = null
let serviceRegistryCache: TimedCache<LocalServiceDefinition[]> | null = null
let serviceRegistryPromise: Promise<LocalServiceDefinition[]> | null = null

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readTimedCache<T>(cache: TimedCache<T> | null, ttlMs: number): T | null {
  if (!cache) return null
  return Date.now() - cache.updatedAt < ttlMs ? cache.value : null
}

function writeTimedCache<T>(value: T): TimedCache<T> {
  return { value, updatedAt: Date.now() }
}

function getSupabase() {
  if (supabaseClient) return supabaseClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  supabaseClient = createClient(url, key)
  return supabaseClient
}

function invalidateServiceRegistryCache() {
  serviceRegistryCache = null
  serviceRegistryPromise = null
}

function normalizeKey(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

function slugifyServiceKey(value: string): string {
  const slug = (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'service'
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function collectAliases(service: LocalServiceDefinition): string[] {
  return [service.key, service.displayName, ...(service.aliases || [])]
}

function describeKind(kind: ServiceKind): string {
  return kind === 'daemon' ? '상시 서비스' : '일회성 잡'
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)
  return result.length ? result : undefined
}

function normalizeCommandValue(value: unknown): string[] | undefined {
  if (typeof value === 'string' && value.trim()) {
    return ['/bin/bash', '-lc', value.trim()]
  }
  return normalizeStringArray(value)
}

function filterEnabledServices(services: LocalServiceDefinition[]): LocalServiceDefinition[] {
  return services.filter(service => service.isEnabled !== false)
}

function resolveServicePath(value: string | null | undefined, cwd?: string | null): string | undefined {
  if (!value) return undefined
  return isAbsolute(value) ? value : join(cwd || PROJECT_ROOT, value)
}

function mergeRegistries(rows: LocalServiceRow[]): LocalServiceDefinition[] {
  const byKey = new Map<string, LocalServiceDefinition>()
  for (const service of STATIC_SERVICE_REGISTRY) byKey.set(service.key, service)
  for (const row of rows) {
    if (!row.is_enabled) {
      byKey.delete(row.service_key)
      continue
    }
    const service = mapRowToService(row)
    byKey.set(service.key, service)
  }
  return Array.from(byKey.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function isMissingRegistryTable(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message || '') : ''
  return message.includes('local_service_registry')
}

function mapRowToService(row: LocalServiceRow): LocalServiceDefinition {
  return {
    key: row.service_key,
    displayName: row.display_name,
    description: row.description || '',
    kind: row.kind,
    startMode: row.start_mode,
    cwd: row.cwd || undefined,
    startCommand: normalizeCommandValue(row.start_command),
    stopCommand: normalizeCommandValue(row.stop_command),
    pidFile: resolveServicePath(row.pid_file, row.cwd),
    lockFile: resolveServicePath(row.lock_file, row.cwd),
    logPath: resolveServicePath(row.log_path, row.cwd),
    processPatterns: normalizeStringArray(row.process_patterns),
    launchdLabel: row.launchd_label || undefined,
    healthcheckUrl: row.healthcheck_url || undefined,
    aliases: normalizeStringArray(row.aliases),
    isEnabled: row.is_enabled,
    isProtected: row.is_protected,
    source: 'db',
  }
}

async function fetchDbServiceRows(includeDisabled = false): Promise<LocalServiceRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  let query = supabase.from('local_service_registry').select('*').order('service_key')
  if (!includeDisabled) query = query.eq('is_enabled', true)

  const { data, error } = await query
  if (error) {
    if (!isMissingRegistryTable(error)) {
      console.error('[local-services] registry load error:', error.message)
    }
    return []
  }
  return (data || []) as LocalServiceRow[]
}

async function getServiceRegistry(): Promise<LocalServiceDefinition[]> {
  const cached = readTimedCache(serviceRegistryCache, SERVICE_CACHE_TTL)
  if (cached) return cached
  if (serviceRegistryPromise) return serviceRegistryPromise

  serviceRegistryPromise = (async () => {
    const rows = await fetchDbServiceRows(true)
    const merged = rows.length ? mergeRegistries(rows) : STATIC_SERVICE_REGISTRY
    const enabled = filterEnabledServices(merged)
    serviceRegistryCache = writeTimedCache(enabled)
    return enabled
  })()

  try {
    return await serviceRegistryPromise
  } finally {
    serviceRegistryPromise = null
  }
}

async function runCommand(command: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      cwd: opts?.cwd || PROJECT_ROOT,
      env: { ...process.env, PATH: `${DEFAULT_PATH}:${process.env.PATH || ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    const timer = opts?.timeoutMs
      ? setTimeout(() => {
          proc.kill('SIGTERM')
          reject(new Error(`command timeout: ${command.join(' ')}`))
        }, opts.timeoutMs)
      : null

    proc.on('error', err => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    proc.on('close', code => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

function spawnDetached(command: string[], cwd?: string, logPath?: string): number {
  let logFd: number | undefined
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true })
    logFd = openSync(logPath, 'a')
  }

  const proc = spawn(command[0], command.slice(1), {
    cwd: cwd || PROJECT_ROOT,
    env: { ...process.env, PATH: `${DEFAULT_PATH}:${process.env.PATH || ''}` },
    detached: true,
    stdio: logFd != null ? ['ignore', logFd, logFd] : 'ignore',
  })

  if (logFd != null) {
    try { closeSync(logFd) } catch { /* ignore */ }
  }
  proc.unref()
  return proc.pid ?? 0
}

function readPid(path: string | undefined): number | null {
  if (!path || !existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8').trim()
  const pid = Number(raw)
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function findProcessPids(patterns: string[] | undefined): Promise<number[]> {
  if (!patterns?.length) return []
  const found = new Set<number>()
  for (const pattern of patterns) {
    const result = await runCommand(['pgrep', '-af', pattern], { timeoutMs: 4000 }).catch(() => ({ code: 1, stdout: '', stderr: '' }))
    if (!result.stdout) continue
    for (const line of result.stdout.split('\n')) {
      if (line.includes('pgrep -af')) continue
      const pid = Number(line.trim().split(/\s+/, 1)[0])
      if (Number.isFinite(pid) && pid > 0) found.add(pid)
    }
  }
  return Array.from(found)
}

async function isLaunchdLoaded(label: string | undefined): Promise<boolean | undefined> {
  if (!label || typeof process.getuid !== 'function') return undefined
  const uid = process.getuid()
  const result = await runCommand(['launchctl', 'print', `gui/${uid}/${label}`], { timeoutMs: 5000 }).catch(() => ({ code: 1, stdout: '', stderr: '' }))
  return result.code === 0
}

async function checkHealth(url: string | undefined): Promise<{ ok: boolean; text: string } | undefined> {
  if (!url) return undefined
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    return { ok: res.ok, text: `${res.status} ${res.statusText}`.trim() }
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : 'health check failed' }
  }
}

async function getServiceStatus(service: LocalServiceDefinition): Promise<ServiceStatus> {
  const pids = new Set<number>()
  const pidFromFile = readPid(service.pidFile)
  const pidFromLock = readPid(service.lockFile)
  if (pidFromFile && isAlive(pidFromFile)) pids.add(pidFromFile)
  if (pidFromLock && isAlive(pidFromLock)) pids.add(pidFromLock)
  for (const pid of await findProcessPids(service.processPatterns)) {
    if (isAlive(pid)) pids.add(pid)
  }

  const logUpdatedAt = service.logPath && existsSync(service.logPath) ? statSync(service.logPath).mtime : undefined
  const health = pids.size > 0 ? await checkHealth(service.healthcheckUrl) : undefined
  const launchdLoaded = await isLaunchdLoaded(service.launchdLabel)
  const state = pids.size > 0
    ? 'running'
    : service.kind === 'daemon'
      ? 'stopped'
      : 'idle'

  return {
    service,
    state,
    pids: Array.from(pids).sort((a, b) => a - b),
    healthText: health?.text,
    healthOk: health?.ok,
    launchdLoaded,
    logUpdatedAt,
  }
}

async function tailLog(logPath: string | undefined, lines = 30): Promise<string> {
  if (!logPath || !existsSync(logPath)) return '로그 파일이 없습니다.'
  const clamped = Math.max(5, Math.min(lines, 120))
  const result = await runCommand(['tail', '-n', String(clamped), logPath], { timeoutMs: 4000 }).catch(() => ({ code: 1, stdout: '', stderr: '' }))
  if (result.stdout) return result.stdout
  const all = readFileSync(logPath, 'utf-8').trim().split('\n')
  return all.slice(-clamped).join('\n') || '(로그가 비어 있음)'
}

async function stopByMetadata(service: LocalServiceDefinition): Promise<number[]> {
  const status = await getServiceStatus(service)
  const killed: number[] = []
  const targets = [...status.pids].sort((a, b) => b - a)

  if (service.stopCommand) {
    await runCommand(service.stopCommand, { cwd: service.cwd || PROJECT_ROOT, timeoutMs: 15000 })
  } else {
    for (const pid of targets) {
      try {
        process.kill(pid, 'SIGTERM')
        killed.push(pid)
      } catch {
        // ignore
      }
    }
  }

  await sleep(2000)
  const survivors = targets.filter(isAlive)
  for (const pid of survivors) {
    try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
  }

  if (service.pidFile && existsSync(service.pidFile)) {
    try { unlinkSync(service.pidFile) } catch { /* ignore */ }
  }
  if (service.lockFile && existsSync(service.lockFile)) {
    try { unlinkSync(service.lockFile) } catch { /* ignore */ }
  }

  return killed
}

function resolveServiceInList(query: string | undefined, services: LocalServiceDefinition[]): LocalServiceDefinition | null {
  if (!query) return null
  const key = normalizeKey(query)
  const exact = services.find(service =>
    collectAliases(service).some(alias => normalizeKey(alias) === key)
  )
  if (exact) return exact

  return services.find(service =>
    collectAliases(service).some(alias => normalizeKey(alias).includes(key) || key.includes(normalizeKey(alias)))
  ) || null
}

function buildStatusLine(status: ServiceStatus): string {
  const stateLabel = status.state === 'running'
    ? '✅ 실행 중'
    : status.state === 'stopped'
      ? '⛔ 중지'
      : '⏸ 대기'
  const bits = [
    stateLabel,
    status.pids.length ? `pid ${status.pids.join(',')}` : '',
    status.launchdLoaded != null ? `launchd ${status.launchdLoaded ? 'loaded' : 'not loaded'}` : '',
    status.healthText ? `health ${status.healthOk ? 'ok' : 'fail'} (${status.healthText})` : '',
    status.logUpdatedAt ? `로그 ${formatDateTime(status.logUpdatedAt)}` : '로그 없음',
  ].filter(Boolean)
  return `- ${status.service.key}: ${bits.join(' · ')}`
}

async function buildServiceHelp(): Promise<string> {
  const services = await getServiceRegistry()
  return services.map(service => `• ${service.key} — ${service.description}`).join('\n')
}

function buildLocalServiceContextFromServices(services: LocalServiceDefinition[]): string {
  const lines = services.map(service => {
    const aliasText = service.aliases?.length ? ` (별칭: ${service.aliases.slice(0, 3).join(', ')})` : ''
    return `- ${service.key}: ${service.description} · ${describeKind(service.kind)}${aliasText}`
  })
  return `${lines.join('\n')}\n\n서비스 제어는 등록된 이름만 사용하세요. 애매하면 service_list 또는 service_status로 먼저 확인하세요.`
}

function toDbRowPayload(action: Record<string, unknown>, serviceKey: string, existing?: LocalServiceRow): Record<string, unknown> {
  const displayName = normalizeString(action.display_name ?? action.displayName)
    || normalizeString(action.service_name)
    || existing?.display_name
    || serviceKey
  const description = normalizeString(action.description) ?? existing?.description ?? ''
  const kind = (normalizeString(action.kind) as ServiceKind | undefined) || existing?.kind || 'job'
  const requestedMode = normalizeString(action.start_mode) as StartMode | undefined
  const startMode = requestedMode || existing?.start_mode || (kind === 'daemon' ? 'command' : 'detached')
  const aliases = normalizeStringArray(action.aliases) ?? normalizeStringArray(existing?.aliases)
  const processPatterns = normalizeStringArray(action.process_patterns) ?? normalizeStringArray(existing?.process_patterns)
  const isEnabled = typeof action.is_enabled === 'boolean'
    ? action.is_enabled
    : existing?.is_enabled ?? true

  const startCommand = action.start_command !== undefined
    ? normalizeCommandValue(action.start_command)
    : normalizeCommandValue(existing?.start_command)
  const stopCommand = action.stop_command !== undefined
    ? normalizeCommandValue(action.stop_command)
    : normalizeCommandValue(existing?.stop_command)

  return {
    service_key: serviceKey,
    display_name: displayName,
    description,
    kind,
    start_mode: startMode,
    cwd: normalizeString(action.cwd) ?? existing?.cwd ?? null,
    start_command: startCommand || null,
    stop_command: stopCommand || null,
    pid_file: normalizeString(action.pid_file) ?? existing?.pid_file ?? null,
    lock_file: normalizeString(action.lock_file) ?? existing?.lock_file ?? null,
    log_path: normalizeString(action.log_path) ?? existing?.log_path ?? null,
    process_patterns: processPatterns || null,
    launchd_label: normalizeString(action.launchd_label) ?? existing?.launchd_label ?? null,
    healthcheck_url: normalizeString(action.healthcheck_url) ?? existing?.healthcheck_url ?? null,
    aliases: aliases || null,
    is_enabled: isEnabled,
    is_protected: existing?.is_protected ?? false,
  }
}

async function findServiceRow(query: string): Promise<LocalServiceRow | null> {
  const rows = await fetchDbServiceRows(true)
  const key = normalizeKey(query)

  const exact = rows.find(row => {
    const aliases = normalizeStringArray(row.aliases) || []
    return [row.service_key, row.display_name, ...aliases].some(alias => normalizeKey(alias) === key)
  })
  if (exact) return exact

  return rows.find(row => {
    const aliases = normalizeStringArray(row.aliases) || []
    return [row.service_key, row.display_name, ...aliases].some(alias => {
      const normalized = normalizeKey(alias)
      return normalized.includes(key) || key.includes(normalized)
    })
  }) || null
}

async function registerOrUpdateService(action: Record<string, unknown>, mode: 'register' | 'update'): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) return '⚠️ Supabase 연결 정보가 없어 서비스 레지스트리를 수정할 수 없어요.'

  const explicitKey = normalizeString(action.service_key)
  const rawQuery = explicitKey
    || normalizeString(action.service_name)
    || normalizeString(action.display_name ?? action.displayName)
  if (!rawQuery) {
    return '⚠️ 서비스 등록/수정 실패: service_key 또는 display_name이 필요해요.'
  }

  const existing = await findServiceRow(rawQuery)
  const serviceKey = explicitKey ? slugifyServiceKey(explicitKey) : existing?.service_key || slugifyServiceKey(rawQuery)
  if (mode === 'update' && !existing) {
    return `⚠️ "${rawQuery}" 서비스가 아직 등록되지 않았어요.`
  }

  const confirmed = action.confirmed === true || action.confirmed === 'true'
  if (existing?.is_protected && !confirmed) {
    return `⚠️ ${serviceKey}는 보호된 기본 서비스라서 수정하려면 confirmed:true가 필요해요.`
  }

  const payload = toDbRowPayload(action, serviceKey, existing || undefined)
  const startCommand = payload.start_command as string[] | null
  if (!existing && !startCommand) {
    return '⚠️ 새 서비스 등록에는 start_command가 필요해요.'
  }

  const table = supabase.from('local_service_registry') as any
  const query = mode === 'register'
    ? table.upsert(payload as any, { onConflict: 'service_key' }).select('service_key, display_name').single()
    : table.update(payload as any).eq('service_key', existing!.service_key).select('service_key, display_name').single()

  const { data, error } = await query as { data: { service_key?: string; display_name?: string } | null; error: { message: string } | null }
  if (error) {
    if (isMissingRegistryTable(error)) {
      return '⚠️ local_service_registry 테이블이 아직 없어요. migration부터 적용해 주세요.'
    }
    return `⚠️ 서비스 ${mode === 'register' ? '등록' : '수정'} 실패: ${error.message}`
  }

  invalidateServiceRegistryCache()
  return mode === 'register'
    ? `✅ 서비스 등록: "${data?.service_key || serviceKey}" (${data?.display_name || payload.display_name})`
    : `✅ 서비스 수정: "${data?.service_key || serviceKey}" (${data?.display_name || payload.display_name})`
}

async function setServiceEnabled(query: string, enabled: boolean, confirmed: boolean): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) return '⚠️ Supabase 연결 정보가 없어 서비스 레지스트리를 수정할 수 없어요.'

  const existing = await findServiceRow(query)
  if (!existing) return `⚠️ "${query}" 서비스가 등록되어 있지 않아요.`
  if (existing.is_protected && !confirmed) {
    return `⚠️ ${existing.service_key}는 보호된 기본 서비스라서 ${enabled ? '활성화' : '비활성화'}하려면 confirmed:true가 필요해요.`
  }

  const { error } = await (supabase
    .from('local_service_registry') as any)
    .update({ is_enabled: enabled } as any)
    .eq('service_key', existing.service_key)

  if (error) {
    if (isMissingRegistryTable(error)) {
      return '⚠️ local_service_registry 테이블이 아직 없어요. migration부터 적용해 주세요.'
    }
    return `⚠️ 서비스 ${enabled ? '활성화' : '비활성화'} 실패: ${error.message}`
  }

  invalidateServiceRegistryCache()
  return `✅ 서비스 ${enabled ? '활성화' : '비활성화'}: "${existing.service_key}"`
}

async function deleteServiceRow(query: string, confirmed: boolean): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) return '⚠️ Supabase 연결 정보가 없어 서비스 레지스트리를 수정할 수 없어요.'

  const existing = await findServiceRow(query)
  if (!existing) return `⚠️ "${query}" 서비스가 등록되어 있지 않아요.`
  if (existing.is_protected && !confirmed) {
    return `⚠️ ${existing.service_key}는 보호된 기본 서비스라서 삭제하려면 confirmed:true가 필요해요.`
  }

  const { error } = await (supabase
    .from('local_service_registry') as any)
    .delete()
    .eq('service_key', existing.service_key)

  if (error) {
    if (isMissingRegistryTable(error)) {
      return '⚠️ local_service_registry 테이블이 아직 없어요. migration부터 적용해 주세요.'
    }
    return `⚠️ 서비스 삭제 실패: ${error.message}`
  }

  invalidateServiceRegistryCache()
  return `🗑️ 서비스 삭제: "${existing.service_key}"`
}

export function buildLocalServiceContext(): string {
  return buildLocalServiceContextFromServices(filterEnabledServices(STATIC_SERVICE_REGISTRY))
}

export async function getLocalServiceContext(): Promise<string> {
  return buildLocalServiceContextFromServices(await getServiceRegistry())
}

export async function getLocalServiceRegistry(): Promise<LocalServiceDefinition[]> {
  return getServiceRegistry()
}

export async function getLocalServiceStatus(target: string | LocalServiceDefinition): Promise<ServiceStatus | null> {
  const services = await getServiceRegistry()
  const service = typeof target === 'string' ? resolveServiceInList(target, services) : target
  if (!service) return null
  return getServiceStatus(service)
}

export async function executeLocalServiceAction(action: Record<string, unknown>): Promise<string | null> {
  const type = String(action.type || '')
  if (!type.startsWith('service_')) return null

  if (type === 'service_register') {
    return registerOrUpdateService(action, 'register')
  }
  if (type === 'service_update') {
    return registerOrUpdateService(action, 'update')
  }
  if (type === 'service_disable') {
    const requested = String(action.service_name || action.service_key || '')
    return setServiceEnabled(requested, false, action.confirmed === true || action.confirmed === 'true')
  }
  if (type === 'service_enable') {
    const requested = String(action.service_name || action.service_key || '')
    return setServiceEnabled(requested, true, action.confirmed === true || action.confirmed === 'true')
  }
  if (type === 'service_delete') {
    const requested = String(action.service_name || action.service_key || '')
    return deleteServiceRow(requested, action.confirmed === true || action.confirmed === 'true')
  }

  const services = await getServiceRegistry()

  if (type === 'service_list') {
    const statuses = await Promise.all(services.map(getServiceStatus))
    const lines = statuses.map(buildStatusLine)
    return `🧭 로컬 서비스 목록 (${services.length}개)\n${lines.join('\n')}`
  }

  const requestedName = String(action.service_name || action.service_key || '')
  if (!requestedName && type === 'service_status') {
    const statuses = await Promise.all(services.map(getServiceStatus))
    return `🧭 로컬 서비스 상태\n${statuses.map(buildStatusLine).join('\n')}`
  }
  if (!requestedName && type === 'service_doctor') {
    const statuses = await Promise.all(services.map(getServiceStatus))
    const risky = statuses.filter(status => status.service.kind === 'daemon' && status.state !== 'running')
    const lines = (risky.length ? risky : statuses).map(buildStatusLine)
    return `🧪 로컬 서비스 점검 요약\n${lines.join('\n')}`
  }

  const service = resolveServiceInList(requestedName, services)
  if (!service) {
    return `⚠️ 서비스명을 찾지 못했어요.\n${await buildServiceHelp()}`
  }

  const confirmed = action.confirmed === true || action.confirmed === 'true'
  if ((type === 'service_stop' || type === 'service_restart') && !confirmed) {
    return `⚠️ ${service.key} ${type === 'service_stop' ? '중지' : '재시작'}는 명시적 확인이 필요해요. 액션에 confirmed:true를 넣어 다시 실행해 주세요.`
  }

  if (type === 'service_status') {
    const status = await getServiceStatus(service)
    return [
      `🩺 ${service.displayName} (${service.key})`,
      `- 설명: ${service.description}`,
      `- 유형: ${describeKind(service.kind)}`,
      `- 출처: ${service.source === 'db' ? 'DB 레지스트리' : '내장 기본값'}`,
      buildStatusLine(status),
      service.logPath ? `- 로그: ${service.logPath}` : '',
    ].filter(Boolean).join('\n')
  }

  if (type === 'service_logs') {
    const lines = Number(action.lines || 30)
    const body = await tailLog(service.logPath, lines)
    return `📄 ${service.key} 최근 로그\n${body}`
  }

  if (type === 'service_doctor') {
    const status = await getServiceStatus(service)
    const logTail = await tailLog(service.logPath, 20)
    const advice: string[] = []
    if (service.kind === 'daemon' && status.state !== 'running') advice.push('재시작 필요')
    if (status.healthOk === false) advice.push(`health check 실패: ${status.healthText}`)
    if (!advice.length) advice.push('큰 이상 징후는 아직 없어요')
    return [
      `🧪 ${service.displayName} 점검`,
      buildStatusLine(status),
      `- 진단: ${advice.join(' · ')}`,
      '',
      logTail,
    ].join('\n')
  }

  if (type === 'service_start') {
    const before = await getServiceStatus(service)
    if (before.state === 'running') {
      return `ℹ️ ${service.key}는 이미 실행 중이에요.\n${buildStatusLine(before)}`
    }
    if (!service.startCommand) {
      return `⚠️ ${service.key}는 시작 명령이 등록되지 않았어요.`
    }

    let startSummary = ''
    if (service.startMode === 'detached') {
      const pid = spawnDetached(service.startCommand, service.cwd, service.logPath)
      startSummary = pid > 0 ? `백그라운드 실행 요청 (pid ${pid})` : '백그라운드 실행 요청'
      await sleep(1500)
    } else {
      const result = await runCommand(service.startCommand, { cwd: service.cwd || PROJECT_ROOT, timeoutMs: 20000 })
      startSummary = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, 400)
      await sleep(2500)
    }

    const after = await getServiceStatus(service)
    const tail = await tailLog(service.logPath, 12)
    return [
      `▶️ ${service.key} 시작`,
      buildStatusLine(after),
      startSummary ? `- 실행 결과: ${startSummary}` : '',
      '',
      tail,
    ].filter(Boolean).join('\n')
  }

  if (type === 'service_stop') {
    const before = await getServiceStatus(service)
    if (before.state !== 'running') {
      return `ℹ️ ${service.key}는 이미 멈춰 있어요.\n${buildStatusLine(before)}`
    }
    const killed = await stopByMetadata(service)
    const after = await getServiceStatus(service)
    return [
      `⏹ ${service.key} 중지`,
      `- 종료 대상: ${killed.length ? killed.join(', ') : '없음'}`,
      buildStatusLine(after),
    ].join('\n')
  }

  if (type === 'service_restart') {
    const killed = await stopByMetadata(service)
    await sleep(1200)
    if (!service.startCommand) {
      return `⚠️ ${service.key}는 재시작 명령이 등록되지 않았어요.`
    }
    if (service.startMode === 'detached') {
      spawnDetached(service.startCommand, service.cwd, service.logPath)
    } else {
      await runCommand(service.startCommand, { cwd: service.cwd || PROJECT_ROOT, timeoutMs: 20000 })
    }
    await sleep(2500)
    const after = await getServiceStatus(service)
    const tail = await tailLog(service.logPath, 12)
    return [
      `🔄 ${service.key} 재시작`,
      `- 종료 대상: ${killed.length ? killed.join(', ') : '없음'}`,
      buildStatusLine(after),
      '',
      tail,
    ].join('\n')
  }

  return `⚠️ 지원하지 않는 서비스 액션: ${type}`
}
