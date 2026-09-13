import assert from 'node:assert/strict'
import test from 'node:test'

import { lastRowSpan } from './linear-stat-rows'

test('리뷰노트 활동 지표 — 지표 5개를 모바일 2열로', () => {
  // 줄은 [노트,문제] [문제세트,문제풀이] [용량]. 용량이 두 칸을 차지해야
  // 그 위 구분선이 폭을 다 덮고 '문제 풀이' 밑에도 선이 생긴다.
  assert.equal(lastRowSpan(5, 2), 2)
})

test('2열 모드 3열 배치에서도 마지막 줄을 채운다', () => {
  // [노트,문제,문제세트] [문제풀이,용량] → 용량이 두 칸
  assert.equal(lastRowSpan(5, 3), 2)
})

test('한 줄에 다 들어가면 늘리지 않는다', () => {
  assert.equal(lastRowSpan(5, 5), 1)
  assert.equal(lastRowSpan(3, 5), 1)
})

test('마지막 줄이 꽉 차면 늘리지 않는다', () => {
  assert.equal(lastRowSpan(4, 2), 1)
  assert.equal(lastRowSpan(6, 3), 1)
})

test('빈 격자와 1열은 늘릴 것이 없다', () => {
  assert.equal(lastRowSpan(0, 2), 1)
  assert.equal(lastRowSpan(4, 1), 1)
})

test('늘린 칸이 한 줄을 넘지 않는다', () => {
  // 어떤 조합에서도 span 이 perRow 보다 커지면 격자가 무너진다.
  for (let perRow = 1; perRow <= 6; perRow++) {
    for (let count = 0; count <= 20; count++) {
      const span = lastRowSpan(count, perRow)
      assert.ok(span >= 1 && span <= Math.max(1, perRow), `count=${count} perRow=${perRow} span=${span}`)
    }
  }
})
