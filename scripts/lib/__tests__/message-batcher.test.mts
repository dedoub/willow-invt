/**
 * scripts/lib/message-batcher.ts 회귀 테스트.
 *
 * 실행: npx tsx scripts/lib/__tests__/message-batcher.test.mts
 *
 * 프레임워크 없이 도는 단독 스크립트다. 배칭은 타이머·abort 레이스가 얽혀서
 * 눈으로 읽어서는 못 잡는다. 실제로 돌려봐야 한다.
 */
import assert from 'node:assert/strict'
import { createMessageBatcher } from '../message-batcher'

const CHAT = 1
const DELAY = 50 // 테스트용 짧은 디바운스
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Harness {
  batcher: ReturnType<typeof createMessageBatcher>
  runs: string[]
  abortControllers: Map<number, AbortController>
  inFlightText: Map<number, string>
}

/**
 * @param runBehavior run이 어떻게 끝나는지. 배칭 레이스는 abort 반응 속도에
 *   좌우되므로 이걸 테스트마다 바꿔가며 돌린다.
 */
function harness(runBehavior: (signal: AbortSignal) => Promise<void>): Harness {
  const runs: string[] = []
  const abortControllers = new Map<number, AbortController>()
  const inFlightText = new Map<number, string>()

  const batcher = createMessageBatcher({
    delayMs: DELAY,
    abortControllers,
    inFlightText,
    async run(chatId, combined, signal) {
      runs.push(combined)
      await runBehavior(signal)
    },
  })

  return { batcher, runs, abortControllers, inFlightText }
}

/** abort 신호가 오면 즉시 끝나는 run. 유실 버그가 터지던 조건이다. */
function fastAbort(signal: AbortSignal): Promise<void> {
  return new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

/** abort 신호를 받고도 디바운스보다 오래 붙잡고 있는 run. */
async function slowAbort(signal: AbortSignal): Promise<void> {
  await fastAbort(signal)
  await sleep(DELAY * 3)
}

const tests: Array<[string, () => Promise<void>]> = [
  ['디바운스 안에 연달아 온 메시지는 한 번에 합쳐진다', async () => {
    const h = harness(async () => { await sleep(10) })
    await h.batcher.push(CHAT, 'A', 1)
    await h.batcher.push(CHAT, 'B', 2)
    await h.batcher.push(CHAT, 'C', 3)
    await sleep(DELAY * 3)

    assert.deepEqual(h.runs, ['A\n\nB\n\nC'])
  }],

  ['처리 중에 새 메시지가 오면 이전 메시지를 버리지 않는다 (즉시 abort)', async () => {
    const h = harness(fastAbort)
    await h.batcher.push(CHAT, 'A', 1)
    await sleep(DELAY * 2)          // A 처리 시작
    assert.deepEqual(h.runs, ['A'])

    await h.batcher.push(CHAT, 'B', 2)  // A를 abort시키고 재배칭
    await sleep(DELAY * 3)

    assert.deepEqual(h.runs, ['A', 'A\n\nB'], 'A가 유실되면 안 된다')
  }],

  ['abort가 느려도 이전 메시지가 중복되지 않는다', async () => {
    const h = harness(slowAbort)
    await h.batcher.push(CHAT, 'A', 1)
    await sleep(DELAY * 2)

    await h.batcher.push(CHAT, 'B', 2)
    await sleep(DELAY * 6)

    assert.deepEqual(h.runs, ['A', 'A\n\nB'])
  }],

  ['연속 3턴 동안 앞선 메시지가 계속 누적된다', async () => {
    const h = harness(fastAbort)
    await h.batcher.push(CHAT, 'A', 1)
    await sleep(DELAY * 2)
    await h.batcher.push(CHAT, 'B', 2)
    await sleep(DELAY * 2)
    await h.batcher.push(CHAT, 'C', 3)
    await sleep(DELAY * 3)

    assert.deepEqual(h.runs, ['A', 'A\n\nB', 'A\n\nB\n\nC'])
  }],

  ['액션이 실행된 뒤(dropInFlight)에는 이전 메시지를 재배칭하지 않는다', async () => {
    // 액션까지 간 입력을 다시 합치면 같은 액션이 두 번 실행된다.
    const h = harness(async (signal) => {
      h.batcher.dropInFlight(CHAT)
      await fastAbort(signal)
    })
    await h.batcher.push(CHAT, 'A', 1)
    await sleep(DELAY * 2)

    await h.batcher.push(CHAT, 'B', 2)
    await sleep(DELAY * 3)

    assert.deepEqual(h.runs, ['A', 'B'])
  }],

  ['cancel은 대기 중인 배치와 진행 중인 run을 모두 정리한다', async () => {
    const h = harness(fastAbort)
    await h.batcher.push(CHAT, 'A', 1)
    await sleep(DELAY * 2)

    h.batcher.cancel(CHAT)
    await sleep(DELAY * 3)
    assert.deepEqual(h.runs, ['A'])

    // 취소 이후 들어온 메시지는 이전 맥락 없이 혼자 돈다
    await h.batcher.push(CHAT, 'B', 2)
    await sleep(DELAY * 3)
    assert.deepEqual(h.runs, ['A', 'B'])
  }],

  ['서로 다른 chat은 배치가 섞이지 않는다', async () => {
    const h = harness(fastAbort)
    await h.batcher.push(1, 'A', 1)
    await h.batcher.push(2, 'X', 2)
    await sleep(DELAY * 3)

    assert.deepEqual(h.runs.sort(), ['A', 'X'])
  }],
]

let failed = 0
for (const [name, fn] of tests) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
  } catch (err) {
    failed++
    console.log(`  ❌ ${name}`)
    console.log(`     ${err instanceof Error ? err.message.split('\n').join('\n     ') : err}`)
  }
}

console.log(failed === 0 ? `\n${tests.length}개 통과` : `\n${failed}/${tests.length}개 실패`)
process.exit(failed === 0 ? 0 : 1)
