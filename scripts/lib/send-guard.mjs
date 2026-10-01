// 발송 차단 — 윌리가 넘긴 디스패치 작업(codex)이 도는 동안에는 메일을 보내지 않는다.
// 2026-10-01: 디스패치가 대표 확인 없이 인턴 3명에게 메일을 두 번 보냈다. 보내는 건 대표가 초안을 보고 직접 한다.
//
// ws-dispatcher 가 작업 시작 때 잠금 파일을 만들고 끝나면 지운다. codex 의 셸은 환경변수를 물려받지 않아서
// (shell_environment_policy inherit=core) 파일로 표시한다. 잠금을 만든 프로세스가 죽었으면 무시한다.
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export const NO_SEND_LOCK = join(homedir(), '.willow', 'no-send.lock')

function alive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

export function sendBlockedBy(lockPath = NO_SEND_LOCK) {
  if (!existsSync(lockPath)) return null
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    return lock?.pid && alive(lock.pid) ? lock : null
  } catch {
    return null
  }
}

export function assertSendAllowed(what, lockPath = NO_SEND_LOCK) {
  const lock = sendBlockedBy(lockPath)
  if (lock) {
    throw new Error(`발송 차단: 윌리 디스패치 작업 중에는 메일을 보내지 않아요(${what}). 초안까지만 만들고, 발송은 대표님이 확인한 뒤 직접 합니다. [작업 ${lock.command ?? '?'}]`)
  }
}

export function holdNoSend(command, lockPath = NO_SEND_LOCK) {
  mkdirSync(dirname(lockPath), { recursive: true })
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, command, at: new Date().toISOString() }))
  return () => { try { rmSync(lockPath, { force: true }) } catch { /* noop */ } }
}
