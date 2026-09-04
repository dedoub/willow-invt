import assert from 'node:assert/strict'
import test from 'node:test'

import { asFreshOrder, selectFresh, shuffle, type FreshItem } from '../english-queue'

const item = (id: string, createdAt: string, sourceType = 'wiki'): FreshItem =>
  ({ id, created_at: createdAt, source_type: sourceType })

// 등록 오름차순 풀 — API가 넘겨주는 순서와 같다
const pool: FreshItem[] = [
  item('a', '2026-08-01T00:00:00Z', 'wiki'),
  item('b', '2026-08-02T00:00:00Z', 'wiki'),
  item('c', '2026-08-03T00:00:00Z', 'business_talk'),
  item('d', '2026-08-04T00:00:00Z', 'daily_life'),
  item('e', '2026-08-05T00:00:00Z', 'wiki'),
]

test('모르는 값은 oldest로 떨어진다', () => {
  assert.equal(asFreshOrder('random'), 'random')
  assert.equal(asFreshOrder('spread'), 'spread')
  assert.equal(asFreshOrder(undefined), 'oldest')
  assert.equal(asFreshOrder('없는값'), 'oldest')
})

test('oldest는 오래된 것부터 앞에서 자른다', () => {
  assert.deepEqual(selectFresh(pool, 'oldest', 3).map(i => i.id), ['a', 'b', 'c'])
})

test('newest는 최신부터 자른다', () => {
  assert.deepEqual(selectFresh(pool, 'newest', 3).map(i => i.id), ['e', 'd', 'c'])
})

test('random은 풀에서 뽑되 중복 없이 개수만큼 준다', () => {
  const got = selectFresh(pool, 'random', 3)
  assert.equal(got.length, 3)
  assert.equal(new Set(got.map(i => i.id)).size, 3)
  for (const g of got) assert.ok(pool.some(p => p.id === g.id))
})

test('random은 원본 배열을 건드리지 않는다', () => {
  const before = pool.map(i => i.id)
  selectFresh(pool, 'random', 5)
  assert.deepEqual(pool.map(i => i.id), before)
})

test('spread는 종류를 돌아가며 뽑는다', () => {
  // wiki 3 · business_talk 1 · daily_life 1 → 앞 3개에 세 종류가 다 들어와야 한다
  const got = selectFresh(pool, 'spread', 3)
  assert.equal(new Set(got.map(i => i.source_type)).size, 3)
})

test('spread는 한 종류가 떨어져도 나머지로 채운다', () => {
  const got = selectFresh(pool, 'spread', 5)
  assert.equal(got.length, 5)
  assert.equal(new Set(got.map(i => i.id)).size, 5)
})

test('요청 개수가 풀보다 크면 있는 만큼만 준다', () => {
  for (const order of ['oldest', 'newest', 'random', 'spread'] as const) {
    assert.equal(selectFresh(pool, order, 99).length, 5, order)
  }
})

test('빈 풀은 빈 배열이다', () => {
  assert.deepEqual(selectFresh([], 'spread', 5), [])
})

test('shuffle은 원소를 잃지도 더하지도 않는다', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const out = shuffle(input)
  assert.deepEqual([...out].sort((a, b) => a - b), input)
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8])
})

test('shuffle은 첫 자리를 고르게 돌린다 (편향 셔플 회귀)', () => {
  // sort(() => Math.random() - 0.5)는 비교가 일관되지 않아 원래 순서 쪽으로
  // 치우친다. 신규+복습을 이어붙인 뒤 섞으므로 그 편향이 그대로 화면에 나온다.
  const counts = new Map<number, number>()
  for (let i = 0; i < 6000; i++) {
    const first = shuffle([0, 1, 2, 3, 4, 5])[0]
    counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  for (const v of [0, 1, 2, 3, 4, 5]) {
    const share = (counts.get(v) ?? 0) / 6000
    assert.ok(share > 0.12 && share < 0.21, `${v} 비율 ${share.toFixed(3)}`)
  }
})
