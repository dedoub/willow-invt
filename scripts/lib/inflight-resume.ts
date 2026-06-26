import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export type PendingTaskPhase =
  | 'queued'
  | 'running'
  | 'codex_running'
  | 'action_running'
  | 'response_sending'
  | 'resuming'

export interface PendingTaskEntry {
  chatId: number
  text: string
  lastMessageId?: number
  startedAt: string
  updatedAt: string
  phase: PendingTaskPhase
  resumeCount: number
  workspaceKey?: string
  workspacePath?: string
}

interface PendingTaskStore {
  version: 1
  tasks: PendingTaskEntry[]
}

const EMPTY_STORE: PendingTaskStore = {
  version: 1,
  tasks: [],
}

function ensureParentDir(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function readStore(filePath: string): PendingTaskStore {
  if (!existsSync(filePath)) return { ...EMPTY_STORE }

  try {
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { ...EMPTY_STORE }
    const parsed = JSON.parse(raw) as PendingTaskStore
    if (!Array.isArray(parsed.tasks)) return { ...EMPTY_STORE }
    return {
      version: 1,
      tasks: parsed.tasks.filter(task => typeof task?.chatId === 'number' && typeof task?.text === 'string'),
    }
  } catch {
    return { ...EMPTY_STORE }
  }
}

function writeStore(filePath: string, store: PendingTaskStore) {
  ensureParentDir(filePath)
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
}

export function loadPendingTasks(filePath: string): PendingTaskEntry[] {
  return readStore(filePath).tasks
}

export function savePendingTask(
  filePath: string,
  task: Pick<PendingTaskEntry, 'chatId' | 'text'> & Partial<Omit<PendingTaskEntry, 'chatId' | 'text'>>
) {
  const now = new Date().toISOString()
  const store = readStore(filePath)
  const existingIndex = store.tasks.findIndex(entry => entry.chatId === task.chatId)
  const existing = existingIndex >= 0 ? store.tasks[existingIndex] : null

  const merged: PendingTaskEntry = {
    chatId: task.chatId,
    text: task.text,
    lastMessageId: task.lastMessageId ?? existing?.lastMessageId,
    startedAt: task.startedAt ?? existing?.startedAt ?? now,
    updatedAt: now,
    phase: task.phase ?? existing?.phase ?? 'running',
    resumeCount: task.resumeCount ?? existing?.resumeCount ?? 0,
    workspaceKey: task.workspaceKey ?? existing?.workspaceKey,
    workspacePath: task.workspacePath ?? existing?.workspacePath,
  }

  if (existingIndex >= 0) {
    store.tasks[existingIndex] = merged
  } else {
    store.tasks.push(merged)
  }

  writeStore(filePath, store)
}

export function patchPendingTask(
  filePath: string,
  chatId: number,
  patch: Partial<Omit<PendingTaskEntry, 'chatId'>>
) {
  const store = readStore(filePath)
  const index = store.tasks.findIndex(entry => entry.chatId === chatId)
  if (index < 0) return

  store.tasks[index] = {
    ...store.tasks[index],
    ...patch,
    chatId,
    updatedAt: new Date().toISOString(),
  }

  writeStore(filePath, store)
}

export function removePendingTask(filePath: string, chatId: number) {
  const store = readStore(filePath)
  const nextTasks = store.tasks.filter(entry => entry.chatId !== chatId)
  if (nextTasks.length === store.tasks.length) return
  writeStore(filePath, { version: 1, tasks: nextTasks })
}

export function isResumablePendingTask(task: PendingTaskEntry, nowMs = Date.now()): boolean {
  const startedAtMs = Date.parse(task.startedAt)
  if (!Number.isFinite(startedAtMs)) return false
  if (nowMs - startedAtMs > 30 * 60 * 1000) return false
  if (task.resumeCount >= 2) return false
  if (task.phase === 'response_sending') return false
  return Boolean(task.text?.trim())
}
