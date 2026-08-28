import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EMPTY_COMPOSE, composeKey, createLatestOnly, draftOf, errorOf, isSeeded,
  publishFailed, publishSucceeded, seedDraft, setDraft,
} from '../inquiry-compose'

const A = composeKey('voicecards', 'thread-A')
const B = composeKey('portle', 'thread-B')

test('키는 앱까지 포함한다 — 두 앱의 스레드 id 는 겹칠 수 있다', () => {
  assert.notEqual(composeKey('voicecards', 'same-id'), composeKey('portle', 'same-id'))
})

test('발행이 실패하면 쓴 글이 남는다', () => {
  // 서버가 받았다고 확인하기 전에 입력창을 비우면, 실패한 답변이 보낸 것처럼 사라진다.
  let s = setDraft(EMPTY_COMPOSE, A, '환불은 이렇게 진행됩니다')
  s = publishFailed(s, A, 'HTTP 500')
  assert.equal(draftOf(s, A), '환불은 이렇게 진행됩니다')
  assert.equal(errorOf(s, A), 'HTTP 500')
})

test('실패 표시는 그 스레드 칸에만 남는다', () => {
  // 전역 실패 플래그면 A 의 실패가 B 의 빈 칸 옆에 뜨고, 정작 A 에서는 지워진다.
  let s = setDraft(EMPTY_COMPOSE, A, 'A 답변')
  s = setDraft(s, B, 'B 답변')
  s = publishFailed(s, A, '발행 실패')

  assert.equal(errorOf(s, A), '발행 실패')
  assert.equal(errorOf(s, B), null, 'B 에는 A 의 실패가 보이면 안 된다')
  assert.equal(draftOf(s, B), 'B 답변', 'B 의 초안은 그대로다')
})

test('초안도 스레드마다 따로다 — 스레드를 옮겨도 서로 덮지 않는다', () => {
  let s = setDraft(EMPTY_COMPOSE, A, 'A 답변')
  s = setDraft(s, B, 'B 답변')
  assert.equal(draftOf(s, A), 'A 답변')
  assert.equal(draftOf(s, B), 'B 답변')
  assert.equal(draftOf(s, composeKey('scripta', 'never-touched')), '')
})

test('성공한 뒤에야 그 스레드의 초안과 실패가 지워진다', () => {
  let s = setDraft(EMPTY_COMPOSE, A, 'A 답변')
  s = setDraft(s, B, 'B 답변')
  s = publishFailed(s, A, '한 번 실패')
  s = publishSucceeded(s, A)

  assert.equal(draftOf(s, A), '')
  assert.equal(errorOf(s, A), null)
  assert.equal(draftOf(s, B), 'B 답변', '남의 초안까지 지우면 안 된다')
})

test('다시 쓰기 시작하면 그 스레드의 실패 표시는 걷힌다', () => {
  let s = publishFailed(setDraft(EMPTY_COMPOSE, A, '초안'), A, '실패')
  s = setDraft(s, A, '초안 고침')
  assert.equal(errorOf(s, A), null)
})

test('상태를 갈아끼우지 않는다 — 이전 상태가 그대로 남는다', () => {
  const first = setDraft(EMPTY_COMPOSE, A, '처음')
  const second = setDraft(first, A, '나중')
  assert.equal(draftOf(first, A), '처음')
  assert.equal(draftOf(second, A), '나중')
  assert.equal(draftOf(EMPTY_COMPOSE, A), '')
})

// ─── 늦게 온 응답 가드 ─────────────────────────────────────────────────────────

test('늦게 온 응답은 버려진다 — 겹치는 두 선택', async () => {
  // A 를 고르고, 응답이 오기 전에 B 를 고른다. B 가 먼저 도착해 반영되고,
  // 뒤늦게 도착한 A 는 버려져야 한다. 형제 앱에서는 이 가드가 있는 것처럼
  // 보였지만 플래그가 한 번도 true 가 되지 않아, 관리자가 A 의 질문을 읽으면서
  // B 의 스레드에 답을 쓸 수 있었다.
  const latest = createLatestOnly()
  const committed: string[] = []

  const load = async (name: string, delayMs: number) => {
    const ticket = latest.begin()
    await new Promise(r => setTimeout(r, delayMs))
    if (!latest.isCurrent(ticket)) return
    committed.push(name)
  }

  const a = load('A', 40)   // 먼저 시작, 늦게 도착
  const b = load('B', 5)    // 나중에 시작, 먼저 도착
  await Promise.all([a, b])

  assert.deepEqual(committed, ['B'], 'A 는 이미 낡았으므로 반영되면 안 된다')
})

test('아무도 끼어들지 않으면 그대로 반영된다', async () => {
  const latest = createLatestOnly()
  const ticket = latest.begin()
  await new Promise(r => setTimeout(r, 1))
  assert.equal(latest.isCurrent(ticket), true)
})

