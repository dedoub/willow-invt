import assert from 'node:assert/strict'
import test from 'node:test'

import { carryForwardMissingDays, type DailyFigure } from '../etf-history'

/** 사례는 2026-09-14~15 실제 적재분이다 — KCHP 상장일에 나머지 셋이 하루 늦었다. */

const rows: DailyFigure[] = [
  { symbol: 'KDEF', date: '2026-09-14', market_cap: 115_743_930 },
  { symbol: 'KMCA', date: '2026-09-14', market_cap: 5_837_541 },
  { symbol: 'BOBP', date: '2026-09-14', market_cap: 589_894 },
  { symbol: 'KCHP', date: '2026-09-15', market_cap: 239_900 },
]

function totalOn(filled: DailyFigure[], date: string) {
  return filled.filter(r => r.date === date).reduce((sum, r) => sum + (r.market_cap ?? 0), 0)
}

test('한 종목만 들어온 날에도 나머지는 직전 값을 이어 쓴다', () => {
  const filled = carryForwardMissingDays(rows)
  assert.equal(totalOn(filled, '2026-09-14'), 122_171_365)
  // 이어 쓰지 않으면 239,900 으로 떨어져 선이 끊긴 것처럼 보인다
  assert.equal(totalOn(filled, '2026-09-15'), 122_411_265)
})

test('아직 한 번도 안 나온 종목은 앞 구간에 지어내지 않는다', () => {
  const filled = carryForwardMissingDays(rows)
  const before = filled.filter(r => r.date === '2026-09-14').map(r => r.symbol).sort()
  assert.deepEqual(before, ['BOBP', 'KDEF', 'KMCA'])
})

test('날짜가 뒤섞여 들어와도 시간순으로 이어진다', () => {
  const shuffled = [rows[3], rows[0], rows[2], rows[1]]
  const filled = carryForwardMissingDays(shuffled)
  assert.equal(totalOn(filled, '2026-09-15'), 122_411_265)
})

test('빈 입력은 빈 결과', () => {
  assert.deepEqual(carryForwardMissingDays([]), [])
})
