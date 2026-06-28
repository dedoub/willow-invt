import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export interface AgentThreadRecord {
  botKey: string
  chatId: number
  workspaceKey: string
  taskScope: string
  threadId: string
  status: 'active' | 'failed'
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  workspacePath?: string
  lastUserMessage?: string
  lastSummary?: string
  lastError?: string
  runCount: number
}

interface AgentThreadStore {
  version: 1
  threads: AgentThreadRecord[]
}

export interface AgentThreadLookup {
  botKey: string
  chatId: number
  workspaceKey: string
  taskScope: string
}

const EMPTY_STORE: AgentThreadStore = { version: 1, threads: [] }

function ensureParentDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function normalizeScope(scope: string): string {
  const cleaned = (scope || '').trim().toLowerCase().replace(/\s+/g, '-')
  return cleaned || 'interactive-main'
}

function readStore(filePath: string): AgentThreadStore {
  if (!existsSync(filePath)) return { ...EMPTY_STORE }
  try {
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { ...EMPTY_STORE }
    const parsed = JSON.parse(raw) as AgentThreadStore
    if (!Array.isArray(parsed.threads)) return { ...EMPTY_STORE }
    return {
      version: 1,
      threads: parsed.threads.filter(thread =>
        typeof thread?.botKey === 'string'
        && typeof thread?.chatId === 'number'
        && typeof thread?.workspaceKey === 'string'
        && typeof thread?.taskScope === 'string'
        && typeof thread?.threadId === 'string'
      ),
    }
  } catch {
    return { ...EMPTY_STORE }
  }
}

function writeStore(filePath: string, store: AgentThreadStore) {
  ensureParentDir(filePath)
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

function matchThread(thread: AgentThreadRecord, lookup: AgentThreadLookup): boolean {
  return thread.botKey === lookup.botKey
    && thread.chatId === lookup.chatId
    && thread.workspaceKey === lookup.workspaceKey
    && thread.taskScope === normalizeScope(lookup.taskScope)
}

export function getAgentThread(filePath: string, lookup: AgentThreadLookup): AgentThreadRecord | null {
  const store = readStore(filePath)
  return store.threads.find(thread => matchThread(thread, lookup)) || null
}

export function upsertAgentThread(
  filePath: string,
  thread: AgentThreadLookup & {
    threadId: string
    status?: AgentThreadRecord['status']
    workspacePath?: string
    lastUserMessage?: string
    lastSummary?: string
    lastError?: string
    countRun?: boolean
  }
): AgentThreadRecord {
  const now = new Date().toISOString()
  const store = readStore(filePath)
  const taskScope = normalizeScope(thread.taskScope)
  const index = store.threads.findIndex(entry => matchThread(entry, { ...thread, taskScope }))
  const existing = index >= 0 ? store.threads[index] : null

  const merged: AgentThreadRecord = {
    botKey: thread.botKey,
    chatId: thread.chatId,
    workspaceKey: thread.workspaceKey,
    taskScope,
    threadId: thread.threadId,
    status: thread.status ?? existing?.status ?? 'active',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastRunAt: now,
    workspacePath: thread.workspacePath ?? existing?.workspacePath,
    lastUserMessage: thread.lastUserMessage ?? existing?.lastUserMessage,
    lastSummary: thread.lastSummary ?? existing?.lastSummary,
    lastError: thread.lastError ?? (thread.status === 'failed' ? existing?.lastError : undefined),
    runCount: (existing?.runCount ?? 0) + (thread.countRun ? 1 : 0),
  }

  if (index >= 0) store.threads[index] = merged
  else store.threads.push(merged)
  writeStore(filePath, store)
  return merged
}

export function markAgentThreadFailed(
  filePath: string,
  lookup: AgentThreadLookup,
  errorMessage: string
): AgentThreadRecord | null {
  const store = readStore(filePath)
  const index = store.threads.findIndex(thread => matchThread(thread, lookup))
  if (index < 0) return null

  store.threads[index] = {
    ...store.threads[index],
    status: 'failed',
    updatedAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    lastError: errorMessage,
  }
  writeStore(filePath, store)
  return store.threads[index]
}

export function shortThreadId(threadId: string | null | undefined): string {
  if (!threadId) return ''
  return threadId.length > 12 ? `${threadId.slice(0, 12)}…` : threadId
}
