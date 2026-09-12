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

test('buildRealEstateReport adds a zone section and says which way the gap moved', () => {
  const base = {
    date: '2026-09-07',
    overall: {
      trade: { gap: -3.1, pairs: 54, deals: 245, change: -0.4 },
      jeonse: { gap: 1.5, pairs: 64, deals: 694, change: 0.2 },
    },
    fifty: {
      trade: { gap: 2.6, pairs: 9, deals: 18, change: 3.4 },
      jeonse: { gap: 1.2, pairs: 40, deals: 80, change: 0.3 },
    },
    listing: { trackedComplexes: 22, updatedComplexes: 5, count: 8346, previousCount: 8300 },
    sync: { trades: 1, rentals: 3 },
  }

  const narrowing = buildRealEstateReport({
    ...base,
    zone: {
      month: '2026-08',
      index: { 강남3구: 122.4, 노도강: 115.7, 금관구: 113.4 },
      spread: 10.2,
      spreadPrev: 13.9,
    },
  })
  assert.match(narrowing, /\[권역\]/)
  assert.match(narrowing, /강남3구 122\.4/)
  assert.match(narrowing, /노도강 115\.7/)
  assert.match(narrowing, /금관구 113\.4/)
  assert.match(narrowing, /좁혀졌어요/)
  assert.match(narrowing, /10\.2p/)

  const widening = buildRealEstateReport({
    ...base,
    zone: { month: '2026-08', index: { 강남3구: 130 }, spread: 18.0, spreadPrev: 12.0 },
  })
  assert.match(widening, /벌어졌어요/)

  // 지수를 못 읽은 날은 권역 문단을 통째로 뺀다 — 빈 칸으로 남기면 수집 실패처럼 읽힌다.
  assert.doesNotMatch(buildRealEstateReport(base), /\[권역\]/)
})
