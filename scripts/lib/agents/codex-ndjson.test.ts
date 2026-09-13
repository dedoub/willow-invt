import assert from 'node:assert/strict'
import test from 'node:test'
import readline from 'node:readline'
import { Readable } from 'node:stream'

import { escapeLineSeparators, installNdjsonReadlineGuard } from './codex-ndjson'

/** SDK 가 하는 것과 같은 방식으로 한 줄씩 읽는다. */
async function readLines(chunks: Buffer[]): Promise<string[]> {
  const rl = readline.createInterface({ input: Readable.from(chunks), crlfDelay: Infinity })
  const out: string[] = []
  for await (const line of rl) out.push(line)
  return out
}

test('Node readline splits on U+2028 — 이게 버그의 뿌리다', async () => {
  const payload = `${JSON.stringify({ type: 'item.completed', text: 'before\u2028after' })}\n`
  const lines = await readLines([Buffer.from(payload, 'utf8')])
  // 기대가 아니라 사실을 박아 둔다: 한 줄로 실었는데 두 줄로 나온다.
  assert.equal(lines.length, 2)
  assert.throws(() => JSON.parse(lines[0]))
})

test('escapeLineSeparators keeps the JSON on one line and preserves the character', async () => {
  const original = { type: 'item.completed', text: 'before\u2028after\u2029end' }
  const payload = `${JSON.stringify(original)}\n`
  const guarded = escapeLineSeparators()
  const lines = await readLines([]) // 빈 입력도 안전한지 같이 본다
  assert.deepEqual(lines, [])

  const rl = readline.createInterface({
    input: Readable.from([Buffer.from(payload, 'utf8')]).pipe(guarded),
    crlfDelay: Infinity,
  })
  const out: string[] = []
  for await (const line of rl) out.push(line)

  assert.equal(out.length, 1)
  // 파싱되고, 원래 문자가 그대로 살아 있어야 한다 — 지워 버리면 본문이 달라진다.
  assert.deepEqual(JSON.parse(out[0]), original)
})

test('escapeLineSeparators survives a multi-byte character split across chunks', async () => {
  const original = { text: 'a\u2028b' }
  const raw = Buffer.from(`${JSON.stringify(original)}\n`, 'utf8')
  // U+2028 은 UTF-8 로 E2 80 A8 이다. 그 한가운데를 끊어 두 청크로 보낸다.
  const at = raw.indexOf(Buffer.from([0xe2, 0x80, 0xa8]))
  assert.ok(at > 0, 'U+2028 이 바이트열에 있어야 한다')
  const chunks = [raw.subarray(0, at + 1), raw.subarray(at + 1)]

  const rl = readline.createInterface({
    input: Readable.from(chunks).pipe(escapeLineSeparators()),
    crlfDelay: Infinity,
  })
  const out: string[] = []
  for await (const line of rl) out.push(line)

  assert.equal(out.length, 1)
  assert.deepEqual(JSON.parse(out[0]), original)
})

test('installNdjsonReadlineGuard makes a plain createInterface call safe', async () => {
  installNdjsonReadlineGuard()
  // SDK 와 같은 호출 모양. 패치가 걸렸으면 쪼개지지 않는다.
  const payload = `${JSON.stringify({ text: 'x\u2028y' })}\n`
  const lines = await readLines([Buffer.from(payload, 'utf8')])
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]), { text: 'x\u2028y' })
})