test('표는 항상 올라가고, 지난 표는 최신이 아니다', () => {
  const latest = createLatestOnly()
  const first = latest.begin()
  const second = latest.begin()
  assert.ok(second > first)
  assert.equal(latest.isCurrent(first), false)
  assert.equal(latest.isCurrent(second), true)
})

test('세 번 겹쳐도 마지막 하나만 남는다', async () => {
  const latest = createLatestOnly()
  const committed: string[] = []
  const load = async (name: string, delayMs: number) => {
    const ticket = latest.begin()
    await new Promise(r => setTimeout(r, delayMs))
    if (latest.isCurrent(ticket)) committed.push(name)
  }
  await Promise.all([load('A', 30), load('B', 20), load('C', 1)])
  assert.deepEqual(committed, ['C'])
})

// ─── 봇 초안 채우기 ────────────────────────────────────────────────────────────
//
// 채우기는 편의지 권리가 아니다. 사람이 그 칸에 손을 댄 적이 있으면 봇은 물러난다.

test('빈 스레드는 봇 초안으로 채워진다', () => {
  const s = seedDraft(EMPTY_COMPOSE, A, '봇이 쓴 초안')
  assert.equal(draftOf(s, A), '봇이 쓴 초안')
  assert.equal(isSeeded(s, A), true)
})

test('사람이 쓰던 글을 봇 초안이 덮지 않는다', () => {
  let s = setDraft(EMPTY_COMPOSE, A, '내가 쓰던 답변')
  s = seedDraft(s, A, '봇이 쓴 초안')
  assert.equal(draftOf(s, A), '내가 쓰던 답변')
  assert.equal(isSeeded(s, A), false)
})

test('지워서 비워 둔 것도 사람의 결정이다 — 덮지 않는다', () => {
  // drafts[key] 가 '' 인 것과 키가 아예 없는 것은 다르다. 값으로만 보면
  // (`draftOf(s, key) === ''`) 일부러 비운 칸에 봇 초안이 들어온다.
  let s = setDraft(EMPTY_COMPOSE, A, '쓰다가')
  s = setDraft(s, A, '')
  s = seedDraft(s, A, '봇이 쓴 초안')
  assert.equal(draftOf(s, A), '')
  assert.equal(isSeeded(s, A), false)
})

test('같은 스레드를 두 번 열어도 두 번 채우지 않는다', () => {
  let s = seedDraft(EMPTY_COMPOSE, A, '봇 초안')
  s = setDraft(s, A, '봇 초안 + 내가 고친 부분')
  s = seedDraft(s, A, '봇 초안')          // 다시 열었다
  assert.equal(draftOf(s, A), '봇 초안 + 내가 고친 부분')
})

test('빈 초안으로는 채우지 않는다 — 채운 흔적도 남기지 않는다', () => {
  const s = seedDraft(EMPTY_COMPOSE, A, '   \n ')
  assert.equal(draftOf(s, A), '')
  assert.equal(isSeeded(s, A), false)
})

test('봇 초안 표시는 사람이 한 글자만 고쳐도 걷힌다', () => {
  let s = seedDraft(EMPTY_COMPOSE, A, '봇 초안')
  assert.equal(isSeeded(s, A), true)
  s = setDraft(s, A, '봇 초안!')
  assert.equal(isSeeded(s, A), false, '사람이 손댄 글을 봇 초안이라 부르면 안 된다')
})

test('발행이 실패하면 아직 봇 초안이다 — 그 글은 여전히 아무도 승인하지 않았다', () => {
  let s = seedDraft(EMPTY_COMPOSE, A, '봇 초안')
  s = publishFailed(s, A, 'HTTP 500')
  assert.equal(draftOf(s, A), '봇 초안')
  assert.equal(isSeeded(s, A), true)
})

test('발행에 성공하면 봇 표시도 함께 걷힌다', () => {
  let s = seedDraft(EMPTY_COMPOSE, A, '봇 초안')
  s = publishSucceeded(s, A)
  assert.equal(draftOf(s, A), '')
  assert.equal(isSeeded(s, A), false)
})

test('채우기도 스레드마다 따로다', () => {
  let s = seedDraft(EMPTY_COMPOSE, A, 'A 초안')
  s = setDraft(s, B, '내가 쓴 B')
  s = seedDraft(s, B, 'B 초안')
  assert.equal(draftOf(s, A), 'A 초안')
  assert.equal(isSeeded(s, A), true)
  assert.equal(draftOf(s, B), '내가 쓴 B')
  assert.equal(isSeeded(s, B), false)
})

test('상태를 갈아끼우지 않는다 — 채우기 전 상태가 그대로 남는다', () => {
  const before = EMPTY_COMPOSE
  const after = seedDraft(before, A, '봇 초안')
  assert.equal(draftOf(before, A), '')
  assert.equal(isSeeded(before, A), false)
  assert.equal(draftOf(after, A), '봇 초안')
})
