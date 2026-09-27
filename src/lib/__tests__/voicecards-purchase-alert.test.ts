import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoicecardsUserPurchaseFacts,
  mergeVoicecardsPurchaseSignals,
  summarizeVoicecardsMonthlyPurchases,
  summarizeVoicecardsPurchaseSignals,
} from '../voicecards-purchase-alert'

test('keeps a receipt when the client purchase event is missing', () => {
  const signals = mergeVoicecardsPurchaseSignals([], [{
    store_txn_id: 'txn-1',
    platform: 'ios',
    user_id: 'user-1',
    product_id: 'com.monor.voicecards.credits.1000',
    credits: 1100,
    created_at: '2026-09-08T03:47:20.000Z',
  }])

  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.id, 'receipt:txn-1')
  assert.equal(signals[0]?.properties?.reason, 'purchase')
  assert.equal(signals[0]?.properties?.delta, 1100)
})

test('deduplicates the client event against its server receipt', () => {
  const signals = mergeVoicecardsPurchaseSignals([{
    id: 'event-1',
    event_name: 'credits_changed',
    created_at: '2026-09-08T03:47:21.000Z',
    user_id: 'user-1',
    device_id: 'device-1',
    platform: 'ios',
    country: 'JP',
    properties: {
      reason: 'purchase',
      delta: 1100,
      product_id: 'com.monor.voicecards.credits.1000',
    },
  }], [{
    store_txn_id: 'txn-1',
    platform: 'ios',
    user_id: 'user-1',
    product_id: 'com.monor.voicecards.credits.1000',
    credits: 1100,
    created_at: '2026-09-08T03:47:20.000Z',
  }])

  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.id, 'receipt:txn-1')
  assert.equal(signals[0]?.country, 'JP')
  assert.equal(signals[0]?.device_id, 'device-1')
})

test('deduplicates a device-account purchase whose client event has no user_id', () => {
  // 구글 로그인 전 기기 계정 결제: 영수증은 device:<uuid>, 이벤트는 user_id 없이 device_id 만 찍힌다
  // (2026-09-16 GPA.3396-3686-0902-90897 이 두 번 집계된 사례).
  const signals = mergeVoicecardsPurchaseSignals([{
    id: 'event-1',
    event_name: 'credits_changed',
    created_at: '2026-09-16T08:39:50.298Z',
    user_id: null,
    device_id: '0c13b734-42bc-44e8-aa84-2f2eef3c6225',
    platform: 'android',
    country: 'DE',
    properties: {
      reason: 'purchase',
      delta: 1100,
      product_id: 'com.monor.voicecards.credits.1000',
    },
  }], [{
    store_txn_id: 'GPA.3396-3686-0902-90897',
    platform: 'android',
    user_id: 'device:0c13b734-42bc-44e8-aa84-2f2eef3c6225',
    product_id: 'com.monor.voicecards.credits.1000',
    credits: 1100,
    created_at: '2026-09-16T08:39:49.043Z',
  }])

  assert.equal(signals.length, 1)
  assert.equal(signals[0]?.id, 'receipt:GPA.3396-3686-0902-90897')
  assert.equal(signals[0]?.country, 'DE')
})

test('counts receipt-only purchases in dashboard revenue totals', () => {
  const signals = mergeVoicecardsPurchaseSignals([], [{
    store_txn_id: 'txn-1',
    platform: 'ios',
    user_id: 'user-1',
    product_id: 'com.monor.voicecards.credits.1000',
    credits: 1100,
    created_at: '2026-09-08T03:47:20.000Z',
  }])

  const totals = summarizeVoicecardsPurchaseSignals(
    signals,
    { 'com.monor.voicecards.credits.1000': 9.99 },
    { 'com.monor.voicecards.credits.1000': 1100 },
    () => '2026-09-08',
  )

  assert.equal(totals.iosTotal, 9.99)
  assert.equal(totals.androidTotal, 0)
  assert.equal(totals.creditsTotal, 1100)
  assert.equal(totals.iosByDate.get('2026-09-08'), 9.99)
  assert.equal(totals.creditsByDate.get('2026-09-08'), 1100)
})

test('counts receipt-only purchases in the monthly alert summary', () => {
  const signals = mergeVoicecardsPurchaseSignals([], [{
    store_txn_id: 'txn-1',
    platform: 'ios',
    user_id: 'user-1',
    product_id: 'com.monor.voicecards.credits.1000',
    credits: 1100,
    created_at: '2026-09-08T03:47:20.000Z',
  }])

  const summary = summarizeVoicecardsMonthlyPurchases(
    signals,
    productId => productId === 'com.monor.voicecards.credits.1000' ? 9.99 : null,
  )

  assert.deepEqual(summary, {
    purchaseCount: 1,
    listUsd: 9.99,
    unpricedCount: 0,
  })
})

test('uses receipts for user-table purchase date and credit totals', () => {
  const facts = buildVoicecardsUserPurchaseFacts(
    [{ user_id: 'user-1', purchased_credits: 0, last_purchase: null }],
    [{ user_id: 'user-1', purchased_today: 0 }],
    [{
      store_txn_id: 'txn-1',
      platform: 'ios',
      user_id: 'user-1',
      product_id: 'com.monor.voicecards.credits.1000',
      credits: 1100,
      created_at: '2026-09-08T03:47:20.000Z',
    }],
    ownerId => ownerId,
    () => '2026-09-08',
    '2026-09-08',
  )

  assert.deepEqual(facts.get('user-1'), {
    purchasedCredits: 1100,
    purchasedToday: 1100,
    lastPurchaseAt: '2026-09-08T03:47:20.000Z',
  })
})
