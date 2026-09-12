import assert from 'node:assert/strict'
import test from 'node:test'
import { isResumeFailure, runWithClient } from '../codex-sdk-runner'

/**
 * 2026-09-12 실측. 윌리 봇이 같은 오류를 재시작해도 계속 뱉었다:
 *
 *   Error: thread/resume: thread/resume failed: paginated_threads is not supported yet (code -32601)
 *
 * 뿌리는 둘이다.
 * (1) 6월에 만든 오래된 codex 스레드는 지금 깔린 codex 로 <b>이어받을 수 없다</b>.
 *     새로 만든 스레드는 멀쩡히 이어받아진다 — 재현으로 확인했다.
 * (2) 그 죽은 id 가 <b>파일에</b> 적혀 있어서(willy-agent-threads.json), 프로세스를
 *     다시 띄워도 같은 id 를 또 집어 든다. 대안이 없어 그 워크스페이스의 대화는
 *     영원히 실패한다. 「재시작해도 온다」의 정체가 이것이다.
 *
 * 고치는 자리는 (2)다. 이어받기가 깨지면 <b>새 스레드로 한 번 물러서서</b> 답을
 * 내고, 새 id 를 돌려줘 호출부가 죽은 id 를 갈아 끼우게 한다.
 */

type FakeEvent = Record<string, unknown>

/**
 * <b>실제 SDK 는 `runStreamed` 에서 안 던진다.</b> 2026-09-12 실측: 이어받기 실패는
 * `runStreamed` 가 무사히 반환한 <b>뒤</b> 이벤트를 읽는 중에 터진다. 처음 만든
 * 가짜는 await 에서 던지게 해 두어, 고쳐 놓고도 실제로는 안 걸리는 줄 몰랐다.
 * 그래서 두 자리를 <b>모두</b> 흉내 낸다.
 */
function fakeThread(id: string, events: FakeEvent[], opts?: { throwOnRun?: Error; throwOnIterate?: Error; throwAfter?: number }) {
  return {
    id,
    runStreamed: async () => {
      if (opts?.throwOnRun) throw opts.throwOnRun
      return {
        events: (async function* () {
          let sent = 0
          for (const e of events) {
            if (opts?.throwOnIterate && sent === (opts.throwAfter ?? 0)) throw opts.throwOnIterate
            yield e
            sent += 1
          }
          if (opts?.throwOnIterate && sent === (opts.throwAfter ?? 0)) throw opts.throwOnIterate
        })(),
      }
    },
  }
}

function okEvents(id: string, text: string): FakeEvent[] {
  return [
    { type: 'thread.started', thread_id: id },
    { type: 'item.completed', item: { type: 'agent_message', text } },
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ]
}

const RESUME_ERR = new Error(
  'Codex Exec exited with code 1: Reading prompt from stdin...\n'
  + 'Error: thread/resume: thread/resume failed: paginated_threads is not supported yet (code -32601)'
)

test('이어받기가 깨지면 새 스레드로 물러서서 답을 낸다', async () => {
  const calls: string[] = []
  const client = {
    resumeThread: (id: string) => { calls.push(`resume:${id}`); return fakeThread(id, [], { throwOnIterate: RESUME_ERR }) },
    startThread: () => { calls.push('start'); return fakeThread('new-thread', okEvents('new-thread', '안녕')) },
  }

  const events: Array<{ threadId: string; mode: string }> = []
  const out = await runWithClient(client as never, '안녕?', {
    threadId: 'dead-thread',
    onThreadEvent: (e) => events.push(e as never),
  } as never)

  assert.equal(out.text, '안녕')
  // 새 id 를 돌려줘야 호출부가 파일의 죽은 id 를 갈아 끼운다.
  assert.equal(out.threadId, 'new-thread')
  assert.deepEqual(calls, ['resume:dead-thread', 'start'])
  // 이어받기가 무너졌다는 사실을 화면에도 알린다 — 조용히 맥락을 잃으면 안 된다.
  assert.ok(events.some(e => e.mode === 'resume_failed'), '이어받기 실패를 알려야 한다')
  // <b>살아 있는 id 를 알려야 한다.</b> 이것이 없으면 호출부가 죽은 id 를 계속 쥔다.
  assert.ok(
    events.some(e => e.mode === 'started' && e.threadId === 'new-thread'),
    '물러선 새 스레드의 id 를 알려야 한다',
  )
  // 죽은 id 를 「살아 있다」고 알리지 않는다.
  assert.ok(!events.some(e => e.mode === 'started' && e.threadId === 'dead-thread'))
})

