import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  REJECTION_LIMIT, blockingCertLock, certLockMessage, certLockPath, clearCertLock, readCertLock,
  recordCertRejection,
} from './cert-attempt-lock.mjs'

async function scratchFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cert-lock-'))
  return path.join(dir, 'cert-lock-woori-card.json')
}

test('잠금 파일은 회사별 로그 폴더에 site 이름으로 놓인다', () => {
  const file = certLockPath('tensw', 'woori-card')
  assert.ok(file.endsWith(path.join('logs', 'tensw-local-finance', 'cert-lock-woori-card.json')))
})

test('거부가 없으면 아무것도 막지 않는다', async () => {
  const file = await scratchFile()
  assert.equal(await readCertLock(file), null)
  assert.equal(await blockingCertLock(file), null)
})

test('거부는 누적되고 첫 시각을 잃지 않는다', async () => {
  const file = await scratchFile()
  const first = await recordCertRejection(file, { at: new Date('2026-08-27T04:01:30+09:00') })
  const second = await recordCertRejection(file, { at: new Date('2026-08-28T04:01:30+09:00') })

  assert.equal(first.rejections, 1)
  assert.equal(second.rejections, 2)
  assert.equal(second.first_rejected_at, first.first_rejected_at)
  assert.notEqual(second.last_rejected_at, second.first_rejected_at)
})

test('한도에 닿기 전에는 다음 실행을 막지 않는다 — 한 번은 화면 상태 탓일 수 있다', async () => {
  const file = await scratchFile()
  await recordCertRejection(file)
  assert.equal(await blockingCertLock(file), null)
})

test('한도에 닿으면 막는다 — 5회면 인증서가 잠긴다', async () => {
  const file = await scratchFile()
  for (let index = 0; index < REJECTION_LIMIT; index += 1) await recordCertRejection(file)
  const blocked = await blockingCertLock(file)
  assert.equal(blocked.rejections, REJECTION_LIMIT)
  assert.ok(REJECTION_LIMIT < 5)
})

test('로그인에 성공하면 잠금이 풀린다', async () => {
  const file = await scratchFile()
  await recordCertRejection(file)
  await recordCertRejection(file)
  await clearCertLock(file)
  assert.equal(await blockingCertLock(file), null)
})

test('안내문은 무엇을 지워야 다시 도는지까지 알려준다', async () => {
  const file = await scratchFile()
  const lock = await recordCertRejection(file, { reason: '증거=/tmp/a.png' })
  const message = certLockMessage('우리카드', lock, file)

  assert.match(message, /우리카드 인증서 암호가 1회 거부/)
  assert.ok(message.includes(file))
  assert.ok(message.includes('증거=/tmp/a.png'))
})
