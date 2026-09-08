import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRealEstateReport, trendSnapshot } from './realestate-report.mjs'

test('trendSnapshot compares the latest point with the nearest point at least seven days earlier', () => {
  assert.deepEqual(trendSnapshot([
    { date: '2026-08-30', gapRate: -0.8, pairs: 7, deals: 14 },
    { date: '2026-09-05', gapRate: 2.6, pairs: 9, deals: 18 },
    { date: '2026-09-06', gapRate: 2.6, pairs: 9, deals: 18 },
  ]), {
    date: '2026-09-06',
    gap: 2.6,
    pairs: 9,
    deals: 18,
    previousDate: '2026-08-30',
    change: 3.4,
  })
})

test('buildRealEstateReport separates sale and jeonse and flags unreliable 50-pyeong data', () => {
  const message = buildRealEstateReport({
    date: '2026-09-07',
    overall: {
      trade: { gap: -3.1, pairs: 54, deals: 245, change: -0.4 },
      jeonse: { gap: 1.5, pairs: 64, deals: 694, change: 0.2 },
    },
    fifty: {
      trade: { gap: 2.6, pairs: 9, deals: 18, change: 3.4 },
      jeonse: { gap: 71, pairs: 3, deals: 3, change: 44.4 },
    },
    listing: { trackedComplexes: 22, updatedComplexes: 5, count: 8346, previousCount: 8300 },
    sync: { trades: 1, rentals: 3 },
  })

  assert.match(message, /\[매매\]/)
  assert.match(message, /전체 -3\.1%/)
  assert.match(message, /50평대 \+2\.6%/)
  assert.match(message, /\[전세\]/)
  assert.match(message, /전체 \+1\.5%/)
  assert.match(message, /50평대 \+71\.0%/)
  assert.match(message, /표본 왜곡 가능성이 커요/)
  assert.match(message, /매매 약세·전세 보합/)
  assert.match(message, /전체 22개 추적 단지·오늘 호가 갱신 5개 단지/)
})