test('이어받기와 무관한 오류는 그대로 올린다 — 같은 일을 두 번 시키지 않는다', async () => {
  const calls: string[] = []
  const boom = new Error('network unreachable')
  const client = {
    resumeThread: (id: string) => { calls.push(`resume:${id}`); return fakeThread(id, [], { throwOnIterate: boom }) },
    startThread: () => { calls.push('start'); return fakeThread('new-thread', okEvents('new-thread', 'x')) },
  }

  await assert.rejects(
    () => runWithClient(client as never, '안녕?', { threadId: 't1' } as never),
    /network unreachable/,
  )
  assert.deepEqual(calls, ['resume:t1'], '물러서지 말아야 한다')
})

test('이어받을 id 가 없으면 처음부터 새 스레드다 — 물러설 자리도 없다', async () => {
  const calls: string[] = []
  const client = {
    resumeThread: () => { calls.push('resume'); return fakeThread('x', []) },
    startThread: () => { calls.push('start'); return fakeThread('fresh', okEvents('fresh', '처음')) },
  }
  const out = await runWithClient(client as never, '안녕?', {} as never)
  assert.equal(out.threadId, 'fresh')
  assert.deepEqual(calls, ['start'])
})

test('물러선 새 스레드마저 깨지면 그 오류를 올린다', async () => {
  const client = {
    resumeThread: (id: string) => fakeThread(id, [], { throwOnIterate: RESUME_ERR }),
    startThread: () => fakeThread('new', [], { throwOnRun: new Error('시작도 실패') }),
  }
  await assert.rejects(
    () => runWithClient(client as never, '안녕?', { threadId: 'dead' } as never),
    /시작도 실패/,
  )
})

test('isResumeFailure — 이어받기 실패만 골라낸다', () => {
  assert.equal(isResumeFailure(RESUME_ERR), true)
  assert.equal(isResumeFailure(new Error('thread/resume: thread/resume failed: no rollout found')), true)
  assert.equal(isResumeFailure(new Error('network unreachable')), false)
  assert.equal(isResumeFailure(new Error('turn failed: model overloaded')), false)
  assert.equal(isResumeFailure(null), false)
})


test('이어받기 실패가 await 에서 나도 물러선다 — 두 자리 모두', async () => {
  const calls: string[] = []
  const client = {
    resumeThread: (id: string) => { calls.push('resume'); return fakeThread(id, [], { throwOnRun: RESUME_ERR }) },
    startThread: () => { calls.push('start'); return fakeThread('new2', okEvents('new2', '됐어요')) },
  }
  const out = await runWithClient(client as never, '안녕?', { threadId: 'dead' } as never)
  assert.equal(out.text, '됐어요')
  assert.deepEqual(calls, ['resume', 'start'])
})

/**
 * <b>이미 일한 턴은 다시 시키지 않는다.</b> 답을 절반 받아 놓고 이어받기 오류가
 * 나면, 새 스레드로 처음부터 다시 돌리는 것은 값을 두 번 물리는 일이다.
 */
test('이벤트를 이미 받은 뒤에 깨지면 물러서지 않는다', async () => {
  const calls: string[] = []
  const client = {
    resumeThread: (id: string) => {
      calls.push('resume')
      return fakeThread(id, okEvents(id, '절반'), { throwOnIterate: RESUME_ERR, throwAfter: 2 })
    },
    startThread: () => { calls.push('start'); return fakeThread('new3', okEvents('new3', '새로')) },
  }
  await assert.rejects(
    () => runWithClient(client as never, '안녕?', { threadId: 'half' } as never),
    /paginated_threads/,
  )
  assert.deepEqual(calls, ['resume'], '이미 받은 턴을 다시 돌리면 안 된다')
})
