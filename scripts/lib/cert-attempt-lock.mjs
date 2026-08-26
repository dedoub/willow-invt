// 인증서 암호가 거부된 뒤 다음 실행이 또 누르지 못하게 막는다.
//
// 우리카드도 KB카드도 암호를 5회 틀리면 인증서를 잠근다. 잠기면 카드뿐 아니라
// 같은 인증서를 쓰는 홈택스까지 함께 멈추고, 푸는 데 사람이 붙어야 한다.
// 스케줄러는 매일 새벽 혼자 도니, 한 번 거부된 상태를 그대로 두면 닷새 만에
// 잠긴다. 그래서 거부를 파일로 남기고, 사람이 풀기 전까지는 시도 자체를 건너뛴다.
//
// 잠금은 로그인이 성공하면 저절로 풀린다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** 인증서가 잠기기 전에 멈출 지점. 5회가 한도라 두 번까지만 쓴다. */
export const REJECTION_LIMIT = 2

export function certLockPath(company, site) {
  return path.join(os.homedir(), 'logs', `${company}-local-finance`, `cert-lock-${site}.json`)
}

export async function readCertLock(file) {
  return fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)
}

/**
 * 거부를 한 번 더 셈한다. 누적 횟수를 돌려주므로, 부른 쪽이 한도와 견줘 다음
 * 실행을 막을지 정한다.
 */
export async function recordCertRejection(file, { reason = '', at = new Date() } = {}) {
  const previous = await readCertLock(file)
  const lock = {
    rejections: (previous?.rejections ?? 0) + 1,
    first_rejected_at: previous?.first_rejected_at ?? at.toISOString(),
    last_rejected_at: at.toISOString(),
    reason,
  }
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(lock, null, 2)}\n`)
  return lock
}

export async function clearCertLock(file) {
  await fs.rm(file, { force: true }).catch(() => {})
}

/** 사람에게 무엇을 해야 하는지까지 알려준다. 새벽 로그만 보고도 풀 수 있어야 한다. */
export function certLockMessage(label, lock, file) {
  return [
    `${label} 인증서 암호가 ${lock.rejections}회 거부돼 자동 시도를 멈춰 뒀어요.`,
    `5회 틀리면 인증서가 잠겨 홈택스까지 멈춰요.`,
    `마지막 거부: ${lock.last_rejected_at}${lock.reason ? ` (${lock.reason})` : ''}`,
    `암호를 확인한 뒤 이 파일을 지우면 다시 시도해요: ${file}`,
  ].join('\n')
}

/** 한도에 닿았으면 잠금 상태를 돌려준다. 아직이면 null. */
export async function blockingCertLock(file, limit = REJECTION_LIMIT) {
  const lock = await readCertLock(file)
  if (!lock || (lock.rejections ?? 0) < limit) return null
  return lock
}
