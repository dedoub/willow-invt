import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoicecardsUserPurchaseFacts,
  mergeVoicecardsPurchaseSignals,
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
