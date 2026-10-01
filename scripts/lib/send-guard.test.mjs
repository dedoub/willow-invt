import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSendAllowed, holdNoSend, sendBlockedBy } from './send-guard.mjs'

const lockIn = () => join(mkdtempSync(join(tmpdir(), 'send-guard-')), 'no-send.lock')

test('잠금이 없으면 보낼 수 있다', () => {
  assert.doesNotThrow(() => assertSendAllowed('test', lockIn()))
})

test('디스패치가 잠금을 잡고 있으면 발송을 막고, 풀면 다시 열린다', () => {
  const lock = lockIn()
  const release = holdNoSend('cmd-1', lock)
  assert.throws(() => assertSendAllowed('출근부', lock), /발송 차단/)
  release()
  assert.equal(existsSync(lock), false)
  assert.doesNotThrow(() => assertSendAllowed('출근부', lock))
})

test('잠금을 만든 프로세스가 죽었으면 무시한다', () => {
  const lock = lockIn()
  writeFileSync(lock, JSON.stringify({ pid: 999999, command: 'dead' }))
  assert.equal(sendBlockedBy(lock), null)
})
